"""OpenAI (GPT) adapter — streaming chat completions with tool calling.

History from other providers is passed as text-only turns (see base.py);
the current turn runs a full native tool loop.
"""

import json
from collections.abc import AsyncIterator
from typing import Any

from .. import config
from ..prompt import build_system_prompt
from .base import Event, history_to_text_pairs


class OpenAIProvider:
    async def run(self, req, tool_defs: list[dict[str, Any]], execute_tool) -> AsyncIterator[Event]:
        try:
            from openai import AsyncOpenAI
        except ImportError:
            yield ("turns", {"messages": []})
            yield ("error", {"message": "The 'openai' package is not installed on the AI engine."})
            return

        import os

        api_key = req.api_key or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            yield ("turns", {"messages": []})
            yield (
                "error",
                {"message": "No OpenAI API key. Add one in the admin panel (Providers)."},
            )
            return

        bot = req.bot
        client = AsyncOpenAI(api_key=api_key)

        messages: list[dict[str, Any]] = [{"role": "system", "content": build_system_prompt(bot)}]
        for pair in history_to_text_pairs(req.messages):
            messages.append({"role": pair["role"], "content": pair["text"]})

        tools = [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": _clean_schema(t.get("input_schema", {"type": "object"})),
                },
            }
            for t in tool_defs
        ]

        new_turns: list[dict[str, Any]] = []
        assistant_text_parts: list[str] = []
        usage = {"inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0}

        try:
            for _ in range(config.MAX_TOOL_ITERATIONS):
                params: dict[str, Any] = {
                    "model": bot.model or "gpt-5.4",
                    "max_completion_tokens": bot.max_tokens or 4096,
                    "messages": messages,
                    "stream": True,
                    "stream_options": {"include_usage": True},
                }
                if tools:
                    params["tools"] = tools

                stream = await client.chat.completions.create(**params)
                text_buf = ""
                tool_calls: dict[int, dict[str, Any]] = {}
                finish_reason = None

                async for chunk in stream:
                    if chunk.usage:
                        usage["inputTokens"] += chunk.usage.prompt_tokens or 0
                        usage["outputTokens"] += chunk.usage.completion_tokens or 0
                        cached = getattr(
                            getattr(chunk.usage, "prompt_tokens_details", None), "cached_tokens", 0
                        )
                        usage["cacheReadTokens"] += cached or 0
                    if not chunk.choices:
                        continue
                    choice = chunk.choices[0]
                    delta = choice.delta
                    if delta and delta.content:
                        text_buf += delta.content
                        yield ("text", {"text": delta.content})
                    if delta and delta.tool_calls:
                        for tc in delta.tool_calls:
                            slot = tool_calls.setdefault(
                                tc.index, {"id": "", "name": "", "arguments": ""}
                            )
                            if tc.id:
                                slot["id"] = tc.id
                            if tc.function and tc.function.name:
                                slot["name"] = tc.function.name
                            if tc.function and tc.function.arguments:
                                slot["arguments"] += tc.function.arguments
                    if choice.finish_reason:
                        finish_reason = choice.finish_reason

                if text_buf:
                    assistant_text_parts.append(text_buf)

                if finish_reason == "tool_calls" and tool_calls:
                    calls = [tool_calls[i] for i in sorted(tool_calls)]
                    messages.append(
                        {
                            "role": "assistant",
                            "content": text_buf or None,
                            "tool_calls": [
                                {
                                    "id": c["id"],
                                    "type": "function",
                                    "function": {"name": c["name"], "arguments": c["arguments"]},
                                }
                                for c in calls
                            ],
                        }
                    )
                    for c in calls:
                        try:
                            args = json.loads(c["arguments"] or "{}")
                        except json.JSONDecodeError:
                            args = {}
                        yield ("tool_use", {"name": c["name"], "input": args})
                        ok = True
                        try:
                            result = await execute_tool(
                                c["name"], args, bot, req.conversation_id
                            )
                        except Exception as err:  # noqa: BLE001
                            ok = False
                            result = f"Error: {err}"
                        yield ("tool_result", {"name": c["name"], "ok": ok})
                        messages.append(
                            {"role": "tool", "tool_call_id": c["id"], "content": result}
                        )
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


def _clean_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Drop Anthropic-only keys OpenAI's function schema rejects."""
    if not isinstance(schema, dict):
        return {"type": "object"}
    return {k: v for k, v in schema.items() if k not in ("strict",)}


def _describe(err: Exception) -> str:
    msg = str(err)
    lower = msg.lower()
    if "api key" in lower or "authentication" in lower or "401" in lower:
        return "OpenAI rejected the API key. Check the key in the admin panel (Providers)."
    if "rate limit" in lower or "429" in lower:
        return "Rate limited by OpenAI. Please retry in a moment."
    return f"OpenAI error: {msg}"
