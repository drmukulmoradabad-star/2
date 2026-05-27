/**
 * ArchPanel — interactive jaw and dental arch editing controls.
 * Operations are applied in-place to the geometry in viewerStore.
 */

import { useState, useCallback } from "react";
import { useViewerStore } from "@/store/viewerStore";
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
  type ArchAnalysis,
} from "./ArchEditor";
import * as THREE from "three";

const SECTION_HDR = "text-[9px] uppercase tracking-[0.15em] font-semibold mb-2 mt-3 block";
const DIVIDER = "my-3 border-t border-[#1a1d24]";
const ROW = "flex items-center justify-between gap-2";

function StatRow({ label, value, unit = "" }: { label: string; value: number; unit?: string }) {
  return (
    <div className="flex justify-between py-0.5" style={{ borderBottom: "1px solid #0e1117" }}>
      <span className="text-[10px]" style={{ color: "#3a5060" }}>{label}</span>
      <span className="font-mono text-[10px]" style={{ color: "#7fa8c0" }}>
        {value.toFixed(2)}{unit && ` ${unit}`}
      </span>
    </div>
  );
}

function SliderRow({
  label, value, min, max, step, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className={ROW}>
      <span className="text-[10px] shrink-0 w-20" style={{ color: "#4a6070" }}>{label}</span>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <Slider
          min={min} max={max} step={step}
          value={[value]}
          onValueChange={([v]) => onChange(v)}
          className="w-20"
        />
        <span className="font-mono text-[10px] w-12 text-right" style={{ color: "#7fa8c0" }}>
          {value.toFixed(step < 0.1 ? 2 : 1)}{unit ? unit : ""}
        </span>
      </div>
    </div>
  );
}

