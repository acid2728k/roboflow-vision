import "./style.css";
import { config } from "./config";
import { InferenceClient } from "./api";

const ui = {
  video: document.getElementById("video"),
  overlay: document.getElementById("overlay"),
  heatmapCanvas: document.getElementById("heatmapCanvas"),
  objectsCount: document.getElementById("objectsCount"),
  fpsValue: document.getElementById("fpsValue"),
  latencyValue: document.getElementById("latencyValue"),
  classBars: document.getElementById("classBars"),
  captionBar: document.getElementById("captionBar"),
  logOutput: document.getElementById("logOutput"),
  cameraSelect: document.getElementById("cameraSelect"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  thresholdInput: document.getElementById("thresholdInput"),
  thresholdValue: document.getElementById("thresholdValue"),
  maxBoxesInput: document.getElementById("maxBoxesInput"),
  nmsInput: document.getElementById("nmsInput"),
  inferFpsInput: document.getElementById("inferFpsInput"),
  captureScaleInput: document.getElementById("captureScaleInput"),
  captionIntervalInput: document.getElementById("captionIntervalInput"),
  apiModeInput: document.getElementById("apiModeInput"),
  showBoxesToggle: document.getElementById("showBoxesToggle"),
  showHeatmapToggle: document.getElementById("showHeatmapToggle"),
  showCaptionToggle: document.getElementById("showCaptionToggle")
};

const overlayCtx = ui.overlay.getContext("2d");
const heatCtx = ui.heatmapCanvas.getContext("2d");
const captureCanvas = document.createElement("canvas");
const captureCtx = captureCanvas.getContext("2d", { willReadFrequently: false });

const client = new InferenceClient();

const state = {
  running: false,
  stream: null,
  detections: [],
  latencyMs: null,
  inferBusy: false,
  renderRafId: null,
  lastCaptionAt: 0,
  lastCaptionText: "Waiting for scene description...",
  inferenceTimestamps: [],
  heatGridCols: 11,
  heatGridRows: 7,
  heatGrid: [],
  captureWidth: 0,
  captureHeight: 0
};

function initHeatGrid() {
  state.heatGrid = Array.from({ length: state.heatGridRows }, () =>
    Array.from({ length: state.heatGridCols }, () => 0)
  );
}

function logLine(text) {
  const now = new Date().toLocaleTimeString();
  ui.logOutput.textContent = `[${now}] ${text}\n${ui.logOutput.textContent}`.slice(0, 5000);
}

function getSettings() {
  return {
    threshold: Number(ui.thresholdInput.value),
    maxBoxes: Number(ui.maxBoxesInput.value),
    nms: Number(ui.nmsInput.value),
    inferFps: Number(ui.inferFpsInput.value),
    captureScale: Number(ui.captureScaleInput.value),
    captionIntervalSec: Number(ui.captionIntervalInput.value),
    apiMode: ui.apiModeInput.value,
    showBoxes: ui.showBoxesToggle.checked,
    showHeatmap: ui.showHeatmapToggle.checked,
    showCaption: ui.showCaptionToggle.checked
  };
}

function hashColor(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 85% 62%)`;
}

function clearOverlay() {
  overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
  overlayCtx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);
}

function fitOverlayToVideo() {
  const width = ui.video.videoWidth || 1280;
  const height = ui.video.videoHeight || 720;
  if (ui.overlay.width !== width || ui.overlay.height !== height) {
    ui.overlay.width = width;
    ui.overlay.height = height;
  }
}

function drawDetections() {
  const { showBoxes } = getSettings();
  if (!showBoxes) {
    return;
  }
  // Mirror drawing horizontally to match mirrored video element.
  overlayCtx.save();
  overlayCtx.setTransform(-1, 0, 0, 1, ui.overlay.width, 0);
  overlayCtx.lineWidth = 2;
  overlayCtx.font = "15px monospace";
  state.detections.forEach((det) => {
    const color = hashColor(det.class);
    overlayCtx.strokeStyle = color;
    overlayCtx.fillStyle = color;
    overlayCtx.strokeRect(det.x, det.y, det.width, det.height);
    const label = `${det.class} ${(det.confidence * 100).toFixed(1)}%`;
    overlayCtx.fillRect(det.x, Math.max(0, det.y - 18), overlayCtx.measureText(label).width + 8, 18);
    overlayCtx.fillStyle = "#08101b";
    overlayCtx.fillText(label, det.x + 4, Math.max(12, det.y - 5));
  });
  overlayCtx.restore();
}

function decayHeatmap() {
  for (let y = 0; y < state.heatGridRows; y += 1) {
    for (let x = 0; x < state.heatGridCols; x += 1) {
      state.heatGrid[y][x] *= 0.96;
    }
  }
}

function updateHeatmapFromDetections() {
  state.detections.forEach((det) => {
    const cx = det.x + det.width / 2;
    const cy = det.y + det.height / 2;
    const gx = Math.floor((cx / ui.overlay.width) * state.heatGridCols);
    const gy = Math.floor((cy / ui.overlay.height) * state.heatGridRows);
    if (gx >= 0 && gy >= 0 && gx < state.heatGridCols && gy < state.heatGridRows) {
      state.heatGrid[gy][gx] = Math.min(1, state.heatGrid[gy][gx] + Math.max(0.08, det.confidence * 0.5));
    }
  });
}

function drawHeatmap() {
  const { showHeatmap } = getSettings();
  heatCtx.clearRect(0, 0, ui.heatmapCanvas.width, ui.heatmapCanvas.height);
  if (!showHeatmap) {
    return;
  }
  const cw = ui.heatmapCanvas.width / state.heatGridCols;
  const ch = ui.heatmapCanvas.height / state.heatGridRows;
  for (let y = 0; y < state.heatGridRows; y += 1) {
    for (let x = 0; x < state.heatGridCols; x += 1) {
      const v = Math.max(0, Math.min(1, state.heatGrid[y][x]));
      const hue = 120 - Math.floor(v * 120);
      heatCtx.fillStyle = `hsl(${hue} 90% ${25 + v * 35}%)`;
      heatCtx.fillRect(x * cw, y * ch, cw - 1, ch - 1);
    }
  }
}

function renderClassBars() {
  const counts = new Map();
  state.detections.forEach((det) => {
    counts.set(det.class, (counts.get(det.class) || 0) + 1);
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!entries.length) {
    ui.classBars.innerHTML = "<div class='class-row'>No classes yet.</div>";
    return;
  }
  const max = entries[0][1];
  ui.classBars.innerHTML = entries
    .map(([label, count]) => {
      const pct = (count / max) * 100;
      const color = hashColor(label);
      return `<div class="class-row">
        <span>${label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color};"></div></div>
        <span>${count}</span>
      </div>`;
    })
    .join("");
}

function updateMetrics() {
  ui.objectsCount.textContent = String(state.detections.length);
  ui.latencyValue.textContent = state.latencyMs == null ? "-" : `${state.latencyMs.toFixed(0)} ms`;

  if (state.inferenceTimestamps.length >= 2) {
    const deltas = [];
    for (let i = 1; i < state.inferenceTimestamps.length; i += 1) {
      deltas.push(state.inferenceTimestamps[i] - state.inferenceTimestamps[i - 1]);
    }
    const avgDelta = deltas.reduce((sum, item) => sum + item, 0) / deltas.length;
    ui.fpsValue.textContent = `${(1000 / avgDelta).toFixed(1)}`;
  } else {
    ui.fpsValue.textContent = "0.0";
  }
}

function drawFrame() {
  if (!state.running) {
    clearOverlay();
    return;
  }
  fitOverlayToVideo();
  clearOverlay();
  drawDetections();
  decayHeatmap();
  updateHeatmapFromDetections();
  drawHeatmap();
  updateMetrics();
  renderClassBars();
  state.renderRafId = requestAnimationFrame(drawFrame);
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter((device) => device.kind === "videoinput");
  ui.cameraSelect.innerHTML = "";
  videoDevices.forEach((device, idx) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Camera ${idx + 1}`;
    ui.cameraSelect.appendChild(option);
  });
}

