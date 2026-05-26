import { useCallback } from "react";
import { useMeshEditStore } from "./meshEditStore";
import { useViewerStore } from "@/store/viewerStore";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import {
  smoothMesh,
  decimateMesh,
  fillHoles,
  repairMesh,
  sculptMesh,
  trimMesh,
  detectMarginLine,
  remeshUniform,
  computeMeshStats,
  type MeshStats,
} from "./MeshEditEngine";
import { useState } from "react";
import * as THREE from "three";

const SECTION = "mb-4";
const LABEL = "text-[10px] uppercase tracking-widest mb-2 block";
const BTN_BASE = "w-full text-[11px] px-3 py-1.5 rounded transition-all disabled:opacity-30";

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-8 h-4 rounded-full shrink-0 transition-all"
      style={{
        background: value ? "rgba(0,229,255,0.3)" : "#1a1d24",
        border: `1px solid ${value ? "rgba(0,229,255,0.5)" : "#2a3540"}`,
      }}
    >
      <span
        className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
        style={{ left: value ? "calc(100% - 14px)" : 2, background: value ? "#00e5ff" : "#3a5060" }}
      />
    </button>
  );
}

function ToolBtn({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-1 rounded text-[10px] transition-all capitalize"
      style={{
        background: active ? "rgba(0,229,255,0.15)" : "#13161d",
        border: `1px solid ${active ? "rgba(0,229,255,0.5)" : "#1e2530"}`,
        color: active ? "#00e5ff" : "#4a6070",
      }}
    >
      {children}
    </button>
  );
}

function StatRow({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
      <span style={{ color: "#3a5060" }}>{label}</span>
      <span style={{ color: warn ? "#ff9940" : "#7fa8c0" }}>{value}</span>
    </div>
  );
}

function StatusDot({ op }: { op: string }) {
  const status = useMeshEditStore((s) => s.statuses[op] ?? "idle");
  if (status === "idle") return null;
  const colors: Record<string, string> = {
    running: "#ffcc00", done: "#4dffb8", error: "#ff5252",
  };
  return (
    <span
      className="ml-2 text-[9px] px-1.5 py-0.5 rounded"
      style={{
        background: `${colors[status]}18`,
        color: colors[status],
        border: `1px solid ${colors[status]}44`,
      }}
    >
      {status === "running" ? "working…" : status}
    </span>
  );
}

