import { useCallback, useState } from "react";
import { useViewerStore } from "@/store/viewerStore";
import { useSegmentationStore } from "@/modules/segmentation/segmentationStore";
import { useMovementStore } from "@/modules/movement/movementStore";
import { useAIStore } from "./aiStore";
import {
  predictCollisions,
  detectLandmarks,
  segmentGingiva,
  analyzeArchForm,
  runAIToothNumbering,
  predictTreatment,
  computeSmartAlignmentSuggestions,
  getMLModel,
} from "./AIEngine";
import { useToast } from "@/hooks/use-toast";
import type { ToothSegment } from "@/modules/segmentation/SegmentationEngine";

const BTN = "text-[11px] px-3 py-1.5 rounded transition-all disabled:opacity-30 w-full";
const SECTION = "mb-4";
const LABEL_CLASS = "text-[10px] uppercase tracking-widest mb-1.5 block";

type RiskLevel = "none" | "low" | "moderate" | "high";

function RiskBadge({ level }: { level: RiskLevel }) {
  const colors: Record<RiskLevel, string> = {
    none: "#00e5ff", low: "#4dffb8", moderate: "#ffcc00", high: "#ff5252",
  };
  return (
    <span
      className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded"
      style={{ background: `${colors[level]}18`, color: colors[level], border: `1px solid ${colors[level]}44` }}
    >
      {level}
    </span>
  );
}

