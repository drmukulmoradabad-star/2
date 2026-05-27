/**
 * ArchPanel v2 — comprehensive jaw & dental arch editing UI.
 *
 * Sections:
 *  1. Arch analysis & stats
 *  2. Interactive arch curve (control point overlay)
 *  3. Arch form presets (ovoid, tapered, square, narrow, broadU)
 *  4. Region isolation (anterior / posterior / left / right)
 *  5. Arch expansion / contraction (uniform + parabolic)
 *  6. Width adjustment (symmetric + asymmetric left/right)
 *  7. Alveolar ridge & gingiva reshaping
 *  8. Tilt, torque, translation, occlusal leveling
 *  9. Tooth integrity & constraints
 * 10. Undo / redo
 */

import { useState, useCallback } from "react";
import { useViewerStore } from "@/store/viewerStore";
import { useArchEditStore, makeControlPointId } from "./archEditStore";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import {
  analyzeArch,
  expandArch,
  adjustArchWidth,
  tiltArch,
  translateArch,
  reshapeAlveolarRidge,
  expandArchParabolic,
  levelArch,
  applyAsymmetricWidth,
  applyArchFormPreset,
  applyRegionIsolation,
  type ArchAnalysis,
  type ArchRegion as EditorRegion,
} from "./ArchEditor";
import { ARCH_PRESETS, generatePresetControlPoints } from "./ArchFormPresets";
import type { ArchPreset, ArchRegion, ArchEditTool } from "./archEditStore";
import * as THREE from "three";

// ─── UI primitives ────────────────────────────────────────────────────────────

const HDR = "text-[9px] uppercase tracking-[0.15em] font-semibold mb-1.5 mt-3 block";
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
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] shrink-0 w-[64px]" style={{ color: "#4a6070" }}>{label}</span>
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

function Stat({ label, value, unit = "" }: { label: string; value: number | string; unit?: string }) {
  return (
    <div className="flex justify-between py-0.5" style={{ borderBottom: "1px solid #0e1117" }}>
      <span className="text-[10px]" style={{ color: "#3a5060" }}>{label}</span>
      <span className="font-mono text-[10px]" style={{ color: "#7fa8c0" }}>
        {typeof value === "number" ? value.toFixed(2) : value}{unit && ` ${unit}`}
      </span>
    </div>
  );
}

function ApplyBtn({
  label, onClick, disabled = false, accent = false,
}: {
  label: string; onClick: () => void; disabled?: boolean; accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full mt-1.5 py-1.5 rounded text-[10px] transition-all disabled:opacity-30"
      style={{
        background: accent ? "rgba(0,229,255,0.1)" : "#0e1117",
        border: `1px solid ${accent ? "rgba(0,229,255,0.3)" : "#1e2530"}`,
        color: accent ? "#00e5ff" : "#7fa8c0",
      }}
    >
      {label}
    </button>
  );
}

// ─── Preset swatch ────────────────────────────────────────────────────────────

