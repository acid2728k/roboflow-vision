# roboflow-vision (MVP)

Vanilla JS web app for object detection + scene caption:

- webcam stream
- overlay with bounding boxes
- metrics panel (object count, fps, latency, class bars)
- mini heatmap
- scene caption updates every N seconds

## Quick start

1. Copy `.env.example` to `.env`
2. Fill endpoints and keys
3. Install deps and run:

```bash
npm install
npm run server
npm run dev
```

Frontend: `http://localhost:5173`  
Backend proxy: `http://localhost:8787`

## API contract examples ( TODO adjust to your providers )

### Detection request

```json
{
  "image": "data:image/jpeg;base64,...",
  "threshold": 0.45,
  "max_predictions": 30,
  "nms": 0.5
}
```

### Detection response (supported parser formats)

```json
{
  "predictions": [
    { "x": 320, "y": 220, "width": 120, "height": 90, "class": "banana", "confidence": 0.93 }
  ]
}
```

or

```json
{
  "detections": [
    { "xmin": 110, "ymin": 80, "xmax": 210, "ymax": 180, "label": "cup", "score": 0.89 }
  ]
}
```

### Caption request

```json
{
  "image": "data:image/jpeg;base64,...",
  "prompt": "Describe the scene in one concise sentence."
}
```

### Caption response (supported parser formats)

```json
{ "caption": "A person holds a banana and a cup in a living room." }
```

or

```json
{
  "choices": [
    { "message": { "content": "A person holds a banana and a cup in a living room." } }
  ]
}
```
