"""LiveKit voice agent worker.

For each call (a LiveKit "room"), we resolve the bot behind the dialed/target
number, build a realtime STT -> LLM -> TTS pipeline on the bot's chosen
provider, and give the model the same knowledge-search + lead-capture tools the
chat and WhatsApp channels use. Transcript turns are persisted as a voice
"conversation" via the control plane.

Run: python -m app.worker start   (dev)  |  the container runs the same.
"""

import json
import logging

from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RoomInputOptions,
    RunContext,
    WorkerOptions,
    cli,
    function_tool,
)
from livekit.plugins import deepgram, silero
from livekit.plugins import anthropic as lk_anthropic
from livekit.plugins import google as lk_google
from livekit.plugins import openai as lk_openai

from . import backend, config

logger = logging.getLogger("voice-agent")


def _build_llm(provider: str, model: str | None, api_key: str | None):
    """Map a bot's provider/model to the matching LiveKit LLM plugin. Falls back
    to the engine's env key when the API didn't supply a per-bot key."""
    if provider == "openai":
        return lk_openai.LLM(model=model or "gpt-5.4", api_key=api_key or config.OPENAI_API_KEY or None)
    if provider == "gemini":
        return lk_google.LLM(
            model=model or "gemini-2.5-flash", api_key=api_key or config.GEMINI_API_KEY or None
        )
    return lk_anthropic.LLM(
        model=model or "claude-opus-5", api_key=api_key or config.ANTHROPIC_API_KEY or None
    )


def _build_tts():
    if config.TTS_PROVIDER == "openai":
        return lk_openai.TTS(voice="alloy", api_key=config.OPENAI_API_KEY or None)
    return deepgram.TTS(model="aura-2-thalia-en", api_key=config.DEEPGRAM_API_KEY or None)


def _voice_system_prompt(bot: dict) -> str:
    """Persona + guardrails, adapted for spoken conversation."""
    parts = [f"You are {bot['name']}, {bot.get('persona', '').strip()}"]
    if bot.get("instructions"):
        parts.append(bot["instructions"].strip())
    if bot.get("hasKnowledge"):
        parts.append(
            "You have a knowledge base — call search_knowledge before answering "
            "questions about specifics, and answer only from what it returns."
        )
    if bot.get("leadCaptureEnabled"):
        parts.append(
            "If the caller wants a callback or to speak to the team, collect their "
            "name and a phone number or email, then call capture_lead."
        )
    if bot.get("guardrails"):
        parts.append(f"Boundaries:\n{bot['guardrails'].strip()}")
    parts.append(
        "This is a PHONE CALL. Keep replies short, natural, and conversational — "
        "one or two sentences. Never output markdown, lists, or symbols; speak in "
        "plain sentences a person would say aloud. Ask one question at a time."
    )
    return "\n\n".join(parts)


class BotVoiceAgent(Agent):
    def __init__(self, bot: dict, call_id: str | None):
        self._bot = bot
        self._call_id = call_id
        super().__init__(instructions=_voice_system_prompt(bot))

    @function_tool()
    async def search_knowledge(self, context: RunContext, query: str) -> str:
        """Search the business's knowledge base for facts, policies, or details.

        Args:
            query: The key terms of the caller's question.
        """
        if not self._bot.get("hasKnowledge"):
            return "No knowledge base is configured."
        return await backend.search_knowledge(self._bot["id"], query)

    @function_tool()
    async def capture_lead(
        self, context: RunContext, name: str, contact: str, notes: str = ""
    ) -> str:
        """Save the caller as a lead once they've given a name and a contact.

        Args:
            name: The caller's full name.
            contact: Phone number or email.
            notes: One sentence on what they want.
        """
        if not self._bot.get("leadCaptureEnabled"):
            return "Lead capture is not enabled."
        return await backend.capture_lead(self._bot["id"], name, contact, notes, self._call_id)


async def entrypoint(ctx: JobContext):
    await ctx.connect()

    # Dispatch metadata (set on outbound; for inbound we read the SIP number).
    meta: dict = {}
    if ctx.job and ctx.job.metadata:
        try:
            meta = json.loads(ctx.job.metadata)
        except json.JSONDecodeError:
            meta = {}

    direction = meta.get("direction", "inbound")
    bot_id = meta.get("botId")
    dialed_number = meta.get("dialedNumber")
    callee = meta.get("to")

    # Inbound: wait for the SIP participant to learn which number was dialed.
    if direction == "inbound" and not (bot_id or dialed_number):
        participant = await ctx.wait_for_participant()
        attrs = participant.attributes or {}
        dialed_number = attrs.get("sip.trunkPhoneNumber") or attrs.get("sip.phoneNumber")
        callee = attrs.get("sip.phoneNumber")

    bot = await backend.resolve_voice_bot(phone=dialed_number, bot_id=bot_id)
    if not bot:
        logger.warning("No bot mapped for call (number=%s botId=%s) — hanging up", dialed_number, bot_id)
        await ctx.room.disconnect()
        return

    call = await backend.start_call_record(
        {
            "botId": bot["id"],
            "direction": direction,
            "peerNumber": callee or dialed_number or "unknown",
            "room": ctx.room.name,
        }
    )
    call_id = call.get("callId")

    session: AgentSession = AgentSession(
        stt=deepgram.STT(model="nova-3", api_key=config.DEEPGRAM_API_KEY or None),
        llm=_build_llm(bot.get("provider", "anthropic"), bot.get("model"), bot.get("apiKey")),
        tts=_build_tts(),
        vad=silero.VAD.load(),
    )

    transcript: list[dict] = []

    @session.on("conversation_item_added")
    def _on_item(ev):
        try:
            role = ev.item.role
            text = ev.item.text_content
            if text:
                transcript.append({"role": "user" if role == "user" else "assistant", "text": text})
        except Exception:  # noqa: BLE001 - never let logging break the call
            pass

    await session.start(
        agent=BotVoiceAgent(bot, call_id),
        room=ctx.room,
        room_input_options=RoomInputOptions(),
    )

    # Agent speaks first (greeting) on both inbound and outbound.
    greeting = bot.get("greeting") or f"Hi, you've reached {bot['name']}. How can I help?"
    await session.say(greeting, allow_interruptions=True)

    async def _finish():
        if not call_id:
            return
        await backend.finish_call_record(
            call_id, {"transcript": transcript, "status": "completed"}
        )

    ctx.add_shutdown_callback(_finish)


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(entrypoint_fnc=entrypoint, agent_name="chatbot-suite-voice"),
    )
