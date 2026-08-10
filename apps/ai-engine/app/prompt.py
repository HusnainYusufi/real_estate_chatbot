"""System prompt assembly.

The prompt must stay byte-stable for a given bot config: it is cached with a
prompt-cache breakpoint, and any change invalidates the cache for every
conversation on that bot. Never interpolate timestamps or per-request state.
"""

from .schemas import BotConfig


def build_system_prompt(bot: BotConfig) -> str:
    parts: list[str] = [f"You are {bot.name}, {bot.persona.strip()}"]

    if bot.instructions:
        parts.append(bot.instructions.strip())

    if bot.has_knowledge:
        parts.append(
            "You have a curated knowledge base for this domain, accessible through "
            "the search_knowledge tool. When a question depends on domain specifics "
            "— policies, processes, definitions, local practices — search the "
            "knowledge base before answering rather than answering from general "
            "knowledge alone. Ground your answers in what you find and say so when "
            "the knowledge base doesn't cover something."
        )

    if bot.lead_capture_enabled:
        parts.append(
            "When a visitor wants follow-up from a human — a call back, a meeting, "
            "to speak with the team — collect their name and a contact method "
            "(phone or email), then save it with the capture_lead tool. Never call "
            "capture_lead before the visitor has actually shared contact details."
        )

    if bot.guardrails:
        parts.append(f"Important boundaries:\n{bot.guardrails.strip()}")

    parts.append(
        "Keep responses focused, brief, and concise. Answer the question that was "
        "asked; give a high-level summary unless an in-depth explanation is "
        "specifically requested. Use plain language the user can act on."
    )

    return "\n\n".join(parts)
