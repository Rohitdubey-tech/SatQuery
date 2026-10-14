const REQUIRED_FIELDS = ["id", "confidence", "area_sqm", "detected_on", "label"];

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeConfidence(value) {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  if (parsed > 1 && parsed <= 100) return Number((parsed / 100).toFixed(2));
  if (parsed >= 0 && parsed <= 1) return Number(parsed.toFixed(2));
  return null;
}

function haversineMeters(from, to) {
  const earthRadius = 6371000;
  const fromLat = (from[1] * Math.PI) / 180;
  const toLat = (to[1] * Math.PI) / 180;
  const deltaLat = ((to[1] - from[1]) * Math.PI) / 180;
  const deltaLon = ((to[0] - from[0]) * Math.PI) / 180;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function footprintFromPoint(lon, lat, areaSqm) {
  const sideMeters = Math.max(12, Math.sqrt(areaSqm));
  const halfLon = (sideMeters / 2) / (111320 * Math.cos((lat * Math.PI) / 180));
  const halfLat = (sideMeters / 2) / 110540;
  return {
    type: "Polygon",
    coordinates: [[
      [lon - halfLon, lat - halfLat],
      [lon + halfLon, lat - halfLat],
      [lon + halfLon, lat + halfLat],
      [lon - halfLon, lat + halfLat],
      [lon - halfLon, lat - halfLat]
    ]]
  };
}

function textField(record, key) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function detectionFromRecord(record, row, source, importedAt, school, skippedRows) {
  const id = textField(record, "id");
  const label = textField(record, "label");
  const detectedOn = textField(record, "detected_on");
  const lon = parseNumber(record.longitude);
  const lat = parseNumber(record.latitude);
  const confidence = normalizeConfidence(record.confidence);
  const areaSqm = parseNumber(record.area_sqm);
  const missing = [...REQUIRED_FIELDS, "latitude", "longitude"].filter((field) => textField(record, field) === "");

  if (missing.length > 0) {
    skippedRows.push({ row, reason: `Missing ${missing.join(", ")}` });
    return null;
  }

  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    skippedRows.push({ row, reason: "Invalid latitude/longitude" });
    return null;
  }

  if (confidence === null) {
    skippedRows.push({ row, reason: "Confidence must be between 0 and 1, or 0 and 100" });
    return null;
  }

  if (areaSqm === null || areaSqm <= 0) {
    skippedRows.push({ row, reason: "area_sqm must be a positive number" });
    return null;
  }

  const centroid = [lon, lat];
  const detection = {
    id,
    change_type: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "external_detection",
    status: "new",
    centroid,
    geometry: footprintFromPoint(lon, lat, areaSqm),
    distance_to_school_m: haversineMeters(school, centroid),
    area_sqm: areaSqm,
    confidence,
    detected_between: ["external import", detectedOn],
    detected_on: detectedOn,
    label,
    note: "",
    source,
    importedAt,
    updatedAt: importedAt,
    evidence: [`Imported from ${source}`, `External label: ${label}`, `Detected on ${detectedOn}`]
  };
  return detection;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return headers.reduce((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {});
  });
}

function parseGeoJson(text) {
  const parsed = JSON.parse(text);
  const features = parsed.type === "FeatureCollection" ? parsed.features : [parsed];
  return features.map((feature) => {
    if (!feature.geometry || feature.geometry.type !== "Point") {
      return { properties: {}, invalidGeometry: true };
    }
    const [longitude, latitude] = feature.geometry.coordinates;
    return {
      ...(feature.properties ?? {}),
      longitude,
      latitude
    };
  });
}

export function parseDetectionFile(fileName, text, school) {
  const importedAt = new Date().toISOString();
  const skippedRows = [];
  const lowerName = fileName.toLowerCase();
  let records;

  try {
    if (lowerName.endsWith(".csv")) {
      records = parseCsv(text);
    } else if (lowerName.endsWith(".geojson") || lowerName.endsWith(".json")) {
      records = parseGeoJson(text);
    } else {
      records = [];
      skippedRows.push({ row: 0, reason: "Unsupported file type" });
    }
  } catch {
    records = [];
    skippedRows.push({ row: 0, reason: "Could not parse file" });
  }

  const detections = records
    .map((record, index) => {
      if (record.invalidGeometry) {
        skippedRows.push({ row: index + 2, reason: "GeoJSON feature is not a Point" });
        return null;
      }
      return detectionFromRecord(record, index + 2, fileName, importedAt, school, skippedRows);
    })
    .filter((detection) => detection !== null);

  return {
    source: fileName,
    importedAt,
    detections,
    validRows: detections.length,
    skippedRows
  };
}
