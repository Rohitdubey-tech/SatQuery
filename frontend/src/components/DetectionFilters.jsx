import { Filter, RotateCcw } from "lucide-react";

const statusOptions = [
  { value: "new", label: "New Target" },
  { value: "under_review", label: "Under Review" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" }
];

export default function DetectionFilters({ filters, onChange, statusCounts, onResetFilters }) {
  function toggleStatus(status) {
    const active = filters.statuses.includes(status);
    onChange({
      ...filters,
      statuses: active ? filters.statuses.filter((item) => item !== status) : [...filters.statuses, status]
    });
  }

  const confPercent = Math.round(filters.minConfidence * 100);

  return (
    <section className="panel-card filter-panel">
      <div className="card-header">
        <div className="header-title-group">
          <Filter size={15} />
          <span>Detection Filters</span>
        </div>
        {onResetFilters && (
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={onResetFilters}
            title="Reset filters to default"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div className="filter-group">
        <label className="filter-label">Triage Status</label>
        <div className="status-toggle-grid">
          {statusOptions.map((option) => {
            const isChecked = filters.statuses.includes(option.value);
            const count = statusCounts ? statusCounts[option.value] : null;
            return (
              <button
                type="button"
                key={option.value}
                className={`status-toggle-btn ${isChecked ? "active" : ""}`}
                onClick={() => toggleStatus(option.value)}
                aria-pressed={isChecked}
              >
                <div className="toggle-btn-left">
                  <span className={`status-indicator ${option.value}`} />
                  <span className="toggle-label-text">{option.label}</span>
                </div>
                {count !== null && <span className="toggle-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-label-row">
          <label htmlFor="conf-slider" className="filter-label">Minimum Confidence</label>
          <span className="filter-value-pill">{confPercent}%</span>
        </div>
        <input
          id="conf-slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={filters.minConfidence}
          onChange={(event) => onChange({ ...filters, minConfidence: Number(event.target.value) })}
          aria-label="Minimum confidence threshold"
          className="range-input"
        />
        <div className="slider-ticks">
          <span>0%</span>
          <span>50%</span>
          <span>75%</span>
          <span>90%</span>
        </div>
      </div>

      <div className="filter-group">
        <label htmlFor="distance-select" className="filter-label">Buffer Distance Filter</label>
        <select
          id="distance-select"
          className="form-select"
          value={filters.maxDistanceM}
          onChange={(event) => onChange({ ...filters, maxDistanceM: Number(event.target.value) })}
        >
          <option value={500}>Within 500 m</option>
          <option value={1000}>Within 1 km (Standard)</option>
          <option value={2000}>Within 2 km</option>
          <option value={0}>All Distances (Unfiltered)</option>
        </select>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={filters.showRejected}
          onChange={(event) => onChange({ ...filters, showRejected: event.target.checked })}
        />
        <span>Include rejected / false-positive targets</span>
      </label>
    </section>
  );
}
