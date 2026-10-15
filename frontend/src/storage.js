export const CASE_STORAGE_KEY = "satquery.case.v1";

export const defaultFilters = {
  statuses: ["new", "under_review", "verified"],
  minConfidence: 0.7,
  maxDistanceM: 1000,
  showRejected: false
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadCase() {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(CASE_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || !Array.isArray(parsed.detections)) return null;
    return {
      ...parsed,
      filters: { ...defaultFilters, ...parsed.filters },
      timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
      radius: Number(parsed.radius) || 1000
    };
  } catch {
    return null;
  }
}

export function saveCase(caseState) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(CASE_STORAGE_KEY, JSON.stringify(caseState));
}

export function clearCase() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(CASE_STORAGE_KEY);
}

export function downloadCase(caseState) {
  const blob = new Blob([JSON.stringify(caseState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${caseState.investigationName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-case.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
