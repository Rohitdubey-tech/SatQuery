from __future__ import annotations

from statistics import mean
from typing import Any

from .demo_data import AUG_IMAGE, DETECTIONS, JAN_IMAGE, SCHOOL, buffer_polygon, context_features, detection_features, haversine_m, layer_catalog
from .schemas import ParsedQuery


def parse_query(query: str) -> ParsedQuery:
    text = query.lower()
    radius_m = 1000
    if "500" in text:
        radius_m = 500
    elif "1 km" in text or "1km" in text or "1000" in text:
        radius_m = 1000

    supported = all(term in text for term in ["construction", "school"]) and (
        "compare" in text or "new" in text or "change" in text
    )
    return ParsedQuery(
        intent="change_detection" if supported else "unsupported",
        target="new construction",
        date_range=[JAN_IMAGE["date"], AUG_IMAGE["date"]],
        relation="within",
        anchor=SCHOOL["name"],
        radius_m=radius_m,
        filters=["building-like footprint", "new in August", "absent in January"],
        confidence=0.91 if supported else 0.48,
    )


def summarize_for_radius(radius_m: int) -> dict[str, Any]:
    inside = [item for item in DETECTIONS if item["distance_to_school_m"] <= radius_m]
    outside = [item for item in DETECTIONS if item["distance_to_school_m"] > radius_m]
    total_area = round(sum(item["area_sqm"] for item in inside), 1)
    avg_conf = round(mean([item["confidence"] for item in inside]), 2) if inside else 0
    high_conf = len([item for item in inside if item["confidence"] >= 0.84])
    return {
        "radius_m": radius_m,
        "total_detections": len(DETECTIONS),
        "inside_buffer": len(inside),
        "outside_buffer": len(outside),
        "high_confidence_inside": high_conf,
        "total_new_area_sqm": total_area,
        "average_confidence": avg_conf,
        "nearest_detection_m": min(item["distance_to_school_m"] for item in DETECTIONS),
        "farthest_inside_m": max([item["distance_to_school_m"] for item in inside], default=0),
    }


def run_analysis(query: str, radius_m: int = 1000) -> dict[str, Any]:
    parsed = parse_query(query)
    selected_radius = parsed.radius_m if radius_m == 1000 else radius_m
    summary = summarize_for_radius(selected_radius)
    ranked = sorted(DETECTIONS, key=lambda item: (item["distance_to_school_m"], -item["confidence"]))
    evidence = [
        {
            "id": item["id"],
            "distance_to_school_m": item["distance_to_school_m"],
            "confidence": item["confidence"],
            "area_sqm": item["area_sqm"],
            "assessment": "Inside requested buffer" if item["distance_to_school_m"] <= selected_radius else "Outside requested buffer",
            "notes": item["evidence"],
        }
        for item in ranked[:8]
    ]
    return {
        "query": query,
        "parsed_query": parsed.model_dump(),
        "summary": summary,
        "images": [JAN_IMAGE, AUG_IMAGE],
        "school": SCHOOL,
        "layers": layer_catalog(),
        "detections": DETECTIONS,
        "detections_geojson": detection_features(),
        "context_geojson": context_features(),
        "buffer_geojson": {
            "type": "Feature",
            "properties": {"id": f"analysis-buffer-{selected_radius}", "radius_m": selected_radius},
            "geometry": buffer_polygon(SCHOOL["coordinates"], selected_radius),
        },
        "evidence": evidence,
        "pipeline": [
            {"name": "Parse query", "status": "complete", "detail": "Detected change analysis intent, target, dates, anchor, and radius."},
            {"name": "Load imagery", "status": "complete", "detail": "Loaded January baseline and August observation scenes."},
            {"name": "Run CV change model", "status": "complete", "detail": "Segmented candidate new construction footprints."},
            {"name": "Apply GIS filter", "status": "complete", "detail": f"Measured distance from each footprint to the school and applied {selected_radius} m buffer."},
            {"name": "Compile evidence", "status": "complete", "detail": "Ranked detections by proximity and confidence for analyst review."},
        ],
        "answer": (
            f"Detected {summary['total_detections']} new construction candidates between {JAN_IMAGE['date']} "
            f"and {AUG_IMAGE['date']}. {summary['inside_buffer']} are within {selected_radius} m of "
            f"{SCHOOL['name']}, covering about {summary['total_new_area_sqm']} sqm."
        ),
    }


def make_chat_response(message: str, radius_m: int = 1000) -> dict[str, Any]:
    text = message.lower()
    if "500" in text:
        radius_m = 500
    summary = summarize_for_radius(radius_m)
    if "confidence" in text:
        answer = (
            f"The average confidence for detections inside {radius_m} m is {summary['average_confidence']}. "
            f"{summary['high_confidence_inside']} detections are at or above 0.84 confidence."
        )
    elif "area" in text or "size" in text:
        answer = f"Inside {radius_m} m, the estimated new built-up footprint area is {summary['total_new_area_sqm']} sqm."
    elif "500" in text:
        answer = f"There are {summary['inside_buffer']} new construction detections within 500 m of the school."
    elif "nearest" in text or "closest" in text:
        nearest = min(DETECTIONS, key=lambda item: item["distance_to_school_m"])
        answer = f"The closest detection is {nearest['id']} at {nearest['distance_to_school_m']} m from the school."
    else:
        answer = (
            f"For the {radius_m} m buffer, {summary['inside_buffer']} of {summary['total_detections']} "
            "new construction detections fall inside the requested zone."
        )
    return {"answer": answer, "summary": summary, "sources": ["demo detection layer", "school buffer calculation", "January/August image metadata"]}


def make_report(query: str, radius_m: int = 1000) -> dict[str, Any]:
    analysis = run_analysis(query, radius_m)
    summary = analysis["summary"]
    return {
        "title": "SatQuery AI Change Detection Report",
        "case_id": "SATQ-RIV-2026-0819",
        "query": query,
        "executive_summary": analysis["answer"],
        "method": [
            "Natural-language query parsed into target, dates, anchor, and distance constraint.",
            "January baseline and August observation imagery compared with deterministic demo CV provider.",
            "Candidate footprints measured against a generated school buffer using geodesic distance.",
            "Evidence records compiled from footprint, proximity, confidence, and imagery metadata.",
        ],
        "key_metrics": summary,
        "limitations": [
            "Demo imagery and detections are fictional but georeferenced.",
            "The prototype demonstrates workflow behavior and interface contracts, not production model accuracy.",
            "Final enforcement or field action should use verified source imagery and human review.",
        ],
        "attachments": ["detections.geojson", "context.geojson", "report.json"],
        "analysis": analysis,
    }
