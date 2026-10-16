import { Crosshair, Eye, Globe, Locate, Map as MapIcon, Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";

export default function MapToolbar({
  activeBasemap,
  onBasemapChange,
  onFitDetections,
  onRecenterAnchor,
  showCoordinates,
  onToggleCoordinates
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  function toggleFullscreen() {
    const mapEl = document.querySelector(".map-wrapper");
    if (!document.fullscreenElement && mapEl) {
      mapEl.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  return (
    <div className="map-toolbar" role="toolbar" aria-label="Map Tools">
      <div className="toolbar-section">
        <button
          type="button"
          className={`toolbar-btn ${activeBasemap === "satellite" ? "active" : ""}`}
          onClick={() => onBasemapChange("satellite")}
          title="Satellite Imagery (Esri World Imagery)"
        >
          <Globe size={14} />
          <span>Satellite</span>
        </button>
        <button
          type="button"
          className={`toolbar-btn ${activeBasemap === "dark" ? "active" : ""}`}
          onClick={() => onBasemapChange("dark")}
          title="Tactical Dark Map (CartoDB Dark Matter)"
        >
          <Eye size={14} />
          <span>Dark</span>
        </button>
        <button
          type="button"
          className={`toolbar-btn ${activeBasemap === "street" ? "active" : ""}`}
          onClick={() => onBasemapChange("street")}
          title="Street Map (OpenStreetMap)"
        >
          <MapIcon size={14} />
          <span>Street</span>
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-section">
        <button
          type="button"
          className="toolbar-btn"
          onClick={onRecenterAnchor}
          title="Center on Anchor Facility"
        >
          <Locate size={14} />
          <span>Anchor</span>
        </button>
        <button
          type="button"
          className="toolbar-btn"
          onClick={onFitDetections}
          title="Fit All Detections In View"
        >
          <Crosshair size={14} />
          <span>Fit All</span>
        </button>
        <button
          type="button"
          className={`toolbar-btn ${showCoordinates ? "active" : ""}`}
          onClick={onToggleCoordinates}
          title="Toggle Cursor Lat/Lng Coordinates"
        >
          <span>Coords</span>
        </button>
        <button
          type="button"
          className="toolbar-btn icon-only"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Map"}
          aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen Map"}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
    </div>
  );
}
