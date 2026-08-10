"""Provider-agnostic chat entry point.

Selects the adapter for the bot's provider (Anthropic / OpenAI / Gemini),
builds the shared tool set, and streams (event, data) tuples. Tool execution
is identical across providers — the same executors in tools.py, which call
back into the NestJS API.
"""

from collections.abc import AsyncIterator

from .providers.anthropic_provider import AnthropicProvider
from .providers.base import Event
from .providers.gemini_provider import GeminiProvider
from .providers.openai_provider import OpenAIProvider
from .schemas import ChatRequest
from .tools import build_tool_definitions, execute_tool

_PROVIDERS = {
    "anthropic": AnthropicProvider(),
    "openai": OpenAIProvider(),
    "gemini": GeminiProvider(),
}


async def run_chat(req: ChatRequest) -> AsyncIterator[Event]:
    provider = _PROVIDERS.get(req.bot.provider) or _PROVIDERS["anthropic"]
    tool_defs = build_tool_definitions(req.bot)
    async for event in provider.run(req, tool_defs, execute_tool):
        yield event
