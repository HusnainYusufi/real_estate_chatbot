"""Client for the NestJS control plane.

The voice agent is stateless like the text engine: it fetches the bot's config
(persona, provider, key, knowledge flag) by phone number or bot id, searches
knowledge, captures leads, and posts call records — all over /internal/*.
"""

from typing import Any

import httpx

from . import config

_headers = {"X-Internal-Key": config.INTERNAL_API_KEY}


async def _get(path: str, params: dict[str, Any] | None = None) -> Any:
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.get(f"{config.INTERNAL_API_URL}{path}", params=params, headers=_headers)
        r.raise_for_status()
        return r.json()


async def _post(path: str, body: dict[str, Any]) -> Any:
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.post(f"{config.INTERNAL_API_URL}{path}", json=body, headers=_headers)
        r.raise_for_status()
        return r.json()


async def resolve_voice_bot(*, phone: str | None = None, bot_id: str | None = None) -> dict | None:
    """Resolve the bot + provider key for a call. Returns None if no bot is
    mapped to the dialed number (inbound) or the id is unknown (outbound)."""
    try:
        return await _get(
            "/internal/voice/resolve",
            {k: v for k, v in {"phone": phone, "botId": bot_id}.items() if v},
        )
    except httpx.HTTPStatusError as err:
        if err.response.status_code == 404:
            return None
        raise


async def search_knowledge(bot_id: str, query: str) -> str:
    data = await _get("/internal/knowledge/search", {"botId": bot_id, "q": query, "limit": 4})
    hits = data.get("hits", [])
    if not hits:
        return "No matching entries in the knowledge base."
    return "\n\n".join(
        f"[{i}] {h['documentTitle']}"
        + (f" — {h['heading']}" if h.get("heading") else "")
        + f"\n{h['content']}"
        for i, h in enumerate(hits, 1)
    )


async def capture_lead(bot_id: str, name: str, contact: str, notes: str, call_id: str | None) -> str:
    await _post(
        "/internal/leads",
        {"botId": bot_id, "name": name, "contact": contact, "notes": notes, "conversationId": call_id},
    )
    return "Lead saved."


async def start_call_record(body: dict[str, Any]) -> dict:
    """Create/lookup the call record; returns { callId }."""
    return await _post("/internal/voice/calls", body)


async def finish_call_record(call_id: str, body: dict[str, Any]) -> None:
    await _post(f"/internal/voice/calls/{call_id}/finish", body)
