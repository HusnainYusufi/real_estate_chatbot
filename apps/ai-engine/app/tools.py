"""Tool definitions and executors.

Built-in tools call back into the NestJS API (internal endpoints), keeping the
engine stateless. Custom tools POST to the tenant's webhook.
"""

import ipaddress
import json
import socket
from typing import Any
from urllib.parse import urlparse

import httpx

from . import config
from .schemas import BotConfig, CustomToolConfig

SEARCH_KNOWLEDGE = {
    "name": "search_knowledge",
    "description": (
        "Search this assistant's curated domain knowledge base. Call this whenever "
        "the answer depends on domain-specific facts, processes, policies, or "
        "definitions — before answering from general knowledge. Returns the most "
        "relevant excerpts with their source documents. If nothing matches, answer "
        "from general knowledge and say the knowledge base did not cover it."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Key terms of the user's question, e.g. 'closing costs first time buyer'.",
            }
        },
        "required": ["query"],
        "additionalProperties": False,
    },
    "strict": True,
}

CAPTURE_LEAD = {
    "name": "capture_lead",
    "description": (
        "Save a visitor's contact details as a sales lead for the business. Call "
        "this only after the visitor has explicitly shared their name AND a contact "
        "method (phone or email) and wants follow-up from a human. If either is "
        "missing, ask for it first instead of calling this tool."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "The visitor's full name."},
            "contact": {"type": "string", "description": "Phone number or email address."},
            "notes": {
                "type": "string",
                "description": "One or two sentences on what the visitor wants, for the human following up.",
            },
        },
        "required": ["name", "contact"],
        "additionalProperties": False,
    },
    "strict": True,
}


def build_tool_definitions(bot: BotConfig) -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    if bot.has_knowledge:
        tools.append(SEARCH_KNOWLEDGE)
    if bot.lead_capture_enabled:
        tools.append(CAPTURE_LEAD)
    for custom in bot.custom_tools:
        tools.append(
            {
                "name": custom.name,
                "description": custom.description,
                "input_schema": custom.input_schema,
            }
        )
    return tools


async def execute_tool(
    name: str, tool_input: dict[str, Any], bot: BotConfig, conversation_id: str
) -> str:
    """Run a tool and return its result text. Raises on failure — the engine
    converts exceptions into is_error tool results the model can recover from."""
    if name == "search_knowledge" and bot.has_knowledge:
        return await _search_knowledge(bot.id, str(tool_input.get("query", "")))
    if name == "capture_lead" and bot.lead_capture_enabled:
        return await _capture_lead(bot.id, conversation_id, tool_input)
    custom = next((t for t in bot.custom_tools if t.name == name), None)
    if custom is not None:
        return await _call_webhook(custom, tool_input, bot.id, conversation_id)
    raise ValueError(f'Tool "{name}" is not available for this assistant.')


_internal_headers = {"X-Internal-Key": config.INTERNAL_API_KEY}


async def _search_knowledge(bot_id: str, query: str) -> str:
    async with httpx.AsyncClient(timeout=10) as http:
        response = await http.get(
            f"{config.INTERNAL_API_URL}/internal/knowledge/search",
            params={"botId": bot_id, "q": query, "limit": 4},
            headers=_internal_headers,
        )
        response.raise_for_status()
    hits = response.json().get("hits", [])
    if not hits:
        return "No matching entries in the knowledge base for this query."
    sections = []
    for i, hit in enumerate(hits, start=1):
        heading = f" — {hit['heading']}" if hit.get("heading") else ""
        sections.append(f"[{i}] {hit['documentTitle']}{heading}\n{hit['content']}")
    return "\n\n---\n\n".join(sections)


async def _capture_lead(bot_id: str, conversation_id: str, tool_input: dict[str, Any]) -> str:
    async with httpx.AsyncClient(timeout=10) as http:
        response = await http.post(
            f"{config.INTERNAL_API_URL}/internal/leads",
            json={
                "botId": bot_id,
                "conversationId": conversation_id,
                "name": str(tool_input.get("name", "")),
                "contact": str(tool_input.get("contact", "")),
                "notes": str(tool_input.get("notes", "")),
            },
            headers=_internal_headers,
        )
        response.raise_for_status()
    lead = response.json()
    return json.dumps(
        {
            "status": "saved",
            "reference": lead["id"],
            "note": "Lead recorded. The team will follow up using the contact details provided.",
        }
    )


def _assert_public_host(url: str) -> None:
    """SSRF guard for tenant-supplied webhook URLs."""
    if config.ALLOW_PRIVATE_WEBHOOKS:
        return
    host = urlparse(url).hostname or ""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as err:
        raise ValueError(f"Webhook host {host!r} does not resolve.") from err
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError(
                f"Webhook host {host!r} resolves to a private address; refusing to call it."
            )


async def _call_webhook(
    tool: CustomToolConfig, tool_input: dict[str, Any], bot_id: str, conversation_id: str
) -> str:
    _assert_public_host(tool.webhook_url)
    headers = {"Content-Type": "application/json"}
    if tool.secret:
        headers["X-Webhook-Secret"] = tool.secret
    async with httpx.AsyncClient(timeout=config.WEBHOOK_TIMEOUT_SECONDS) as http:
        response = await http.post(
            tool.webhook_url,
            json={
                "tool": tool.name,
                "input": tool_input,
                "botId": bot_id,
                "conversationId": conversation_id,
            },
            headers=headers,
        )
    if response.status_code >= 400:
        raise ValueError(f"Webhook returned HTTP {response.status_code}.")
    return response.text[:20_000]
