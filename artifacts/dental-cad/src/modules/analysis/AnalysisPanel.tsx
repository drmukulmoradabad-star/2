import { useState } from "react";
import { useAnalysisStore, MeasurementType } from "./analysisStore";
import { useViewerStore } from "@/store/viewerStore";
import { useSegmentationStore } from "../segmentation/segmentationStore";

const TOOL_CONFIG: { type: MeasurementType; label: string; icon: string; desc: string; points: number; viewerTool: "measure_distance" | "measure_angle" }[] = [
  { type: "distance", label: "Distance", icon: "↔", desc: "Click 2 points", points: 2, viewerTool: "measure_distance" },
  { type: "angle", label: "Angle", icon: "∠", desc: "Click 3 points (vertex = 2nd)", points: 3, viewerTool: "measure_angle" },
  { type: "arch_width", label: "Arch Width", icon: "⌒", desc: "Click widest 2 points", points: 2, viewerTool: "measure_distance" },
  { type: "overbite", label: "Overbite", icon: "↕", desc: "Click upper then lower ref.", points: 2, viewerTool: "measure_distance" },
  { type: "overjet", label: "Overjet", icon: "⇔", desc: "Click upper then lower ref.", points: 2, viewerTool: "measure_distance" },
  { type: "spacing", label: "Spacing", icon: "⋮⋮", desc: "Click gap between teeth", points: 2, viewerTool: "measure_distance" },
];

const TYPE_COLORS: Record<MeasurementType, string> = {
  distance: "#00e5ff",
  angle: "#ffcc00",
  arch_width: "#4dffb8",
  overbite: "#ff6b6b",
  overjet: "#ff9940",
  spacing: "#b87cff",
};

function fmt(v: number, unit: string) {
  return unit === "deg" ? `${v.toFixed(1)}°` : `${v.toFixed(2)} mm`;
}

