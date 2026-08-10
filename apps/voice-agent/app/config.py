"""Voice-agent configuration (repo-root .env + real env vars)."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")
load_dotenv()

# Talks back to the NestJS control plane (same internal secret as the AI engine).
INTERNAL_API_URL = os.environ.get("INTERNAL_API_URL", "http://localhost:4000")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "dev-internal-key-change-me")

# LiveKit server (self-hosted via docker-compose, or LiveKit Cloud).
LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "ws://localhost:7880")
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "devsecret_change_me_32chars_min__")

# Speech providers. Deepgram = streaming STT (and a TTS voice); swap freely.
DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")
# TTS: "deepgram" (needs Deepgram key) or "openai" (needs OpenAI key).
TTS_PROVIDER = os.environ.get("VOICE_TTS_PROVIDER", "deepgram")

# Fallback LLM keys (per-bot keys are resolved from the API at call time).
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")

# SIP trunk (from your carrier — Telnyx / Twilio Elastic SIP / etc.).
SIP_OUTBOUND_TRUNK_ID = os.environ.get("SIP_OUTBOUND_TRUNK_ID", "")

VOICE_AGENT_PORT = int(os.environ.get("VOICE_AGENT_PORT", "8100"))
