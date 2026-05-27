/**
 * SculptPanel v2 — Professional dental sculpting UI.
 *
 * Sections:
 *  1. Tool grid (grab, smooth, inflate, deflate, flatten, relax, pinch, push, pull, crease, clay)
 *  2. Brush settings (radius, strength, falloff)
 *  3. Symmetry
 *  4. Mask / Freeze
 *  5. Sculpt Layers
 *  6. Constraints & Stability
 *  7. Keyboard shortcuts
 */

import { useCallback, useState } from "react";
import { useSculptStore } from "./sculptStore";
import { useLatticeStore } from "./latticeStore";
import { useViewerStore } from "@/store/viewerStore";
import { Slider } from "@/components/ui/slider";
import type { SculptTool, FalloffCurve } from "./SculptEngine";

// ─── Reusable UI ─────────────────────────────────────────────────────────────

const HDR = "text-[9px] uppercase tracking-[0.15em] font-semibold mb-2 mt-1 block";
const DIV = "my-3 border-t border-[#1a1d24]";

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px]" style={{ color: "#4a6070" }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        className="relative w-9 h-5 rounded-full transition-all"
        style={{
          background: value ? "rgba(0,229,255,0.2)" : "#0e1117",
          border: `1px solid ${value ? "rgba(0,229,255,0.5)" : "#1e2530"}`,
        }}
      >
        <span className="absolute top-0.5 w-4 h-4 rounded-full transition-all" style={{
          left: value ? "calc(100% - 18px)" : 2,
          background: value ? "#00e5ff" : "#2a3a4a",
        }} />
      </button>
    </div>
  );
}

function Row({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] shrink-0 w-[52px]" style={{ color: "#4a6070" }}>{label}</span>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <Slider min={min} max={max} step={step} value={[value]}
          onValueChange={([v]) => onChange(v)} className="w-20" />
        <span className="font-mono text-[10px] w-11 text-right" style={{ color: "#7fa8c0" }}>
          {unit === "%" ? `${(value * 100).toFixed(0)}%` : value.toFixed(step < 0.1 ? 2 : 1)}{unit && unit !== "%" ? unit : ""}
        </span>
      </div>
    </div>
  );
}

// ─── Falloff preview SVG ──────────────────────────────────────────────────────

