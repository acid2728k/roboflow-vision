# roboflow-vision

Web app for real-time object detection and scene description using the camera. Built with vanilla JavaScript (no React/Vue), Vite, and an optional Express proxy for secure API keys.

## Features

- **Webcam stream** with optional horizontal mirror (selfie-style).
- **Bounding boxes** overlaid on the video with class labels and confidence.
- **Left panel**: object count, inference FPS, latency, class chips (wrap layout), mini heatmap, controls, log.
- **Scene caption** at the bottom, updated at a configurable interval (e.g. from smolVLM or similar).
- **Configurable**: confidence threshold, max boxes, NMS, inference FPS, capture scale, caption interval, API mode (mock / proxy / hosted).

## Quick start

Runs out of the box in **mock mode** (no API keys).

```bash
npm install
npm run dev
```

Open **http://localhost:5173**, choose a camera, and press **Start**.

## Real inference (Roboflow + optional caption)

Use the backend proxy to keep API keys out of the browser bundle.

1. Copy `.env.example` to `.env` and set:
   - **RF_DETECT_URL** — your **model inference** endpoint (object detection), not a Workflow. In Roboflow: project → **Deploy** → your trained model → **Hosted API** / **Inference** → copy that URL.
   - **RF_API_KEY** — Private API key from the same workspace as the model.
   - Optionally **SMOLVLM_URL** and **SMOLVLM_API_KEY** for scene caption.
2. Start backend and frontend:

```bash
npm run server
npm run dev
```

Backend: **http://localhost:8787** (Vite proxies `/api/*` to it).

## API modes

| Mode   | Description |
|--------|-------------|
| **mock**  | No network; demo detections and caption. |
| **proxy** | Frontend calls `/api/detect` and `/api/caption`; keys stay on the backend. |
| **hosted**| Frontend calls Roboflow/caption endpoints directly (keys in env may be exposed in the bundle). |

## Project structure

```
roboflow-vision/
├── index.html
├── package.json
├── vite.config.js
├── .env.example       # Template; copy to .env (not committed)
├── backend/
│   └── server.js     # Express proxy: /api/detect, /api/caption
└── src/
    ├── main.js       # UI, camera, overlay, inference loop
    ├── api.js        # Inference client (mock, proxy, hosted)
    ├── config.js     # Env-based config
    └── style.css
```

## Configuration

- **Environment**: all secrets and URLs in `.env` (see `.env.example`). Do not commit `.env`.
- **Backend** reads `RF_DETECT_URL`, `RF_API_KEY`, `SMOLVLM_URL`, `SMOLVLM_API_KEY`, `BACKEND_PORT`.
- **Frontend** (hosted mode only) uses `VITE_RF_DETECT_URL`, `VITE_RF_API_KEY`, `VITE_SMOLVLM_*`, `VITE_API_MODE`.

## API contract (backend ↔ Roboflow)

**Detection request** (backend sends to Roboflow):

- **Legacy** (e.g. `detect.roboflow.com`): body `{ image: "<raw base64>", threshold, max_predictions, nms }`.
- **Serverless v2** (e.g. `serverless.roboflow.com`): body `{ inputs: { image: { type: "base64", value: "<raw base64>" } }, api_key? }`, plus query params `confidence`, `overlap`, `max_detections`.

**Detection response**: backend normalizes to `{ predictions: [ { x, y, width, height, class, confidence } ] }` (center form converted to top-left where needed). Supports `predictions`, `detections`, `results`, `outputs.predictions`, etc.

## License

Private / unlicensed unless stated otherwise.