function TaskRow({ label, status, onRun }: { label: string; status: string; onRun: () => void }) {
  const running = status === "running";
  const done = status === "done";
  return (
    <button
      onClick={onRun}
      disabled={running}
      className={BTN}
      style={{
        background: done ? "rgba(0,229,255,0.07)" : "#13161d",
        border: `1px solid ${done ? "rgba(0,229,255,0.25)" : "#1e2530"}`,
        color: done ? "#00e5ff" : "#7fa8c0",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}
    >
      <span>{label}</span>
      {running && <span className="text-[9px]" style={{ color: "#4a6070" }}>running…</span>}
      {done && <span className="text-[9px]" style={{ color: "#00e5ff" }}>✓</span>}
    </button>
  );
}

export default function AIPanel() {
  const { geometry } = useViewerStore();
  const { result: segResult } = useSegmentationStore();
  const { transforms, setCollidingPairs } = useMovementStore();
  const ai = useAIStore();
  const { toast } = useToast();

  const segments: ToothSegment[] = segResult?.segments ?? [];
  const hasGeometry = !!geometry;
  const hasSegments = segments.length > 0;

  const runCollision = useCallback(async () => {
    if (!hasSegments) return;
    ai.setCollisionStatus("running");
    await new Promise((r) => setTimeout(r, 20));
    try {
      const report = predictCollisions(segments, transforms, 0.1);
      ai.setCollisionReport(report);
      ai.setCollisionStatus("done");
      setCollidingPairs(report.pairs.map((p) => [p.idA, p.idB]));
      toast({ title: "Collision analysis complete", description: `${report.pairs.length} collision${report.pairs.length !== 1 ? "s" : ""} found` });
    } catch {
      ai.setCollisionStatus("error");
    }
  }, [segments, transforms]);

  const runLandmarks = useCallback(async () => {
    if (!hasSegments) return;
    ai.setLandmarkStatus("running");
    await new Promise((r) => setTimeout(r, 20));
    try {
      const lm = detectLandmarks(segments);
      ai.setLandmarks(lm);
      ai.setLandmarkStatus("done");
      toast({ title: "Landmarks detected", description: `${lm.length} landmarks found` });
    } catch {
      ai.setLandmarkStatus("error");
    }
  }, [segments]);

  const runGingiva = useCallback(async () => {
    if (!hasGeometry || !hasSegments) return;
    ai.setGingivaStatus("running");
    await new Promise((r) => setTimeout(r, 20));
    try {
      const g = segmentGingiva(geometry!, segments);
      ai.setGingivaSegmentation(g);
      ai.setGingivaStatus("done");
      toast({ title: "Gingiva segmented", description: `Surface area: ${g.area} mm²` });
    } catch {
      ai.setGingivaStatus("error");
    }
  }, [geometry, segments]);

  const runArchForm = useCallback(async () => {
    if (!hasSegments) return;
    ai.setArchFormStatus("running");
    await new Promise((r) => setTimeout(r, 20));
    try {
      const a = analyzeArchForm(segments);
      ai.setArchFormAnalysis(a);
      ai.setArchFormStatus("done");
      toast({ title: "Arch form analyzed", description: `Detected: ${a.detectedForm}` });
    } catch {
      ai.setArchFormStatus("error");
    }
  }, [segments]);

  const runNumbering = useCallback(async () => {
    if (!hasSegments) return;
    ai.setNumberingStatus("running");
    await new Promise((r) => setTimeout(r, 20));
    try {
      const r = runAIToothNumbering(segments, "unknown");
      ai.setToothNumbering(r);
      ai.setNumberingStatus("done");
      toast({ title: "Tooth numbering complete", description: `Confidence: ${(r.confidence * 100).toFixed(0)}%` });
    } catch {
      ai.setNumberingStatus("error");
    }
  }, [segments]);

  const runTreatmentPrediction = useCallback(async () => {
    if (!hasSegments) return;
    ai.setTreatmentStatus("running");
    await new Promise((r) => setTimeout(r, 20));
    try {
      const p = predictTreatment(segments, transforms);
      ai.setTreatmentPrediction(p);
      ai.setTreatmentStatus("done");
      toast({ title: "Treatment predicted", description: `~${p.estimatedStages} stages, ${p.predictedDurationWeeks} wks` });
    } catch {
      ai.setTreatmentStatus("error");
    }
  }, [segments, transforms]);

  const runAlignment = useCallback(async () => {
    if (!hasSegments) return;
    ai.setAlignmentStatus("running");
    await new Promise((r) => setTimeout(r, 20));
    try {
      const s = computeSmartAlignmentSuggestions(segments, transforms);
      ai.setAlignmentSuggestions(s);
      ai.setAlignmentStatus("done");
      toast({ title: "Alignment suggestions ready", description: `${s.length} suggestion${s.length !== 1 ? "s" : ""}` });
    } catch {
      ai.setAlignmentStatus("error");
    }
  }, [segments, transforms]);

  const needsSegments = !hasSegments;

  return (
    <div className="p-3 text-[11px]" style={{ color: "#c8d8e8" }}>

      {needsSegments && (
        <div
          className="mb-4 px-3 py-2 rounded text-[10px]"
          style={{ background: "rgba(255,204,0,0.06)", border: "1px solid rgba(255,204,0,0.2)", color: "#ffcc00" }}
        >
          Run segmentation first to enable AI tools
        </div>
      )}

      {/* ML Model Status */}
      <div className={SECTION}>
        <span className={LABEL_CLASS} style={{ color: "#2a4050" }}>Model Status</span>
        <div className="rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1e2530" }}>
          <div className="flex items-center justify-between">
            <span style={{ color: "#4a6070" }}>{getMLModel().name} v{getMLModel().version}</span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,204,0,0.1)", color: "#ffcc00", border: "1px solid rgba(255,204,0,0.25)" }}
            >
              Geometric Mode
            </span>
          </div>
          <p className="mt-1 text-[9px]" style={{ color: "#2a4050" }}>
            Running deterministic geometric algorithms. ML model adapter ready for plugin.
          </p>
        </div>
      </div>

      {/* COLLISION PREDICTION */}
      <div className={SECTION}>
        <span className={LABEL_CLASS} style={{ color: "#2a4050" }}>Collision Prediction</span>
        <TaskRow label="Analyze Collisions" status={ai.collisionStatus} onRun={runCollision} />
        {ai.collisionReport && (
          <div className="mt-2 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1e2530" }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: "#7fa8c0" }}>{ai.collisionReport.pairs.length} collision{ai.collisionReport.pairs.length !== 1 ? "s" : ""}</span>
              <RiskBadge level={ai.collisionReport.riskLevel} />
            </div>
            <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
              <span style={{ color: "#3a5060" }}>Total Penetration</span>
              <span style={{ color: "#7fa8c0" }}>{ai.collisionReport.totalPenetrationDepth} mm</span>
            </div>
            {ai.collisionReport.pairs.slice(0, 3).map((p, i) => (
              <div key={i} className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
                <span className="text-[10px]" style={{ color: "#4a6070" }}>
                  {p.labelA} ↔ {p.labelB}
                </span>
                <span className="text-[10px]" style={{ color: "#ff5252" }}>{p.penetrationDepth} mm</span>
              </div>
            ))}
            {ai.collisionReport.pairs.length > 3 && (
              <p className="text-[9px] mt-1" style={{ color: "#2a4050" }}>
                +{ai.collisionReport.pairs.length - 3} more
              </p>
            )}
          </div>
        )}
      </div>

      {/* LANDMARK DETECTION */}
      <div className={SECTION}>
        <span className={LABEL_CLASS} style={{ color: "#2a4050" }}>Landmark Detection</span>
        <TaskRow label="Detect Landmarks" status={ai.landmarkStatus} onRun={runLandmarks} />
        {ai.landmarks.length > 0 && (
          <div className="mt-2 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1e2530" }}>
            <div className="flex items-center justify-between mb-1">
              <span style={{ color: "#7fa8c0" }}>{ai.landmarks.length} landmarks</span>
              <button
                onClick={() => ai.setShowLandmarks(!ai.showLandmarks)}
                className="text-[9px] px-1.5 py-0.5 rounded"
                style={{ background: ai.showLandmarks ? "rgba(0,229,255,0.1)" : "#13161d", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.2)" }}
              >
                {ai.showLandmarks ? "Hide" : "Show"}
              </button>
            </div>
            {["cusp_tip", "contact_point", "arch_midline", "gingival_margin", "incisor_edge"].map((type) => {
              const count = ai.landmarks.filter((l) => l.type === type).length;
              if (!count) return null;
              return (
                <div key={type} className="flex justify-between py-0.5">
                  <span className="text-[10px]" style={{ color: "#3a5060" }}>{type.replace(/_/g, " ")}</span>
                  <span className="text-[10px]" style={{ color: "#4a6070" }}>{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* GINGIVA SEGMENTATION */}
      <div className={SECTION}>
        <span className={LABEL_CLASS} style={{ color: "#2a4050" }}>Gingiva Segmentation</span>
        <TaskRow label="Segment Gingiva" status={ai.gingivaStatus} onRun={runGingiva} />
        {ai.gingivaSegmentation && (
          <div className="mt-2 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1e2530" }}>
            <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
              <span style={{ color: "#3a5060" }}>Gingival Faces</span>
              <span style={{ color: "#7fa8c0" }}>{ai.gingivaSegmentation.gingivaFaceIndices.length.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span style={{ color: "#3a5060" }}>Surface Area</span>
              <span style={{ color: "#7fa8c0" }}>{ai.gingivaSegmentation.area} mm²</span>
            </div>
          </div>
        )}
      </div>

      {/* ARCH FORM */}
      <div className={SECTION}>
        <span className={LABEL_CLASS} style={{ color: "#2a4050" }}>AI Arch Form Analysis</span>
        <TaskRow label="Analyze Arch Form" status={ai.archFormStatus} onRun={runArchForm} />
        {ai.archFormAnalysis && (
          <div className="mt-2 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1e2530" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="capitalize font-semibold" style={{ color: "#00e5ff" }}>
                {ai.archFormAnalysis.detectedForm}
              </span>
              <span className="text-[9px]" style={{ color: "#4a6070" }}>
                {(ai.archFormAnalysis.confidence * 100).toFixed(0)}% conf
              </span>
            </div>
            <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
              <span style={{ color: "#3a5060" }}>Arch Width</span>
              <span style={{ color: "#7fa8c0" }}>{ai.archFormAnalysis.archWidth} mm</span>
            </div>
            <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
              <span style={{ color: "#3a5060" }}>Arch Depth</span>
              <span style={{ color: "#7fa8c0" }}>{ai.archFormAnalysis.archDepth} mm</span>
            </div>
            <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
              <span style={{ color: "#3a5060" }}>Symmetry Score</span>
              <span style={{ color: "#7fa8c0" }}>{(ai.archFormAnalysis.symmetryScore * 100).toFixed(0)}%</span>
            </div>
            {ai.archFormAnalysis.recommendedForm !== ai.archFormAnalysis.detectedForm && (
              <div className="mt-1.5 text-[10px]" style={{ color: "#ffcc00" }}>
                ⚠ Recommended: {ai.archFormAnalysis.recommendedForm}
              </div>
            )}
          </div>
        )}
      </div>

      {/* TOOTH NUMBERING */}
      <div className={SECTION}>
        <span className={LABEL_CLASS} style={{ color: "#2a4050" }}>AI Tooth Numbering</span>
        <TaskRow label="Auto-Number Teeth" status={ai.numberingStatus} onRun={runNumbering} />
        {ai.toothNumbering && (
          <div className="mt-2 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1e2530" }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: "#4a6070" }}>Method: {ai.toothNumbering.method.replace(/_/g, " ")}</span>
              <span style={{ color: "#00e5ff" }}>{(ai.toothNumbering.confidence * 100).toFixed(0)}% overall</span>
            </div>
            <div
              className="overflow-y-auto"
              style={{ maxHeight: 120 }}
            >
              {Object.entries(ai.toothNumbering.assignments).map(([id, a]) => (
                <div key={id} className="flex justify-between py-0.5">
                  <span className="text-[10px]" style={{ color: "#3a5060" }}>{id}</span>
                  <span className="text-[10px]" style={{ color: "#7fa8c0" }}>
                    {a.label} <span style={{ color: "#2a4050" }}>({(a.confidence * 100).toFixed(0)}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* TREATMENT PREDICTION */}
      <div className={SECTION}>
        <span className={LABEL_CLASS} style={{ color: "#2a4050" }}>Treatment Prediction</span>
        <TaskRow label="Predict Treatment" status={ai.treatmentStatus} onRun={runTreatmentPrediction} />
        {ai.treatmentPrediction && (
          <div className="mt-2 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1e2530" }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: "#4a6070" }}>Complexity</span>
              <span
                className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: ai.treatmentPrediction.complexityLabel === "simple" ? "rgba(0,229,255,0.1)" :
                    ai.treatmentPrediction.complexityLabel === "moderate" ? "rgba(255,204,0,0.1)" :
                    "rgba(255,82,82,0.1)",
                  color: ai.treatmentPrediction.complexityLabel === "simple" ? "#00e5ff" :
                    ai.treatmentPrediction.complexityLabel === "moderate" ? "#ffcc00" : "#ff5252",
                  border: "1px solid currentColor",
                }}
              >
                {ai.treatmentPrediction.complexityLabel}
              </span>
            </div>
            <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
              <span style={{ color: "#3a5060" }}>Est. Stages</span>
              <span style={{ color: "#7fa8c0" }}>{ai.treatmentPrediction.estimatedStages}</span>
            </div>
            <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
              <span style={{ color: "#3a5060" }}>Max Movement</span>
              <span style={{ color: "#7fa8c0" }}>{ai.treatmentPrediction.maxSingleToothMovementMm} mm</span>
            </div>
            <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
              <span style={{ color: "#3a5060" }}>Duration</span>
              <span style={{ color: "#7fa8c0" }}>~{ai.treatmentPrediction.predictedDurationWeeks} wks</span>
            </div>
            {ai.treatmentPrediction.riskFactors.map((r, i) => (
              <div key={i} className="mt-1 flex items-start gap-1.5">
                <span style={{ color: "#ff5252", flexShrink: 0 }}>⚠</span>
                <span className="text-[10px]" style={{ color: "#ff9940" }}>{r}</span>
              </div>
            ))}
            {ai.treatmentPrediction.recommendations.map((r, i) => (
              <div key={i} className="mt-1 flex items-start gap-1.5">
                <span style={{ color: "#4dffb8", flexShrink: 0 }}>→</span>
                <span className="text-[10px]" style={{ color: "#4a6070" }}>{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ALIGNMENT SUGGESTIONS */}
      <div className={SECTION}>
        <span className={LABEL_CLASS} style={{ color: "#2a4050" }}>Smart Alignment Suggestions</span>
        <TaskRow label="Generate Suggestions" status={ai.alignmentStatus} onRun={runAlignment} />
        {ai.alignmentSuggestions.length > 0 && (
          <div className="mt-2 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1e2530" }}>
            <p className="text-[10px] mb-2" style={{ color: "#4a6070" }}>
              {ai.alignmentSuggestions.length} adjustment{ai.alignmentSuggestions.length !== 1 ? "s" : ""} suggested
            </p>
            {ai.alignmentSuggestions.slice(0, 5).map((s, i) => (
              <div key={i} className="py-1" style={{ borderBottom: "1px solid #13161d" }}>
                <div className="flex justify-between">
                  <span className="text-[10px]" style={{ color: "#3a5060" }}>{s.segmentId}</span>
                  <span className="text-[10px]" style={{ color: "#ffcc00" }}>{s.displacementMm} mm</span>
                </div>
                <p className="text-[9px]" style={{ color: "#2a4050" }}>{s.reason}</p>
              </div>
            ))}
          </div>
        )}
        {ai.alignmentSuggestions.length === 0 && ai.alignmentStatus === "done" && (
          <div className="mt-2 rounded px-2 py-1.5 text-[10px]" style={{ background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.15)", color: "#4dffb8" }}>
            All teeth well aligned — no suggestions
          </div>
        )}
      </div>

      {/* CLEAR */}
      {(ai.collisionStatus !== "idle" || ai.landmarkStatus !== "idle") && (
        <button
          onClick={ai.clearAll}
          className="w-full py-1 rounded text-[10px] mt-2"
          style={{ background: "transparent", border: "1px solid #1e2530", color: "#2a4050" }}
        >
          Clear All Results
        </button>
      )}
    </div>
  );
}
