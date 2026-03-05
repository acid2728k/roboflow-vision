import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = Number(process.env.BACKEND_PORT || 8787);

app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

function getRawBase64(image) {
  if (!image || typeof image !== "string") return "";
  return image.replace(/^data:image\/\w+;base64,/, "");
}

function isServerlessV2(url) {
  return url && (url.includes("serverless.roboflow.com") || url.includes("inference.roboflow.com"));
}

app.post("/api/detect", async (req, res) => {
  try {
    const { image, threshold = 0.45, maxBoxes = 30, nms = 0.5 } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: "Missing image field (base64 data URL)." });
    }
    if (!process.env.RF_DETECT_URL) {
      void nms;
      const predictions = [
        { x: 520, y: 470, width: 300, height: 650, class: "person", confidence: 0.92 },
        { x: 760, y: 420, width: 190, height: 240, class: "banana", confidence: 0.88 },
        { x: 220, y: 540, width: 180, height: 210, class: "cup", confidence: 0.83 }
      ].filter((p) => p.confidence >= threshold).slice(0, maxBoxes);
      return res.json({ predictions, mock: true });
    }

    const rawBase64 = getRawBase64(image);
    const headers = { "Content-Type": "application/json" };
    let url = process.env.RF_DETECT_URL;
    let body;

    if (isServerlessV2(url)) {
      // Serverless v2 / Workflow: "inputs" required; value = raw base64 (no data URL prefix).
      body = {
        inputs: {
          image: { type: "base64", value: rawBase64 }
        }
      };
      if (process.env.RF_API_KEY) body.api_key = process.env.RF_API_KEY;
      const params = new URLSearchParams();
      if (process.env.RF_API_KEY) params.set("api_key", process.env.RF_API_KEY);
      params.set("confidence", String(threshold));
      params.set("overlap", String(nms));
      params.set("max_detections", String(maxBoxes));
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}${params.toString()}`;
    } else {
      // Legacy Hosted (e.g. detect.roboflow.com): image in body or as raw base64.
      if (process.env.RF_API_KEY) {
        headers.Authorization = `Bearer ${process.env.RF_API_KEY}`;
      }
      body = {
        image: rawBase64,
        threshold,
        max_predictions: maxBoxes,
        nms
      };
      if (url.includes("api_key=") === false && process.env.RF_API_KEY) {
        const sep = url.includes("?") ? "&" : "?";
        url = `${url}${sep}api_key=${encodeURIComponent(process.env.RF_API_KEY)}`;
      }
    }

    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: text });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.json({ raw: text, predictions: [] });
    }

    // Roboflow may return error message in body with 200
    if (data.message && (data.message.includes("Failed to assemble") || data.message.includes("Error") || data.message.includes("invalid"))) {
      return res.status(502).json({ error: data.message, predictions: [] });
    }

    // Normalize: extract predictions from various response shapes (API, Workflow, etc.)
    const rawList =
      data.predictions ??
      data.detections ??
      data.results ??
      data.outputs?.predictions ??
      data.outputs?.detections ??
      data.result?.predictions ??
      [];
    const list = Array.isArray(rawList) ? rawList : [];
    return res.json({ predictions: list });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/caption", async (req, res) => {
  try {
    const { image } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: "Missing image field (base64 data URL)." });
    }
    if (!process.env.SMOLVLM_URL) {
      return res.json({
        caption: "A person holds a banana and a cup in a living room.",
        mock: true
      });
    }

    const headers = { "Content-Type": "application/json" };
    if (process.env.SMOLVLM_API_KEY) {
      headers.Authorization = `Bearer ${process.env.SMOLVLM_API_KEY}`;
    }

    const upstream = await fetch(process.env.SMOLVLM_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        image,
        prompt: "Describe the scene in one concise sentence."
      })
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: text });
    }

    try {
      return res.json(JSON.parse(text));
    } catch {
      return res.json({ caption: text });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`[roboflow-vision] proxy listening on http://localhost:${port}`);
});
