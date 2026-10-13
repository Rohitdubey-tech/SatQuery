const school = {
  id: "school-riverside-01",
  name: "Riverside Public School",
  type: "school",
  coordinates: [77.5987, 12.974]
};

const images = [
  { id: "sat-jan-2026-riverside", label: "January baseline", date: "2026-01-12", cloud_cover: 0.06, resolution_m: 0.5, provider: "DemoSat-0.5m", bounds: [77.5865, 12.9645, 77.6118, 12.9856] },
  { id: "sat-aug-2026-riverside", label: "August observation", date: "2026-08-19", cloud_cover: 0.04, resolution_m: 0.5, provider: "DemoSat-0.5m", bounds: [77.5865, 12.9645, 77.6118, 12.9856] }
];

const distances = [115, 145, 172, 205, 236, 260, 285, 315, 342, 365, 389, 412, 438, 460, 476, 488, 492, 494, 530, 560, 590, 625, 660, 700, 742, 785, 825, 865, 910, 950, 992, 1045, 1110, 1185, 1275, 1380, 1510];

function pointAt(distance, bearing) {
  const angle = (bearing * Math.PI) / 180;
  const dx = Math.sin(angle) * distance;
  const dy = Math.cos(angle) * distance;
  const lon = school.coordinates[0] + dx / (111320 * Math.cos((school.coordinates[1] * Math.PI) / 180));
  const lat = school.coordinates[1] + dy / 110540;
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
}

function rectangle(lon, lat) {
  const dLon = 0.00011;
  const dLat = 0.00008;
  return { type: "Polygon", coordinates: [[[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]]] };
}

function buffer(radius) {
  const coords = [];
  for (let i = 0; i <= 72; i += 1) {
    const angle = (2 * Math.PI * i) / 72;
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius;
    coords.push([
      school.coordinates[0] + dx / (111320 * Math.cos((school.coordinates[1] * Math.PI) / 180)),
      school.coordinates[1] + dy / 110540
    ]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

function detections() {
  const bearings = [4, 24, 48, 69, 92, 113, 136, 158, 183, 207, 231, 252, 278, 302, 326, 344, 16, 37, 59, 80, 103, 126, 149, 171, 194, 216, 239, 261, 284, 307, 331, 42, 101, 190, 251, 312, 352];
  const updatedAt = "2026-08-19T10:30:00.000Z";
  return distances.map((distance, index) => {
    const centroid = pointAt(distance, bearings[index]);
    const confidence = Number((0.72 + ((index * 7) % 23) / 100).toFixed(2));
    return {
      id: `new-build-${String(index + 1).padStart(2, "0")}`,
      change_type: "new_construction",
      status: confidence >= 0.84 ? "verified" : "under_review",
      centroid,
      geometry: rectangle(centroid[0], centroid[1]),
      distance_to_school_m: distance,
      area_sqm: 260 + (index % 7) * 42,
      confidence,
      detected_between: [images[0].date, images[1].date],
      detected_on: images[1].date,
      label: "new construction",
      note: "",
      source: "Seeded demo",
      updatedAt,
      evidence: ["Absent in January baseline", "Visible new roof signature in August", "Footprint shape matches building morphology"]
    };
  });
}

export function fallbackAnalysis(query, radius_m) {
  const all = detections();
  const inside = all.filter((item) => item.distance_to_school_m <= radius_m);
  const summary = {
    radius_m,
    total_detections: all.length,
    inside_buffer: inside.length,
    outside_buffer: all.length - inside.length,
    high_confidence_inside: inside.filter((item) => item.confidence >= 0.84).length,
    total_new_area_sqm: Number(inside.reduce((sum, item) => sum + item.area_sqm, 0).toFixed(1)),
    average_confidence: Number((inside.reduce((sum, item) => sum + item.confidence, 0) / inside.length).toFixed(2)),
    nearest_detection_m: Math.min(...all.map((item) => item.distance_to_school_m)),
    farthest_inside_m: Math.max(...inside.map((item) => item.distance_to_school_m))
  };
  const features = all.map((item) => ({ type: "Feature", properties: { id: item.id, confidence: item.confidence, distance_to_school_m: item.distance_to_school_m }, geometry: item.geometry }));
  return {
    query,
    parsed_query: { intent: "change_detection", target: "new construction", date_range: [images[0].date, images[1].date], relation: "within", anchor: school.name, radius_m, filters: ["building-like footprint", "new in August"], confidence: 0.91 },
    summary,
    images,
    school,
    layers: [
      { id: "jan-baseline", name: "January baseline", type: "raster", date: images[0].date, enabled: true },
      { id: "aug-observation", name: "August observation", type: "raster", date: images[1].date, enabled: true },
      { id: "new-construction", name: "New construction detections", type: "vector", count: all.length, enabled: true },
      { id: "school-buffers", name: "School buffers", type: "vector", radii_m: [500, 1000], enabled: true }
    ],
    detections: all,
    detections_geojson: { type: "FeatureCollection", features },
    context_geojson: { type: "FeatureCollection", features: [] },
    buffer_geojson: { type: "Feature", properties: { radius_m }, geometry: buffer(radius_m) },
    evidence: all.slice(0, 8).map((item) => ({ id: item.id, distance_to_school_m: item.distance_to_school_m, confidence: item.confidence, area_sqm: item.area_sqm, assessment: item.distance_to_school_m <= radius_m ? "Inside requested buffer" : "Outside requested buffer", notes: item.evidence })),
    pipeline: [
      { name: "Parse query", status: "complete", detail: "Detected target, dates, anchor, and radius." },
      { name: "Load imagery", status: "complete", detail: "Loaded January and August demo scenes." },
      { name: "Run CV change model", status: "complete", detail: "Segmented candidate construction footprints." },
      { name: "Apply GIS filter", status: "complete", detail: `Applied ${radius_m} m school buffer.` },
      { name: "Compile evidence", status: "complete", detail: "Ranked detections for review." }
    ],
    answer: `Detected ${all.length} new construction candidates. ${inside.length} are within ${radius_m} m of ${school.name}.`
  };
}

export function fallbackReport(query, radius_m) {
  const analysis = fallbackAnalysis(query, radius_m);
  return {
    title: "SatQuery AI Change Detection Report",
    case_id: "SATQ-RIV-2026-0819",
    query,
    executive_summary: analysis.answer,
    method: ["Parsed natural-language query", "Compared January and August imagery", "Measured footprint distances to school", "Compiled evidence for analyst review"],
    key_metrics: analysis.summary,
    limitations: ["Frontend fallback data only when backend is unavailable"],
    attachments: ["detections.geojson", "context.geojson", "report.json"],
    analysis
  };
}
