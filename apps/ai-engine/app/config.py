"""Engine configuration. A single .env at the repo root feeds both services."""

import os
from pathlib import Path

from dotenv import load_dotenv

# repo-root .env (../../.. from this file); real env vars win.
load_dotenv(Path(__file__).resolve().parents[3] / ".env")
load_dotenv()

INTERNAL_API_URL = os.environ.get("INTERNAL_API_URL", "http://localhost:4000")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "dev-internal-key-change-me")

DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "claude-opus-5")
DEFAULT_MAX_TOKENS = int(os.environ.get("DEFAULT_MAX_TOKENS", "64000"))
MAX_TOOL_ITERATIONS = int(os.environ.get("MAX_TOOL_ITERATIONS", "10"))

# Server-side refusal fallbacks (beta): retry classifier-declined requests on
# Anthropic's recommended fallback model. Auto-disabled if the API rejects it.
REFUSAL_FALLBACKS_ENABLED = os.environ.get("DISABLE_REFUSAL_FALLBACK") != "1"
FALLBACK_BETA = "server-side-fallback-2026-07-01"

# Custom webhook tools: block private/loopback hosts unless explicitly allowed
# (SSRF guard; enable for local development against your own machine).
ALLOW_PRIVATE_WEBHOOKS = os.environ.get("ALLOW_PRIVATE_WEBHOOKS") == "1"
WEBHOOK_TIMEOUT_SECONDS = float(os.environ.get("WEBHOOK_TIMEOUT_SECONDS", "10"))
