# Chatbot Suite — Multi-Tenant AI Chatbot SaaS

Sell vertical AI chatbots as a service. From the **admin panel** you onboard a client, hand them a bot built from a vertical **template** (law firm, real estate, tax — add your own), upload their documents, choose which **AI model** runs it (Claude, GPT, or Gemini — paste a key and go), and optionally attach their **WhatsApp number** — no Meta Business API subscription. Clients get a hosted chat widget, a WhatsApp auto-responder, captured leads, and full transcripts; you get a **CRM to manage thousands of clients**, **per-message cost tracking**, and a **pricing calculator** to price plans with margin.

## What's inside

- **CRM** — searchable, filterable, paginated client list built for scale; per-client status (lead → trial → active → paused → churned), internal notes, plan, and monthly message limit.
- **Cost engine** — every AI reply's real token usage is priced from an editable model catalog and stored per message, so each client page shows your actual monthly AI cost. A standalone calculator estimates cost-per-message and suggests a client price at your chosen margin.
- **Bring your own model** — paste an Anthropic, OpenAI, or Google key in the panel (encrypted at rest); set any bot to any model from the catalog. Switching provider is a dropdown.
- **WhatsApp** — self-hosted OpenWA gateway, QR pairing, no Meta subscription.

## Architecture

```
        Admin panel (Next.js, :3001)          Client's website        Client's WhatsApp
        operator: onboard, provision           <iframe widget>          customers
                    │ REST                          │ SSE                   │
                    ▼                               ▼                       ▼
┌────────────────────────────────────────────────────────────┐   ┌──────────────────┐
│                    NestJS API (:4000)                      │◄──┤  OpenWA (:2785)  │
│  auth/orgs · bots · templates · knowledge (Postgres FTS)   │──►│  self-hosted     │
│  conversations · leads · usage · admin API                 │   │  WhatsApp gateway│
│  SSE relay + HMAC webhook + persistence                    │   │  (QR pairing)    │
└──────────┬─────────────────────────────┬───────────────────┘   └──────────────────┘
           │                             │ POST /chat/stream (SSE)
┌──────────▼───────────┐      ┌──────────▼──────────────────┐
│      PostgreSQL      │      │   AI Engine (FastAPI, :8000)│
│  all state           │      │   Anthropic SDK agentic loop│
└──────────────────────┘      │   stateless — tools call    │
                              │   back over /internal/*     │
                              └─────────────────────────────┘
```

- **NestJS + Postgres** own all state: tenants (with CRM fields), users, bots, knowledge (chunked + GIN-indexed for full-text search), conversations (raw content blocks in `jsonb` so tool-use replays correctly), leads, per-message cost, encrypted provider keys, plan limits.
- **Python AI engine** (FastAPI) is stateless and **multi-provider**: bot config + history + a resolved API key in, streamed agentic loop out. Provider adapters — Anthropic (`anthropic` SDK), OpenAI (`openai` SDK), Gemini (`google-genai` SDK) — share one tool set and event protocol; the API picks the adapter from the bot's model. Tools that need data call back into `/internal/*` with a shared secret.
- **Cost** is computed by the API from each turn's token usage against `seed-data/model-catalog.json` (operator-editable list prices) and stored on every assistant message.
- **OpenWA** ([rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA)) is a self-hosted WhatsApp gateway using WhatsApp-Web-style QR pairing — **no Meta subscription or per-message fees**. Unofficial automation: use dedicated numbers and read the ban-risk note below.
- **Next.js admin panel** is the operator cockpit.

## Deploy with Docker (recommended)

The whole platform ships as containers. One command brings up Postgres, the NestJS API, the Python AI engine, the Next.js admin panel, and the OpenWA WhatsApp gateway:

```bash
cp .env.example .env         # set JWT_SECRET, ENCRYPTION_KEY, INTERNAL_API_KEY + AI keys
#                              For a remote server, also set:
#                                NEXT_PUBLIC_API_URL=http://YOUR_HOST:4000   (browser → API)
docker compose up -d --build
docker compose exec api node dist/seed.js     # demo admin + bots (first run only)
```

Then open the admin panel at **http://localhost:4100** (or `http://YOUR_HOST:4100`) and log in as `admin@example.com` / `admin-password-123`.

