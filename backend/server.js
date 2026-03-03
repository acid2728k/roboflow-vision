import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = Number(process.env.BACKEND_PORT || 8787);

app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/detect", async (req, res) => {
  try {
    const { image, threshold = 0.45, maxBoxes = 30, nms = 0.5 } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: "Missing image field (base64 data URL)." });
    }
    if (!process.env.RF_DETECT_URL) {
      // Fallback for quick demos; set RF_DETECT_URL/RF_API_KEY to enable real inference.
      void nms;
      const predictions = [
        { x: 520, y: 470, width: 300, height: 650, class: "person", confidence: 0.92 },
        { x: 760, y: 420, width: 190, height: 240, class: "banana", confidence: 0.88 },
        { x: 220, y: 540, width: 180, height: 210, class: "cup", confidence: 0.83 }
      ].filter((p) => p.confidence >= threshold).slice(0, maxBoxes);
      return res.json({ predictions, mock: true });
    }

    const headers = { "Content-Type": "application/json" };
    if (process.env.RF_API_KEY) {
      headers.Authorization = `Bearer ${process.env.RF_API_KEY}`;
    }

    const upstream = await fetch(process.env.RF_DETECT_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        image,
        threshold,
        max_predictions: maxBoxes,
        nms
      })
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: text });
    }

    try {
      return res.json(JSON.parse(text));
    } catch {
      return res.json({ raw: text });
    }
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
