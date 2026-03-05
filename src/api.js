import { config } from "./config";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function mockDetections({ threshold = 0.45, maxBoxes = 30 }) {
  const t = performance.now() / 1000;
  const seed = Math.floor(t * 2);
  const rand = mulberry32(seed);

  const base = [
    { class: "person", confidence: 0.92, x: 0.44, y: 0.18, w: 0.28, h: 0.62 },
    { class: "banana", confidence: 0.88, x: 0.67, y: 0.30, w: 0.18, h: 0.22 },
    { class: "cup", confidence: 0.83, x: 0.18, y: 0.44, w: 0.16, h: 0.18 }
  ];

  // Small movement + optional extra boxes to stress UI a bit.
  const extras = [];
  const extraCount = clamp(Math.floor(rand() * 6), 0, 5);
  for (let i = 0; i < extraCount; i += 1) {
    const c = rand() > 0.5 ? "book" : "chair";
    extras.push({
      class: c,
      confidence: 0.35 + rand() * 0.45,
      x: rand() * 0.85,
      y: rand() * 0.75,
      w: 0.08 + rand() * 0.12,
      h: 0.08 + rand() * 0.18
    });
  }

  const all = [...base, ...extras]
    .map((d, idx) => {
      const dx = Math.sin(t * (0.6 + idx * 0.12)) * 0.01;
      const dy = Math.cos(t * (0.7 + idx * 0.1)) * 0.01;
      return {
        x: clamp(d.x + dx, 0.02, 0.92),
        y: clamp(d.y + dy, 0.02, 0.92),
        width: d.w,
        height: d.h,
        class: d.class,
        confidence: d.confidence
      };
    })
    .filter((d) => d.confidence >= threshold)
    .slice(0, maxBoxes);

  // Return in "pixel-like" coords relative to a 1000x1000 input, so existing mapping works.
  return all.map((d) => ({
    x: d.x * 1000,
    y: d.y * 1000,
    width: d.width * 1000,
    height: d.height * 1000,
    class: d.class,
    confidence: d.confidence
  }));
}

function mockCaption() {
  const t = Math.floor(performance.now() / 1000);
  const variants = [
    "A person holds a banana and a cup in a living room.",
    "A person is standing indoors while holding a banana and a mug.",
    "A person is facing the camera, holding a banana and a cup."
  ];
  return variants[t % variants.length];
}

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
  const raw =
    payload?.predictions ??
    payload?.detections ??
    payload?.results ??
    payload?.outputs?.predictions ??
    payload?.outputs?.detections ??
    payload?.result?.predictions ??
    [];
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
    if (apiMode === "mock") {
      // No network calls. Returns deterministic, slightly animated mock boxes.
      // `imageBase64` is unused by design.
      void imageBase64;
      void nms;
      return mockDetections({ threshold, maxBoxes });
    }

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
    if (apiMode === "mock") {
      void imageBase64;
      return mockCaption();
    }

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