function PresetSwatch({ id, active, onClick }: { id: ArchPreset; active: boolean; onClick: () => void }) {
  const p = ARCH_PRESETS[id];
  const W = 52, H = 28;

  // Build left and right halves of arch silhouette
  const leftPts = p.profile.map(([t, w]) => {
    const x = (W / 2) * (1 - w);
    const y = H * (1 - t * 0.7);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const rightPts = [...p.profile].reverse().map(([t, w]) => {
    const x = (W / 2) + (W / 2) * w;
    const y = H * (1 - t * 0.7);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const allPts = [...leftPts, ...rightPts].join(" ");

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 py-1.5 px-1 rounded transition-all"
      style={{
        background: active ? `${p.color}18` : "#0e1117",
        border: `1px solid ${active ? p.color + "55" : "#1a1d24"}`,
      }}
    >
      <svg width={W} height={H}>
        <polyline
          points={allPts}
          fill="none"
          stroke={p.color}
          strokeWidth={active ? "1.8" : "1.2"}
          opacity={active ? 0.9 : 0.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[8px] uppercase tracking-wide"
        style={{ color: active ? p.color : "#3a5060" }}>
        {p.label}
      </span>
    </button>
  );
}

// ─── Region selector ──────────────────────────────────────────────────────────

const REGIONS: { id: ArchRegion; label: string }[] = [
  { id: "all",      label: "All"   },
  { id: "anterior", label: "Ant."  },
  { id: "posterior",label: "Post." },
  { id: "left",     label: "Left"  },
  { id: "right",    label: "Right" },
];

// ─── Arch tool tabs ───────────────────────────────────────────────────────────

const ARCH_TOOLS: { id: ArchEditTool; label: string; desc: string }[] = [
  { id: "curve",  label: "Curve",  desc: "Interactive arch curve with draggable control points" },
  { id: "width",  label: "Width",  desc: "Lateral arch width — symmetric or asymmetric" },
  { id: "expand", label: "Expand", desc: "Arch expansion/contraction from centroid" },
  { id: "ridge",  label: "Ridge",  desc: "Alveolar ridge & gingival contouring" },
  { id: "torque", label: "Torque", desc: "Arch tilt, torque, and translation" },
  { id: "level",  label: "Level",  desc: "Occlusal plane leveling" },
];

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function ArchPanel() {
  const { geometry } = useViewerStore();
  const { toast } = useToast();
  const store = useArchEditStore();

  const [analysis, setAnalysis] = useState<ArchAnalysis | null>(null);

  // Expansion
  const [expandFactor, setExpandFactor] = useState(1.0);
  const [expandAxis, setExpandAxis] = useState<"uniform" | "x" | "z">("uniform");

  // Width
  const [widthFactor, setWidthFactor] = useState(1.0);

  // Tilt / translate
  const [tiltAngle, setTiltAngle] = useState(0);
  const [tiltAxis, setTiltAxis] = useState<"x" | "z">("x");
  const [transX, setTransX] = useState(0);
  const [transY, setTransY] = useState(0);
  const [transZ, setTransZ] = useState(0);

  // Ridge
  const [ridgeHeight, setRidgeHeight] = useState(0);
  const [ridgeWidth, setRidgeWidth] = useState(5);

  // Parabolic
  const [parabolicMm, setParabolicMm] = useState(0);
  const [anteriorWeight, setAnteriorWeight] = useState(0.5);

  // Level
  const [levelFactor, setLevelFactor] = useState(0.5);

  const hasGeo = !!geometry;
  const { activeArchTool, setActiveArchTool } = store;

  // ── Run helper: snapshot → apply → toast ─────────────────────────────────
  const run = useCallback((label: string, fn: () => void) => {
    if (!geometry) { toast({ title: "No scan loaded", variant: "destructive" }); return; }
    const pos = geometry.attributes.position.array as Float32Array;
    store.pushUndo(pos.slice());
    fn();
    store.incOpCount();
    toast({ title: label, description: "Applied to current scan" });
  }, [geometry, store, toast]);

  // ── Analyze arch ─────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(() => {
    if (!geometry) return;
    const a = analyzeArch(geometry);
    setAnalysis(a);
    store.setArchAnalysis(a.archWidth, a.archDepth, a.archHeight, a.centroid);
    toast({ title: "Arch analyzed" });
  }, [geometry, store, toast]);

  // ── Initialize arch curve control points ─────────────────────────────────
  const handleInitCurve = useCallback(() => {
    if (!geometry) return;
    const a = analyzeArch(geometry);
    setAnalysis(a);
    store.setArchAnalysis(a.archWidth, a.archDepth, a.archHeight, a.centroid);

    const positions = generatePresetControlPoints(
      "ovoid",
      a.centroid,
      a.archWidth / 2,
      a.archDepth / 2,
      a.centroid.y,
      9
    );

    const cps = positions.map((pos) => ({
      id: makeControlPointId(),
      position: pos.clone(),
      restPosition: pos.clone(),
      influenceRadius: a.archWidth * 0.15,
    }));

    store.setControlPoints(cps);
    store.setShowCurve(true);
    toast({ title: "Arch curve initialized", description: "Drag cyan spheres in 3D viewport (Sculpt mode)" });
  }, [geometry, store, toast]);

  // ── Apply arch form preset ────────────────────────────────────────────────
  const handleApplyPreset = useCallback((preset: ArchPreset) => {
    if (!geometry) return;
    run(`${ARCH_PRESETS[preset].label} arch form applied`, () => {
      applyArchFormPreset(geometry, preset);
    });
    store.setActivePreset(preset);
  }, [geometry, run, store]);

  // ── Undo / redo ───────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (!geometry) return;
    const snap = store.undo();
    if (snap) {
      (geometry.attributes.position.array as Float32Array).set(snap);
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      toast({ title: "Arch undo" });
    }
  }, [geometry, store, toast]);

  const handleRedo = useCallback(() => {
    if (!geometry) return;
    const current = (geometry.attributes.position.array as Float32Array).slice();
    const snap = store.redo(current);
    if (snap) {
      (geometry.attributes.position.array as Float32Array).set(snap);
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      toast({ title: "Arch redo" });
    }
  }, [geometry, store, toast]);

  return (
    <div className="flex flex-col h-full text-[11px] overflow-y-auto" style={{ color: "#c8d8e8" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 shrink-0 flex items-center justify-between"
        style={{ borderBottom: "1px solid #1e2530", background: "#0a0c10" }}>
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Jaw & Arch</p>
          {store.opCount > 0 && (
            <p className="text-[9px] mt-0.5" style={{ color: "#3a8060" }}>
              {store.opCount} op{store.opCount !== 1 ? "s" : ""}
              {store.undoStack.length > 0 && (
                <span style={{ color: "#2a5040" }}> · {store.undoStack.length} undo</span>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={handleUndo} disabled={store.undoStack.length === 0}
            title="Undo"
            className="px-2 py-0.5 rounded text-[10px] disabled:opacity-30 transition-all"
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}>↩</button>
          <button onClick={handleRedo} disabled={store.redoStack.length === 0}
            title="Redo"
            className="px-2 py-0.5 rounded text-[10px] disabled:opacity-30 transition-all"
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}>↪</button>
          <button onClick={handleAnalyze} disabled={!hasGeo}
            className="px-2 py-0.5 rounded text-[10px] disabled:opacity-30 transition-all"
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}>
            Analyze
          </button>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-0">

        {/* ── Analysis stats ─────────────────────────────────────────────── */}
        {analysis && (
          <>
            <span className={HDR} style={{ color: "#2a4050" }}>Arch Dimensions</span>
            <div className="rounded p-2 mb-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
              <Stat label="Width"    value={analysis.archWidth}  unit="u" />
              <Stat label="Depth"    value={analysis.archDepth}  unit="u" />
              <Stat label="Height"   value={analysis.archHeight} unit="u" />
              <Stat label="Vertices" value={analysis.vertCount}  />
            </div>
            <div className={DIV} />
          </>
        )}

        {/* ── Tool tabs ──────────────────────────────────────────────────── */}
        <span className={HDR} style={{ color: "#2a4050" }}>Editing Mode</span>
        <div className="grid grid-cols-3 gap-1 mb-2">
          {ARCH_TOOLS.map((t) => {
            const isActive = activeArchTool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveArchTool(t.id)}
                title={t.desc}
                className="py-1.5 rounded text-[9px] uppercase tracking-wide transition-all"
                style={{
                  background: isActive ? "rgba(0,229,255,0.1)" : "#0e1117",
                  border: `1px solid ${isActive ? "rgba(0,229,255,0.35)" : "#1a1d24"}`,
                  color: isActive ? "#00e5ff" : "#4a6070",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Region isolation ───────────────────────────────────────────── */}
        <span className={HDR} style={{ color: "#2a4050" }}>Region</span>
        <div className="flex gap-1 mb-2">
          {REGIONS.map(({ id, label }) => {
            const active = store.activeRegion === id;
            return (
              <button key={id} onClick={() => store.setActiveRegion(id)}
                className="flex-1 py-1 rounded text-[8px] uppercase transition-all"
                style={{
                  background: active ? "rgba(0,229,255,0.1)" : "#0e1117",
                  border: `1px solid ${active ? "rgba(0,229,255,0.3)" : "#1a1d24"}`,
                  color: active ? "#00e5ff" : "#4a6070",
                }}>
                {label}
              </button>
            );
          })}
        </div>

        <div className={DIV} />

        {/* ── CURVE TOOL ─────────────────────────────────────────────────── */}
        {activeArchTool === "curve" && (
          <>
            <span className={HDR} style={{ color: "#2a4050" }}>Interactive Arch Curve</span>
            <p className="text-[9px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
              Initializes draggable control points overlaid on the 3D arch.
              Activate Sculpt mode, then drag the glowing spheres to reshape the arch in real time.
            </p>

            <div className="flex gap-1 mb-2">
              <button
                onClick={handleInitCurve}
                disabled={!hasGeo}
                className="flex-1 py-1.5 rounded text-[10px] transition-all disabled:opacity-30"
                style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.3)", color: "#00e5ff" }}
              >
                {store.controlPoints.length > 0 ? "Reinitialize Curve" : "Initialize Arch Curve"}
              </button>
              {store.controlPoints.length > 0 && (
                <button
                  onClick={store.resetControlPoints}
                  className="px-2 py-1.5 rounded text-[10px] transition-all"
                  style={{ background: "#0e1117", border: "1px solid #1e2530", color: "#5a7080" }}
                >
                  Reset
                </button>
              )}
            </div>

            {store.controlPoints.length > 0 && (
              <div className="mb-2">
                <Toggle label="Show arch curve" value={store.showCurve} onChange={store.setShowCurve} />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Row label="CP Influence" value={store.deformFalloff} min={0.1} max={5} step={0.05}
                onChange={store.setDeformFalloff} />
              <Row label="Strength" value={store.deformStrength} min={0.01} max={1} step={0.01} unit="%"
                onChange={store.setDeformStrength} />
            </div>

            <div className="mt-2 mb-1">
              <Toggle label="Mirror symmetry (X)" value={store.symmetryEnabled} onChange={store.setSymmetryEnabled} />
            </div>

            {store.controlPoints.length > 0 && store.selectedPointId && (
              <div className="mt-1 px-2 py-1.5 rounded text-[9px]"
                style={{ background: "rgba(255,153,64,0.06)", border: "1px solid rgba(255,153,64,0.2)", color: "#ff9940" }}>
                CP selected — drag in viewport to deform
              </div>
            )}

            <div className={DIV} />

            {/* Arch form presets */}
            <span className={HDR} style={{ color: "#2a4050" }}>Arch Form Presets</span>
            <p className="text-[9px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
              Apply a standard dental arch form to the geometry.
            </p>
            <div className="grid grid-cols-3 gap-1 mb-1">
              {(Object.keys(ARCH_PRESETS) as ArchPreset[]).map((pid) => (
                <PresetSwatch
                  key={pid}
                  id={pid}
                  active={store.activePreset === pid}
                  onClick={() => handleApplyPreset(pid)}
                />
              ))}
            </div>
            {store.activePreset && (
              <p className="text-[9px] leading-relaxed mt-0.5" style={{ color: "#2a4050" }}>
                {ARCH_PRESETS[store.activePreset].description}
              </p>
            )}
          </>
        )}

        {/* ── WIDTH TOOL ─────────────────────────────────────────────────── */}
        {activeArchTool === "width" && (
          <>
            <span className={HDR} style={{ color: "#2a4050" }}>Symmetric Width</span>
            <Row label="Width ×" value={widthFactor} min={0.5} max={2.0} step={0.01} onChange={setWidthFactor} />
            <ApplyBtn accent label="Apply Width"
              disabled={!hasGeo}
              onClick={() => run("Arch width adjusted", () => adjustArchWidth(geometry!, widthFactor))} />

            <div className={DIV} />

            <span className={HDR} style={{ color: "#2a4050" }}>Asymmetric Width</span>
            <p className="text-[9px] mb-2" style={{ color: "#2a3a48" }}>
              Adjust left and right quadrants independently.
            </p>
            <div className="flex flex-col gap-2">
              <Row label="Left ×" value={store.leftWidthFactor} min={0.5} max={2.0} step={0.01}
                onChange={store.setLeftWidthFactor} />
              <Row label="Right ×" value={store.rightWidthFactor} min={0.5} max={2.0} step={0.01}
                onChange={store.setRightWidthFactor} />
            </div>
            <ApplyBtn label="Apply Asymmetric"
              disabled={!hasGeo}
              onClick={() => run("Asymmetric width applied", () =>
                applyAsymmetricWidth(geometry!, store.leftWidthFactor, store.rightWidthFactor)
              )} />

            <div className={DIV} />

            <span className={HDR} style={{ color: "#2a4050" }}>Palatal Expansion</span>
            <p className="text-[9px] mb-2" style={{ color: "#2a3a48" }}>
              Parabolic lateral expansion — simulates palate expander.
            </p>
            <div className="flex flex-col gap-2">
              <Row label="Amount" value={parabolicMm} min={-5} max={10} step={0.1} unit="u"
                onChange={setParabolicMm} />
              <Row label="Ant. Bias" value={anteriorWeight} min={0} max={1} step={0.05}
                onChange={setAnteriorWeight} />
            </div>
            <ApplyBtn label="Apply Palatal Expansion"
              disabled={!hasGeo}
              onClick={() => run("Palatal expansion applied", () =>
                expandArchParabolic(geometry!, parabolicMm, anteriorWeight)
              )} />
          </>
        )}

        {/* ── EXPAND TOOL ────────────────────────────────────────────────── */}
        {activeArchTool === "expand" && (
          <>
            <span className={HDR} style={{ color: "#2a4050" }}>Arch Expansion / Contraction</span>
            <p className="text-[9px] mb-2" style={{ color: "#2a3a48" }}>
              Scale arch from its centroid. Factor 1.0 = no change.
            </p>
            <Row label="Factor ×" value={expandFactor} min={0.5} max={2.0} step={0.01} onChange={setExpandFactor} />
            <div className="flex gap-1 my-1.5">
              {(["uniform", "x", "z"] as const).map((ax) => (
                <button
                  key={ax}
                  onClick={() => setExpandAxis(ax)}
                  className="flex-1 py-1 rounded text-[9px] uppercase transition-all"
                  style={{
                    background: expandAxis === ax ? "rgba(0,229,255,0.1)" : "#13161d",
                    border: `1px solid ${expandAxis === ax ? "rgba(0,229,255,0.3)" : "#1e2530"}`,
                    color: expandAxis === ax ? "#00e5ff" : "#4a6070",
                  }}
                >
                  {ax === "uniform" ? "All" : ax === "x" ? "Lat." : "A-P"}
                </button>
              ))}
            </div>
            <ApplyBtn accent label="Apply Expansion"
              disabled={!hasGeo}
              onClick={() => run("Arch expansion applied", () =>
                expandArch(geometry!, expandFactor, expandAxis)
              )} />

            <div className={DIV} />

            <span className={HDR} style={{ color: "#2a4050" }}>Region Expansion</span>
            <p className="text-[9px] mb-2" style={{ color: "#2a3a48" }}>
              Apply expansion to selected region only.
            </p>
            <ApplyBtn label={`Expand — ${store.activeRegion}`}
              disabled={!hasGeo || store.activeRegion === "all"}
              onClick={() => run(`Region expansion: ${store.activeRegion}`, () =>
                applyRegionIsolation(geometry!, store.activeRegion as EditorRegion, expandFactor)
              )} />
          </>
        )}

        {/* ── RIDGE TOOL ─────────────────────────────────────────────────── */}
        {activeArchTool === "ridge" && (
          <>
            <span className={HDR} style={{ color: "#2a4050" }}>Alveolar Ridge</span>
            <p className="text-[9px] mb-2" style={{ color: "#2a3a48" }}>
              Reshape the gingival ridge height and profile.
            </p>
            <div className="flex flex-col gap-2">
              <Row label="Height Δ" value={ridgeHeight} min={-3} max={3} step={0.05} unit="u"
                onChange={setRidgeHeight} />
              <Row label="Width" value={ridgeWidth} min={0.5} max={20} step={0.25} unit="u"
                onChange={setRidgeWidth} />
            </div>
            <ApplyBtn accent label="Apply Ridge Shape"
              disabled={!hasGeo}
              onClick={() => run("Ridge reshaped", () =>
                reshapeAlveolarRidge(geometry!, ridgeHeight, ridgeWidth)
              )} />

            <div className={DIV} />

            <span className={HDR} style={{ color: "#2a4050" }}>Gingiva Mode</span>
            <Toggle
              label="Restrict sculpt to gingival surface"
              value={store.gingivaOnlyMode}
              onChange={store.setGingivaOnlyMode}
            />
            <p className="text-[9px] mt-1 leading-relaxed" style={{ color: "#2a3a48" }}>
              When active, sculpt brush influence is biased toward the upper gingival region.
            </p>
          </>
        )}

        {/* ── TORQUE TOOL ────────────────────────────────────────────────── */}
        {activeArchTool === "torque" && (
          <>
            <span className={HDR} style={{ color: "#2a4050" }}>Arch Tilt</span>
            <Row label="Angle" value={tiltAngle} min={-20} max={20} step={0.5} unit="°"
              onChange={setTiltAngle} />
            <div className="flex gap-1 my-1.5">
              {(["x", "z"] as const).map((ax) => (
                <button key={ax} onClick={() => setTiltAxis(ax)}
                  className="flex-1 py-1 rounded text-[9px] transition-all"
                  style={{
                    background: tiltAxis === ax ? "rgba(0,229,255,0.1)" : "#13161d",
                    border: `1px solid ${tiltAxis === ax ? "rgba(0,229,255,0.3)" : "#1e2530"}`,
                    color: tiltAxis === ax ? "#00e5ff" : "#4a6070",
                  }}>
                  {ax === "x" ? "Fwd / Back" : "Left / Right"}
                </button>
              ))}
            </div>
            <ApplyBtn accent label="Apply Tilt"
              disabled={!hasGeo}
              onClick={() => run("Arch tilt applied", () => tiltArch(geometry!, tiltAngle, tiltAxis))} />

            <div className={DIV} />

            <span className={HDR} style={{ color: "#2a4050" }}>Translate Arch</span>
            <div className="flex flex-col gap-1.5 mb-1">
              <Row label="X (lat.)"  value={transX} min={-5} max={5} step={0.05} unit="u" onChange={setTransX} />
              <Row label="Y (vert.)" value={transY} min={-5} max={5} step={0.05} unit="u" onChange={setTransY} />
              <Row label="Z (A-P)"   value={transZ} min={-5} max={5} step={0.05} unit="u" onChange={setTransZ} />
            </div>
            <ApplyBtn label="Apply Translation"
              disabled={!hasGeo}
              onClick={() => run("Arch translated", () =>
                translateArch(geometry!, new THREE.Vector3(transX, transY, transZ))
              )} />
          </>
        )}

        {/* ── LEVEL TOOL ─────────────────────────────────────────────────── */}
        {activeArchTool === "level" && (
          <>
            <span className={HDR} style={{ color: "#2a4050" }}>Occlusal Leveling</span>
            <p className="text-[9px] mb-2" style={{ color: "#2a3a48" }}>
              Reduce vertical variation across the arch to create a flatter occlusal plane.
            </p>
            <Row label="Amount" value={levelFactor} min={0} max={1} step={0.02} unit="%"
              onChange={setLevelFactor} />
            <ApplyBtn accent label="Level Arch"
              disabled={!hasGeo}
              onClick={() => run("Arch leveled", () => levelArch(geometry!, levelFactor))} />
          </>
        )}

        <div className={DIV} />

        {/* ── Tooth integrity ────────────────────────────────────────────── */}
        <span className={HDR} style={{ color: "#2a4050" }}>Tooth Integrity</span>
        <div className="flex flex-col gap-2">
          <Toggle
            label="Lock tooth integrity"
            value={store.toothIntegrityLock}
            onChange={store.setToothIntegrityLock}
          />
        </div>
        <p className="text-[9px] mt-1 leading-relaxed" style={{ color: "#2a3a48" }}>
          Limits deformation magnitude to preserve tooth anatomy.
          Pair with displacement constraints in the Sculpt panel.
        </p>

        <div className={DIV} />

        {/* ── Shortcuts ─────────────────────────────────────────────────── */}
        <span className={HDR} style={{ color: "#2a4050" }}>Shortcuts</span>
        <div className="rounded p-2 text-[9px] leading-relaxed"
          style={{ background: "#0a0c10", border: "1px solid #1a1d24", color: "#2a4050" }}>
          <p>↩ / ↪ buttons — Arch undo / redo</p>
          <p className="mt-0.5">Drag cyan spheres — Deform arch (Sculpt mode)</p>
          <p className="mt-0.5">Click sphere — Select (shows influence ring)</p>
          <p className="mt-0.5">Analyze — Measure arch dimensions</p>
        </div>

      </div>
    </div>
  );
}
