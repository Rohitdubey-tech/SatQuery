from __future__ import annotations

import math
from datetime import date
from typing import Any

SCHOOL = {
    "id": "school-riverside-01",
    "name": "Riverside Public School",
    "type": "school",
    "coordinates": [77.5987, 12.974],
}

AOI_POLYGON = {
    "type": "Feature",
    "properties": {"id": "aoi-riverside", "name": "Riverside Demonstration AOI"},
    "geometry": {
        "type": "Polygon",
        "coordinates": [
            [
                [77.5865, 12.9645],
                [77.6118, 12.9645],
                [77.6118, 12.9856],
                [77.5865, 12.9856],
                [77.5865, 12.9645],
            ]
        ],
    },
}

JAN_IMAGE = {
    "id": "sat-jan-2026-riverside",
    "label": "January baseline",
    "date": "2026-01-12",
    "cloud_cover": 0.06,
    "resolution_m": 0.5,
    "provider": "DemoSat-0.5m",
    "bounds": [77.5865, 12.9645, 77.6118, 12.9856],
}

AUG_IMAGE = {
    "id": "sat-aug-2026-riverside",
    "label": "August observation",
    "date": "2026-08-19",
    "cloud_cover": 0.04,
    "resolution_m": 0.5,
    "provider": "DemoSat-0.5m",
    "bounds": [77.5865, 12.9645, 77.6118, 12.9856],
}


def meters_to_degrees(dx_m: float, dy_m: float, lat: float) -> tuple[float, float]:
    lon_deg = dx_m / (111_320 * math.cos(math.radians(lat)))
    lat_deg = dy_m / 110_540
    return lon_deg, lat_deg


def rectangle(lon: float, lat: float, width_m: float, height_m: float) -> dict[str, Any]:
    half_w_lon, _ = meters_to_degrees(width_m / 2, 0, lat)
    _, half_h_lat = meters_to_degrees(0, height_m / 2, lat)
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [lon - half_w_lon, lat - half_h_lat],
                [lon + half_w_lon, lat - half_h_lat],
                [lon + half_w_lon, lat + half_h_lat],
                [lon - half_w_lon, lat + half_h_lat],
                [lon - half_w_lon, lat - half_h_lat],
            ]
        ],
    }


def haversine_m(point_a: list[float], point_b: list[float]) -> float:
    lon1, lat1 = point_a
    lon2, lat2 = point_b
    radius = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def buffer_polygon(center: list[float], radius_m: int, steps: int = 72) -> dict[str, Any]:
    lon, lat = center
    coords = []
    for idx in range(steps + 1):
        angle = 2 * math.pi * idx / steps
        dx = math.cos(angle) * radius_m
        dy = math.sin(angle) * radius_m
        d_lon, d_lat = meters_to_degrees(dx, dy, lat)
        coords.append([lon + d_lon, lat + d_lat])
    return {"type": "Polygon", "coordinates": [coords]}


def _point_at(center: list[float], distance_m: float, bearing_deg: float) -> list[float]:
    lon, lat = center
    angle = math.radians(bearing_deg)
    dx = math.sin(angle) * distance_m
    dy = math.cos(angle) * distance_m
    d_lon, d_lat = meters_to_degrees(dx, dy, lat)
    return [round(lon + d_lon, 6), round(lat + d_lat, 6)]


def build_detections() -> list[dict[str, Any]]:
    distances = [
        115, 145, 172, 205, 236, 260, 285, 315, 342, 365, 389, 412, 438, 460, 476, 488, 492, 494,
        530, 560, 590, 625, 660, 700, 742, 785, 825, 865, 910, 950, 992,
        1045, 1110, 1185, 1275, 1380, 1510,
    ]
    bearings = [
        4, 24, 48, 69, 92, 113, 136, 158, 183, 207, 231, 252, 278, 302, 326, 344, 16, 37,
        59, 80, 103, 126, 149, 171, 194, 216, 239, 261, 284, 307, 331,
        42, 101, 190, 251, 312, 352,
    ]
    detections = []
    for idx, (dist, bearing) in enumerate(zip(distances, bearings), start=1):
        centroid = _point_at(SCHOOL["coordinates"], dist, bearing)
        width = 18 + (idx % 5) * 4
        height = 14 + (idx % 4) * 5
        area = round(width * height * (0.78 + (idx % 3) * 0.05), 1)
        confidence = round(0.72 + ((idx * 7) % 23) / 100, 2)
        detections.append(
            {
                "id": f"new-build-{idx:02d}",
                "change_type": "new_construction",
                "status": "verified" if confidence >= 0.84 else "review",
                "centroid": centroid,
                "geometry": rectangle(centroid[0], centroid[1], width, height),
                "distance_to_school_m": round(haversine_m(centroid, SCHOOL["coordinates"])),
                "area_sqm": area,
                "confidence": confidence,
                "detected_between": [JAN_IMAGE["date"], AUG_IMAGE["date"]],
                "evidence": [
                    "Absent from January baseline footprint layer",
                    "High-reflectance roof signature in August image",
                    "Rectangular edge response matches building morphology",
                ],
            }
        )
    return detections


DETECTIONS = build_detections()


def feature_collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}


def detection_features() -> dict[str, Any]:
    return feature_collection(
        [
            {
                "type": "Feature",
                "properties": {
                    "id": item["id"],
                    "change_type": item["change_type"],
                    "status": item["status"],
                    "confidence": item["confidence"],
                    "area_sqm": item["area_sqm"],
                    "distance_to_school_m": item["distance_to_school_m"],
                },
                "geometry": item["geometry"],
            }
            for item in DETECTIONS
        ]
    )


def context_features() -> dict[str, Any]:
    return feature_collection(
        [
            AOI_POLYGON,
            {
                "type": "Feature",
                "properties": {"id": SCHOOL["id"], "name": SCHOOL["name"], "type": "school"},
                "geometry": {"type": "Point", "coordinates": SCHOOL["coordinates"]},
            },
            {
                "type": "Feature",
                "properties": {"id": "buffer-school-500", "name": "500 m school buffer", "radius_m": 500},
                "geometry": buffer_polygon(SCHOOL["coordinates"], 500),
            },
            {
                "type": "Feature",
                "properties": {"id": "buffer-school-1000", "name": "1 km school buffer", "radius_m": 1000},
                "geometry": buffer_polygon(SCHOOL["coordinates"], 1000),
            },
        ]
    )


def layer_catalog() -> list[dict[str, Any]]:
    return [
        {"id": "jan-baseline", "name": "January baseline", "type": "raster", "date": JAN_IMAGE["date"], "enabled": True},
        {"id": "aug-observation", "name": "August observation", "type": "raster", "date": AUG_IMAGE["date"], "enabled": True},
        {"id": "new-construction", "name": "New construction detections", "type": "vector", "count": len(DETECTIONS), "enabled": True},
        {"id": "school-buffers", "name": "School buffers", "type": "vector", "radii_m": [500, 1000], "enabled": True},
        {"id": "context", "name": "AOI and school context", "type": "vector", "enabled": True},
    ]


def demo_payload() -> dict[str, Any]:
    return {
        "project": "SatQuery AI",
        "scenario": "New construction monitoring near Riverside Public School",
        "aoi": AOI_POLYGON,
        "school": SCHOOL,
        "images": [JAN_IMAGE, AUG_IMAGE],
        "layers": layer_catalog(),
        "detections": DETECTIONS,
        "detections_geojson": detection_features(),
        "context_geojson": context_features(),
        "generated_on": date.today().isoformat(),
    }