export default function AnalysisPanel() {
  const {
    measurements, activeTool, setActiveTool,
    pendingPoints, clearPendingPoints,
    deleteMeasurement, clearAll, exportCsv, requiredPoints,
  } = useAnalysisStore();

  const setViewerTool = useViewerStore((s) => s.setActiveTool);
  const viewerTool = useViewerStore((s) => s.activeTool);
  const { result } = useSegmentationStore();
  const hasSegments = (result?.segments.length ?? 0) > 0;

  const startMeasurement = (config: typeof TOOL_CONFIG[number]) => {
    if (activeTool === config.type) {
      setActiveTool(null);
      setViewerTool("orbit");
      return;
    }
    setActiveTool(config.type);
    setViewerTool(config.viewerTool);
    clearPendingPoints();
  };

  const cancelActive = () => {
    setActiveTool(null);
    setViewerTool("orbit");
    clearPendingPoints();
  };

  const required = requiredPoints();
  const pending = pendingPoints.length;

  return (
    <div className="flex flex-col h-full text-[11px]" style={{ color: "#c8d8e8" }}>
      {/* Header */}
      <div className="px-3 py-2 shrink-0 flex items-center justify-between" style={{ borderBottom: "1px solid #1e2530" }}>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Measurements</p>
        <div className="flex gap-1">
          {measurements.length > 0 && (
            <>
              <button
                onClick={exportCsv}
                className="text-[9px] px-2 py-0.5 rounded transition-all"
                style={{ background: "rgba(77,255,184,0.08)", border: "1px solid rgba(77,255,184,0.3)", color: "#4dffb8" }}
              >
                Export CSV
              </button>
              <button
                onClick={clearAll}
                className="text-[9px] px-2 py-0.5 rounded transition-all"
                style={{ background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", color: "#ff4d4d" }}
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tool selection */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid #1a1d24" }}>
        <div className="grid grid-cols-3 gap-1">
          {TOOL_CONFIG.map((cfg) => {
            const isActive = activeTool === cfg.type;
            const c = TYPE_COLORS[cfg.type];
            return (
              <button
                key={cfg.type}
                onClick={() => startMeasurement(cfg)}
                className="flex flex-col items-center gap-0.5 py-2 px-1 rounded transition-all"
                style={{
                  background: isActive ? `${c}18` : "#13161d",
                  border: `1px solid ${isActive ? c : "#1e2530"}`,
                  color: isActive ? c : "#4a6070",
                }}
              >
                <span style={{ fontSize: 14 }}>{cfg.icon}</span>
                <span className="text-[9px] uppercase tracking-wider">{cfg.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active measurement guide */}
      {activeTool && (
        <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid #1a1d24" }}>
          <div className="rounded p-2 flex flex-col gap-1.5" style={{ background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.2)" }}>
            <div className="flex items-center justify-between">
              <span style={{ color: "#00e5ff" }}>
                {TOOL_CONFIG.find((c) => c.type === activeTool)?.label ?? activeTool}
              </span>
              <button onClick={cancelActive} style={{ color: "#4a6070" }}>✕</button>
            </div>
            <p style={{ color: "#4a6070" }}>
              {!hasSegments
                ? "⚠ Segment teeth first to place points"
                : pending === 0
                ? TOOL_CONFIG.find((c) => c.type === activeTool)?.desc
                : `${pending}/${required} points placed — click on a tooth`}
            </p>
            {pending > 0 && (
              <div className="flex gap-1">
                {Array.from({ length: required }).map((_, i) => (
                  <span
                    key={i}
                    className="flex-1 h-1.5 rounded-full transition-all"
                    style={{ background: i < pending ? "#00e5ff" : "#1e2530" }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Measurement list */}
      <div className="flex-1 overflow-y-auto">
        {measurements.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-28 px-4 text-center gap-1">
            <p style={{ color: "#2a3a48" }}>No measurements yet</p>
            <p className="text-[10px]" style={{ color: "#1e2a33" }}>Select a tool above, then click on teeth in the viewport</p>
          </div>
        ) : (
          <div>
            {/* Summary stats */}
            <div className="px-3 pt-2 pb-1">
              <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "#2a4050" }}>Summary</p>
              {(["arch_width", "overbite", "overjet"] as MeasurementType[]).map((type) => {
                const ms = measurements.filter((m) => m.type === type);
                if (!ms.length) return null;
                const last = ms[ms.length - 1];
                return (
                  <div key={type} className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
                    <span style={{ color: "#3a5060" }}>{TOOL_CONFIG.find((c) => c.type === type)?.label}</span>
                    <span className="font-mono" style={{ color: TYPE_COLORS[type] }}>{fmt(last.value, last.unit)}</span>
                  </div>
                );
              })}
            </div>

            <p className="px-3 pt-2 text-[10px] uppercase tracking-widest mb-1" style={{ color: "#2a4050" }}>All Measurements</p>
            {measurements.map((m) => {
              const c = TYPE_COLORS[m.type];
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-3 py-1.5 group transition-colors"
                  style={{ borderLeft: `2px solid transparent` }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0" style={{ background: `${c}20`, color: c }}>
                    {m.type === "angle" ? "∠" : "↔"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: "#7fa8c0" }}>{m.label}</p>
                    <p className="font-mono text-[10px]" style={{ color: c }}>{fmt(m.value, m.unit)}</p>
                  </div>
                  <button
                    onClick={() => deleteMeasurement(m.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "#3a5060" }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Measurement export summary */}
      {measurements.length > 0 && (
        <div className="px-3 py-2 shrink-0" style={{ borderTop: "1px solid #1a1d24" }}>
          <div className="flex justify-between items-center">
            <span style={{ color: "#3a5060" }}>{measurements.length} measurement{measurements.length !== 1 ? "s" : ""}</span>
            <button
              onClick={exportCsv}
              className="text-[10px] px-3 py-1 rounded transition-all"
              style={{ background: "rgba(77,255,184,0.08)", border: "1px solid rgba(77,255,184,0.3)", color: "#4dffb8" }}
            >
              Export CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