| Service | Container | Host port | Notes |
|---|---|---|---|
| Admin panel (Next.js) | `admin` | 4100 | operator UI |
| API (NestJS) | `api` | 4000 | `/healthz` liveness |
| AI engine (FastAPI) | `ai-engine` | — | internal only |
| PostgreSQL | `postgres` | 5434 | remove the mapping in prod |
| WhatsApp gateway | `openwa` | 2785 | dashboard for the API key |
| Voice (LiveKit + SIP + worker) | opt-in | 7880… | `docker compose --profile voice up -d` |

All services have healthchecks and `restart: unless-stopped`, talk to each other by container name on the compose network, and read a single root `.env`.

**Deployment notes:**
- `NEXT_PUBLIC_API_URL` is baked into the admin **at build time** (Next.js inlines it). Set it to the browser-reachable API URL *before* `--build`; changing it later needs `docker compose build admin`.
- Put TLS (a reverse proxy / load balancer) in front of `api` and `admin` for anything internet-facing, and set strong `JWT_SECRET` / `ENCRYPTION_KEY` / `INTERNAL_API_KEY`.
- `DB_SYNC=true` auto-creates the schema (fine to start); switch to migrations for production.
- WhatsApp/voice need their own setup (below) and external accounts.

## Local development (without full Docker)

Run just Postgres in Docker and each app on the host with hot reload:

```bash
cp .env.example .env
docker compose up -d postgres   # Postgres on host port 5434 (POSTGRES_PORT to change)

cd apps/api && npm install && npm run build && npm run seed && npm run start:dev
cd apps/ai-engine && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt \
  && .venv/bin/uvicorn app.main:app --port 8000 --reload
cd apps/admin && npm install && npm run dev        # → http://localhost:4100
```

Seed creates the **platform admin** (`admin@example.com` / `admin-password-123`) and a demo client with one bot per template.

## The operator workflow (what the panel does)

1. **Onboard client** → creates their organization + login; the generated password is shown once.
2. **Give them a bot** → pick a template (`law-firm`, `real-estate`, `tax`); the bot is created with a tuned persona, guardrails, greeting, and starter knowledge. Rename it for the client's brand.
3. **Upload their documents** → markdown/plain text, chunked and indexed instantly; the bot cites them via its `search_knowledge` tool.
4. **Hand over the widget** → share link or copy-paste iframe embed for their website.
5. **Connect WhatsApp (optional)** → one click creates an OpenWA session; the client scans the QR (WhatsApp → Linked devices) with their business phone. From then on, messages to that number are answered by their bot; conversations and leads land in the same dashboard.
6. **Watch usage** → AI replies per client per month vs plan limit; adjust plan/limit per client.

### Train a bot from a website

In a bot's **Knowledge** tab, paste a URL (e.g. `https://www.example.com/`) and hit **Fetch & index** — the API fetches the page, extracts the readable text, chunks it, and indexes it for search. Tick **Crawl the whole site** to follow same-domain links up to N pages. Endpoint: `POST /v1/admin/clients/:orgId/bots/:botId/documents/url` `{ url, crawl?, maxPages? }`.

Notes: fetching is SSRF-guarded (public hosts only; set `ALLOW_PRIVATE_INGEST=1` for local testing). JavaScript-rendered sites may return little text — paste the content manually in that case. It extracts text, not images/PDFs.

### Test a bot (playground)

Each bot has a **Test** tab — a live chat against that bot using the real streaming pipeline, so you can confirm it answers from the knowledge base before handing it to a client. When it calls `search_knowledge` you'll see "Searching the knowledge base…" inline. Needs an AI provider key configured (see below).

### Free AI key for demos

Google Gemini has a **free tier with no credit card**. Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), paste it as the **Gemini** key in the panel's **Providers** page, and set your demo bots to `gemini-2.5-flash` (each bot's Overview tab). The panel shows this tip on the Providers page.

### Adding a new vertical template

Drop `seed-data/templates/<id>.json` (persona, instructions, guardrails, greeting, `knowledgeFiles`) plus markdown under `seed-data/knowledge/` — it appears in the panel's template picker immediately. No code.

## Models, cost & pricing

