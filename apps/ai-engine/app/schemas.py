"""Request/response contracts between the NestJS API and this engine."""

from typing import Any

from pydantic import BaseModel, Field


class CustomToolConfig(BaseModel):
    """A tenant-defined action: exposed to the model as a tool; executed by
    POSTing the model's input to the tenant's webhook."""

    name: str
    description: str
    input_schema: dict[str, Any]
    webhook_url: str
    secret: str | None = None


class BotConfig(BaseModel):
    id: str
    name: str
    persona: str
    instructions: str | None = None
    guardrails: str | None = None
    model: str | None = None
    provider: str = "anthropic"  # anthropic | openai | gemini
    max_tokens: int | None = None
    effort: str | None = None
    lead_capture_enabled: bool = False
    has_knowledge: bool = False
    custom_tools: list[CustomToolConfig] = Field(default_factory=list)


class ChatRequest(BaseModel):
    conversation_id: str
    bot: BotConfig
    # Per-request provider key resolved by the API (client BYO-key → platform →
    # null, in which case the engine falls back to its own env credentials).
    api_key: str | None = None
    # Conversation history in Anthropic message shape ({"role", "content"});
    # content may be a string or a content-block array. Provider adapters
    # translate this into their own wire format.
    messages: list[dict[str, Any]]
