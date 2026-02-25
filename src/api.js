import { config } from "./config";

function normalizeDetection(prediction) {
  const confidence = Number(prediction.confidence ?? prediction.score ?? 0);
  const label = prediction.class ?? prediction.label ?? "unknown";

  if (
    typeof prediction.x === "number" &&
    typeof prediction.y === "number" &&
    typeof prediction.width === "number" &&
    typeof prediction.height === "number"
  ) {
    return {
      x: prediction.x - prediction.width / 2,
      y: prediction.y - prediction.height / 2,
      width: prediction.width,
      height: prediction.height,
      class: label,
      confidence
    };
  }

  if (
    typeof prediction.xmin === "number" &&
    typeof prediction.ymin === "number" &&
    typeof prediction.xmax === "number" &&
    typeof prediction.ymax === "number"
  ) {
    return {
      x: prediction.xmin,
      y: prediction.ymin,
      width: prediction.xmax - prediction.xmin,
      height: prediction.ymax - prediction.ymin,
      class: label,
      confidence
    };
  }

  return null;
}

function parseDetections(payload) {
  const raw = payload?.predictions ?? payload?.detections ?? payload?.results ?? [];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(normalizeDetection).filter(Boolean);
}

function parseCaption(payload) {
  return (
    payload?.caption ||
    payload?.description ||
    payload?.result?.caption ||
    payload?.choices?.[0]?.message?.content ||
    "No caption available."
  );
}

async function safeFetch(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

export class InferenceClient {
  async detect({ imageBase64, threshold, maxBoxes, nms, apiMode }) {
    if (apiMode === "hosted") {
      if (!config.hosted.rfDetectUrl) {
        throw new Error("Missing VITE_RF_DETECT_URL for hosted mode.");
      }
      const headers = {
        "Content-Type": "application/json"
      };
      if (config.hosted.rfApiKey) {
        headers.Authorization = `Bearer ${config.hosted.rfApiKey}`;
      }

      const payload = await safeFetch(config.hosted.rfDetectUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          image: imageBase64,
          threshold,
          max_predictions: maxBoxes,
          nms
        })
      });

      return parseDetections(payload);
    }

    const payload = await safeFetch(config.proxy.detectUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageBase64, threshold, maxBoxes, nms })
    });
    return parseDetections(payload);
  }

  async caption({ imageBase64, apiMode }) {
    if (apiMode === "hosted") {
      if (!config.hosted.smolvlmUrl) {
        throw new Error("Missing VITE_SMOLVLM_URL for hosted mode.");
      }
      const headers = {
        "Content-Type": "application/json"
      };
      if (config.hosted.smolvlmApiKey) {
        headers.Authorization = `Bearer ${config.hosted.smolvlmApiKey}`;
      }

      const payload = await safeFetch(config.hosted.smolvlmUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          image: imageBase64,
          prompt: "Describe the current scene in one concise sentence."
        })
      });

      return parseCaption(payload);
    }

    const payload = await safeFetch(config.proxy.captionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageBase64 })
    });
    return parseCaption(payload);
  }
}
