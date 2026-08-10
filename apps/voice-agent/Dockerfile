FROM python:3.12-slim

# libgomp1 is needed by the Silero VAD (onnxruntime) plugin.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scripts ./scripts

# Pre-download the Silero VAD / turn-detection model weights into the image.
RUN python -m app.worker download-files || true

EXPOSE 8100
# Runs BOTH the control API (outbound trigger) and the LiveKit worker.
CMD ["sh", "-c", "python -m app.worker start & uvicorn app.main:app --host 0.0.0.0 --port 8100"]