function FalloffPreview({ curve }: { curve: FalloffCurve }) {
  const pts: string[] = [];
  const W = 44, H = 18;
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    let y: number;
    switch (curve) {
      case "linear":   y = t; break;
      case "smooth":   y = t * t * (3 - 2 * t); break;
      case "sharp":    y = Math.pow(t, 3); break;
      case "constant": y = 0; break;
      case "sphere":   y = 1 - Math.sqrt(Math.max(0, 1 - (1-t)*(1-t))); break;
      case "root":     y = Math.sqrt(t); break;
      default:         y = t;
    }
    pts.push(`${(t * W).toFixed(1)},${((1 - y) * H).toFixed(1)}`);
  }
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline points={pts.join(" ")} fill="none" stroke="#00e5ff" strokeWidth="1.2" opacity="0.6" />
      <line x1="0" y1={H} x2={W} y2={H} stroke="#1e2530" strokeWidth="0.5" />
    </svg>
  );
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: { id: SculptTool; label: string; desc: string; key: string; icon: React.ReactNode }[] = [
  {
    id: "grab", label: "Grab", key: "G", desc: "Drag surface region with soft falloff",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M5 4v5M7.5 3v6M10 4v5M12.5 5.5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5 9a2.5 2.5 0 002.5 2.5h2.5A2.5 2.5 0 0015 9" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>,
  },
  {
    id: "smooth", label: "Smooth", key: "S", desc: "Laplacian surface relaxation",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M2 10 Q5 4 8 8 Q11 12 14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M2 12 Q5 8 8 10 Q11 12 14 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/></svg>,
  },
  {
    id: "inflate", label: "Inflate", key: "I", desc: "Push outward along vertex normals",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/></svg>,
  },
  {
    id: "deflate", label: "Deflate", key: "D", desc: "Push inward along vertex normals",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/></svg>,
  },
  {
    id: "flatten", label: "Flatten", key: "F", desc: "Project region onto hit plane",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M4 5 Q8 3 12 5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6"/><path d="M4 11 Q8 13 12 11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6"/></svg>,
  },
  {
    id: "relax", label: "Relax", key: "R", desc: "Equalize edge lengths — surface fairing",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M3 13 L8 3 L13 13Z" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/></svg>,
  },
  {
    id: "pinch", label: "Pinch", key: "P", desc: "Pull vertices toward brush centre",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M3 4 L8 8 L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M3 12 L8 8 L13 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    id: "pull", label: "Pull", key: "U", desc: "Pull surface outward along normal",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M8 12 L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5 7 L8 4 L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M4 12 Q8 10 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/></svg>,
  },
  {
    id: "push", label: "Push", key: "H", desc: "Push surface inward along normal",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M8 4 L8 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5 9 L8 12 L11 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M4 4 Q8 6 12 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/></svg>,
  },
  {
    id: "crease", label: "Crease", key: "C", desc: "Sharpen surface fold lines",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M2 6 L8 10 L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M2 10 L8 14 L14 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4"/></svg>,
  },
  {
    id: "clay", label: "Clay", key: "Y", desc: "Build-up with implicit flattening",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><ellipse cx="8" cy="10" rx="5" ry="3" stroke="currentColor" strokeWidth="1.5"/><path d="M3 10 Q8 4 13 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  },
  {
    id: "surface", label: "Surface", key: "V", desc: "Surface slide — drag vertices along mesh tangent",
    icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M2 6 Q5 4 8 6 Q11 8 14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M6 9 L10 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/><path d="M8 7 L10 9 L8 11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.8"/></svg>,
  },
];

const FALLOFF_OPTIONS: { id: FalloffCurve; label: string }[] = [
  { id: "smooth",   label: "Smooth" },
  { id: "linear",   label: "Linear" },
  { id: "sharp",    label: "Sharp"  },
  { id: "sphere",   label: "Sphere" },
  { id: "root",     label: "Root"   },
  { id: "constant", label: "Const"  },
];

// ─── Lattice section sub-component ───────────────────────────────────────────

function LatticeSection() {
  const ls = useLatticeStore();
  const { activeTool, setActiveTool } = useViewerStore();
  const isSculptMode = activeTool === "sculpt";

  const toggle = () => {
    ls.setIsLatticeActive(!ls.isLatticeActive);
    if (!isSculptMode) setActiveTool("sculpt");
  };

  const resetLattice = () => {
    (window as any).__latticeResetFn?.();
    ls.resetLattice();
  };

  return (
    <>
      <span className={HDR} style={{ color: "#2a4050" }}>Lattice / FFD Deform</span>
      <p className="text-[9px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
        Free-form deformation cage. Drag blue control points to reshape the arch region.
        Trilinear interpolation propagates displacement to all vertices.
      </p>

      <Toggle
        label="Enable Lattice Cage"
        value={ls.isLatticeActive}
        onChange={toggle}
      />

      {ls.isLatticeActive && (
        <div className="mt-2 flex flex-col gap-2">
          {/* Grid dimensions */}
          <div className="grid grid-cols-3 gap-1">
            {([
              { label: "X", value: ls.latticeNx, set: ls.setLatticeNx },
              { label: "Y", value: ls.latticeNy, set: ls.setLatticeNy },
              { label: "Z", value: ls.latticeNz, set: ls.setLatticeNz },
            ] as const).map(({ label, value, set }) => (
              <div key={label} className="flex flex-col items-center gap-0.5">
                <span className="text-[9px]" style={{ color: "#4a6070" }}>{label} Div</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => set(value - 1)}
                    className="w-5 h-5 rounded text-[11px] font-bold"
                    style={{ background: "#0e1117", border: "1px solid #1a1d24", color: "#4a6070" }}
                  >−</button>
                  <span className="font-mono text-[10px] w-4 text-center" style={{ color: "#7fa8c0" }}>{value}</span>
                  <button
                    onClick={() => set(value + 1)}
                    className="w-5 h-5 rounded text-[11px] font-bold"
                    style={{ background: "#0e1117", border: "1px solid #1a1d24", color: "#4a6070" }}
                  >+</button>
                </div>
              </div>
            ))}
          </div>

          {ls.totalDisplacement > 0.001 && (
            <div className="px-2 py-1 rounded text-[9px]"
              style={{ background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.1)", color: "#4a7080" }}>
              Total displacement: {ls.totalDisplacement.toFixed(3)} u
            </div>
          )}

          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={resetLattice}
              className="py-1.5 rounded text-[10px] transition-all"
              style={{ background: "#0e1117", border: "1px solid #1a1d24", color: "#7fa8c0" }}
            >
              Reset Cage
            </button>
            <button
              onClick={() => ls.setIsLatticeActive(false)}
              className="py-1.5 rounded text-[10px] transition-all"
              style={{ background: "#0e1117", border: "1px solid #1a1d24", color: "#5a3040" }}
            >
              Exit Lattice
            </button>
          </div>

          <div className="rounded p-2 text-[9px] leading-relaxed"
            style={{ background: "#0a0c10", border: "1px solid #1a1d24", color: "#2a3a48" }}>
            Drag cyan spheres to deform · LMB = select + drag · Reset restores original positions
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function SculptPanel() {
  const store = useSculptStore();
  const { activeTool, setActiveTool } = useViewerStore();
  const isSculptMode = activeTool === "sculpt";
  const [editingLayerIdx, setEditingLayerIdx] = useState<number | null>(null);
  const [editingLayerName, setEditingLayerName] = useState("");

  const toggleSculptMode = useCallback(() => {
    if (isSculptMode) {
      setActiveTool("orbit");
      store.setActiveSculptTool(null);
    } else {
      setActiveTool("sculpt");
      if (!store.activeSculptTool) store.setActiveSculptTool("smooth");
    }
  }, [isSculptMode, store.activeSculptTool]);

  const selectTool = useCallback((id: SculptTool) => {
    store.setActiveSculptTool(id);
    store.setMaskMode("off");
    if (!isSculptMode) setActiveTool("sculpt");
  }, [isSculptMode]);

  const setMaskMode = useCallback((m: typeof store.maskMode) => {
    store.setMaskMode(m);
    if (m !== "off") {
      store.setActiveSculptTool(null);
      if (!isSculptMode) setActiveTool("sculpt");
    }
  }, [isSculptMode]);

  return (
    <div className="flex flex-col h-full text-[11px] overflow-y-auto" style={{ color: "#c8d8e8" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 shrink-0 flex items-center justify-between"
        style={{ borderBottom: "1px solid #1e2530", background: "#0a0c10" }}>
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Sculpt</p>
          {isSculptMode && (
            <p className="text-[9px] mt-0.5" style={{ color: "#3a8060" }}>
              {store.strokeCount} stroke{store.strokeCount !== 1 ? "s" : ""}
              {store.undoStack.length > 0 && <span style={{ color: "#2a5040" }}> · {store.undoStack.length} undo</span>}
            </p>
          )}
        </div>
        <button onClick={toggleSculptMode} className="text-[10px] px-3 py-1 rounded font-semibold transition-all"
          style={{
            background: isSculptMode ? "rgba(0,229,255,0.15)" : "#13161d",
            border: `1px solid ${isSculptMode ? "rgba(0,229,255,0.5)" : "#1e2530"}`,
            color: isSculptMode ? "#00e5ff" : "#4a6070",
          }}>
          {isSculptMode ? "Active" : "Enable"}
        </button>
      </div>

      <div className="p-3 flex flex-col gap-0">

        {/* ── Tool grid ──────────────────────────────────────────────────── */}
        <span className={HDR} style={{ color: "#2a4050" }}>Sculpt Tools</span>
        <div className="grid grid-cols-3 gap-1 mb-1">
          {TOOLS.map((tool) => {
            const active = isSculptMode && store.activeSculptTool === tool.id && store.maskMode === "off";
            return (
              <button key={tool.id} onClick={() => selectTool(tool.id)}
                title={`${tool.desc} [${tool.key}]`}
                className="flex flex-col items-center gap-1 py-2 rounded transition-all"
                style={{
                  background: active ? "rgba(0,229,255,0.12)" : "#0e1117",
                  border: `1px solid ${active ? "rgba(0,229,255,0.4)" : "#1a1d24"}`,
                  color: active ? "#00e5ff" : "#4a6070",
                }}>
                <span style={{ color: active ? "#00e5ff" : "#3a5060" }}>{tool.icon}</span>
                <span className="text-[9px] uppercase tracking-wider">{tool.label}</span>
              </button>
            );
          })}
        </div>

        {isSculptMode && store.activeSculptTool && store.maskMode === "off" && (
          <div className="mb-2 px-2 py-1.5 rounded text-[9px] leading-relaxed"
            style={{ background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.1)", color: "#4a7080" }}>
            {TOOLS.find(t => t.id === store.activeSculptTool)?.desc}
          </div>
        )}

        <div className={DIV} />

        {/* ── Brush settings ─────────────────────────────────────────────── */}
        <span className={HDR} style={{ color: "#2a4050" }}>Brush</span>
        <div className="flex flex-col gap-2.5 mb-2">
          <Row label="Radius"   value={store.brushRadius}   min={0.03} max={4}   step={0.01} onChange={store.setBrushRadius} />
          <Row label="Strength" value={store.brushStrength} min={0.01} max={1}   step={0.01} unit="%" onChange={store.setBrushStrength} />
        </div>
        <p className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: "#2a3a48" }}>Falloff Curve</p>
        <div className="grid grid-cols-3 gap-1 mb-2">
          {FALLOFF_OPTIONS.map(({ id, label }) => {
            const active = store.brushFalloff === id;
            return (
              <button key={id} onClick={() => store.setBrushFalloff(id)}
                className="flex flex-col items-center gap-0.5 py-1.5 rounded transition-all"
                style={{
                  background: active ? "rgba(0,229,255,0.08)" : "transparent",
                  border: `1px solid ${active ? "rgba(0,229,255,0.3)" : "#1a1d24"}`,
                }}>
                <FalloffPreview curve={id} />
                <span className="text-[8px] uppercase tracking-wider"
                  style={{ color: active ? "#00e5ff" : "#3a5060" }}>{label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[9px] mb-1" style={{ color: "#2a3a48" }}>
          Scroll wheel = radius &nbsp;·&nbsp; Shift+Scroll = strength
        </p>

        <div className={DIV} />

        {/* ── Symmetry ───────────────────────────────────────────────────── */}
        <span className={HDR} style={{ color: "#2a4050" }}>Symmetry</span>
        <div className="flex flex-col gap-2 mb-2">
          <Toggle label="Mirror Symmetry" value={store.symmetryEnabled} onChange={store.setSymmetryEnabled} />
          {store.symmetryEnabled && (
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: "#4a6070" }}>Mirror Axis</span>
              <div className="flex gap-1">
                {(["x", "y", "z"] as const).map((ax) => (
                  <button key={ax} onClick={() => store.setSymmetryAxis(ax)}
                    className="w-7 h-6 rounded text-[10px] font-mono font-bold uppercase transition-all"
                    style={{
                      background: store.symmetryAxis === ax ? "rgba(0,229,255,0.15)" : "#13161d",
                      border: `1px solid ${store.symmetryAxis === ax ? "rgba(0,229,255,0.4)" : "#1e2530"}`,
                      color: store.symmetryAxis === ax ? "#00e5ff" : "#4a6070",
                    }}>{ax}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={DIV} />

        {/* ── Mask / Freeze ──────────────────────────────────────────────── */}
        <span className={HDR} style={{ color: "#2a4050" }}>Mask / Freeze</span>
        <p className="text-[9px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
          Paint masked (red) regions to lock them from deformation.
          Masked vertices are shown as a pink overlay in the viewport.
        </p>
        <div className="grid grid-cols-2 gap-1 mb-2">
          {([
            { mode: "paint" as const, label: "Paint Mask", color: "#ff4488" },
            { mode: "erase" as const, label: "Erase Mask", color: "#44a8ff" },
          ]).map(({ mode, label, color }) => {
            const active = store.maskMode === mode;
            return (
              <button key={mode} onClick={() => setMaskMode(active ? "off" : mode)}
                className="py-1.5 rounded text-[10px] transition-all"
                style={{
                  background: active ? `${color}18` : "#0e1117",
                  border: `1px solid ${active ? `${color}55` : "#1a1d24"}`,
                  color: active ? color : "#4a6070",
                }}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: "Clear", fn: store.clearMask,    title: "Unlock all vertices" },
            { label: "Fill",  fn: store.fillMask,     title: "Lock all vertices" },
            { label: "Invert",fn: store.invertMask,   title: "Invert mask weights" },
            { label: "Reset", fn: store.clearAllMask, title: "Reset all weights to 1" },
          ].map(({ label, fn, title }) => (
            <button key={label} onClick={fn} title={title}
              className="py-1 rounded text-[9px] transition-all"
              style={{ background: "#0e1117", border: "1px solid #1a1d24", color: "#4a6070" }}>
              {label}
            </button>
          ))}
        </div>

        <div className={DIV} />

        {/* ── Sculpt Layers ──────────────────────────────────────────────── */}
        <span className={HDR} style={{ color: "#2a4050" }}>Sculpt Layers</span>
        <p className="text-[9px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
          Each layer stores a named mesh state. Toggle visibility to compare. Active layer receives all strokes.
        </p>
        <div className="flex flex-col gap-0.5 mb-2">
          {store.layers.map((layer, idx) => {
            const isActive = idx === store.activeLayerIdx;
            const isEditing = editingLayerIdx === idx;
            return (
              <div key={layer.id}
                onClick={() => store.setActiveLayerIdx(idx)}
                className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-all"
                style={{
                  background: isActive ? "rgba(0,229,255,0.08)" : "transparent",
                  border: `1px solid ${isActive ? "rgba(0,229,255,0.2)" : "transparent"}`,
                }}>
                {/* Visibility */}
                <button onClick={e => { e.stopPropagation(); store.setLayerVisible(idx, !layer.visible); }}
                  className="shrink-0" title={layer.visible ? "Hide layer" : "Show layer"}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    {layer.visible
                      ? <><circle cx="6" cy="6" r="2.5" stroke="#00e5ff" strokeWidth="1.2"/><path d="M1 6 Q6 1 11 6 Q6 11 1 6Z" stroke="#00e5ff" strokeWidth="1" fill="none"/></>
                      : <><path d="M1 1 L11 11" stroke="#4a6070" strokeWidth="1.2" strokeLinecap="round"/><path d="M1 6 Q6 1 11 6 Q6 11 1 6Z" stroke="#4a6070" strokeWidth="1" fill="none"/></>
                    }
                  </svg>
                </button>

                {/* Name / edit */}
                {isEditing ? (
                  <input
                    autoFocus
                    value={editingLayerName}
                    onChange={e => setEditingLayerName(e.target.value)}
                    onBlur={() => { store.renameLayer(idx, editingLayerName || layer.name); setEditingLayerIdx(null); }}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") { store.renameLayer(idx, editingLayerName || layer.name); setEditingLayerIdx(null); } }}
                    className="flex-1 bg-transparent text-[10px] outline-none px-0.5 rounded"
                    style={{ color: "#00e5ff", border: "1px solid rgba(0,229,255,0.3)" }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="flex-1 text-[10px] truncate select-none"
                    style={{ color: isActive ? "#00e5ff" : "#4a6070" }}
                    onDoubleClick={e => { e.stopPropagation(); setEditingLayerIdx(idx); setEditingLayerName(layer.name); }}
                    title="Double-click to rename"
                  >
                    {layer.name}
                    {isActive && <span className="ml-1 text-[8px] opacity-50">●</span>}
                  </span>
                )}

                {/* Opacity mini-slider */}
                <input type="range" min={0} max={1} step={0.05}
                  value={layer.opacity}
                  onChange={e => { e.stopPropagation(); store.setLayerOpacity(idx, +e.target.value); }}
                  onClick={e => e.stopPropagation()}
                  className="w-10 h-1 appearance-none rounded"
                  style={{ accentColor: "#00e5ff" }}
                  title={`Opacity ${(layer.opacity * 100).toFixed(0)}%`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-1 mb-1">
          <button onClick={store.addLayer}
            className="flex-1 py-1 rounded text-[10px] transition-all"
            style={{ background: "#0e1117", border: "1px solid #1a1d24", color: "#4a6070" }}>
            + Add Layer
          </button>
          {store.activeLayerIdx > 0 && (
            <button onClick={() => store.mergeLayerDown(store.activeLayerIdx)}
              className="flex-1 py-1 rounded text-[10px] transition-all"
              style={{ background: "#0e1117", border: "1px solid #1a1d24", color: "#4a6070" }}>
              Merge ↓
            </button>
          )}
          {store.layers.length > 1 && (
            <button onClick={() => store.deleteLayer(store.activeLayerIdx)}
              className="py-1 px-2 rounded text-[10px] transition-all"
              style={{ background: "#0e1117", border: "1px solid #1a1d24", color: "#5a3040" }}>
              ✕
            </button>
          )}
        </div>

        <div className={DIV} />

        {/* ── Constraints & Stability ─────────────────────────────────────── */}
        <span className={HDR} style={{ color: "#2a4050" }}>Constraints & Stability</span>
        <div className="flex flex-col gap-2 mb-2">
          <Toggle label="Displacement Limit" value={store.constraintsEnabled} onChange={store.setConstraintsEnabled} />
          {store.constraintsEnabled && (
            <Row label="Max Disp" value={store.maxDisplacement} min={0.05} max={5} step={0.05}
              onChange={store.setMaxDisplacement} />
          )}

          <div className={`${DIV} my-2`} />

          <Toggle label="Auto-Smooth Stroke" value={store.autoSmooth} onChange={store.setAutoSmooth} />
          {store.autoSmooth && (
            <Row label="Strength" value={store.autoSmoothStrength} min={0.05} max={1} step={0.05}
              unit="%" onChange={store.setAutoSmoothStrength} />
          )}
        </div>

        <div className={DIV} />

        {/* ── Lattice Deformation ─────────────────────────────────────────── */}
        <LatticeSection />

        <div className={DIV} />

        {/* ── Shortcuts ──────────────────────────────────────────────────── */}
        <div className="rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
          <p className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: "#2a3a48" }}>Keyboard Shortcuts</p>
          {[
            ["LMB drag",      "Apply brush stroke"],
            ["Scroll",        "Adjust brush radius"],
            ["Shift+Scroll",  "Adjust strength"],
            ["Ctrl+Z",        "Undo stroke"],
            ["Ctrl+Y / ⇧Z",   "Redo stroke"],
            ["G/S/I/D/F/R",   "Tool shortcuts"],
            ["B",             "Toggle sculpt mode"],
          ].map(([k, d]) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="font-mono text-[9px]" style={{ color: "#3a6070" }}>{k}</span>
              <span className="text-[9px]" style={{ color: "#2a3a48" }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
