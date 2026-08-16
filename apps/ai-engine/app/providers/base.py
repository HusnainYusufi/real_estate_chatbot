"""Shared provider contract.

Every provider adapter is an async generator that yields (event, data) tuples
mapping onto the SSE protocol the NestJS API relays:

  text / tool_use / tool_result / refusal / error  → forwarded to the client
  turns / done                                      → consumed by the API
                                                      (persistence + usage/cost)

`turns` carries the new conversation turns to persist, always in Anthropic
message shape ({"role", "content"}) so storage stays uniform across providers.
"""

import re
from collections.abc import AsyncIterator
from typing import Any

Event = tuple[str, dict[str, Any]]


def summarize_tool_result(name: str, content: str | None) -> dict[str, Any]:
    """Extra fields for a tool_result event so the UI can show WHAT the bot
    used — the retrieved knowledge sources and a snippet — for transparency."""
    text = content or ""
    sources: list[str] = []
    if name == "search_knowledge":
        # search_knowledge formats results as "[n] Document title — heading".
        for line in text.splitlines():
            m = re.match(r"^\[\d+\]\s+(.+)$", line)
            if m:
                sources.append(m.group(1).strip())
    return {"sources": sources, "preview": text[:2000]}


def history_to_text_pairs(messages: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Flatten stored Anthropic-shaped history to simple {role, text} turns.

    Non-Anthropic providers use this: cross-provider history is text-only
    (tool-call blocks from another provider don't translate), while the
    current turn still runs a full tool loop natively.
    """
    out: list[dict[str, str]] = []
    for msg in messages:
        role = msg.get("role")
        if role not in ("user", "assistant"):
            continue
        content = msg.get("content")
        if isinstance(content, str):
            text = content
        elif isinstance(content, list):
            text = "\n".join(
                b.get("text", "")
                for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            ).strip()
        else:
            text = ""
        if text:
            out.append({"role": role, "text": text})
    return out


class Provider:
    """Interface implemented by each provider adapter."""

    async def run(
        self, req: "ChatRequestLike", tool_defs: list[dict[str, Any]], execute_tool
    ) -> AsyncIterator[Event]:  # pragma: no cover - interface
        raise NotImplementedError
        yield  # make this an async generator


class ChatRequestLike:  # typing helper only
    conversation_id: str
    api_key: str | None
    bot: Any
    messages: list[dict[str, Any]]