- **Connect providers** (panel → Providers): paste an Anthropic / OpenAI / Google key. Keys are encrypted (AES-256-GCM) and only a `…last4` preview is ever returned. A client can also have their own key (BYO-key) that overrides the platform key.
- **Per-bot model** (bot → Overview): pick any model from the catalog; the engine routes to that provider automatically. A bot on a provider with no key reports it cleanly rather than failing silently.
- **Cost tracking**: `seed-data/model-catalog.json` holds list prices (per 1M tokens, input/output/cache — edit as prices change). Every assistant reply stores its computed `costUsd`; each client page shows the running monthly total, and the client list has a cost column.
- **Pricing calculator** (panel → Cost calculator): enter model + tokens-per-message + volume + markup → get cost/message, cost/month, and a suggested client price with the margin spelled out. Use it to price plans before you sell them.

> Prices in the shipped catalog were checked 2026-08 ([OpenAI](https://www.morphllm.com/openai-api-pricing), [Gemini](https://www.opslyft.com/blog/google-gemini-api-pricing-2026), Anthropic per the Claude API docs). Keep `pricesAsOf` and the numbers current.

## WhatsApp: how it works & the honest caveat

- OpenWA runs as a Docker service (`:2785`). First-time setup: open its dashboard, create an API key, put it in `.env` as `OPENWA_API_KEY`.
- Connecting a bot = create session → register our HMAC-signed webhook → start → show QR. Inbound `message.received` events hit `POST /v1/channels/whatsapp/webhook` (signature-verified, fast-ack, processed async): the bot runs the same AI pipeline and replies via OpenWA's send-text API, with a typing indicator while it thinks. Group chats and the client's own outgoing messages are ignored; messages per chat are processed in order.
- **Ban risk**: OpenWA drives WhatsApp Web via reverse-engineered clients, which violates WhatsApp's ToS. Replying to inbound messages (this product's pattern) is the lowest-risk usage, but the risk is never zero — use dedicated numbers, tell clients, put it in your ToS. The adapter is isolated in `apps/api/src/whatsapp/`; swapping to the official WhatsApp Cloud API later is contained to that folder.

## Voice / phone calls (SIP)

The same bots can answer inbound calls and place outbound calls — reusing each bot's persona, knowledge, provider/model, and lead capture. This runs on **LiveKit** (open-source, self-hosted): WebRTC media + native SIP, with a Python voice worker doing streaming **speech-to-text → the bot's LLM → text-to-speech**.

```
Caller ⇄ Carrier SIP trunk ⇄ livekit-sip ⇄ LiveKit ⇄ voice-agent worker
                                                        │  Deepgram STT → bot LLM → TTS
                                                        └─ /internal/voice/* (bot config, knowledge, leads, call records)
Outbound: NestJS /voice/call → voice-agent → LiveKit dials the callee via the trunk
```

- `apps/voice-agent/` — the LiveKit worker (`app/worker.py`) + an outbound-call API (`app/main.py`). Provider is chosen per bot: `claude-*` → Anthropic, `gpt-*` → OpenAI, `gemini-*` → Google (same catalog as chat).
- NestJS `voice` module — maps phone numbers (DIDs) to bots, records every call with a transcript, exposes the admin + `/internal/voice/*` endpoints.
- Admin panel → a bot → **Voice** tab — attach a number, place a test outbound call, and read call history with transcripts.

### What you must supply (paid, external)

Unlike WhatsApp, phone calling can't be fully self-hosted — the PSTN requires a licensed carrier:

1. **A SIP trunk + phone number** from a carrier — **Telnyx** or **Twilio Elastic SIP** recommended. Pay per number + per minute.
2. **A Deepgram API key** for streaming STT (and the default TTS voice) — set `DEEPGRAM_API_KEY`. (TTS can switch to OpenAI with `VOICE_TTS_PROVIDER=openai`.)
3. An **LLM key** — the same provider keys you already added in the panel.

### Bring it up

```bash
# Start the voice stack (opt-in profile): LiveKit + Redis + SIP bridge + worker
docker compose --profile voice up -d livekit redis livekit-sip voice-agent

# One-time trunk provisioning (from apps/voice-agent, .venv active, LIVEKIT_*/SIP_* set):
python -m scripts.provision_trunk inbound  --numbers +14155550100
python -m scripts.provision_trunk outbound --address sip.telnyx.com --number +14155550100 \
    --username SIP_USER --password SIP_PASS      # prints SIP_OUTBOUND_TRUNK_ID → put in .env
```

Then point the carrier's inbound SIP for your DID at the LiveKit SIP endpoint, attach that number to a bot in the **Voice** tab, and call it. For outbound, enter a destination in the tab and hit **Call**.

> **Latency & cost:** target < ~1s response; Deepgram + a fast TTS + a mid-tier model (e.g. `claude-sonnet-5` or `gpt-5.4`) is the sweet spot. Every call is billed by the carrier (per-minute) **and** STT/TTS/LLM per usage — surface this in your client pricing (the cost calculator covers LLM tokens; add carrier + STT/TTS minutes on top).

## API surface (summary)

```
Auth        POST /v1/auth/register|login · GET /v1/auth/me
Admin       GET /v1/admin/clients?q&status&page&pageSize  (CRM: search/filter/paginate)
(operator)  POST /v1/admin/clients · GET|PATCH /v1/admin/clients/:orgId  (status/notes/plan/limit)
            GET /v1/admin/models · GET|POST /v1/admin/providers · DELETE .../providers/:id
            GET /v1/admin/templates
            GET|POST /v1/admin/clients/:orgId/bots · PATCH|DELETE .../bots/:botId
            GET|POST|DELETE .../bots/:botId/documents[/:documentId]
            GET .../bots/:botId/leads · GET .../bots/:botId/conversations
            GET /v1/admin/clients/:orgId/conversations/:id/messages
            POST|GET|DELETE .../bots/:botId/whatsapp     (connect / status+QR / disconnect)
Client      GET|POST /v1/bots · GET|PATCH|DELETE /v1/bots/:id · documents · leads ·
(tenant)    conversations · usage · POST|GET|DELETE /v1/bots/:botId/whatsapp
Public      GET /v1/public/bots/:publicId · POST /v1/public/chat (SSE)
Voice       GET|POST .../bots/:botId/voice/numbers · DELETE .../voice/numbers/:id
(operator)  POST .../bots/:botId/voice/call   (outbound) · GET .../voice/calls
Webhooks    POST /v1/channels/whatsapp/webhook   (OpenWA → us, HMAC sha256)
Internal    GET /internal/knowledge/search · POST /internal/leads          (AI engine → us)
            GET /internal/voice/resolve · POST /internal/voice/calls[/:id/finish]  (voice agent → us)
```

## Project layout

```
apps/admin/       Next.js operator panel (CRM, onboarding, bots, model picker, providers, calculator, WhatsApp QR)
apps/api/         NestJS — auth, admin/CRM, bots, templates, knowledge, catalog, providers (encrypted keys),
                  chat relay + cost engine, whatsapp, leads, usage
apps/ai-engine/   FastAPI — multi-provider agentic loop (providers/: anthropic, openai, gemini) + shared tools
apps/voice-agent/ LiveKit voice worker (STT→LLM→TTS) + outbound-call API + SIP trunk provisioning
seed-data/        vertical templates + starter knowledge + model-catalog.json (prices)
infra/            livekit.yaml, livekit-sip.yaml (self-hosted voice config)
docker-compose.yml  postgres + api + ai-engine + openwa  (+ voice profile: livekit + redis + livekit-sip + voice-agent)
```

## Production checklist

- [ ] Real `JWT_SECRET`, `INTERNAL_API_KEY`, `OPENWA_WEBHOOK_SECRET`, `ENCRYPTION_KEY` (rotating it makes stored provider keys unreadable — re-enter them); TLS in front of the API and panel.
- [ ] Keep `seed-data/model-catalog.json` prices current; they drive all cost/margin numbers.
- [ ] `DB_SYNC=false` + TypeORM migrations.
- [ ] Rate-limit `/v1/public/chat` and the WhatsApp webhook per bot.
- [ ] Verify the OpenWA image tag/version against its install docs; persist its volume; monitor session status (`action_required`/`failed` → re-pair).
- [ ] Billing: wire Stripe to `organizations.plan` / `monthlyMessageLimit`.
- [ ] Warn clients about unofficial WhatsApp automation in your ToS; dedicated numbers only.