export default function ArchPanel() {
  const { geometry } = useViewerStore();
  const { toast } = useToast();

  // Analysis
  const [analysis, setAnalysis] = useState<ArchAnalysis | null>(null);

  // Expansion
  const [expandFactor, setExpandFactor] = useState(1.0);
  const [expandAxis, setExpandAxis] = useState<"uniform" | "x" | "z">("uniform");

  // Width
  const [widthFactor, setWidthFactor] = useState(1.0);

  // Tilt
  const [tiltAngle, setTiltAngle] = useState(0);
  const [tiltAxis, setTiltAxis] = useState<"x" | "z">("x");

  // Translation
  const [transX, setTransX] = useState(0);
  const [transY, setTransY] = useState(0);
  const [transZ, setTransZ] = useState(0);

  // Ridge
  const [ridgeHeight, setRidgeHeight] = useState(0);
  const [ridgeWidth, setRidgeWidth] = useState(5);

  // Parabolic expansion
  const [parabolicMm, setParabolicMm] = useState(0);
  const [anteriorWeight, setAnteriorWeight] = useState(0.5);

  // Level
  const [levelFactor, setLevelFactor] = useState(0.5);

  const hasGeo = !!geometry;

  const run = useCallback((label: string, fn: () => void) => {
    if (!geometry) { toast({ title: "No scan loaded", variant: "destructive" }); return; }
    fn();
    toast({ title: label, description: "Applied to current scan" });
  }, [geometry]);

  return (
    <div className="flex flex-col h-full text-[11px] overflow-y-auto" style={{ color: "#c8d8e8" }}>
      {/* Header */}
      <div className="px-3 py-2 shrink-0 flex items-center justify-between" style={{ borderBottom: "1px solid #1e2530", background: "#0a0c10" }}>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Jaw & Arch Editing</p>
        <button
          onClick={() => {
            if (!geometry) return;
            const a = analyzeArch(geometry);
            setAnalysis(a);
            toast({ title: "Analysis complete" });
          }}
          disabled={!hasGeo}
          className="text-[10px] px-2 py-0.5 rounded disabled:opacity-30 transition-all"
          style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
        >
          Analyze
        </button>
      </div>

      <div className="p-3">
        {/* Arch Analysis */}
        {analysis && (
          <>
            <span className={SECTION_HDR} style={{ color: "#2a4050" }}>Arch Dimensions</span>
            <div className="rounded p-2 mb-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
              <StatRow label="Width" value={analysis.archWidth} unit="u" />
              <StatRow label="Depth" value={analysis.archDepth} unit="u" />
              <StatRow label="Height" value={analysis.archHeight} unit="u" />
              <StatRow label="Vertices" value={analysis.vertCount} />
            </div>
            <div className={DIVIDER} />
          </>
        )}

        {/* ── Arch Expansion ──────────────────────────────────────────── */}
        <span className={SECTION_HDR} style={{ color: "#2a4050" }}>Arch Expansion / Contraction</span>
        <p className="text-[9px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
          Scale arch outward or inward from its centroid. Factor 1.0 = no change.
        </p>

        <SliderRow label="Scale Factor" value={expandFactor} min={0.5} max={2.0} step={0.01} onChange={setExpandFactor} />

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
              {ax}
            </button>
          ))}
        </div>

        <button
          onClick={() => run("Arch expansion applied", () => expandArch(geometry!, expandFactor, expandAxis))}
          disabled={!hasGeo}
          className="w-full mt-1 py-1.5 rounded text-[10px] transition-all disabled:opacity-30"
          style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)", color: "#00e5ff" }}
        >
          Apply Expansion
        </button>

        <div className={DIVIDER} />

        {/* ── Width Adjustment ─────────────────────────────────────────── */}
        <span className={SECTION_HDR} style={{ color: "#2a4050" }}>Arch Width</span>
        <SliderRow label="Width Factor" value={widthFactor} min={0.5} max={2.0} step={0.01} onChange={setWidthFactor} />
        <button
          onClick={() => run("Arch width adjusted", () => adjustArchWidth(geometry!, widthFactor))}
          disabled={!hasGeo}
          className="w-full mt-2 py-1.5 rounded text-[10px] transition-all disabled:opacity-30"
          style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
        >
          Apply Width
        </button>

        <div className={DIVIDER} />

        {/* ── Parabolic Expansion ──────────────────────────────────────── */}
        <span className={SECTION_HDR} style={{ color: "#2a4050" }}>Palatal Expansion</span>
        <p className="text-[9px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
          Lateral expansion with anterior-posterior parabolic gradient. Simulates palate expander.
        </p>
        <SliderRow label="Expansion" value={parabolicMm} min={-5} max={10} step={0.1} unit="u" onChange={setParabolicMm} />
        <SliderRow label="Ant. Weight" value={anteriorWeight} min={0} max={1} step={0.05} onChange={setAnteriorWeight} />
        <button
          onClick={() => run("Parabolic expansion applied", () => expandArchParabolic(geometry!, parabolicMm, anteriorWeight))}
          disabled={!hasGeo}
          className="w-full mt-2 py-1.5 rounded text-[10px] transition-all disabled:opacity-30"
          style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
        >
          Apply Palatal Expansion
        </button>

        <div className={DIVIDER} />

        {/* ── Tilt ─────────────────────────────────────────────────────── */}
        <span className={SECTION_HDR} style={{ color: "#2a4050" }}>Arch Tilt</span>
        <SliderRow label="Angle" value={tiltAngle} min={-15} max={15} step={0.5} unit="°" onChange={setTiltAngle} />
        <div className="flex gap-1 my-1.5">
          {(["x", "z"] as const).map((ax) => (
            <button
              key={ax}
              onClick={() => setTiltAxis(ax)}
              className="flex-1 py-1 rounded text-[9px] uppercase transition-all"
              style={{
                background: tiltAxis === ax ? "rgba(0,229,255,0.1)" : "#13161d",
                border: `1px solid ${tiltAxis === ax ? "rgba(0,229,255,0.3)" : "#1e2530"}`,
                color: tiltAxis === ax ? "#00e5ff" : "#4a6070",
              }}
            >
              {ax === "x" ? "Fwd/Back" : "Left/Right"}
            </button>
          ))}
        </div>
        <button
          onClick={() => run("Arch tilt applied", () => tiltArch(geometry!, tiltAngle, tiltAxis))}
          disabled={!hasGeo}
          className="w-full py-1.5 rounded text-[10px] transition-all disabled:opacity-30"
          style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
        >
          Apply Tilt
        </button>

        <div className={DIVIDER} />

        {/* ── Translation ──────────────────────────────────────────────── */}
        <span className={SECTION_HDR} style={{ color: "#2a4050" }}>Translate Arch</span>
        <div className="flex flex-col gap-1.5 mb-2">
          <SliderRow label="X (lateral)" value={transX} min={-5} max={5} step={0.1} unit="u" onChange={setTransX} />
          <SliderRow label="Y (vertical)" value={transY} min={-5} max={5} step={0.1} unit="u" onChange={setTransY} />
          <SliderRow label="Z (A-P)" value={transZ} min={-5} max={5} step={0.1} unit="u" onChange={setTransZ} />
        </div>
        <button
          onClick={() => run("Arch translated", () => translateArch(geometry!, new THREE.Vector3(transX, transY, transZ)))}
          disabled={!hasGeo}
          className="w-full py-1.5 rounded text-[10px] transition-all disabled:opacity-30"
          style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
        >
          Apply Translation
        </button>

        <div className={DIVIDER} />

        {/* ── Alveolar Ridge ───────────────────────────────────────────── */}
        <span className={SECTION_HDR} style={{ color: "#2a4050" }}>Alveolar Ridge</span>
        <p className="text-[9px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
          Reshape the gingival ridge height profile.
        </p>
        <SliderRow label="Height Δ" value={ridgeHeight} min={-3} max={3} step={0.1} unit="u" onChange={setRidgeHeight} />
        <SliderRow label="Ridge Width" value={ridgeWidth} min={1} max={20} step={0.5} unit="u" onChange={setRidgeWidth} />
        <button
          onClick={() => run("Ridge reshaped", () => reshapeAlveolarRidge(geometry!, ridgeHeight, ridgeWidth))}
          disabled={!hasGeo}
          className="w-full mt-2 py-1.5 rounded text-[10px] transition-all disabled:opacity-30"
          style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
        >
          Apply Ridge Shape
        </button>

        <div className={DIVIDER} />

        {/* ── Occlusal Leveling ─────────────────────────────────────────── */}
        <span className={SECTION_HDR} style={{ color: "#2a4050" }}>Occlusal Leveling</span>
        <p className="text-[9px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
          Reduce vertical variation across the arch to create a flatter occlusal plane.
        </p>
        <SliderRow label="Level Amount" value={levelFactor} min={0} max={1} step={0.05} onChange={setLevelFactor} />
        <button
          onClick={() => run("Arch leveled", () => levelArch(geometry!, levelFactor))}
          disabled={!hasGeo}
          className="w-full mt-2 py-1.5 rounded text-[10px] transition-all disabled:opacity-30"
          style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
        >
          Level Arch
        </button>
      </div>
    </div>
  );
}
