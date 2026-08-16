"""Google Gemini adapter — streaming generate_content with function calling
via the google-genai SDK.

History from other providers is text-only (see base.py); the current turn
runs a full native tool loop.
"""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from .. import config
from ..prompt import build_system_prompt
from .base import Event, history_to_text_pairs, summarize_tool_result


class GeminiProvider:
    async def run(self, req, tool_defs: list[dict[str, Any]], execute_tool) -> AsyncIterator[Event]:
        try:
            from google import genai
            from google.genai import types
        except ImportError:
            yield ("turns", {"messages": []})
            yield (
                "error",
                {"message": "The 'google-genai' package is not installed on the AI engine."},
            )
            return

        import os

        api_key = req.api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            yield ("turns", {"messages": []})
            yield (
                "error",
                {"message": "No Gemini API key. Add one in the admin panel (Providers)."},
            )
            return

        bot = req.bot
        client = genai.Client(api_key=api_key)

        # Gemini "contents": user/model turns; tool results are function_response parts.
        contents: list[Any] = []
        for pair in history_to_text_pairs(req.messages):
            role = "model" if pair["role"] == "assistant" else "user"
            contents.append(types.Content(role=role, parts=[types.Part(text=pair["text"])]))

        function_declarations = [
            types.FunctionDeclaration(
                name=t["name"],
                description=t.get("description", ""),
                parameters=_to_gemini_schema(t.get("input_schema", {"type": "object"})),
            )
            for t in tool_defs
        ]
        tools = [types.Tool(function_declarations=function_declarations)] if function_declarations else None

        gen_config = types.GenerateContentConfig(
            system_instruction=build_system_prompt(bot),
            max_output_tokens=bot.max_tokens or 4096,
            tools=tools,
        )

        new_turns: list[dict[str, Any]] = []
        assistant_text_parts: list[str] = []
        usage = {"inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0}
        model = bot.model or "gemini-2.5-flash"

        try:
            for _ in range(config.MAX_TOOL_ITERATIONS):
                # google-genai streaming is sync-iterator based; run it off-thread
                # and hand chunks back through an asyncio queue.
                queue: asyncio.Queue = asyncio.Queue()
                loop = asyncio.get_running_loop()

                def produce():
                    try:
                        for chunk in client.models.generate_content_stream(
                            model=model, contents=contents, config=gen_config
                        ):
                            loop.call_soon_threadsafe(queue.put_nowait, ("chunk", chunk))
                        loop.call_soon_threadsafe(queue.put_nowait, ("end", None))
                    except Exception as err:  # noqa: BLE001
                        loop.call_soon_threadsafe(queue.put_nowait, ("err", err))

                task = loop.run_in_executor(None, produce)
                text_buf = ""
                calls: list[Any] = []
                # Preserve the original function-call PARTS: newer Gemini models
                # attach a `thought_signature` that MUST be echoed back with the
                # function call, or the next turn 400s (INVALID_ARGUMENT).
                call_parts: list[Any] = []
                while True:
                    kind, payload = await queue.get()
                    if kind == "end":
                        break
                    if kind == "err":
                        raise payload
                    chunk = payload
                    if getattr(chunk, "usage_metadata", None):
                        um = chunk.usage_metadata
                        usage["inputTokens"] = um.prompt_token_count or usage["inputTokens"]
                        usage["outputTokens"] = (
                            um.candidates_token_count or usage["outputTokens"]
                        )
                        usage["cacheReadTokens"] = (
                            getattr(um, "cached_content_token_count", 0) or usage["cacheReadTokens"]
                        )
                    for cand in getattr(chunk, "candidates", None) or []:
                        for part in getattr(cand.content, "parts", None) or []:
                            if getattr(part, "text", None):
                                text_buf += part.text
                                yield ("text", {"text": part.text})
                            if getattr(part, "function_call", None):
                                calls.append(part.function_call)
                                call_parts.append(part)  # keeps thought_signature
                await task

                if text_buf:
                    assistant_text_parts.append(text_buf)

                if calls:
                    model_parts = []
                    if text_buf:
                        model_parts.append(types.Part(text=text_buf))
                    # Echo the original call parts (with their thought_signature)
                    # rather than reconstructing them.
                    model_parts.extend(call_parts)
                    contents.append(types.Content(role="model", parts=model_parts))

                    response_parts = []
                    for call in calls:
                        args = dict(call.args or {})
                        yield ("tool_use", {"name": call.name, "input": args})
                        ok = True
                        try:
                            result = await execute_tool(call.name, args, bot, req.conversation_id)
                        except Exception as err:  # noqa: BLE001
                            ok = False
                            result = f"Error: {err}"
                        yield (
                            "tool_result",
                            {
                                "name": call.name,
                                "ok": ok,
                                **summarize_tool_result(call.name, result),
                            },
                        )
                        response_parts.append(
                            types.Part(
                                function_response=types.FunctionResponse(
                                    name=call.name, response={"result": result}
                                )
                            )
                        )
                    contents.append(types.Content(role="user", parts=response_parts))
                    continue

                break

            final_text = "".join(assistant_text_parts).strip()
            if final_text:
                new_turns.append({"role": "assistant", "content": final_text})
            yield ("turns", {"messages": new_turns})
            yield ("done", {"stopReason": "end_turn", "usage": usage})
        except Exception as err:  # noqa: BLE001
            yield ("turns", {"messages": new_turns})
            yield ("error", {"message": _describe(err)})


def _to_gemini_schema(schema: dict[str, Any]):
    """Convert a JSON-schema object into a google-genai Schema."""
    from google.genai import types

    type_map = {
        "object": types.Type.OBJECT,
        "string": types.Type.STRING,
        "integer": types.Type.INTEGER,
        "number": types.Type.NUMBER,
        "boolean": types.Type.BOOLEAN,
        "array": types.Type.ARRAY,
    }

    def convert(node: dict[str, Any]):
        if not isinstance(node, dict):
            return types.Schema(type=types.Type.STRING)
        node_type = type_map.get(node.get("type", "string"), types.Type.STRING)
        kwargs: dict[str, Any] = {"type": node_type}
        if node.get("description"):
            kwargs["description"] = node["description"]
        if node.get("enum"):
            kwargs["enum"] = [str(v) for v in node["enum"]]
        if node.get("type") == "object" and isinstance(node.get("properties"), dict):
            kwargs["properties"] = {k: convert(v) for k, v in node["properties"].items()}
            if node.get("required"):
                kwargs["required"] = node["required"]
        if node.get("type") == "array" and isinstance(node.get("items"), dict):
            kwargs["items"] = convert(node["items"])
        return types.Schema(**kwargs)

    return convert(schema)


def _describe(err: Exception) -> str:
    msg = str(err)
    lower = msg.lower()
    if "api key" in lower or "api_key" in lower or "permission" in lower or "401" in lower:
        return "Gemini rejected the API key. Check the key in the admin panel (Providers)."
    if "quota" in lower or "429" in lower or "resource_exhausted" in lower:
        return "Rate limited / quota exceeded on Gemini. Please retry in a moment."
    return f"Gemini error: {msg}"
