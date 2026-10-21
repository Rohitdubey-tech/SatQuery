// SatQuery AI Application Initial Layout
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArchiveRestore,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FileUp,
  Layers,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Radar,
  RotateCcw,
  Ruler,
  Save,
  School,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X
} from "lucide-react";
import { Circle, CircleMarker, GeoJSON, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { analyze, askChat } from "./api";
import DetectionDetails, { statusLabel } from "./components/DetectionDetails";
import DetectionFilters from "./components/DetectionFilters";
import EvidenceMatrix from "./components/EvidenceMatrix";
import MapToolbar from "./components/MapToolbar";
import { parseDetectionFile } from "./importers";
import { clearCase, defaultFilters, downloadCase, loadCase, saveCase } from "./storage";

const DEFAULT_QUERY = "Compare the Jan and Aug satellite images and find new construction within 1 km of the school.";
const DEFAULT_INVESTIGATION = "Riverside School Buffer Investigation";
const sampleCsvUrl = new URL("./sample-data/sample-detections.csv", import.meta.url).href;
const sampleGeoJsonUrl = new URL("./sample-data/sample-detections.geojson", import.meta.url).href;

const suggestedQueries = [
  {
    label: "New construction (1 km buffer)",
    query: "Compare January and August satellite images and find new construction within 1 km of the school.",
    radius: 1000
  },
  {
    label: "High-confidence 500 m scan",
    query: "Find high-confidence new building footprints within 500 m of Riverside Public School.",
    radius: 500
  },
  {
    label: "Encroachment review & triage",
    query: "Identify possible new construction encroachment near the school buffer and rank detections for analyst review.",
    radius: 1000
  }
];

const copilotSuggestions = [
  "How many detections are inside 500 m?",
  "What is the average confidence score?",
  "Which footprint is closest to the school?",
  "Summarize verified encroachments for municipal notice"
];

const analysisProgressSteps = [
  "Locating Area of Interest",
  "Fetching satellite imagery layers",
  "Computing difference segmentation",
  "Evaluating buffer intersections",
  "Compiling confidence metrics"
];

const demoNotes = [
  "Roof signature is clearly visible in August acquisition. Verified against municipal permits.",
  "Inside 500 m school security buffer with high confidence. Field confirmation recommended.",
  "New structural expansion adjacent to campus utility perimeter.",
  "Rejected: geometry overlaps existing paved municipal parking lot.",
  "Rejected: transient surface variation after review against baseline imagery."
];

const schoolIcon = L.divIcon({
  className: "school-anchor-marker",
  html: `<div class="school-marker-pin"><span class="school-marker-dot"></span></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const statusColors = {
  new: { stroke: "#388bfd", fill: "#1f6feb" },
  under_review: { stroke: "#d29922", fill: "#bb8009" },
  verified: { stroke: "#2ea043", fill: "#238636" },
  rejected: { stroke: "#6e7681", fill: "#484f58" }
};

function buffer500Style() {
  return { color: "#d29922", weight: 1.5, dashArray: "5 5", fillColor: "#d29922", fillOpacity: 0.08 };
}

function buffer1000Style() {
  return { color: "#388bfd", weight: 1.5, dashArray: "6 6", fillColor: "#388bfd", fillOpacity: 0.05 };
}

function markerStyle(detection, isSelected) {
  const colors = statusColors[detection.status] || statusColors.new;
  return {
    color: isSelected ? "#ffffff" : colors.stroke,
    weight: isSelected ? 3 : 1.8,
    fillColor: colors.fill,
    fillOpacity: detection.status === "rejected" ? 0.35 : 0.85
  };
}

function polygonStyle(status, isSelected) {
  const colors = statusColors[status] || statusColors.new;
  return {
    color: isSelected ? "#ffffff" : colors.stroke,
    weight: isSelected ? 2.5 : 1.5,
    fillColor: colors.fill,
    fillOpacity: isSelected ? 0.5 : status === "rejected" ? 0.15 : 0.35
  };
}

function normalizeDetection(item) {
  const rawStatus = String(item?.status ?? "new");
  const status = rawStatus === "review"
    ? "under_review"
    : ["new", "under_review", "verified", "rejected"].includes(rawStatus)
      ? rawStatus
      : "new";
  const updatedAt = item.updatedAt ?? new Date().toISOString();
  return {
    ...item,
    status,
    detected_on: item.detected_on ?? item.detected_between?.[1],
    label: item.label ?? item.change_type?.replace(/_/g, " "),
    note: item.note ?? "",
    source: item.source ?? "Seeded demo",
    updatedAt
  };
}

function uniqueDetections(existing, incoming) {
  const used = new Set(existing.map((item) => item.id));
  return incoming.map((item) => {
    if (!used.has(item.id)) {
      used.add(item.id);
      return item;
    }
    let suffix = 2;
    let nextId = `${item.id}-${suffix}`;
    while (used.has(nextId)) {
      suffix += 1;
      nextId = `${item.id}-${suffix}`;
    }
    used.add(nextId);
    return { ...item, id: nextId };
  });
}

function distanceConfidenceFilter(filters) {
  return (detection) => {
    const insideDistance = filters.maxDistanceM === 0 || detection.distance_to_school_m <= filters.maxDistanceM;
    return detection.confidence >= filters.minConfidence && insideDistance;
  };
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createTimelineEvent(kind, title, detail) {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    detail,
    createdAt: new Date().toISOString()
  };
}

function shapeDemoDetections(items) {
  return items.map((item, index) => {
    if (index < 3) {
      return { ...item, status: "verified", note: demoNotes[index], updatedAt: new Date().toISOString() };
    }
    if (index < 5) {
      return { ...item, status: "rejected", note: demoNotes[index], updatedAt: new Date().toISOString() };
    }
    if (index < 10) {
      return { ...item, status: "under_review", note: "Queued for analyst validation.", updatedAt: new Date().toISOString() };
    }
    return { ...item, status: "new", note: "", updatedAt: new Date().toISOString() };
  });
}

function FitMap({ detections, result }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([]);
    detections.forEach((item) => bounds.extend([item.centroid[1], item.centroid[0]]));
    bounds.extend([result.school.coordinates[1], result.school.coordinates[0]]);
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.18), { animate: false });
    }
  }, [map, detections, result]);
  return null;
}

function MapFocus({ detection }) {
  const map = useMap();
  useEffect(() => {
    if (!detection) return;
    map.setView([detection.centroid[1], detection.centroid[0]], Math.max(map.getZoom(), 17), { animate: true });
  }, [detection, map]);
  return null;
}

function MapCursorTracker({ onMouseMove }) {
  useMapEvents({
    mousemove(e) {
      onMouseMove(e.latlng);
    }
  });
  return null;
}

function Metric({
  label,
  value,
  icon: Icon,
  subtext,
  variant
}) {
  return (
    <div className={`metric-box ${variant ? `metric-${variant}` : ""}`}>
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <Icon size={16} className="metric-icon" />
      </div>
      <div className="metric-bottom">
        <strong className="metric-value">{value}</strong>
        {subtext && <span className="metric-subtext">{subtext}</span>}
      </div>
    </div>
  );
}

function DetectionList({
  detections,
  radius,
  selectedId,
  onSelect
}) {
  const sorted = useMemo(
    () => [...detections].sort((a, b) => a.distance_to_school_m - b.distance_to_school_m).slice(0, 15),
    [detections]
  );

  return (
    <div className="target-stream-list" role="list">
      {sorted.map((item) => {
        const isSelected = item.id === selectedId;
        return (
          <button
            type="button"
            className={`target-stream-item ${isSelected ? "selected" : ""}`}
            key={item.id}
            onClick={() => onSelect(item.id)}
            role="listitem"
            aria-selected={isSelected}
          >
            <div className="stream-item-main">
              <span className={`status-indicator ${item.status}`} />
              <div className="stream-item-info">
                <span className="stream-id">{item.id}</span>
                <span className="stream-meta">
                  {item.distance_to_school_m} m &bull; {Math.round(item.area_sqm)} m²
                </span>
              </div>
            </div>
            <div className="stream-item-aside">
              <span className="stream-conf">{Math.round(item.confidence * 100)}%</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AnalysisProgress({ activeIndex, complete }) {
  return (
    <div className="progress-stepper">
      {analysisProgressSteps.map((step, index) => {
        const done = complete || index < activeIndex;
        const active = !complete && index === activeIndex;
        return (
          <div className={`stepper-item ${done ? "done" : ""} ${active ? "active" : ""}`} key={step}>
            <div className="stepper-bullet">
              {done ? <CheckCircle2 size={13} /> : <span>{index + 1}</span>}
            </div>
            <span className="stepper-text">{step}</span>
          </div>
        );
      })}
    </div>
  );
}

function TemporalComparisonView({
  detections,
  images
}) {
  const earlier = images[0];
  const latest = images[1] ?? images[0];
  const verifiedCount = detections.filter((d) => d.status === "verified").length;
  const highConfCount = detections.filter((d) => d.confidence >= 0.85).length;

  return (
    <div className="temporal-view-panel">
      <div className="panel-card">
        <div className="card-header">
          <Layers size={16} />
          <span>Multitemporal Satellite Acquisition Comparison</span>
        </div>
        <p className="section-description">
          Cross-sensor comparison between the baseline pre-event observation and the target post-event observation.
        </p>

        <div className="imagery-cards-grid">
          <div className="imagery-card baseline-card">
            <div className="imagery-card-header">
              <span className="tag-pill">Baseline Observation</span>
              <h4>{earlier?.date ?? "2024-01-14"}</h4>
            </div>
            <div className="imagery-card-body">
              <div className="meta-pair">
                <span>Sensor / Provider:</span>
                <strong>{earlier?.provider ?? "Sentinel-2 / ESA"}</strong>
              </div>
              <div className="meta-pair">
                <span>Spatial Resolution:</span>
                <strong>{earlier?.resolution_m ?? 3.0} m GSD</strong>
              </div>
              <div className="meta-pair">
                <span>Cloud Cover:</span>
                <strong>{((earlier?.cloud_cover ?? 0.05) * 100).toFixed(1)}%</strong>
              </div>
              <div className="meta-pair">
                <span>Target Detections:</span>
                <strong>0 (Baseline reference)</strong>
              </div>
            </div>
          </div>

          <div className="imagery-card target-card">
            <div className="imagery-card-header">
              <span className="tag-pill highlight">Target Observation</span>
              <h4>{latest?.date ?? "2024-08-22"}</h4>
            </div>
            <div className="imagery-card-body">
              <div className="meta-pair">
                <span>Sensor / Provider:</span>
                <strong>{latest?.provider ?? "WorldView-3 / Maxar"}</strong>
              </div>
              <div className="meta-pair">
                <span>Spatial Resolution:</span>
                <strong>{latest?.resolution_m ?? 0.5} m GSD</strong>
              </div>
              <div className="meta-pair">
                <span>Cloud Cover:</span>
                <strong>{((latest?.cloud_cover ?? 0.02) * 100).toFixed(1)}%</strong>
              </div>
              <div className="meta-pair">
                <span>Total New Footprints:</span>
                <strong>{detections.length} candidate changes</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="temporal-summary-card">
          <h4>Observation Change Summary</h4>
          <div className="summary-stat-row">
            <div><span>Candidate Footprints:</span> <strong>{detections.length}</strong></div>
            <div><span>High-Confidence (≥85%):</span> <strong>{highConfCount}</strong></div>
            <div><span>Analyst Verified:</span> <strong>{verifiedCount}</strong></div>
            <div><span>Interval Elapsed:</span> <strong>7 Months (Jan &rarr; Aug 2024)</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CaseTimeline({ events }) {
  const [filterKind, setFilterKind] = useState("all");
  const filteredEvents = useMemo(() => {
    return events
      .filter((e) => filterKind === "all" || e.kind === filterKind)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [events, filterKind]);

  return (
    <div className="panel-card timeline-card">
      <div className="card-header">
        <Clock size={16} />
        <span>Investigation Activity Log ({events.length} events)</span>
      </div>

      <div className="timeline-filter-pills">
        <button
          type="button"
          className={`filter-pill ${filterKind === "all" ? "active" : ""}`}
          onClick={() => setFilterKind("all")}
        >
          All
        </button>
        <button
          type="button"
          className={`filter-pill ${filterKind === "analysis" ? "active" : ""}`}
          onClick={() => setFilterKind("analysis")}
        >
          Analysis
        </button>
        <button
          type="button"
          className={`filter-pill ${filterKind === "review" ? "active" : ""}`}
          onClick={() => setFilterKind("review")}
        >
          Analyst Reviews
        </button>
        <button
          type="button"
          className={`filter-pill ${filterKind === "import" ? "active" : ""}`}
          onClick={() => setFilterKind("import")}
        >
          Data Imports
        </button>
        <button
          type="button"
          className={`filter-pill ${filterKind === "case" ? "active" : ""}`}
          onClick={() => setFilterKind("case")}
        >
          Backups
        </button>
      </div>

      <div className="timeline-feed">
        {filteredEvents.length > 0 ? (
          filteredEvents.map((event) => (
            <div className="timeline-item" key={event.id}>
              <div className="timeline-meta-bar">
                <span className="timeline-badge">{event.kind.toUpperCase()}</span>
                <span className="timeline-timestamp">{new Date(event.createdAt).toLocaleTimeString()}</span>
              </div>
              <h5 className="timeline-title">{event.title}</h5>
              <p className="timeline-detail">{event.detail}</p>
            </div>
          ))
        ) : (
          <p className="text-muted text-center py-4">No events found for this filter.</p>
        )}
      </div>
    </div>
  );
}

function ReportPreview({
  detections,
  filteredDetections,
  filters,
  investigationName,
  onPrint,
  query,
  radius,
  result,
  timeline
}) {
  if (!result) {
    return <div className="empty-state-card">Run an analysis first to generate the report.</div>;
  }

  const pending = detections.filter((item) => item.status === "new" || item.status === "under_review");
  const verified = detections.filter((item) => item.status === "verified");
  const rejected = detections.filter((item) => item.status === "rejected");
  const reviewed = detections.filter((item) => item.status !== "new" || item.note.trim() !== "");
  const totalVerifiedArea = verified.reduce((sum, d) => sum + d.area_sqm, 0);

  return (
    <div className="clean-report-document">
      <div className="report-doc-header">
        <div>
          <span className="doc-subtitle">Geospatial Intelligence Investigation Report</span>
          <h2 className="doc-title">{investigationName}</h2>
          <span className="doc-meta-ref">Case ID: SQ-{result.school.id.toUpperCase()}-{(result.summary.total_detections || 37)} &bull; Date: {new Date().toLocaleDateString()}</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={onPrint}>
          <Download size={14} />
          <span>Print / Export PDF</span>
        </button>
      </div>

      <section className="report-doc-section">
        <h3 className="section-title">1. Executive Overview</h3>
        <p className="report-text">
          Satellite multispectral change analysis detected <strong>{detections.length} candidate building footprints</strong> across the Riverside Area of Interest.
          Applying spatial buffer filtering at the <strong>{radius} m perimeter</strong> around <em>{result.school.name}</em> identified <strong>{filteredDetections.length} active detections</strong>.
          To date, <strong>{verified.length} footprints</strong> have been confirmed by analysts as verified new construction encroachment into the buffer zone, totaling <strong>{Math.round(totalVerifiedArea)} m²</strong> in ground footprint area.
        </p>
      </section>

      <section className="report-doc-section">
        <h3 className="section-title">2. Scope & Parameters</h3>
        <div className="doc-info-grid">
          <div><span className="info-key">Anchor Facility:</span> <strong>{result.school.name} ({result.school.type})</strong></div>
          <div><span className="info-key">Coordinates:</span> <strong>{result.school.coordinates[1].toFixed(5)}° N, {result.school.coordinates[0].toFixed(5)}° E</strong></div>
          <div><span className="info-key">Buffer Radius:</span> <strong>{radius} meters</strong></div>
          <div><span className="info-key">Observation Period:</span> <strong>Jan 2024 &rarr; Aug 2024</strong></div>
          <div className="col-span-2"><span className="info-key">Analyst Query:</span> <em>"{query}"</em></div>
        </div>
      </section>

      <section className="report-doc-section">
        <h3 className="section-title">3. Triage Breakdown</h3>
        <div className="report-metrics-table-grid">
          <div className="report-stat-cell">
            <span className="cell-label">Total Detections</span>
            <strong className="cell-value">{detections.length}</strong>
          </div>
          <div className="report-stat-cell">
            <span className="cell-label">Inside Buffer ({radius}m)</span>
            <strong className="cell-value">{filteredDetections.length}</strong>
          </div>
          <div className="report-stat-cell success-cell">
            <span className="cell-label">Verified Encroachments</span>
            <strong className="cell-value">{verified.length}</strong>
          </div>
          <div className="report-stat-cell">
            <span className="cell-label">Pending Review</span>
            <strong className="cell-value">{pending.length}</strong>
          </div>
          <div className="report-stat-cell">
            <span className="cell-label">Rejected Targets</span>
            <strong className="cell-value">{rejected.length}</strong>
          </div>
          <div className="report-stat-cell">
            <span className="cell-label">Verified Footprint Area</span>
            <strong className="cell-value">{Math.round(totalVerifiedArea)} m²</strong>
          </div>
        </div>
      </section>

      <section className="report-doc-section">
        <h3 className="section-title">4. Analyst Reviewed Targets</h3>
        {reviewed.length > 0 ? (
          <table className="clean-doc-table">
            <thead>
              <tr>
                <th>Target ID</th>
                <th>Status</th>
                <th>Distance</th>
                <th>Confidence</th>
                <th>Footprint</th>
                <th>Analyst Notes</th>
              </tr>
            </thead>
            <tbody>
              {reviewed.slice(0, 15).map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.id}</strong></td>
                  <td><span className="table-status-label">{statusLabel(d.status)}</span></td>
                  <td>{d.distance_to_school_m} m</td>
                  <td>{Math.round(d.confidence * 100)}%</td>
                  <td>{Math.round(d.area_sqm)} m²</td>
                  <td>{d.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">No targets have been marked with analyst notes or reviewed status yet.</p>
        )}
      </section>

      <section className="report-doc-section">
        <h3 className="section-title">5. Methodology & Attribution</h3>
        <p className="report-text text-sm">
          Computer vision segmentation (Mask R-CNN) was executed across coregistered multispectral acquisitions from Sentinel-2 and WorldView-3.
          Buffer polygons and distance calculations utilize the WGS-84 geodesic reference ellipsoid.
          Results serve as an analytical decision-support aid and require official GIS field confirmation before regulatory enforcement.
        </p>
      </section>
    </div>
  );
}

export default function App() {
  const [savedCase, setSavedCase] = useState(() => loadCase());
  const [query, setQuery] = useState("");
  const [radius, setRadius] = useState(1000);
  const [investigationName, setInvestigationName] = useState(DEFAULT_INVESTIGATION);
  const [filters, setFilters] = useState(defaultFilters);
  const [detections, setDetections] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [result, setResult] = useState(null);
  const [chatInput, setChatInput] = useState("How many detections are within 500 m?");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);
  const [readyToSave, setReadyToSave] = useState(false);
  const [caseCreatedAt, setCaseCreatedAt] = useState(null);
  const [saveStatus, setSaveStatus] = useState(savedCase ? `Saved (${savedCase.detections.length})` : "Not saved");
  const [importPreview, setImportPreview] = useState(null);
  const [selectedDetectionId, setSelectedDetectionId] = useState(null);

  // View & Layer states:
  const [activeTab, setActiveTab] = useState("map");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeBasemap, setActiveBasemap] = useState("satellite");
  const [showFootprintPolygons, setShowFootprintPolygons] = useState(true);
  const [showBuffer500, setShowBuffer500] = useState(true);
  const [showBuffer1000, setShowBuffer1000] = useState(true);
  const [showCentroids, setShowCentroids] = useState(true);
  const [showCoordinates, setShowCoordinates] = useState(true);
  const [cursorCoords, setCursorCoords] = useState(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [utcTime, setUtcTime] = useState("");

  const detectionInputRef = useRef(null);
  const caseInputRef = useRef(null);
  const mapRef = useRef(null);

  // Clean compact UTC clock: HH:MM:SS UTC
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const timeStr = now.toISOString().slice(11, 19) + " UTC";
      setUtcTime(timeStr);
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const selectedDetection = detections.find((item) => item.id === selectedDetectionId) ?? null;

  function addTimelineEvent(kind, title, detail) {
    setTimeline((events) => [createTimelineEvent(kind, title, detail), ...events].slice(0, 50));
  }

  async function run(nextQuery = query, nextRadius = radius, preserveCaseDetections = detections.length > 0) {
    const cleanQuery = nextQuery.trim();
    if (!cleanQuery) return;
    setLoading(true);
    setAnalysisStepIndex(0);
    try {
      const analysisRequest = analyze(cleanQuery, nextRadius);
      for (let index = 0; index < analysisProgressSteps.length; index += 1) {
        setAnalysisStepIndex(index);
        await wait(220);
      }
      const next = await analysisRequest;
      const normalized = next.detections.map(normalizeDetection);
      if (!preserveCaseDetections) {
        setDetections(normalized);
      }
      if (!caseCreatedAt) {
        setCaseCreatedAt(new Date().toISOString());
      }
      setResult({ ...next, detections: preserveCaseDetections ? detections : normalized });
      setMessages([{ role: "satquery", text: next.answer }]);
      addTimelineEvent("analysis", "Analysis Run Complete", `${cleanQuery} (${nextRadius} m buffer)`);
    } finally {
      setLoading(false);
      setReadyToSave(true);
    }
  }

  async function sendChat(customPrompt) {
    const textToSend = (customPrompt ?? chatInput).trim();
    if (!textToSend) return;
    setMessages((items) => [...items, { role: "analyst", text: textToSend }]);
    if (!customPrompt) setChatInput("");
    const response = await askChat(textToSend, radius);
    setMessages((items) => [...items, { role: "satquery", text: response.answer }]);
  }

  async function handleDetectionFile(file) {
    if (!file || !result) return;
    const text = await file.text();
    setImportPreview(parseDetectionFile(file.name, text, result.school.coordinates));
    if (detectionInputRef.current) detectionInputRef.current.value = "";
  }

  function applyImportPreview() {
    if (!importPreview) return;
    const incoming = uniqueDetections(detections, importPreview.detections);
    setDetections((items) => [...items, ...incoming]);
    setSelectedDetectionId(incoming[0]?.id ?? selectedDetectionId);
    addTimelineEvent("import", "Detections Imported", `${incoming.length} valid detections from ${importPreview.source}`);
    setImportPreview(null);
  }

  function updateDetectionStatus(id, status) {
    setDetections((items) =>
      items.map((item) => (item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item))
    );
    addTimelineEvent("review", "Detection Status Updated", `${id} marked as ${statusLabel(status)}`);
  }

  function updateBatchDetectionStatus(ids, status) {
    const idSet = new Set(ids);
    setDetections((items) =>
      items.map((item) => (idSet.has(item.id) ? { ...item, status, updatedAt: new Date().toISOString() } : item))
    );
    addTimelineEvent("review", "Batch Status Updated", `${ids.length} detections marked as ${statusLabel(status)}`);
  }

  function updateDetectionNote(id, note) {
    setDetections((items) =>
      items.map((item) => (item.id === id ? { ...item, note, updatedAt: new Date().toISOString() } : item))
    );
  }

  function currentCaseState() {
    return {
      version: 1,
      investigationName,
      query,
      radius,
      filters,
      detections,
      timeline,
      createdAt: caseCreatedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function exportCurrentCase() {
    const event = createTimelineEvent("case", "Case Backup Exported", `${detections.length} detections exported to JSON`);
    const caseState = { ...currentCaseState(), timeline: [event, ...timeline].slice(0, 50) };
    setTimeline(caseState.timeline);
    downloadCase(caseState);
  }

  async function importCaseFile(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.version !== 1 || !Array.isArray(parsed.detections)) return;
      await loadCaseIntoWorkspace(parsed);
    } catch {
      alert("Invalid case JSON format.");
    }
    if (caseInputRef.current) caseInputRef.current.value = "";
  }

  async function loadCaseIntoWorkspace(caseState) {
    const normalized = caseState.detections.map(normalizeDetection);
    const restoredQuery = caseState.query || DEFAULT_QUERY;
    const restoredRadius = Number(caseState.radius) || 1000;
    setInvestigationName(caseState.investigationName || DEFAULT_INVESTIGATION);
    setQuery(restoredQuery);
    setRadius(restoredRadius);
    setFilters({ ...defaultFilters, ...caseState.filters });
    setDetections(normalized);
    const restoredTimeline = [
      createTimelineEvent("case", "Case Restored", `${normalized.length} detections loaded from storage`),
      ...(caseState.timeline ?? [])
    ].slice(0, 50);
    setTimeline(restoredTimeline);
    setCaseCreatedAt(caseState.createdAt ?? new Date().toISOString());
    setSelectedDetectionId(null);
    setLoading(true);
    try {
      const next = await analyze(restoredQuery, restoredRadius);
      setResult({ ...next, detections: normalized });
      setMessages([{ role: "satquery", text: `Restored saved case with ${normalized.length} detections.` }]);
      setReadyToSave(true);
      setSaveStatus(`Restored ${normalized.length} detections`);
    } finally {
      setLoading(false);
    }
  }

  async function loadDemoMode() {
    const demoQuery = suggestedQueries[0].query;
    const demoRadius = 500;
    setLoading(true);
    setAnalysisStepIndex(0);
    setInvestigationName("Judge Demo: Riverside Construction Review");
    setQuery(demoQuery);
    setRadius(demoRadius);
    setFilters({ ...defaultFilters, minConfidence: 0.78, maxDistanceM: 500, showRejected: false });
    try {
      const analysisRequest = analyze(demoQuery, demoRadius);
      for (let index = 0; index < analysisProgressSteps.length; index += 1) {
        setAnalysisStepIndex(index);
        await wait(180);
      }
      const next = await analysisRequest;
      const demoDetections = shapeDemoDetections(next.detections.map(normalizeDetection));
      const demoTimeline = [
        createTimelineEvent("report", "Report Prepared", "Printable case report is ready for judge inspection"),
        createTimelineEvent("review", "Analyst Review Completed", "3 verified, 2 rejected, remaining detections queued"),
        createTimelineEvent("analysis", "Analysis Run", `${demoQuery} (${demoRadius} m buffer)`)
      ];
      setDetections(demoDetections);
      setTimeline(demoTimeline);
      setCaseCreatedAt(new Date().toISOString());
      setSelectedDetectionId(demoDetections[0]?.id ?? null);
      setResult({ ...next, detections: demoDetections });
      setMessages([
        {
          role: "satquery",
          text: "Demo investigation loaded with 37 candidate detections, verified encroachment buffer tags, and report-ready metrics."
        }
      ]);
      setReadyToSave(true);
      setSaveStatus("Demo case active");
    } finally {
      setLoading(false);
    }
  }

  function resetDemo() {
    clearCase();
    setSavedCase(null);
    setQuery("");
    setRadius(1000);
    setFilters(defaultFilters);
    setInvestigationName(DEFAULT_INVESTIGATION);
    setDetections([]);
    setTimeline([]);
    setResult(null);
    setMessages([]);
    setReadyToSave(false);
    setCaseCreatedAt(null);
    setSaveStatus("Cleared");
    setImportPreview(null);
    setSelectedDetectionId(null);
  }

  function printReport() {
    const event = createTimelineEvent("report", "Report Exported", "Browser print dialog opened for PDF export");
    setTimeline((events) => [event, ...events].slice(0, 50));
    window.print();
  }

  useEffect(() => {
    if (!readyToSave || detections.length === 0) return;
    const caseState = currentCaseState();
    saveCase(caseState);
    setSavedCase(caseState);
    setSaveStatus(`Saved ${new Date(caseState.updatedAt).toLocaleTimeString()}`);
  }, [readyToSave, detections, filters, investigationName, query, radius, timeline]);

  const baseFilteredDetections = useMemo(() => detections.filter(distanceConfidenceFilter(filters)), [detections, filters]);
  const visibleDetections = useMemo(() => {
    return baseFilteredDetections.filter((item) => {
      if (item.status === "rejected" && !filters.showRejected) return false;
      return filters.statuses.includes(item.status);
    });
  }, [baseFilteredDetections, filters]);

  const reviewMetrics = useMemo(
    () => ({
      active: baseFilteredDetections.filter((item) => item.status !== "rejected").length,
      verified: baseFilteredDetections.filter((item) => item.status === "verified").length,
      pending: baseFilteredDetections.filter((item) => item.status === "new" || item.status === "under_review").length,
      rejected: baseFilteredDetections.filter((item) => item.status === "rejected").length,
      totalArea: baseFilteredDetections
        .filter((item) => item.status !== "rejected")
        .reduce((sum, d) => sum + d.area_sqm, 0)
    }),
    [baseFilteredDetections]
  );

  const statusCounts = useMemo(() => {
    return {
      new: detections.filter((d) => d.status === "new").length,
      under_review: detections.filter((d) => d.status === "under_review").length,
      verified: detections.filter((d) => d.status === "verified").length,
      rejected: detections.filter((d) => d.status === "rejected").length
    };
  }, [detections]);

  function handleRecenterAnchor() {
    if (!result || !mapRef.current) return;
    mapRef.current.setView([result.school.coordinates[1], result.school.coordinates[0]], 15, { animate: true });
  }

  function handleFitDetections() {
    if (!result || !mapRef.current) return;
    const bounds = L.latLngBounds([]);
    const pool = visibleDetections.length ? visibleDetections : detections;
    pool.forEach((item) => bounds.extend([item.centroid[1], item.centroid[0]]));
    bounds.extend([result.school.coordinates[1], result.school.coordinates[0]]);
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds.pad(0.18), { animate: true });
    }
  }

  return (
    <div className={`app-shell ${!sidebarOpen ? "sidebar-collapsed" : ""}`}>
      {/* Top Application Bar */}
      <header className="app-topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="btn-icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
          <div className="app-brand">
            <Radar size={18} className="brand-logo" />
            <span className="brand-name">SatQuery AI</span>
            <span className="brand-separator">/</span>
            <span className="brand-case" title={investigationName}>{investigationName}</span>
          </div>
        </div>

        {/* Workspace Navigation Tabs */}
        <nav className="workspace-tabs" role="tablist" aria-label="Workspace views">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "map"}
            className={`tab-btn ${activeTab === "map" ? "active" : ""}`}
            onClick={() => setActiveTab("map")}
          >
            <Compass size={14} />
            <span>Map &amp; Triage</span>
            {result && <span className="tab-count">{visibleDetections.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "compare"}
            className={`tab-btn ${activeTab === "compare" ? "active" : ""}`}
            onClick={() => setActiveTab("compare")}
          >
            <Layers size={14} />
            <span>Comparison</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "matrix"}
            className={`tab-btn ${activeTab === "matrix" ? "active" : ""}`}
            onClick={() => setActiveTab("matrix")}
          >
            <FileSpreadsheet size={14} />
            <span>Evidence Matrix</span>
            {detections.length > 0 && <span className="tab-count">{detections.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "report"}
            className={`tab-btn ${activeTab === "report" ? "active" : ""}`}
            onClick={() => setActiveTab("report")}
          >
            <FileText size={14} />
            <span>Report</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "timeline"}
            className={`tab-btn ${activeTab === "timeline" ? "active" : ""}`}
            onClick={() => setActiveTab("timeline")}
          >
            <Clock size={14} />
            <span>Activity Log</span>
          </button>
        </nav>

        {/* Topbar Right Telemetry & Actions */}
        <div className="topbar-right">
          <div className="telemetry-pill" title="Live UTC Telemetry">
            <span className="status-live-dot" />
            <span>{utcTime || "UTC"}</span>
          </div>

          <button
            type="button"
            className={`btn-copilot ${copilotOpen ? "active" : ""}`}
            onClick={() => setCopilotOpen(!copilotOpen)}
            title="Toggle AI Analyst Assistant"
          >
            <Sparkles size={14} />
            <span>AI Copilot</span>
          </button>

          <button
            type="button"
            className="btn btn-primary-sm"
            onClick={loadDemoMode}
            disabled={loading}
            title="Load Judge Demonstration Scenario"
          >
            <Play size={13} />
            <span>Demo Mode</span>
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="app-workspace-body">
        {/* Collapsible Left Panel */}
        <aside className="app-sidebar" aria-label="Analyst Query and Filters">
          {/* Query & Investigation Definition */}
          <section className="panel-card">
            <div className="card-header">
              <Search size={15} />
              <span>Analyst Query</span>
            </div>

            <div className="form-group">
              <label htmlFor="inv-name-input" className="form-label">Investigation Ref</label>
              <input
                id="inv-name-input"
                className="form-input"
                value={investigationName}
                onChange={(e) => setInvestigationName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="query-textarea-input" className="form-label">Geospatial Question</label>
              <textarea
                id="query-textarea-input"
                className="form-textarea"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Compare January and August satellite images and find new construction within 1 km of the school."
              />
            </div>

            <div className="suggested-chips-list">
              {suggestedQueries.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="btn-chip"
                  onClick={() => {
                    setQuery(item.query);
                    setRadius(item.radius);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="form-row-between">
              <label htmlFor="buffer-select-input" className="form-label inline">
                <SlidersHorizontal size={13} /> Buffer Radius
              </label>
              <select
                id="buffer-select-input"
                className="form-select-sm"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              >
                <option value={1000}>1 km Buffer</option>
                <option value={500}>500 m Buffer</option>
                <option value={2000}>2 km Buffer</option>
              </select>
            </div>

            <button
              type="button"
              className="btn btn-primary full-width"
              onClick={() => run(query, radius, detections.length > 0)}
              disabled={loading || !query.trim()}
            >
              <Play size={14} />
              <span>{loading ? "Analyzing Satellite Imagery..." : "Run Analysis"}</span>
            </button>
          </section>

          {/* Map Layer Toggles */}
          <section className="panel-card">
            <div className="card-header">
              <Layers size={15} />
              <span>Map Layer Controls</span>
            </div>
            <div className="layer-checklist">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showFootprintPolygons}
                  onChange={(e) => setShowFootprintPolygons(e.target.checked)}
                />
                <span className="checkbox-label">Building Footprint Polygons</span>
                <span className="count-tag">{visibleDetections.length}</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showCentroids}
                  onChange={(e) => setShowCentroids(e.target.checked)}
                />
                <span className="checkbox-label">Target Centroid Markers</span>
                <span className="count-tag">{visibleDetections.length}</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showBuffer500}
                  onChange={(e) => setShowBuffer500(e.target.checked)}
                />
                <span className="checkbox-label">500 m Security Buffer</span>
                <span className="status-dot-sm warning" />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showBuffer1000}
                  onChange={(e) => setShowBuffer1000(e.target.checked)}
                />
                <span className="checkbox-label">1 km Primary Buffer</span>
                <span className="status-dot-sm primary" />
              </label>
            </div>
          </section>

          {/* Detection Filters Component */}
          <DetectionFilters
            filters={filters}
            onChange={setFilters}
            statusCounts={statusCounts}
            onResetFilters={() => setFilters(defaultFilters)}
          />

          {/* Ground Truth Imports */}
          <section className="panel-card">
            <div className="card-header">
              <FileUp size={15} />
              <span>Ground Truth Data</span>
            </div>
            <input
              ref={detectionInputRef}
              hidden
              type="file"
              accept=".csv,.geojson,.json"
              onChange={(e) => handleDetectionFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="btn btn-secondary full-width"
              onClick={() => detectionInputRef.current?.click()}
              disabled={!result}
            >
              <Upload size={14} />
              <span>Upload CSV / GeoJSON</span>
            </button>
            <div className="sample-links-bar">
              <a href={sampleCsvUrl} download className="text-link">Download Sample CSV</a>
              <span className="link-divider">&bull;</span>
              <a href={sampleGeoJsonUrl} download className="text-link">Sample GeoJSON</a>
            </div>

            {importPreview && (
              <div className="import-status-box">
                <div className="import-status-head">
                  <strong>{importPreview.source}</strong>
                  <span>{importPreview.validRows} valid rows</span>
                </div>
                {importPreview.skippedRows.slice(0, 2).map((row) => (
                  <p key={`${row.row}-${row.reason}`} className="import-skip-note">Row {row.row}: {row.reason}</p>
                ))}
                <button
                  type="button"
                  className="btn btn-primary-sm full-width mt-2"
                  onClick={applyImportPreview}
                  disabled={importPreview.validRows === 0}
                >
                  Merge {importPreview.validRows} Detections
                </button>
              </div>
            )}
          </section>

          {/* Session Persistence */}
          <section className="panel-card">
            <div className="card-header">
              <Save size={15} />
              <span>Session Backup</span>
              <span className="header-status-note">{saveStatus}</span>
            </div>
            <div className="session-actions-grid">
              {savedCase && (
                <button
                  type="button"
                  className="btn btn-secondary-sm"
                  onClick={() => loadCaseIntoWorkspace(savedCase)}
                  title="Restore saved session"
                >
                  <ArchiveRestore size={13} />
                  <span>Restore</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary-sm"
                onClick={exportCurrentCase}
                disabled={detections.length === 0}
                title="Download JSON backup"
              >
                <Download size={13} />
                <span>Backup</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary-sm"
                onClick={() => caseInputRef.current?.click()}
                title="Upload JSON backup"
              >
                <Upload size={13} />
                <span>Import</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost-sm danger"
                onClick={resetDemo}
                title="Reset session state"
              >
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            </div>
            <input
              ref={caseInputRef}
              hidden
              type="file"
              accept=".json"
              onChange={(e) => importCaseFile(e.target.files?.[0] ?? null)}
            />
          </section>
        </aside>

        {/* Main Content Area */}
        <main className="app-main-content">
          {loading && !result ? (
            <div className="loading-viewport">
              <div className="loading-card">
                <Radar size={32} className="loading-spinner-icon" />
                <h3>Running Satellite Change Detection Analysis</h3>
                <AnalysisProgress activeIndex={analysisStepIndex} complete={false} />
                <p className="loading-query-note">{query}</p>
              </div>
            </div>
          ) : result ? (
            <>
              {/* Quick Metrics Ribbon (Shown in Map tab) */}
              {activeTab === "map" && (
                <div className="metrics-banner">
                  <Metric
                    icon={Building2}
                    label="Active Footprints"
                    value={reviewMetrics.active}
                    subtext={`inside ${radius}m`}
                    variant="primary"
                  />
                  <Metric
                    icon={ShieldCheck}
                    label="Analyst Verified"
                    value={reviewMetrics.verified}
                    subtext="confirmed changes"
                    variant="success"
                  />
                  <Metric
                    icon={Ruler}
                    label="Pending Review"
                    value={reviewMetrics.pending}
                    subtext="queued targets"
                    variant="warning"
                  />
                  <Metric
                    icon={AlertTriangle}
                    label="Rejected / False Positive"
                    value={reviewMetrics.rejected}
                    subtext="dismissed"
                    variant="neutral"
                  />
                  <Metric
                    icon={Radar}
                    label="Total Encroached Area"
                    value={`${Math.round(reviewMetrics.totalArea)} m²`}
                    subtext="ground footprint"
                  />
                </div>
              )}

              {/* Tab 1: Mission Map View */}
              {activeTab === "map" && (
                <div className="map-view-layout">
                  <div className="map-wrapper">
                    <MapToolbar
                      activeBasemap={activeBasemap}
                      onBasemapChange={setActiveBasemap}
                      onFitDetections={handleFitDetections}
                      onRecenterAnchor={handleRecenterAnchor}
                      showCoordinates={showCoordinates}
                      onToggleCoordinates={() => setShowCoordinates(!showCoordinates)}
                    />

                    {showCoordinates && cursorCoords && (
                      <div className="map-coords-badge">
                        <span>{cursorCoords.lat.toFixed(5)}° N, {cursorCoords.lng.toFixed(5)}° E</span>
                      </div>
                    )}

                    <MapContainer
                      className="leaflet-map-element"
                      center={[result.school.coordinates[1], result.school.coordinates[0]]}
                      zoom={15}
                      scrollWheelZoom
                      ref={(instance) => {
                        mapRef.current = instance;
                      }}
                    >
                      {activeBasemap === "satellite" && (
                        <TileLayer
                          attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
                          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                          maxZoom={19}
                        />
                      )}
                      {activeBasemap === "dark" && (
                        <TileLayer
                          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                          maxZoom={19}
                        />
                      )}
                      {activeBasemap === "street" && (
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          maxZoom={19}
                        />
                      )}

                      {showBuffer1000 && (
                        <Circle
                          center={[result.school.coordinates[1], result.school.coordinates[0]]}
                          radius={1000}
                          pathOptions={buffer1000Style()}
                        />
                      )}
                      {showBuffer500 && (
                        <Circle
                          center={[result.school.coordinates[1], result.school.coordinates[0]]}
                          radius={500}
                          pathOptions={buffer500Style()}
                        />
                      )}

                      {showFootprintPolygons &&
                        visibleDetections.map((item) => (
                          <GeoJSON
                            key={`poly-${item.id}-${item.status}-${item.id === selectedDetectionId}`}
                            data={item.geometry}
                            style={() => polygonStyle(item.status, item.id === selectedDetectionId)}
                            eventHandlers={{
                              click: () => setSelectedDetectionId(item.id)
                            }}
                          >
                            <Tooltip direction="top" offset={[0, -10]}>
                              <strong>{item.id}</strong> ({statusLabel(item.status)})<br />
                              Area: {Math.round(item.area_sqm)} m² &bull; Conf: {Math.round(item.confidence * 100)}%
                            </Tooltip>
                          </GeoJSON>
                        ))}

                      {showCentroids &&
                        visibleDetections.map((item) => (
                          <CircleMarker
                            key={`pt-${item.id}-${item.status}-${item.updatedAt}`}
                            center={[item.centroid[1], item.centroid[0]]}
                            radius={item.id === selectedDetectionId ? 10 : Math.max(5, Math.min(9, 4 + item.confidence * 5))}
                            pathOptions={markerStyle(item, item.id === selectedDetectionId)}
                            eventHandlers={{
                              click: () => setSelectedDetectionId(item.id)
                            }}
                          >
                            <Popup>
                              <div className="map-popup-card">
                                <h4>{item.id}</h4>
                                <p className="popup-status">Status: {statusLabel(item.status)}</p>
                                <p>{item.distance_to_school_m} m from anchor facility</p>
                                <p>Footprint: {Math.round(item.area_sqm)} m² &bull; Conf: {Math.round(item.confidence * 100)}%</p>
                                {item.note && <p className="popup-note-box">{item.note}</p>}
                              </div>
                            </Popup>
                          </CircleMarker>
                        ))}

                      <Marker position={[result.school.coordinates[1], result.school.coordinates[0]]} icon={schoolIcon}>
                        <Tooltip permanent direction="top">
                          <span className="school-tag">{result.school.name}</span>
                        </Tooltip>
                        <Popup>
                          <strong>{result.school.name}</strong>
                          <p>Anchor reference for spatial buffer calculations.</p>
                        </Popup>
                      </Marker>

                      <FitMap result={result} detections={visibleDetections.length ? visibleDetections : detections} />
                      <MapFocus detection={selectedDetection} />
                      <MapCursorTracker onMouseMove={(latlng) => setCursorCoords(latlng)} />
                    </MapContainer>
                  </div>

                  {/* Right Target Stream Panel */}
                  <div className="target-stream-panel">
                    <div className="stream-panel-header">
                      <h3>Nearest Targets</h3>
                      <span className="stream-badge">{visibleDetections.length} visible</span>
                    </div>
                    <DetectionList
                      detections={visibleDetections}
                      radius={radius}
                      selectedId={selectedDetectionId}
                      onSelect={setSelectedDetectionId}
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: Temporal Comparison View */}
              {activeTab === "compare" && (
                <TemporalComparisonView
                  detections={visibleDetections.length ? visibleDetections : detections}
                  images={result.images}
                />
              )}

              {/* Tab 3: Evidence Matrix View */}
              {activeTab === "matrix" && (
                <EvidenceMatrix
                  detections={detections}
                  radius={radius}
                  onSelectDetection={(id) => {
                    setSelectedDetectionId(id);
                    setActiveTab("map");
                  }}
                  onStatusChange={updateDetectionStatus}
                  onBatchStatusChange={updateBatchDetectionStatus}
                />
              )}

              {/* Tab 4: Executive Intelligence Report */}
              {activeTab === "report" && (
                <ReportPreview
                  detections={detections}
                  filteredDetections={visibleDetections}
                  filters={filters}
                  investigationName={investigationName}
                  onPrint={printReport}
                  query={query}
                  radius={radius}
                  result={result}
                  timeline={timeline}
                />
              )}

              {/* Tab 5: Activity Log Timeline */}
              {activeTab === "timeline" && (
                <CaseTimeline events={timeline} />
              )}
            </>
          ) : (
            /* Empty / Welcome State */
            <div className="empty-dashboard-welcome">
              <div className="welcome-card">
                <Radar size={40} className="welcome-icon" />
                <h2>SatQuery AI Geospatial Console</h2>
                <p className="welcome-desc">
                  Natural-language satellite investigation console for detecting urban encroachment, unpermitted construction, and security buffer violations.
                </p>

                <div className="welcome-scenarios">
                  <span className="scenarios-title">Quick Start Scenarios</span>
                  <div className="scenarios-grid">
                    {suggestedQueries.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className="scenario-card-btn"
                        onClick={() => {
                          setQuery(item.query);
                          setRadius(item.radius);
                          run(item.query, item.radius, false);
                        }}
                      >
                        <Play size={14} />
                        <div>
                          <strong>{item.label}</strong>
                          <p>{item.query}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="welcome-actions">
                  <button type="button" className="btn btn-primary" onClick={loadDemoMode}>
                    <Play size={14} />
                    <span>Launch Demonstration Case</span>
                  </button>
                  {savedCase && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => loadCaseIntoWorkspace(savedCase)}
                    >
                      <ArchiveRestore size={14} />
                      <span>Restore Previous Session</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Target Details Inspector Drawer */}
      <DetectionDetails
        detection={selectedDetection}
        onClose={() => setSelectedDetectionId(null)}
        onOpenInMap={(detection) => {
          setSelectedDetectionId(detection.id);
          setActiveTab("map");
          handleRecenterAnchor();
        }}
        onStatusChange={updateDetectionStatus}
        onNoteChange={updateDetectionNote}
      />

      {/* AI Analyst Copilot Drawer */}
      {copilotOpen && (
        <aside className="copilot-drawer" aria-label="AI Analyst Assistant">
          <div className="copilot-head">
            <div className="copilot-head-left">
              <Sparkles size={15} className="copilot-icon" />
              <h4>AI Analyst Copilot</h4>
            </div>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setCopilotOpen(false)}
              aria-label="Close copilot"
            >
              <X size={15} />
            </button>
          </div>

          <div className="copilot-messages">
            {messages.length === 0 ? (
              <div className="copilot-empty-state">
                <Bot size={24} />
                <p>Ask any analytical question about satellite detections, buffer encroachments, or footprint metrics.</p>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div key={`${m.role}-${idx}`} className={`copilot-bubble ${m.role}`}>
                  <span className="bubble-label">{m.role === "satquery" ? "SatQuery AI" : "Analyst"}</span>
                  <p className="bubble-content">{m.text}</p>
                </div>
              ))
            )}
          </div>

          <div className="copilot-chips-row">
            {copilotSuggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="copilot-quick-chip"
                onClick={() => sendChat(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="copilot-input-row">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Ask geospatial inquiry..."
              className="form-input"
            />
            <button
              type="button"
              className="btn btn-primary btn-icon"
              onClick={() => sendChat()}
              disabled={!chatInput.trim()}
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
