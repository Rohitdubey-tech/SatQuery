from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .analysis import make_chat_response, make_report, parse_query, run_analysis
from .demo_data import DETECTIONS, SCHOOL, buffer_polygon, demo_payload, detection_features, layer_catalog
from .schemas import AnalyzeRequest, BufferRequest, ChatRequest, QueryRequest, ReportRequest

app = FastAPI(title="SatQuery AI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "satquery-api"}


@app.get("/api/demo")
def demo() -> dict:
    return demo_payload()


@app.post("/api/query")
def query(request: QueryRequest) -> dict:
    return {"parsed_query": parse_query(request.query).model_dump()}


@app.post("/api/analyze")
def analyze(request: AnalyzeRequest) -> dict:
    return run_analysis(request.query, request.radius_m)


@app.get("/api/layers")
def layers() -> dict:
    return {"layers": layer_catalog()}


@app.get("/api/detections")
def detections() -> dict:
    return {"detections": DETECTIONS, "geojson": detection_features()}


@app.post("/api/gis/buffer")
def gis_buffer(request: BufferRequest) -> dict:
    return {
        "center": request.center,
        "radius_m": request.radius_m,
        "geojson": {
            "type": "Feature",
            "properties": {"id": f"buffer-{request.radius_m}", "radius_m": request.radius_m},
            "geometry": buffer_polygon(request.center or SCHOOL["coordinates"], request.radius_m),
        },
    }


@app.post("/api/chat")
def chat(request: ChatRequest) -> dict:
    return make_chat_response(request.message, request.radius_m)


@app.post("/api/report")
def report(request: ReportRequest) -> dict:
    return make_report(request.query, request.radius_m)
