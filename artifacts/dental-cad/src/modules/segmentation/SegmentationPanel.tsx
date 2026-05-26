import { useState } from "react";
import { useSegmentationStore } from "./segmentationStore";
import { useMovementStore } from "../movement/movementStore";
import { Slider } from "@/components/ui/slider";

const FDI_COLORS = [
  "#00c8ff", "#4dffb8", "#ffcc00", "#ff6b6b",
  "#b87cff", "#ff9940", "#60d9a0", "#ff80c0",
  "#3399ff", "#33ffaa", "#ffaa00", "#ff4444",
  "#9955ff", "#ff8830", "#44cc88", "#ff5599",
];

export default function SegmentationPanel({ onRunSegmentation, isRunning }: {
  onRunSegmentation: (opts: { angleThreshold: number; minFaces: number }) => void;
  isRunning: boolean;
}) {
  const {
    result, metas, setMeta, activeSegmentId, setActiveSegmentId,
    showSegmented, setShowSegmented, brushRadius, setBrushRadius,
  } = useSegmentationStore();
  const { setActiveSegmentId: setMovActive } = useMovementStore();

  const [angleThreshold, setAngleThreshold] = useState(30);
  const [minFaces, setMinFaces] = useState(50);
  const [tab, setTab] = useState<"segments" | "brush">("segments");

  const segments = result?.segments ?? [];

  return (
    <div className="flex flex-col h-full text-[11px]" style={{ color: "#c8d8e8" }}>
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid #1e2530" }}>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Segmentation</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <span className="text-[10px]" style={{ color: "#4a6070" }}>Show</span>
          <button
            onClick={() => setShowSegmented(!showSegmented)}
            disabled={!result}
            className="relative w-8 h-4 rounded-full transition-all duration-200 disabled:opacity-30"
            style={{
              background: showSegmented ? "rgba(0,229,255,0.3)" : "#1a1d24",
              border: `1px solid ${showSegmented ? "rgba(0,229,255,0.5)" : "#2a3540"}`,
            }}
          >
            <span
              className="absolute top-0.5 w-3 h-3 rounded-full transition-all duration-200"
              style={{
                left: showSegmented ? "calc(100% - 14px)" : 2,
                background: showSegmented ? "#00e5ff" : "#3a5060",
              }}
            />
          </button>
        </label>
      </div>

      {/* Auto-segment controls */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid #1a1d24" }}>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span style={{ color: "#4a6070" }}>Angle threshold</span>
            <div className="flex items-center gap-2">
              <Slider min={10} max={60} step={1} value={[angleThreshold]}
                onValueChange={([v]) => setAngleThreshold(v)} className="w-20" />
              <span className="font-mono w-6" style={{ color: "#7fa8c0" }}>{angleThreshold}°</span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: "#4a6070" }}>Min faces</span>
            <div className="flex items-center gap-2">
              <Slider min={10} max={200} step={10} value={[minFaces]}
                onValueChange={([v]) => setMinFaces(v)} className="w-20" />
              <span className="font-mono w-6" style={{ color: "#7fa8c0" }}>{minFaces}</span>
            </div>
          </div>
          <button
            onClick={() => onRunSegmentation({ angleThreshold, minFaces })}
            disabled={isRunning}
            className="w-full py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-all disabled:opacity-40"
            style={{
              background: isRunning ? "rgba(0,229,255,0.05)" : "rgba(0,229,255,0.15)",
              border: "1px solid rgba(0,229,255,0.4)",
              color: "#00e5ff",
            }}
          >
            {isRunning ? "Segmenting..." : "Auto-Detect Teeth"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0" style={{ borderBottom: "1px solid #1a1d24" }}>
        {(["segments", "brush"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-1.5 text-[10px] uppercase tracking-wider transition-colors"
            style={{
              color: tab === t ? "#00e5ff" : "#3a5060",
              borderBottom: tab === t ? "2px solid #00e5ff" : "2px solid transparent",
            }}
          >
            {t === "segments" ? "Segments" : "Brush Paint"}
          </button>
        ))}
      </div>

      {tab === "brush" && (
        <div className="px-3 py-3 shrink-0 flex flex-col gap-2" style={{ borderBottom: "1px solid #1a1d24" }}>
          <div className="flex justify-between items-center">
            <span style={{ color: "#4a6070" }}>Brush radius</span>
            <div className="flex items-center gap-2">
              <Slider min={0.05} max={2} step={0.05} value={[brushRadius]}
                onValueChange={([v]) => setBrushRadius(v)} className="w-20" />
              <span className="font-mono w-10" style={{ color: "#7fa8c0" }}>{brushRadius.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-[10px]" style={{ color: "#2a4050" }}>
            Select a segment below, then paint to assign faces
          </p>
        </div>
      )}

      {/* Segment list */}
      <div className="flex-1 overflow-y-auto">
        {segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 px-3 text-center">
            <p style={{ color: "#2a3a48" }}>No segments yet</p>
            <p className="text-[10px] mt-1" style={{ color: "#1e2a33" }}>Run auto-detect above</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            {segments.map((seg, idx) => {
              const meta = metas[seg.id] ?? {};
              const color = meta.color ?? seg.color;
              const isActive = seg.id === activeSegmentId;
              const isLocked = meta.isLocked ?? false;
              const isHidden = meta.isHidden ?? false;

              return (
                <div
                  key={seg.id}
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors group"
                  style={{
                    background: isActive ? "rgba(0,229,255,0.07)" : "transparent",
                    borderLeft: `2px solid ${isActive ? "#00e5ff" : "transparent"}`,
                  }}
                  onClick={() => {
                    setActiveSegmentId(seg.id);
                    setMovActive(seg.id);
                  }}
                >
                  {/* Color dot / picker */}
                  <label className="shrink-0 cursor-pointer" title="Change color">
                    <span
                      className="block w-3 h-3 rounded-full"
                      style={{ background: color, border: isActive ? "1px solid white" : "none" }}
                    />
                    <input
                      type="color"
                      value={color}
                      className="hidden"
                      onChange={(e) => setMeta(seg.id, { color: e.target.value })}
                    />
                  </label>

                  {/* FDI label */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[9px] font-mono font-bold px-1 rounded"
                        style={{ background: `${color}25`, color }}
                      >
                        {meta.fdiNumber ?? `S${idx + 1}`}
                      </span>
                      <input
                        className="bg-transparent outline-none truncate text-[11px] w-full"
                        style={{ color: isActive ? "#c8d8e8" : "#6080a0" }}
                        value={meta.label ?? seg.label}
                        onChange={(e) => setMeta(seg.id, { label: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <p className="text-[10px]" style={{ color: "#2a4050" }}>
                      {seg.faceIndices.length.toLocaleString()} faces
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {/* Lock */}
                    <button
                      title={isLocked ? "Unlock" : "Lock"}
                      onClick={(e) => { e.stopPropagation(); setMeta(seg.id, { isLocked: !isLocked }); }}
                      style={{ color: isLocked ? "#ffcc00" : "#2a4050" }}
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
                        {isLocked
                          ? <><rect x="2" y="5" width="8" height="6" rx="1" /><path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.2" fill="none" /></>
                          : <><rect x="2" y="5" width="8" height="6" rx="1" /><path d="M4 5V3.5a2 2 0 0 1 4 0" stroke="currentColor" strokeWidth="1.2" fill="none" /></>
                        }
                      </svg>
                    </button>
                    {/* Hide */}
                    <button
                      title={isHidden ? "Show" : "Hide"}
                      onClick={(e) => { e.stopPropagation(); setMeta(seg.id, { isHidden: !isHidden }); }}
                      style={{ color: isHidden ? "#4a6070" : "#2a4050" }}
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
                        {isHidden
                          ? <><path d="M1 1 L11 11" /><path d="M5 3.2A4 4 0 0 1 11 8M7 9.5A4 4 0 0 1 1 5" /></>
                          : <><ellipse cx="6" cy="6" rx="5" ry="3" /><circle cx="6" cy="6" r="1.5" fill="currentColor" /></>
                        }
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FDI numbering reminder */}
      {segments.length > 0 && (
        <div className="px-3 py-2 shrink-0" style={{ borderTop: "1px solid #1a1d24" }}>
          <div className="grid grid-cols-8 gap-0.5">
            {[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28].map((n) => {
              const seg = segments.find((s) => metas[s.id]?.fdiNumber === n || s.fdiNumber === n);
              const color = seg ? (metas[seg.id]?.color ?? seg.color) : "#1a1d24";
              return (
                <div
                  key={n}
                  title={`FDI ${n}`}
                  className="text-center text-[8px] py-0.5 rounded cursor-pointer"
                  style={{
                    background: `${color}40`,
                    color: seg ? color : "#1e2530",
                    border: seg?.id === activeSegmentId ? `1px solid ${color}` : "1px solid transparent",
                  }}
                  onClick={() => {
                    if (seg) { setActiveSegmentId(seg.id); setMovActive(seg.id); }
                  }}
                >
                  {n}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-8 gap-0.5 mt-0.5">
            {[48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38].map((n) => {
              const seg = segments.find((s) => metas[s.id]?.fdiNumber === n || s.fdiNumber === n);
              const color = seg ? (metas[seg.id]?.color ?? seg.color) : "#1a1d24";
              return (
                <div
                  key={n}
                  title={`FDI ${n}`}
                  className="text-center text-[8px] py-0.5 rounded cursor-pointer"
                  style={{
                    background: `${color}40`,
                    color: seg ? color : "#1e2530",
                    border: seg?.id === activeSegmentId ? `1px solid ${color}` : "1px solid transparent",
                  }}
                  onClick={() => {
                    if (seg) { setActiveSegmentId(seg.id); setMovActive(seg.id); }
                  }}
                >
                  {n}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
