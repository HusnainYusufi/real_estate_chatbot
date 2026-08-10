"""FastAPI surface of the AI engine.

Single job: turn a ChatRequest into a Server-Sent-Events stream. All state
(bots, conversations, knowledge, leads) lives behind the NestJS API.
"""

import json

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse

from . import config
from .engine import run_chat
from .schemas import ChatRequest

app = FastAPI(title="Chatbot Suite — AI Engine", version="0.1.0")


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    x_internal_key: str | None = Header(default=None),
) -> StreamingResponse:
    if x_internal_key != config.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal key")

    async def sse():
        async for event, data in run_chat(request):
            yield f"event: {event}\ndata: {json.dumps(data)}\n\n"

    return StreamingResponse(
        sse(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
