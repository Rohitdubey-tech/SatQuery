import { useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronDown, ChevronUp, Download, Eye, Filter, Search, XCircle } from "lucide-react";
import { statusLabel } from "./DetectionDetails";

export default function EvidenceMatrix({
  detections,
  radius,
  onSelectDetection,
  onStatusChange,
  onBatchStatusChange
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortField, setSortField] = useState("distance_to_school_m");
  const [sortOrder, setSortOrder] = useState("asc");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return detections.filter((d) => {
      const matchSearch =
        d.id.toLowerCase().includes(search.toLowerCase()) ||
        (d.note && d.note.toLowerCase().includes(search.toLowerCase())) ||
        d.change_type.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [detections, search, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === "string") {
        const cmp = valA.localeCompare(valB);
        return sortOrder === "asc" ? cmp : -cmp;
      }
      return sortOrder === "asc" ? valA - valB : valB - valA;
    });
  }, [filtered, sortField, sortOrder]);

  function toggleSort(field) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((d) => d.id)));
    }
  }

  function verifyHighConfidence() {
    const highConfIds = sorted.filter((d) => d.confidence >= 0.85).map((d) => d.id);
    if (highConfIds.length > 0) {
      onBatchStatusChange(highConfIds, "verified");
    }
  }

  function exportCSV() {
    const headers = ["ID", "Status", "Distance_m", "Confidence_Percent", "Area_sqm", "Centroid_Lng", "Centroid_Lat", "Note"];
    const rows = sorted.map((d) => [
      d.id,
      d.status,
      d.distance_to_school_m,
      Math.round(d.confidence * 100),
      Math.round(d.area_sqm),
      d.centroid[0],
      d.centroid[1],
      `"${(d.note || "").replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `satquery_detections_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportGeoJSON() {
    const featureCollection = {
      type: "FeatureCollection",
      features: sorted.map((d) => ({
        type: "Feature",
        id: d.id,
        geometry: d.geometry,
        properties: {
          id: d.id,
          status: d.status,
          distance_to_school_m: d.distance_to_school_m,
          confidence: d.confidence,
          area_sqm: d.area_sqm,
          note: d.note,
          source: d.source
        }
      }))
    };
    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `satquery_detections_${Date.now()}.geojson`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="matrix-card">
      <div className="matrix-toolbar">
        <div className="search-input-wrapper">
          <Search size={15} />
          <input
            type="text"
            placeholder="Filter by target ID, note text, or change type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="matrix-search-input"
          />
          {search && (
            <button
              type="button"
              className="btn-clear-search"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="filter-select-wrapper">
          <Filter size={14} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-select-sm"
          >
            <option value="all">All Statuses ({detections.length})</option>
            <option value="new">New ({detections.filter((d) => d.status === "new").length})</option>
            <option value="under_review">Under Review ({detections.filter((d) => d.status === "under_review").length})</option>
            <option value="verified">Verified ({detections.filter((d) => d.status === "verified").length})</option>
            <option value="rejected">Rejected ({detections.filter((d) => d.status === "rejected").length})</option>
          </select>
        </div>

        <div className="matrix-actions-group">
          <button
            type="button"
            className="btn btn-secondary-sm"
            onClick={verifyHighConfidence}
            title="Batch mark all detections with >=85% confidence as verified"
          >
            <Check size={13} />
            <span>Verify ≥85%</span>
          </button>
          {selectedIds.size > 0 && (
            <>
              <button
                type="button"
                className="btn btn-success-sm"
                onClick={() => {
                  onBatchStatusChange(Array.from(selectedIds), "verified");
                  setSelectedIds(new Set());
                }}
              >
                <CheckCircle2 size={13} />
                <span>Verify ({selectedIds.size})</span>
              </button>
              <button
                type="button"
                className="btn btn-danger-sm"
                onClick={() => {
                  onBatchStatusChange(Array.from(selectedIds), "rejected");
                  setSelectedIds(new Set());
                }}
              >
                <XCircle size={13} />
                <span>Reject</span>
              </button>
            </>
          )}
          <button type="button" className="btn btn-secondary-sm" onClick={exportCSV} title="Export to CSV">
            <Download size={13} />
            <span>CSV</span>
          </button>
          <button type="button" className="btn btn-secondary-sm" onClick={exportGeoJSON} title="Export to GeoJSON">
            <Download size={13} />
            <span>GeoJSON</span>
          </button>
        </div>
      </div>

      <div className="table-responsive-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "42px" }}>
                <input
                  type="checkbox"
                  checked={sorted.length > 0 && selectedIds.size === sorted.length}
                  onChange={toggleSelectAll}
                  aria-label="Select all targets"
                />
              </th>
              <th onClick={() => toggleSort("id")} className="sortable-header">
                <div className="th-content">
                  <span>Target ID</span>
                  {sortField === "id" && (sortOrder === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th onClick={() => toggleSort("status")} className="sortable-header">
                <div className="th-content">
                  <span>Status</span>
                  {sortField === "status" && (sortOrder === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th onClick={() => toggleSort("confidence")} className="sortable-header">
                <div className="th-content">
                  <span>Confidence</span>
                  {sortField === "confidence" && (sortOrder === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th onClick={() => toggleSort("distance_to_school_m")} className="sortable-header">
                <div className="th-content">
                  <span>Distance</span>
                  {sortField === "distance_to_school_m" && (sortOrder === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th onClick={() => toggleSort("area_sqm")} className="sortable-header">
                <div className="th-content">
                  <span>Footprint Area</span>
                  {sortField === "area_sqm" && (sortOrder === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th>Centroid (Lng, Lat)</th>
              <th>Analyst Notes</th>
              <th style={{ textAlign: "right" }}>Inspect</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="table-empty-row">
                  No detections match the search or status filters.
                </td>
              </tr>
            ) : (
              sorted.map((item) => {
                const isInsideBuffer = item.distance_to_school_m <= radius;
                const isSelected = selectedIds.has(item.id);
                const confPercent = Math.round(item.confidence * 100);

                return (
                  <tr
                    key={item.id}
                    className={`data-row ${isSelected ? "row-selected" : ""}`}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        aria-label={`Select target ${item.id}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="target-id-link"
                        onClick={() => onSelectDetection(item.id)}
                      >
                        {item.id}
                      </button>
                    </td>
                    <td>
                      <select
                        className="status-dropdown-cell"
                        value={item.status}
                        onChange={(e) => onStatusChange(item.id, e.target.value)}
                      >
                        <option value="new">New</option>
                        <option value="under_review">Under Review</option>
                        <option value="verified">Verified</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </td>
                    <td>
                      <div className="conf-bar-cell">
                        <div className="conf-track">
                          <div
                            className={`conf-fill ${confPercent >= 85 ? "high" : confPercent >= 70 ? "mid" : "low"}`}
                            style={{ width: `${confPercent}%` }}
                          />
                        </div>
                        <span className="conf-num">{confPercent}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`distance-text ${isInsideBuffer ? "inside-highlight" : ""}`}>
                        {item.distance_to_school_m} m
                      </span>
                    </td>
                    <td>
                      <span className="mono-val">{Math.round(item.area_sqm)} m²</span>
                    </td>
                    <td>
                      <span className="coord-val">
                        {item.centroid[0].toFixed(5)}, {item.centroid[1].toFixed(5)}
                      </span>
                    </td>
                    <td className="note-preview-cell" title={item.note}>
                      {item.note ? item.note : <span className="text-muted">None</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn-icon-table"
                        onClick={() => onSelectDetection(item.id)}
                        title="View on Map"
                        aria-label={`Inspect ${item.id} on map`}
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="matrix-table-footer">
        <span>Showing {sorted.length} of {detections.length} total detections</span>
        <span>Active buffer reference: {radius} m</span>
      </div>
    </div>
  );
}
