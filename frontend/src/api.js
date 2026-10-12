import { fallbackAnalysis, fallbackReport } from "./fallback";

const API_BASE = "";

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }
  return response.json();
}

export async function analyze(query, radius_m) {
  try {
    return await postJson("/api/analyze", { query, radius_m });
  } catch {
    return fallbackAnalysis(query, radius_m);
  }
}

export async function askChat(message, radius_m) {
  try {
    return await postJson("/api/chat", { message, radius_m });
  } catch {
    const report = fallbackReport("offline fallback", radius_m);
    return {
      answer: `Backend offline. Fallback data shows ${report.key_metrics.inside_buffer} detections inside ${radius_m} m.`,
      sources: ["frontend fallback dataset"]
    };
  }
}

export async function getReport(query, radius_m) {
  try {
    return await postJson("/api/report", { query, radius_m });
  } catch {
    return fallbackReport(query, radius_m);
  }
}
