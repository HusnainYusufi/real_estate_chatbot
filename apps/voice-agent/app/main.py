"""Control surface for the voice agent.

- POST /calls/outbound : the NestJS API calls this to place an outbound call.
  We create a LiveKit room, dispatch our agent into it with metadata, and add a
  SIP participant that dials the callee through the configured trunk.
- GET  /healthz

The realtime media loop itself runs in the LiveKit worker (worker.py), which
registers with the LiveKit server separately.
"""

import json

from fastapi import FastAPI, Header, HTTPException
from livekit import api
from pydantic import BaseModel

from . import config

app = FastAPI(title="Chatbot Suite — Voice Agent", version="0.1.0")


class OutboundCall(BaseModel):
    bot_id: str
    to_number: str  # E.164, e.g. +14155551234
    from_number: str | None = None
    call_id: str | None = None  # control-plane call record id, for correlation


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True, "sipConfigured": bool(config.SIP_OUTBOUND_TRUNK_ID)}


@app.post("/calls/outbound")
async def outbound(call: OutboundCall, x_internal_key: str | None = Header(default=None)) -> dict:
    if x_internal_key != config.INTERNAL_API_KEY:
        raise HTTPException(401, "Invalid internal key")
    if not config.SIP_OUTBOUND_TRUNK_ID:
        raise HTTPException(
            503,
            "Outbound calling not configured. Set SIP_OUTBOUND_TRUNK_ID (create an "
            "outbound trunk with scripts/provision_trunk.py using your carrier's SIP "
            "credentials).",
        )

    room_name = f"voice-out-{call.call_id or call.to_number.replace('+', '')}"
    lk = api.LiveKitAPI(
        url=config.LIVEKIT_URL, api_key=config.LIVEKIT_API_KEY, api_secret=config.LIVEKIT_API_SECRET
    )
    try:
        # 1) Dispatch our agent into the room, telling it who it's calling as.
        await lk.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name="chatbot-suite-voice",
                room=room_name,
                metadata=json.dumps(
                    {
                        "direction": "outbound",
                        "botId": call.bot_id,
                        "to": call.to_number,
                        "callId": call.call_id,
                    }
                ),
            )
        )
        # 2) Dial the callee and drop them into the same room.
        participant = await lk.sip.create_sip_participant(
            api.CreateSIPParticipantRequest(
                sip_trunk_id=config.SIP_OUTBOUND_TRUNK_ID,
                sip_call_to=call.to_number,
                room_name=room_name,
                participant_identity=f"caller-{call.to_number}",
                wait_until_answered=False,
            )
        )
    finally:
        await lk.aclose()

    return {"room": room_name, "participantId": participant.participant_id}
