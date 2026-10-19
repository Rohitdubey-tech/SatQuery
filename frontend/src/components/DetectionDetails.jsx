import { Check, Copy, LocateFixed, MapPin, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

const statusOptions = [
  { value: "new", label: "New Target" },
  { value: "under_review", label: "Under Review" },
  { value: "verified", label: "Verified Encroachment" },
  { value: "rejected", label: "Rejected / False Positive" }
];

export function statusLabel(status) {
  switch (status) {
    case "new":
      return "New";
    case "under_review":
      return "Under Review";
    case "verified":
      return "Verified";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

export default function DetectionDetails({
  detection,
  onClose,
  onOpenInMap,
  onStatusChange,
  onNoteChange
}) {
  const [copied, setCopied] = useState(false);

  if (!detection) return null;

  function copyCoordinates() {
    if (!detection) return;
    const text = `${detection.centroid[1].toFixed(6)}, ${detection.centroid[0].toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const polygonVertexCount = detection.geometry?.coordinates?.[0]?.length ?? 0;
  const confPercent = Math.round(detection.confidence * 100);

  return (
    <aside className="details-drawer" aria-label="Target Inspector">
      <div className="drawer-header">
        <div className="drawer-title-block">
          <span className={`status-indicator ${detection.status}`} />
          <div>
            <h3 className="drawer-id">{detection.id}</h3>
            <span className="drawer-type">{detection.change_type.replace(/_/g, " ")}</span>
          </div>
        </div>
        <button
          type="button"
          className="btn-icon"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X size={16} />
        </button>
      </div>

      <div className="drawer-field">
        <label htmlFor="target-status-select" className="field-label">Triage Status</label>
        <select
          id="target-status-select"
          className="form-select"
          value={detection.status}
          onChange={(e) => onStatusChange(detection.id, e.target.value)}
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="drawer-stats-grid">
        <div className="stat-card">
          <span className="stat-label">Confidence</span>
          <strong className="stat-value">{confPercent}%</strong>
          <span className="stat-sub">Automated score</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Footprint Area</span>
          <strong className="stat-value">{Math.round(detection.area_sqm)} m²</strong>
          <span className="stat-sub">{polygonVertexCount} vertices</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Anchor Distance</span>
          <strong className="stat-value">{detection.distance_to_school_m} m</strong>
          <span className="stat-sub">{detection.distance_to_school_m <= 1000 ? "Inside buffer" : "Outside buffer"}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Observation</span>
          <strong className="stat-value">{detection.detected_on ?? "Aug 2024"}</strong>
          <span className="stat-sub">{detection.source}</span>
        </div>
      </div>

      <div className="drawer-field">
        <label className="field-label">Centroid Coordinates</label>
        <div className="coord-box">
          <MapPin size={14} className="coord-pin" />
          <span className="coord-text">
            {detection.centroid[1].toFixed(6)}° N, {detection.centroid[0].toFixed(6)}° E
          </span>
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={copyCoordinates}
            title="Copy coordinates"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      <div className="drawer-field">
        <label htmlFor="analyst-note-input" className="field-label">
          Analyst Field Notes & Assessment
        </label>
        <textarea
          id="analyst-note-input"
          className="form-textarea"
          value={detection.note}
          onChange={(event) => onNoteChange(detection.id, event.target.value)}
          placeholder="Record notes, permits verification, visual ground truth check, or justification for rejection..."
        />
        <div className="field-footer-meta">
          <span>Updated {new Date(detection.updatedAt).toLocaleTimeString()}</span>
          <span>{detection.note.length} characters</span>
        </div>
      </div>

      <div className="drawer-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onOpenInMap(detection)}
        >
          <LocateFixed size={15} />
          <span>Zoom in Map</span>
        </button>
        <button
          type="button"
          className={`btn ${detection.status === "verified" ? "btn-secondary" : "btn-primary"}`}
          onClick={() => {
            onStatusChange(detection.id, detection.status === "verified" ? "under_review" : "verified");
          }}
        >
          <ShieldCheck size={15} />
          <span>{detection.status === "verified" ? "Unverify Target" : "Verify Target"}</span>
        </button>
      </div>
    </aside>
  );
}