export default function MeshEditPanel() {
  const {
    activeTool, setActiveTool,
    smoothIterations, smoothFactor, smoothPreserveBoundary,
    setSmoothIterations, setSmoothFactor, setSmoothPreserveBoundary,
    decimateRatio, decimatePreserveBoundary,
    setDecimateRatio, setDecimatePreserveBoundary,
    fillMaxEdges, fillSmooth,
    setFillMaxEdges, setFillSmooth, holesFilled, setHolesFilled,
    repairResult, setRepairResult,
    sculptRadius, sculptStrength, sculptFalloff,
    setSculptRadius, setSculptStrength, setSculptFalloff,
    trimAxis, trimPosition, trimKeepSide,
    setTrimAxis, setTrimPosition, setTrimKeepSide,
    remeshEdgeLength, setRemeshEdgeLength,
    marginCurvatureThreshold, setMarginCurvatureThreshold,
    marginPointCount, setMarginPointCount,
    showMarginLine, setShowMarginLine,
    setStatus,
    history, pushHistory, popHistory, clearHistory,
  } = useMeshEditStore();

  const { geometry, setGeometry } = useViewerStore();
  const { toast } = useToast();
  const [stats, setStats] = useState<MeshStats | null>(null);

  const withHistory = useCallback((label: string, fn: () => THREE.BufferGeometry | null) => {
    if (!geometry) {
      toast({ title: "No scan loaded", variant: "destructive" });
      return;
    }
    pushHistory(label, geometry);
    const result = fn();
    if (result) {
      setGeometry(result);
      setStats(computeMeshStats(result));
    }
  }, [geometry]);

  const runSmooth = useCallback(async () => {
    setStatus("smooth", "running");
    await delay();
    withHistory("Smooth", () => {
      const result = smoothMesh(geometry!, {
        iterations: smoothIterations,
        factor: smoothFactor,
        preserveBoundary: smoothPreserveBoundary,
      });
      toast({ title: "Mesh smoothed", description: `${smoothIterations} Laplacian iterations` });
      setStatus("smooth", "done");
      return result;
    });
  }, [geometry, smoothIterations, smoothFactor, smoothPreserveBoundary]);

  const runDecimate = useCallback(async () => {
    if (!geometry) return;
    setStatus("decimate", "running");
    await delay();
    withHistory("Decimate", () => {
      const before = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
      const result = decimateMesh(geometry!, {
        targetRatio: decimateRatio,
        preserveBoundary: decimatePreserveBoundary,
        qualityThreshold: 0.01,
      });
      const after = result.index ? result.index.count / 3 : result.attributes.position.count / 3;
      toast({ title: "Mesh decimated", description: `${fmt(before)} → ${fmt(after)} triangles` });
      setStatus("decimate", "done");
      return result;
    });
  }, [geometry, decimateRatio, decimatePreserveBoundary]);

  const runFillHoles = useCallback(async () => {
    if (!geometry) return;
    setStatus("fill_holes", "running");
    await delay();
    withHistory("Fill Holes", () => {
      const { geometry: result, holesFilled: n } = fillHoles(geometry!, {
        maxHoleEdges: fillMaxEdges,
        smooth: fillSmooth,
      });
      setHolesFilled(n);
      toast({ title: n > 0 ? `${n} hole${n !== 1 ? "s" : ""} filled` : "No holes found" });
      setStatus("fill_holes", "done");
      return result;
    });
  }, [geometry, fillMaxEdges, fillSmooth]);

  const runRepair = useCallback(async () => {
    if (!geometry) return;
    setStatus("repair", "running");
    await delay();
    withHistory("Repair", () => {
      const { geometry: result, degeneratesRemoved, duplicatesWelded, normalsFlipped } = repairMesh(geometry!);
      setRepairResult({ degeneratesRemoved, duplicatesWelded, normalsFlipped });
      toast({
        title: "Mesh repaired",
        description: `${degeneratesRemoved} degenerate, ${duplicatesWelded} welded, ${normalsFlipped} normals fixed`,
      });
      setStatus("repair", "done");
      return result;
    });
  }, [geometry]);

  const runTrim = useCallback(async () => {
    if (!geometry) return;
    setStatus("trim", "running");
    await delay();
    withHistory("Trim", () => {
      const axisVec = trimAxis === "x"
        ? new THREE.Vector3(1, 0, 0)
        : trimAxis === "y"
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
      const result = trimMesh(geometry!, {
        plane: { normal: axisVec, constant: -trimPosition },
        keepSide: trimKeepSide,
        cap: false,
      });
      toast({ title: "Mesh trimmed", description: `Cut along ${trimAxis.toUpperCase()}=${trimPosition.toFixed(2)}` });
      setStatus("trim", "done");
      return result;
    });
  }, [geometry, trimAxis, trimPosition, trimKeepSide]);

  const runRemesh = useCallback(async () => {
    if (!geometry) return;
    setStatus("remesh", "running");
    await delay();
    withHistory("Remesh", () => {
      const result = remeshUniform(geometry!, remeshEdgeLength);
      const tris = result.index ? result.index.count / 3 : 0;
      toast({ title: "Remesh complete", description: `${fmt(tris)} triangles at ${remeshEdgeLength}mm edge length` });
      setStatus("remesh", "done");
      return result;
    });
  }, [geometry, remeshEdgeLength]);

  const runMarginLine = useCallback(async () => {
    if (!geometry) return;
    setStatus("margin_line", "running");
    await delay();
    try {
      const points = detectMarginLine(geometry!, marginCurvatureThreshold);
      setMarginPointCount(points.length);
      setStatus("margin_line", "done");
      toast({ title: "Margin line detected", description: `${points.length} points` });
    } catch {
      setStatus("margin_line", "error");
    }
  }, [geometry, marginCurvatureThreshold]);

  const runComputeStats = useCallback(async () => {
    if (!geometry) return;
    setStatus("stats", "running");
    await delay();
    try {
      const s = computeMeshStats(geometry);
      setStats(s);
      setStatus("stats", "done");
    } catch {
      setStatus("stats", "error");
    }
  }, [geometry]);

  const runUndo = useCallback(() => {
    const prev = popHistory();
    if (prev) {
      setGeometry(prev);
      toast({ title: "Undo applied" });
    }
  }, [popHistory]);

  const hasGeo = !!geometry;

  return (
    <div className="flex flex-col h-full text-[11px] overflow-y-auto" style={{ color: "#c8d8e8" }}>
      {/* Header + Undo */}
      <div className="px-3 py-2 shrink-0 flex items-center justify-between" style={{ borderBottom: "1px solid #1e2530" }}>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Mesh Editing</p>
        <div className="flex gap-1">
          <button
            onClick={runUndo}
            disabled={history.length === 0}
            className="text-[10px] px-2 py-0.5 rounded transition-all disabled:opacity-30"
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
          >
            Undo ({history.length})
          </button>
          <button
            onClick={() => { clearHistory(); toast({ title: "History cleared" }); }}
            disabled={history.length === 0}
            className="text-[10px] px-2 py-0.5 rounded transition-all disabled:opacity-30"
            style={{ background: "transparent", border: "1px solid #1e2530", color: "#2a4050" }}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="p-3">

        {/* Mesh Stats */}
        <div className={SECTION}>
          <div className="flex items-center justify-between mb-2">
            <span className={LABEL} style={{ color: "#2a4050", margin: 0 }}>Mesh Analysis</span>
            <StatusDot op="stats" />
          </div>
          <button
            onClick={runComputeStats}
            disabled={!hasGeo}
            className={BTN_BASE}
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
          >
            Compute Stats
          </button>
          {stats && (
            <div className="mt-2 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1e2530" }}>
              <StatRow label="Vertices" value={fmt(stats.vertexCount)} />
              <StatRow label="Triangles" value={fmt(stats.triangleCount)} />
              <StatRow label="Open Boundaries" value={stats.openBoundaryEdges} warn={stats.openBoundaryEdges > 0} />
              <StatRow label="Non-Manifold" value={stats.nonManifoldEdges} warn={stats.nonManifoldEdges > 0} />
              <StatRow label="Degenerates" value={stats.degenerateTriangles} warn={stats.degenerateTriangles > 0} />
              <StatRow label="Surface Area" value={`${stats.surfaceAreaMm2} mm²`} />
              <StatRow
                label="Watertight"
                value={stats.isWatertight ? "✓ Yes" : "✗ No"}
                warn={!stats.isWatertight}
              />
              <div className="flex justify-between py-1">
                <span style={{ color: "#3a5060" }}>Bounds (mm)</span>
                <span style={{ color: "#7fa8c0" }} className="text-[9px]">
                  {stats.boundingBoxMm.x}×{stats.boundingBoxMm.y}×{stats.boundingBoxMm.z}
                </span>
              </div>
            </div>
          )}
        </div>

        <div style={{ height: 1, background: "#1a1d24", marginBottom: 16 }} />

        {/* Repair */}
        <div className={SECTION}>
          <div className="flex items-center gap-2 mb-2">
            <span className={LABEL} style={{ color: "#2a4050", margin: 0 }}>Auto Repair</span>
            <StatusDot op="repair" />
          </div>
          <p className="text-[10px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
            Weld duplicate vertices, remove degenerate triangles, and fix inverted normals.
          </p>
          <button
            onClick={runRepair}
            disabled={!hasGeo}
            className={BTN_BASE}
            style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.25)", color: "#00e5ff" }}
          >
            Run Mesh Repair
          </button>
          {repairResult && (
            <div className="mt-2 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1e2530" }}>
              <StatRow label="Degenerates Removed" value={repairResult.degeneratesRemoved} warn={repairResult.degeneratesRemoved > 0} />
              <StatRow label="Vertices Welded" value={repairResult.duplicatesWelded} />
              <StatRow label="Normals Flipped" value={repairResult.normalsFlipped} />
            </div>
          )}
        </div>

        <div style={{ height: 1, background: "#1a1d24", marginBottom: 16 }} />

        {/* Smooth */}
        <div className={SECTION}>
          <div className="flex items-center gap-2 mb-2">
            <span className={LABEL} style={{ color: "#2a4050", margin: 0 }}>Laplacian Smooth</span>
            <StatusDot op="smooth" />
          </div>
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Iterations</span>
              <div className="flex items-center gap-2">
                <Slider min={1} max={20} step={1} value={[smoothIterations]}
                  onValueChange={([v]) => setSmoothIterations(v)} className="w-20" />
                <span className="font-mono w-4" style={{ color: "#7fa8c0" }}>{smoothIterations}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Strength</span>
              <div className="flex items-center gap-2">
                <Slider min={0.05} max={1} step={0.05} value={[smoothFactor]}
                  onValueChange={([v]) => setSmoothFactor(v)} className="w-20" />
                <span className="font-mono w-8 text-right" style={{ color: "#7fa8c0" }}>{smoothFactor.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Preserve Boundary</span>
              <Toggle value={smoothPreserveBoundary} onChange={setSmoothPreserveBoundary} />
            </div>
          </div>
          <button
            onClick={runSmooth}
            disabled={!hasGeo}
            className={BTN_BASE}
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
          >
            Apply Smooth
          </button>
        </div>

        <div style={{ height: 1, background: "#1a1d24", marginBottom: 16 }} />

        {/* Decimate */}
        <div className={SECTION}>
          <div className="flex items-center gap-2 mb-2">
            <span className={LABEL} style={{ color: "#2a4050", margin: 0 }}>Decimation</span>
            <StatusDot op="decimate" />
          </div>
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Target Ratio</span>
              <div className="flex items-center gap-2">
                <Slider min={0.05} max={0.95} step={0.05} value={[decimateRatio]}
                  onValueChange={([v]) => setDecimateRatio(v)} className="w-20" />
                <span className="font-mono w-10 text-right" style={{ color: "#7fa8c0" }}>{(decimateRatio * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Preserve Boundary</span>
              <Toggle value={decimatePreserveBoundary} onChange={setDecimatePreserveBoundary} />
            </div>
          </div>
          <button
            onClick={runDecimate}
            disabled={!hasGeo}
            className={BTN_BASE}
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
          >
            Apply Decimation
          </button>
        </div>

        <div style={{ height: 1, background: "#1a1d24", marginBottom: 16 }} />

        {/* Fill Holes */}
        <div className={SECTION}>
          <div className="flex items-center gap-2 mb-2">
            <span className={LABEL} style={{ color: "#2a4050", margin: 0 }}>Fill Holes</span>
            <StatusDot op="fill_holes" />
          </div>
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Max Hole Size</span>
              <div className="flex items-center gap-2">
                <Slider min={3} max={500} step={1} value={[fillMaxEdges]}
                  onValueChange={([v]) => setFillMaxEdges(v)} className="w-20" />
                <span className="font-mono w-8 text-right" style={{ color: "#7fa8c0" }}>{fillMaxEdges}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Smooth Patch</span>
              <Toggle value={fillSmooth} onChange={setFillSmooth} />
            </div>
          </div>
          <button
            onClick={runFillHoles}
            disabled={!hasGeo}
            className={BTN_BASE}
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
          >
            Fill Holes
          </button>
          {holesFilled > 0 && (
            <p className="mt-1.5 text-[10px]" style={{ color: "#4dffb8" }}>
              {holesFilled} hole{holesFilled !== 1 ? "s" : ""} filled
            </p>
          )}
        </div>

        <div style={{ height: 1, background: "#1a1d24", marginBottom: 16 }} />

        {/* Trim */}
        <div className={SECTION}>
          <div className="flex items-center gap-2 mb-2">
            <span className={LABEL} style={{ color: "#2a4050", margin: 0 }}>Plane Trim</span>
            <StatusDot op="trim" />
          </div>
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex gap-1">
              {(["x", "y", "z"] as const).map((ax) => (
                <ToolBtn key={ax} active={trimAxis === ax} onClick={() => setTrimAxis(ax)}>
                  {ax.toUpperCase()}
                </ToolBtn>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Clip Position</span>
              <div className="flex items-center gap-2">
                <Slider min={-50} max={50} step={0.1} value={[trimPosition]}
                  onValueChange={([v]) => setTrimPosition(v)} className="w-20" />
                <span className="font-mono w-12 text-right" style={{ color: "#7fa8c0" }}>{trimPosition.toFixed(1)}</span>
              </div>
            </div>
            <div className="flex gap-1">
              <ToolBtn active={trimKeepSide === "positive"} onClick={() => setTrimKeepSide("positive")}>
                Keep +
              </ToolBtn>
              <ToolBtn active={trimKeepSide === "negative"} onClick={() => setTrimKeepSide("negative")}>
                Keep −
              </ToolBtn>
            </div>
          </div>
          <button
            onClick={runTrim}
            disabled={!hasGeo}
            className={BTN_BASE}
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
          >
            Apply Trim
          </button>
        </div>

        <div style={{ height: 1, background: "#1a1d24", marginBottom: 16 }} />

        {/* Remesh */}
        <div className={SECTION}>
          <div className="flex items-center gap-2 mb-2">
            <span className={LABEL} style={{ color: "#2a4050", margin: 0 }}>Uniform Remesh</span>
            <StatusDot op="remesh" />
          </div>
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Target Edge Length</span>
              <div className="flex items-center gap-2">
                <Slider min={0.1} max={3} step={0.1} value={[remeshEdgeLength]}
                  onValueChange={([v]) => setRemeshEdgeLength(v)} className="w-20" />
                <span className="font-mono w-12 text-right" style={{ color: "#7fa8c0" }}>{remeshEdgeLength.toFixed(1)} mm</span>
              </div>
            </div>
          </div>
          <button
            onClick={runRemesh}
            disabled={!hasGeo}
            className={BTN_BASE}
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
          >
            Apply Remesh
          </button>
        </div>

        <div style={{ height: 1, background: "#1a1d24", marginBottom: 16 }} />

        {/* Sculpt */}
        <div className={SECTION}>
          <div className="flex items-center gap-2 mb-2">
            <span className={LABEL} style={{ color: "#2a4050", margin: 0 }}>Sculpt Tools</span>
          </div>
          <p className="text-[10px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
            Click in the 3D viewport while a sculpt mode is active to deform the mesh at cursor.
          </p>
          <div className="flex flex-col gap-2 mb-3">
            <div className="grid grid-cols-2 gap-1">
              {(["push", "pull", "smooth", "flatten"] as const).map((mode) => {
                const toolKey = `sculpt_${mode}` as const;
                const active = activeTool === toolKey;
                return (
                  <ToolBtn
                    key={mode}
                    active={active}
                    onClick={() => setActiveTool(active ? "none" : toolKey)}
                  >
                    {mode}
                  </ToolBtn>
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Brush Radius</span>
              <div className="flex items-center gap-2">
                <Slider min={0.1} max={5} step={0.1} value={[sculptRadius]}
                  onValueChange={([v]) => setSculptRadius(v)} className="w-20" />
                <span className="font-mono w-10 text-right" style={{ color: "#7fa8c0" }}>{sculptRadius.toFixed(1)} mm</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Strength</span>
              <div className="flex items-center gap-2">
                <Slider min={0.01} max={1} step={0.01} value={[sculptStrength]}
                  onValueChange={([v]) => setSculptStrength(v)} className="w-20" />
                <span className="font-mono w-8 text-right" style={{ color: "#7fa8c0" }}>{sculptStrength.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px]" style={{ color: "#4a6070" }}>Falloff</span>
              <div className="flex gap-1">
                {(["linear", "smooth", "sharp"] as const).map((f) => (
                  <ToolBtn key={f} active={sculptFalloff === f} onClick={() => setSculptFalloff(f)}>
                    {f}
                  </ToolBtn>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: "#1a1d24", marginBottom: 16 }} />

        {/* Margin Line */}
        <div className={SECTION}>
          <div className="flex items-center gap-2 mb-2">
            <span className={LABEL} style={{ color: "#2a4050", margin: 0 }}>Margin Line</span>
            <StatusDot op="margin_line" />
          </div>
          <p className="text-[10px] mb-2 leading-relaxed" style={{ color: "#2a3a48" }}>
            Detects high-curvature boundaries — used for crown margin preparation.
          </p>
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Sensitivity</span>
              <div className="flex items-center gap-2">
                <Slider min={0.1} max={1.5} step={0.05} value={[marginCurvatureThreshold]}
                  onValueChange={([v]) => setMarginCurvatureThreshold(v)} className="w-20" />
                <span className="font-mono w-8 text-right" style={{ color: "#7fa8c0" }}>{marginCurvatureThreshold.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "#4a6070" }}>Show Overlay</span>
              <Toggle value={showMarginLine} onChange={setShowMarginLine} />
            </div>
          </div>
          <button
            onClick={runMarginLine}
            disabled={!hasGeo}
            className={BTN_BASE}
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
          >
            Detect Margin Line
          </button>
          {marginPointCount > 0 && (
            <p className="mt-1.5 text-[10px]" style={{ color: "#4dffb8" }}>
              {marginPointCount} margin points detected
            </p>
          )}
        </div>

      </div>
    </div>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function delay() {
  return new Promise((r) => setTimeout(r, 20));
}