async function startCamera(deviceId) {
  const constraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 }
    },
    audio: false
  };
  state.stream = await navigator.mediaDevices.getUserMedia(constraints);
  ui.video.srcObject = state.stream;
  await ui.video.play();
  await listCameras();
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }
  state.stream = null;
  ui.video.srcObject = null;
}

function captureFrameBase64(scale = 0.75, quality = 0.72) {
  const width = Math.max(32, Math.floor(ui.video.videoWidth * scale));
  const height = Math.max(32, Math.floor(ui.video.videoHeight * scale));
  captureCanvas.width = width;
  captureCanvas.height = height;
  captureCtx.drawImage(ui.video, 0, 0, width, height);
  state.captureWidth = width;
  state.captureHeight = height;
  return captureCanvas.toDataURL("image/jpeg", quality);
}

function mapDetectionsToVideoCoords(detections) {
  const ratioX = ui.video.videoWidth / Math.max(1, state.captureWidth);
  const ratioY = ui.video.videoHeight / Math.max(1, state.captureHeight);
  return detections.map((det) => ({
    ...det,
    x: det.x * ratioX,
    y: det.y * ratioY,
    width: det.width * ratioX,
    height: det.height * ratioY
  }));
}

async function runInferenceLoop() {
  while (state.running) {
    const settings = getSettings();
    const targetMs = Math.max(30, 1000 / Math.max(1, settings.inferFps));
    const startedAt = performance.now();

    if (!state.inferBusy) {
      state.inferBusy = true;
      try {
        const frame = captureFrameBase64(settings.captureScale);
        const detectStart = performance.now();
        const detections = await client.detect({
          imageBase64: frame,
          threshold: settings.threshold,
          maxBoxes: settings.maxBoxes,
          nms: settings.nms,
          apiMode: settings.apiMode
        });
        state.detections = mapDetectionsToVideoCoords(detections);
        state.latencyMs = performance.now() - detectStart;
        state.inferenceTimestamps.push(performance.now());
        if (state.inferenceTimestamps.length > 20) {
          state.inferenceTimestamps.shift();
        }

        const now = performance.now();
        if (now - state.lastCaptionAt > settings.captionIntervalSec * 1000) {
          try {
            const caption = await client.caption({
              imageBase64: frame,
              apiMode: settings.apiMode
            });
            state.lastCaptionText = caption;
            if (settings.showCaption) {
              ui.captionBar.textContent = caption;
            }
          } catch (error) {
            logLine(`Caption error: ${error.message}`);
          } finally {
            state.lastCaptionAt = now;
          }
        }
      } catch (error) {
        logLine(`Detect error: ${error.message}`);
      } finally {
        state.inferBusy = false;
      }
    }

    const elapsed = performance.now() - startedAt;
    const sleepMs = Math.max(10, targetMs - elapsed);
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
}

async function startApp() {
  if (state.running) {
    return;
  }
  try {
    initHeatGrid();
    await startCamera(ui.cameraSelect.value);
    state.running = true;
    ui.startBtn.disabled = true;
    ui.stopBtn.disabled = false;
    ui.captionBar.textContent = state.lastCaptionText;
    state.renderRafId = requestAnimationFrame(drawFrame);
    runInferenceLoop();
    logLine("Started vision pipeline.");
  } catch (error) {
    logLine(`Start failed: ${error.message}`);
  }
}

function stopApp() {
  state.running = false;
  stopCamera();
  state.detections = [];
  if (state.renderRafId) {
    cancelAnimationFrame(state.renderRafId);
    state.renderRafId = null;
  }
  clearOverlay();
  ui.startBtn.disabled = false;
  ui.stopBtn.disabled = true;
  logLine("Stopped.");
}

function bindUi() {
  ui.apiModeInput.value = config.defaultApiMode;
  ui.thresholdInput.addEventListener("input", () => {
    ui.thresholdValue.textContent = Number(ui.thresholdInput.value).toFixed(2);
  });
  ui.startBtn.addEventListener("click", startApp);
  ui.stopBtn.addEventListener("click", stopApp);
  ui.showCaptionToggle.addEventListener("change", () => {
    ui.captionBar.style.display = ui.showCaptionToggle.checked ? "block" : "none";
    if (ui.showCaptionToggle.checked) {
      ui.captionBar.textContent = state.lastCaptionText;
    }
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", listCameras);
}

async function bootstrap() {
  bindUi();
  initHeatGrid();
  ui.thresholdValue.textContent = Number(ui.thresholdInput.value).toFixed(2);
  ui.captionBar.textContent = state.lastCaptionText;
  try {
    await startCamera("");
    stopCamera();
    await listCameras();
    logLine("Ready. Select camera and press Start.");
  } catch (error) {
    logLine(`Camera setup failed: ${error.message}`);
  }
}

bootstrap();
