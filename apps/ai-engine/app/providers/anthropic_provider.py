"""Anthropic (Claude) adapter — full agentic loop with streaming, native
tool use, prompt caching, and server-side refusal fallbacks."""

from collections.abc import AsyncIterator
from typing import Any

import anthropic
from anthropic import AsyncAnthropic

from .. import config
from ..prompt import build_system_prompt
from .base import Event

_default_client: AsyncAnthropic | None = None


def _client(api_key: str | None) -> AsyncAnthropic:
    if api_key:
        return AsyncAnthropic(api_key=api_key)
    global _default_client
    if _default_client is None:
        _default_client = AsyncAnthropic()  # env credentials
    return _default_client


class AnthropicProvider:
    fallbacks_enabled = config.REFUSAL_FALLBACKS_ENABLED

    async def run(self, req, tool_defs: list[dict[str, Any]], execute_tool) -> AsyncIterator[Event]:
        bot = req.bot
        client = _client(req.api_key)
        system = [
            {
                "type": "text",
                "text": build_system_prompt(bot),
                "cache_control": {"type": "ephemeral"},
            }
        ]
        messages: list[dict[str, Any]] = list(req.messages)
        new_turns: list[dict[str, Any]] = []
        usage = {"inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0}
        stop_reason: str | None = None

        try:
            for _ in range(config.MAX_TOOL_ITERATIONS):
                params: dict[str, Any] = {
                    "model": bot.model or config.DEFAULT_MODEL,
                    "max_tokens": bot.max_tokens or config.DEFAULT_MAX_TOKENS,
                    "system": system,
                    "messages": messages,
                }
                if tool_defs:
                    params["tools"] = tool_defs
                extra: dict[str, Any] = {}
                if bot.effort:
                    extra["output_config"] = {"effort": bot.effort}

                final = None
                while final is None:
                    use_fallbacks = self.fallbacks_enabled
                    try:
                        if use_fallbacks:
                            cm = client.beta.messages.stream(
                                **params,
                                betas=[config.FALLBACK_BETA],
                                extra_body={**extra, "fallbacks": "default"},
                            )
                        else:
                            cm = client.messages.stream(**params, extra_body=extra or None)
                        async with cm as stream:
                            async for text in stream.text_stream:
                                yield ("text", {"text": text})
                            final = await stream.get_final_message()
                    except anthropic.BadRequestError as err:
                        if use_fallbacks and "fallback" in str(err).lower():
                            self.fallbacks_enabled = False
                            continue
                        raise

                usage["inputTokens"] += final.usage.input_tokens
                usage["outputTokens"] += final.usage.output_tokens
                usage["cacheReadTokens"] += getattr(final.usage, "cache_read_input_tokens", 0) or 0
                stop_reason = final.stop_reason

                if stop_reason == "refusal":
                    details = getattr(final, "stop_details", None)
                    yield (
                        "refusal",
                        {
                            "category": getattr(details, "category", None),
                            "explanation": getattr(details, "explanation", None),
                        },
                    )
                    new_turns.append(
                        {"role": "assistant", "content": "I'm not able to help with that request."}
                    )
                    break

                assistant_turn = {
                    "role": "assistant",
                    "content": _sanitize([b.model_dump(mode="json") for b in final.content]),
                }
                messages.append(assistant_turn)
                new_turns.append(assistant_turn)

                if stop_reason == "pause_turn":
                    continue

                if stop_reason == "tool_use":
                    tool_blocks = [b for b in final.content if b.type == "tool_use"]
                    for block in tool_blocks:
                        yield ("tool_use", {"name": block.name, "input": block.input})
                    result_blocks = []
                    for block in tool_blocks:
                        outcome = await _run_one(execute_tool, block, req)
                        yield ("tool_result", {"name": block.name, "ok": outcome["ok"]})
                        result_blocks.append(outcome["block"])
                    tool_turn = {"role": "user", "content": result_blocks}
                    messages.append(tool_turn)
                    new_turns.append(tool_turn)
                    continue

                break

            yield ("turns", {"messages": new_turns})
            yield ("done", {"stopReason": stop_reason, "usage": usage})
        except Exception as err:  # noqa: BLE001
            yield ("turns", {"messages": new_turns})
            yield ("error", {"message": describe_error(err)})


async def _run_one(execute_tool, block, req) -> dict[str, Any]:
    try:
        content = await execute_tool(block.name, dict(block.input or {}), req.bot, req.conversation_id)
        return {
            "ok": True,
            "block": {"type": "tool_result", "tool_use_id": block.id, "content": content},
        }
    except Exception as err:  # noqa: BLE001
        return {
            "ok": False,
            "block": {
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": f"Error: {err}",
                "is_error": True,
            },
        }


def _sanitize(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    last_fallback = -1
    for i, block in enumerate(blocks):
        if block.get("type") == "fallback":
            last_fallback = i
    if last_fallback == -1:
        return blocks
    return [b for i, b in enumerate(blocks) if i >= last_fallback or b.get("type") == "text"]


def describe_error(err: Exception) -> str:
    if isinstance(err, anthropic.AuthenticationError) or "api_key" in str(err).lower():
        return (
            "No Anthropic API credentials. Add an Anthropic key in the admin panel "
            "(Providers) or set ANTHROPIC_API_KEY on the engine."
        )
    if isinstance(err, anthropic.RateLimitError):
        return "Rate limited by the Claude API. Please retry in a moment."
    if isinstance(err, anthropic.APIConnectionError):
        return "Could not reach the Claude API."
    if isinstance(err, anthropic.APIStatusError):
        return f"Claude API error ({err.status_code}): {err.message}"
    return str(err)
