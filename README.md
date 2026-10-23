# SatQuery AI - Working Prototype

SatQuery AI is a local demo prototype for natural-language satellite investigation workflows. It turns an analyst question into a deterministic geospatial analysis, renders map layers and evidence, supports constrained follow-up chat, and produces a printable incident report.

## What is included

- React + TypeScript + Vite frontend
- FastAPI backend with deterministic demo providers
- Leaflet map with AOI, school buffers, Jan/Aug detection layers, and building footprints
- Natural-language query parsing for the demo scenario
- Calculated metrics for 1 km and 500 m school buffers
- Evidence panel, timeline, chat, and report preview
- Offline-friendly fallback data in the frontend if the backend is unavailable

## Demo query

```text
Compare the Jan and Aug satellite images and find new construction within 1 km of the school.
```

Expected result:

- 37 new construction detections across the AOI
- 31 detections inside the 1 km school buffer
- 18 detections inside the 500 m school buffer
- Change confidence, evidence records, layer metadata, and a report summary

## Run locally

Install and start the backend:

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Install and start the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173
```

## API

- `GET /api/health`
- `GET /api/demo`
- `POST /api/query`
- `POST /api/analyze`
- `GET /api/layers`
- `GET /api/detections`
- `POST /api/gis/buffer`
- `POST /api/chat`
- `POST /api/report`

## Notes

The prototype uses fictional but georeferenced demo data around a compact area of interest. The provider interfaces and endpoint shapes are designed so demo providers can later be replaced by real satellite search, CV segmentation, vector GIS, weather, and LLM services.
