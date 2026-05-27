/**
 * AIPanel v2 — AI-assisted orthodontic recommendation engine.
 *
 * Sections:
 *   1. Score card (overall alignment grade)
 *   2. Section tabs: Analysis | Suggestions | Warnings | Overlays
 *   3. Analysis: collision, spacing/crowding, rotation, midline, overbite/overjet,
 *                arch form, treatment prediction, tooth numbering, gingiva
 *   4. Suggestions: smart movement recommendations with confidence, dismiss
 *   5. Warnings: real-time edit warnings, severity feed
 *   6. Overlays: visibility toggles for 3D annotation layers
 *
 * IMPORTANT: The AI only suggests. The admin controls all edits.
 */

import { useState, useCallback, useEffect, useRef } from "react";
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
  analyzeSpacingCrowding,
  analyzeRotations,
  detectMidlineDeviation,
  estimateOverbiteOverjet,
  computeAlignmentScore,
  generateRealtimeWarnings,
  computeMovementArrows,
  getMLModel,
} from "./AIEngine";
import { useToast } from "@/hooks/use-toast";
import type { ToothSegment } from "@/modules/segmentation/SegmentationEngine";

// ─── Small UI primitives ──────────────────────────────────────────────────────

const HDIV = "my-3 border-t border-[#13161d]";

function SectionHdr({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] uppercase tracking-[0.15em] font-semibold mb-2 mt-1"
      style={{ color: "#2a4050" }}>
      {children}
    </p>
  );
}

type Severity = "none" | "low" | "mild" | "moderate" | "high" | "severe" | "info" | "warning" | "critical";
const SEV_COLORS: Record<string, string> = {
  none:     "#4dffb8",
  low:      "#4dffb8",
  mild:     "#80ff80",
  moderate: "#ffcc00",
  high:     "#ff8c40",
  severe:   "#ff5252",
  info:     "#00e5ff",
  warning:  "#ffcc00",
  critical: "#ff5252",
};

function Badge({ label, severity = "info" }: { label: string; severity?: Severity }) {
  const c = SEV_COLORS[severity] ?? "#7fa8c0";
  return (
    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded"
      style={{ background: `${c}18`, color: c, border: `1px solid ${c}44` }}>
      {label}
    </span>
  );
}

function StatRow({ label, value, unit = "", accent }: { label: string; value: string | number; unit?: string; accent?: string }) {
  return (
    <div className="flex justify-between py-0.5" style={{ borderBottom: "1px solid #0e1117" }}>
      <span className="text-[10px]" style={{ color: "#3a5060" }}>{label}</span>
      <span className="font-mono text-[10px]" style={{ color: accent ?? "#7fa8c0" }}>
        {value}{unit && ` ${unit}`}
      </span>
    </div>
  );
}

function RunBtn({ label, status, onRun, disabled = false }: {
  label: string; status: string; onRun: () => void; disabled?: boolean;
}) {
  const running = status === "running";
  const done = status === "done";
  return (
    <button onClick={onRun} disabled={running || disabled}
      className="w-full py-1.5 rounded text-[10px] transition-all disabled:opacity-30 flex items-center justify-between px-2"
      style={{
        background: done ? "rgba(0,229,255,0.07)" : "#0e1117",
        border: `1px solid ${done ? "rgba(0,229,255,0.25)" : "#1e2530"}`,
        color: done ? "#00e5ff" : "#7fa8c0",
      }}>
      <span>{label}</span>
      {running && <span className="text-[9px] animate-pulse" style={{ color: "#ffcc00" }}>running…</span>}
      {done && <span style={{ color: "#4dffb8" }}>✓</span>}
      {status === "error" && <span style={{ color: "#ff5252" }}>✗</span>}
    </button>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[10px]" style={{ color: "#4a6070" }}>{label}</span>
      <button onClick={() => onChange(!value)}
        className="relative w-8 h-4 rounded-full transition-all"
        style={{
          background: value ? "rgba(0,229,255,0.2)" : "#0e1117",
          border: `1px solid ${value ? "rgba(0,229,255,0.5)" : "#1e2530"}`,
        }}>
        <span className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
          style={{ left: value ? "calc(100% - 14px)" : 2, background: value ? "#00e5ff" : "#2a3a4a" }} />
      </button>
    </div>
  );
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, grade, label }: { score: number; grade: string; label: string }) {
  const r = 22, cx = 28, cy = 28;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  const color = score >= 90 ? "#4dffb8" : score >= 75 ? "#00e5ff" : score >= 60 ? "#ffcc00" : score >= 45 ? "#ff8c40" : "#ff5252";
  return (
    <div className="flex items-center gap-3">
      <svg width={56} height={56}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1d24" strokeWidth={5} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "stroke-dasharray 0.6s ease" }} />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          className="font-bold" style={{ fontSize: 13, fill: color }}>{grade}</text>
      </svg>
      <div>
        <p className="text-[18px] font-bold leading-none" style={{ color }}>{score}</p>
        <p className="text-[9px] mt-0.5 uppercase tracking-wide" style={{ color: "#3a5060" }}>{label}</p>
      </div>
    </div>
  );
}

// ─── Sub-score bar ────────────────────────────────────────────────────────────

function SubScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "#4dffb8" : value >= 60 ? "#ffcc00" : "#ff5252";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] w-16 shrink-0" style={{ color: "#3a5060" }}>{label}</span>
      <div className="flex-1 rounded-full h-1.5" style={{ background: "#1a1d24" }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-[9px] w-6 text-right font-mono" style={{ color }}>{value}</span>
    </div>
  );
}

// ─── Panel tab ────────────────────────────────────────────────────────────────

const PANEL_TABS = [
  { id: "analysis",    label: "Analyze" },
  { id: "suggestions", label: "Suggest" },
  { id: "warnings",    label: "Warn" },
  { id: "overlays",    label: "Overlay" },
] as const;

type PanelTab = typeof PANEL_TABS[number]["id"];

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function AIPanel() {
  const { geometry } = useViewerStore();
  const { result: segResult } = useSegmentationStore();
  const { transforms, setCollidingPairs } = useMovementStore();
  const ai = useAIStore();
  const { toast } = useToast();

  const segments: ToothSegment[] = segResult?.segments ?? [];
  const hasGeo = !!geometry;
  const hasSeg = segments.length > 0;

  const [activeTab, setActiveTab] = useState<PanelTab>("analysis");
  const [runningAll, setRunningAll] = useState(false);
  const prevTransformsRef = useRef<string>("");

  // ── Real-time warning refresh when transforms change ─────────────────────
  useEffect(() => {
    if (!ai.warningsEnabled || !hasSeg) return;
    const key = JSON.stringify(transforms);
    if (key === prevTransformsRef.current) return;
    prevTransformsRef.current = key;
    const warnings = generateRealtimeWarnings(segments, transforms);
    ai.setRealtimeWarnings(warnings);
  }, [transforms, hasSeg, ai.warningsEnabled]);

  // ── Individual analysis runners ──────────────────────────────────────────

  const defer = (fn: () => void) => new Promise<void>((res) => { setTimeout(() => { fn(); res(); }, 16); });

  const runCollision = useCallback(async () => {
    if (!hasSeg) return;
    ai.setCollisionStatus("running");
    await defer(() => {
      try {
        const r = predictCollisions(segments, transforms, 0.1);
        ai.setCollisionReport(r);
        ai.setCollisionStatus("done");
        setCollidingPairs(r.pairs.map((p) => [p.idA, p.idB]));
      } catch { ai.setCollisionStatus("error"); }
    });
  }, [segments, transforms]);

  const runSpacing = useCallback(async () => {
    if (!hasSeg) return;
    ai.setSpacingStatus("running");
    await defer(() => {
      try {
        ai.setSpacingAnalysis(analyzeSpacingCrowding(segments));
        ai.setSpacingStatus("done");
      } catch { ai.setSpacingStatus("error"); }
    });
  }, [segments]);

  const runRotations = useCallback(async () => {
    if (!hasSeg) return;
    ai.setRotationStatus("running");
    await defer(() => {
      try {
        ai.setRotationAnalysis(analyzeRotations(segments, transforms));
        ai.setRotationStatus("done");
      } catch { ai.setRotationStatus("error"); }
    });
  }, [segments, transforms]);

  const runMidline = useCallback(async () => {
    if (!hasSeg) return;
    ai.setMidlineStatus("running");
    await defer(() => {
      try {
        ai.setMidlineDeviation(detectMidlineDeviation(segments));
        ai.setMidlineStatus("done");
      } catch { ai.setMidlineStatus("error"); }
    });
  }, [segments]);

  const runOverbite = useCallback(async () => {
    if (!hasSeg) return;
    ai.setOverbiteStatus("running");
    await defer(() => {
      try {
        ai.setOverbiteOverjet(estimateOverbiteOverjet(segments));
        ai.setOverbiteStatus("done");
      } catch { ai.setOverbiteStatus("error"); }
    });
  }, [segments]);

  const runArchForm = useCallback(async () => {
    if (!hasSeg) return;
    ai.setArchFormStatus("running");
    await defer(() => {
      try {
        ai.setArchFormAnalysis(analyzeArchForm(segments));
        ai.setArchFormStatus("done");
      } catch { ai.setArchFormStatus("error"); }
    });
  }, [segments]);

  const runScore = useCallback(async () => {
    if (!hasSeg) return;
    ai.setAlignmentScoreStatus("running");
    await defer(() => {
      try {
        ai.setAlignmentScore(computeAlignmentScore(segments, transforms));
        ai.setAlignmentScoreStatus("done");
      } catch { ai.setAlignmentScoreStatus("error"); }
    });
  }, [segments, transforms]);

  const runAlignment = useCallback(async () => {
    if (!hasSeg) return;
    ai.setAlignmentStatus("running");
    await defer(() => {
      try {
        const s = computeSmartAlignmentSuggestions(segments, transforms);
        ai.setAlignmentSuggestions(s);
        ai.restoreSuggestions();
        const arrows = computeMovementArrows(s, segments);
        ai.setMovementArrows(arrows);
        ai.setAlignmentStatus("done");
      } catch { ai.setAlignmentStatus("error"); }
    });
  }, [segments, transforms]);

  const runTreatment = useCallback(async () => {
    if (!hasSeg) return;
    ai.setTreatmentStatus("running");
    await defer(() => {
      try {
        ai.setTreatmentPrediction(predictTreatment(segments, transforms));
        ai.setTreatmentStatus("done");
      } catch { ai.setTreatmentStatus("error"); }
    });
  }, [segments, transforms]);

  const runLandmarks = useCallback(async () => {
    if (!hasSeg) return;
    ai.setLandmarkStatus("running");
    await defer(() => {
      try {
        ai.setLandmarks(detectLandmarks(segments));
        ai.setLandmarkStatus("done");
      } catch { ai.setLandmarkStatus("error"); }
    });
  }, [segments]);

  const runNumbering = useCallback(async () => {
    if (!hasSeg) return;
    ai.setNumberingStatus("running");
    await defer(() => {
      try {
        ai.setToothNumbering(runAIToothNumbering(segments));
        ai.setNumberingStatus("done");
      } catch { ai.setNumberingStatus("error"); }
    });
  }, [segments]);

  // ── Run All ──────────────────────────────────────────────────────────────
  const runAll = useCallback(async () => {
    if (!hasSeg || runningAll) return;
    setRunningAll(true);
    toast({ title: "AI Analysis Running", description: "Analyzing all metrics…" });

    await runCollision();
    await runSpacing();
    await runRotations();
    await runMidline();
    await runOverbite();
    await runArchForm();
    await runAlignment();
    await runTreatment();
    await runScore();
    await runLandmarks();
    await runNumbering();

    ai.setLastRunAll(Date.now());
    setRunningAll(false);
    toast({ title: "AI Analysis Complete", description: "All metrics updated" });
  }, [hasSeg, runningAll]);

  const activeWarnings = ai.realtimeWarnings.filter((w) => !ai.dismissedWarnings.has(w.id));
  const criticalCount = activeWarnings.filter((w) => w.severity === "critical").length;
  const visibleSuggestions = ai.alignmentSuggestions.filter((s) => !ai.dismissedSuggestions.has(s.segmentId));

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ color: "#c8d8e8" }}>

      {/* ── AI Header ──────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 shrink-0" style={{ background: "#0a0c10", borderBottom: "1px solid #1e2530" }}>
        <div className="flex items-center justify-between mb-1.5">
          <div>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>AI Ortho Assistant</p>
            <p className="text-[9px] mt-0.5" style={{ color: "#1e2a33" }}>
              {getMLModel().name} · Geometric Mode
            </p>
          </div>
          <button
            onClick={runAll}
            disabled={!hasSeg || runningAll}
            className="px-2 py-1 rounded text-[10px] transition-all disabled:opacity-30"
            style={{
              background: runningAll ? "rgba(255,204,0,0.1)" : "rgba(0,229,255,0.1)",
              border: `1px solid ${runningAll ? "rgba(255,204,0,0.3)" : "rgba(0,229,255,0.3)"}`,
              color: runningAll ? "#ffcc00" : "#00e5ff",
            }}>
            {runningAll ? "Running…" : "Run All"}
          </button>
        </div>

        {/* Score card */}
        {ai.alignmentScore && (
          <div className="rounded p-2 mb-1.5" style={{ background: "#0e1117", border: "1px solid #1a1d24" }}>
            <ScoreRing score={ai.alignmentScore.overall} grade={ai.alignmentScore.grade} label={ai.alignmentScore.label} />
            <div className="mt-2 flex flex-col gap-1">
              <SubScoreBar label="Spacing"  value={ai.alignmentScore.spacing} />
              <SubScoreBar label="Symmetry" value={ai.alignmentScore.symmetry} />
              <SubScoreBar label="Rotation" value={ai.alignmentScore.rotation} />
              <SubScoreBar label="Midline"  value={ai.alignmentScore.midline} />
            </div>
          </div>
        )}

        {/* Warning/suggestion badges */}
        <div className="flex gap-1 flex-wrap">
          {criticalCount > 0 && (
            <button onClick={() => setActiveTab("warnings")}
              className="text-[9px] px-1.5 py-0.5 rounded transition-all"
              style={{ background: "rgba(255,82,82,0.12)", border: "1px solid rgba(255,82,82,0.3)", color: "#ff5252" }}>
              {criticalCount} critical
            </button>
          )}
          {activeWarnings.length > criticalCount && (
            <button onClick={() => setActiveTab("warnings")}
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,204,0,0.1)", border: "1px solid rgba(255,204,0,0.3)", color: "#ffcc00" }}>
              {activeWarnings.length - criticalCount} warn
            </button>
          )}
          {visibleSuggestions.length > 0 && (
            <button onClick={() => setActiveTab("suggestions")}
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.25)", color: "#00e5ff" }}>
              {visibleSuggestions.length} suggest
            </button>
          )}
          {!hasSeg && (
            <span className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,204,0,0.06)", border: "1px solid rgba(255,204,0,0.2)", color: "#ffcc00" }}>
              Segment first
            </span>
          )}
        </div>
      </div>

      {/* ── Section Tabs ───────────────────────────────────────────────────── */}
      <div className="flex shrink-0" style={{ borderBottom: "1px solid #1e2530", background: "#0a0c10" }}>
        {PANEL_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const hasWarningDot = tab.id === "warnings" && activeWarnings.length > 0;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex-1 py-1.5 text-[9px] uppercase tracking-wide relative transition-all"
              style={{
                color: isActive ? "#00e5ff" : "#3a5060",
                borderBottom: isActive ? "2px solid #00e5ff" : "2px solid transparent",
              }}>
              {tab.label}
              {hasWarningDot && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                  style={{ background: criticalCount > 0 ? "#ff5252" : "#ffcc00" }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ══════════════ ANALYSIS TAB ══════════════ */}
        {activeTab === "analysis" && (
          <div className="p-3 flex flex-col gap-0 text-[11px]">

            {/* Alignment Score */}
            <SectionHdr>Alignment Score</SectionHdr>
            <RunBtn label="Compute Score" status={ai.alignmentScoreStatus} onRun={runScore} disabled={!hasSeg} />
            {ai.alignmentScore && ai.alignmentScore.details.length > 0 && (
              <div className="mt-1.5 flex flex-col gap-0.5">
                {ai.alignmentScore.details.map((d, i) => (
                  <p key={i} className="text-[9px] pl-1" style={{ color: "#3a5060", borderLeft: "1px solid #1a1d24" }}>{d}</p>
                ))}
              </div>
            )}

            <div className={HDIV} />

            {/* Collision */}
            <SectionHdr>Collision Prediction</SectionHdr>
            <RunBtn label="Analyze Collisions" status={ai.collisionStatus} onRun={runCollision} disabled={!hasSeg} />
            {ai.collisionReport && (
              <div className="mt-1.5 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px]" style={{ color: "#7fa8c0" }}>{ai.collisionReport.pairs.length} collision{ai.collisionReport.pairs.length !== 1 ? "s" : ""}</span>
                  <Badge label={ai.collisionReport.riskLevel} severity={ai.collisionReport.riskLevel as Severity} />
                </div>
                <StatRow label="Total Penetration" value={`${ai.collisionReport.totalPenetrationDepth} mm`} />
                {ai.collisionReport.pairs.slice(0, 4).map((p, i) => (
                  <div key={i} className="flex justify-between py-0.5">
                    <span className="text-[9px]" style={{ color: "#3a5060" }}>{p.labelA} ↔ {p.labelB}</span>
                    <span className="text-[9px] font-mono" style={{ color: "#ff5252" }}>{p.penetrationDepth} mm</span>
                  </div>
                ))}
              </div>
            )}

            <div className={HDIV} />

            {/* Spacing / Crowding */}
            <SectionHdr>Spacing & Crowding</SectionHdr>
            <RunBtn label="Analyze Spacing" status={ai.spacingStatus} onRun={runSpacing} disabled={!hasSeg} />
            {ai.spacingAnalysis && (
              <div className="mt-1.5 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px]" style={{ color: "#7fa8c0" }}>Crowding</span>
                  <Badge label={ai.spacingAnalysis.crowdingLevel} severity={ai.spacingAnalysis.crowdingLevel as Severity} />
                </div>
                <StatRow label="Total Crowding" value={`${ai.spacingAnalysis.totalCrowding} mm`} />
                <StatRow label="Crowded Contacts" value={ai.spacingAnalysis.crowdingCount} />
                <StatRow label="Spacing Gaps" value={ai.spacingAnalysis.spacingCount} />
                {ai.spacingAnalysis.recommendations.map((r, i) => (
                  <p key={i} className="text-[9px] mt-1" style={{ color: "#4a6070" }}>→ {r}</p>
                ))}
              </div>
            )}

            <div className={HDIV} />

            {/* Rotation */}
            <SectionHdr>Rotation Analysis</SectionHdr>
            <RunBtn label="Analyze Rotations" status={ai.rotationStatus} onRun={runRotations} disabled={!hasSeg} />
            {ai.rotationAnalysis && (
              <div className="mt-1.5 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
                <StatRow label="Max Rotation" value={`${ai.rotationAnalysis.maxRotation}°`} />
                <StatRow label="Mean Rotation" value={`${ai.rotationAnalysis.meanRotation}°`} />
                <StatRow label="Rotated Teeth" value={ai.rotationAnalysis.rotatedCount} />
                {ai.rotationAnalysis.teeth.filter((t) => t.severity !== "normal").slice(0, 4).map((t) => (
                  <div key={t.id} className="flex justify-between py-0.5">
                    <span className="text-[9px]" style={{ color: "#3a5060" }}>{t.label}</span>
                    <span className="text-[9px] font-mono" style={{ color: SEV_COLORS[t.severity] }}>{t.estimatedRotation}°</span>
                  </div>
                ))}
              </div>
            )}

            <div className={HDIV} />

            {/* Midline */}
            <SectionHdr>Midline Deviation</SectionHdr>
            <RunBtn label="Detect Midline" status={ai.midlineStatus} onRun={runMidline} disabled={!hasSeg} />
            {ai.midlineDeviation && (
              <div className="mt-1.5 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px]" style={{ color: "#7fa8c0" }}>Deviation</span>
                  <Badge label={ai.midlineDeviation.severity} severity={ai.midlineDeviation.severity as Severity} />
                </div>
                <StatRow label="Shift" value={`${ai.midlineDeviation.deviation} mm`} />
                <StatRow label="Direction" value={ai.midlineDeviation.direction} />
                <p className="text-[9px] mt-1" style={{ color: "#4a6070" }}>→ {ai.midlineDeviation.recommendation}</p>
              </div>
            )}

            <div className={HDIV} />

            {/* Overbite/Overjet */}
            <SectionHdr>Overbite / Overjet</SectionHdr>
            <RunBtn label="Estimate Bite" status={ai.overbiteStatus} onRun={runOverbite} disabled={!hasSeg} />
            {ai.overbiteOverjet && (
              <div className="mt-1.5 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
                <StatRow label="Overbite est." value={`${ai.overbiteOverjet.estimatedOverbite} mm`} />
                <StatRow label="Overjet est." value={`${ai.overbiteOverjet.estimatedOverjet} mm`} />
                <div className="flex justify-between py-0.5">
                  <span className="text-[10px]" style={{ color: "#3a5060" }}>Overbite class</span>
                  <Badge label={ai.overbiteOverjet.overbiteClass.replace("_", " ")}
                    severity={ai.overbiteOverjet.overbiteClass === "normal" ? "none" : "moderate"} />
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[10px]" style={{ color: "#3a5060" }}>Overjet class</span>
                  <Badge label={ai.overbiteOverjet.overjetClass.replace("_", " ")}
                    severity={ai.overbiteOverjet.overjetClass === "normal" ? "none" : "warning"} />
                </div>
                {ai.overbiteOverjet.recommendations.map((r, i) => (
                  <p key={i} className="text-[9px] mt-0.5" style={{ color: "#4a6070" }}>→ {r}</p>
                ))}
              </div>
            )}

            <div className={HDIV} />

            {/* Arch Form */}
            <SectionHdr>Arch Form</SectionHdr>
            <RunBtn label="Analyze Arch Form" status={ai.archFormStatus} onRun={runArchForm} disabled={!hasSeg} />
            {ai.archFormAnalysis && (
              <div className="mt-1.5 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] capitalize font-semibold" style={{ color: "#00e5ff" }}>{ai.archFormAnalysis.detectedForm}</span>
                  <span className="text-[9px]" style={{ color: "#4a6070" }}>{(ai.archFormAnalysis.confidence * 100).toFixed(0)}% conf</span>
                </div>
                <StatRow label="Width" value={`${ai.archFormAnalysis.archWidth} u`} />
                <StatRow label="Depth" value={`${ai.archFormAnalysis.archDepth} u`} />
                <StatRow label="Symmetry" value={`${(ai.archFormAnalysis.symmetryScore * 100).toFixed(0)}%`} />
                {ai.archFormAnalysis.recommendedForm !== ai.archFormAnalysis.detectedForm && (
                  <p className="text-[9px] mt-1" style={{ color: "#ffcc00" }}>
                    → Recommended: {ai.archFormAnalysis.recommendedForm}
                  </p>
                )}
              </div>
            )}

            <div className={HDIV} />

            {/* Treatment Prediction */}
            <SectionHdr>Treatment Prediction</SectionHdr>
            <RunBtn label="Predict Treatment" status={ai.treatmentStatus} onRun={runTreatment} disabled={!hasSeg} />
            {ai.treatmentPrediction && (
              <div className="mt-1.5 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
                <div className="flex items-center justify-between mb-1">
                  <span style={{ color: "#4a6070" }}>Complexity</span>
                  <Badge
                    label={ai.treatmentPrediction.complexityLabel}
                    severity={
                      ai.treatmentPrediction.complexityLabel === "simple" ? "none" :
                      ai.treatmentPrediction.complexityLabel === "moderate" ? "moderate" : "high"
                    }
                  />
                </div>
                <StatRow label="Est. Stages" value={ai.treatmentPrediction.estimatedStages} />
                <StatRow label="Max Movement" value={`${ai.treatmentPrediction.maxSingleToothMovementMm} mm`} />
                <StatRow label="Duration est." value={`~${ai.treatmentPrediction.predictedDurationWeeks} wks`} />
                {ai.treatmentPrediction.riskFactors.slice(0, 3).map((r, i) => (
                  <p key={i} className="text-[9px] mt-0.5" style={{ color: "#ff9940" }}>⚠ {r}</p>
                ))}
                {ai.treatmentPrediction.recommendations.slice(0, 2).map((r, i) => (
                  <p key={i} className="text-[9px] mt-0.5" style={{ color: "#4a6070" }}>→ {r}</p>
                ))}
              </div>
            )}

            <div className={HDIV} />

            {/* Tooth Numbering */}
            <SectionHdr>AI Tooth Numbering</SectionHdr>
            <RunBtn label="Auto-Number Teeth" status={ai.numberingStatus} onRun={runNumbering} disabled={!hasSeg} />
            {ai.toothNumbering && (
              <div className="mt-1.5 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px]" style={{ color: "#4a6070" }}>FDI / Arch-position</span>
                  <span className="text-[10px]" style={{ color: "#00e5ff" }}>{(ai.toothNumbering.confidence * 100).toFixed(0)}% overall</span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 100 }}>
                  {Object.entries(ai.toothNumbering.assignments).slice(0, 8).map(([id, a]) => (
                    <div key={id} className="flex justify-between py-0.5">
                      <span className="text-[9px]" style={{ color: "#3a5060" }}>{id}</span>
                      <span className="text-[9px]" style={{ color: "#7fa8c0" }}>{a.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={HDIV} />

            {/* Clear */}
            {ai.lastRunAll && (
              <div className="flex items-center justify-between">
                <span className="text-[9px]" style={{ color: "#1e2a33" }}>
                  Last: {new Date(ai.lastRunAll).toLocaleTimeString()}
                </span>
                <button onClick={ai.clearAll}
                  className="text-[9px] px-2 py-0.5 rounded transition-all"
                  style={{ background: "#0a0c10", border: "1px solid #1e2530", color: "#2a4050" }}>
                  Clear All
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ SUGGESTIONS TAB ══════════════ */}
        {activeTab === "suggestions" && (
          <div className="p-3 flex flex-col gap-0 text-[11px]">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[9px]" style={{ color: "#2a4050" }}>
                AI suggestions — review and apply manually.
                The AI never modifies your scan directly.
              </p>
            </div>
            <RunBtn label="Generate Movement Suggestions" status={ai.alignmentStatus} onRun={runAlignment} disabled={!hasSeg} />

            {visibleSuggestions.length > 0 && (
              <>
                <div className={HDIV} />
                <div className="flex items-center justify-between mb-1">
                  <SectionHdr>Movement Recommendations</SectionHdr>
                  <button onClick={ai.restoreSuggestions}
                    className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background: "#0e1117", border: "1px solid #1e2530", color: "#2a4050" }}>
                    Restore
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {visibleSuggestions.map((s) => {
                    const conf = Math.round(s.confidence * 100);
                    const color = s.displacementMm < 1 ? "#4dffb8" : s.displacementMm < 2 ? "#ffcc00" : "#ff8c40";
                    return (
                      <div key={s.segmentId} className="rounded p-2"
                        style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold" style={{ color: "#c8d8e8" }}>
                            {s.segmentId}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] font-mono" style={{ color }}>{s.displacementMm} mm</span>
                            <button
                              onClick={() => ai.dismissSuggestion(s.segmentId)}
                              className="text-[9px] px-1 py-0.5 rounded ml-1"
                              style={{ color: "#2a4050", border: "1px solid #1e2530" }}>✕</button>
                          </div>
                        </div>
                        <p className="text-[9px] mb-1.5" style={{ color: "#3a5060" }}>{s.reason}</p>
                        <div className="flex items-center gap-1">
                          <div className="flex-1 h-1 rounded-full" style={{ background: "#1a1d24" }}>
                            <div className="h-1 rounded-full" style={{ width: `${conf}%`, background: color }} />
                          </div>
                          <span className="text-[9px]" style={{ color: "#2a4050" }}>{conf}% conf</span>
                        </div>
                        <div className="mt-1 text-[9px]" style={{ color: "#2a4050" }}>
                          Suggested: X {s.suggestedPosition[0].toFixed(2)}, Y {s.suggestedPosition[1].toFixed(2)}, Z {s.suggestedPosition[2].toFixed(2)}
                        </div>
                        <p className="text-[8px] mt-1 italic" style={{ color: "#1e2a33" }}>
                          Apply this change manually in the Movement panel.
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {ai.alignmentStatus === "done" && visibleSuggestions.length === 0 && (
              <div className="mt-2 rounded px-2 py-2 text-[10px] text-center"
                style={{ background: "rgba(77,255,184,0.05)", border: "1px solid rgba(77,255,184,0.15)", color: "#4dffb8" }}>
                All teeth well aligned — no adjustments suggested
              </div>
            )}

            <div className={HDIV} />
            <SectionHdr>Movement Arrows Overlay</SectionHdr>
            <Toggle label="Show arrows in 3D view" value={ai.showMovementArrows} onChange={ai.setShowMovementArrows} />
            {ai.movementArrows.length > 0 && (
              <p className="text-[9px] mt-1" style={{ color: "#2a4050" }}>
                {ai.movementArrows.length} arrows ready — switch to Movement tool to see them
              </p>
            )}
          </div>
        )}

        {/* ══════════════ WARNINGS TAB ══════════════ */}
        {activeTab === "warnings" && (
          <div className="p-3 flex flex-col gap-0 text-[11px]">
            <div className="flex items-center justify-between mb-2">
              <SectionHdr>Real-time Warnings</SectionHdr>
              <Toggle label="" value={ai.warningsEnabled} onChange={ai.setWarningsEnabled} />
            </div>
            <p className="text-[9px] mb-2" style={{ color: "#2a4050" }}>
              Warnings update automatically as you move teeth.
              These are suggestions only — the admin controls all edits.
            </p>

            {!ai.warningsEnabled && (
              <div className="rounded px-2 py-1.5 text-[10px] mb-2"
                style={{ background: "rgba(255,204,0,0.06)", border: "1px solid rgba(255,204,0,0.2)", color: "#ffcc00" }}>
                Real-time warnings disabled
              </div>
            )}

            {activeWarnings.length === 0 ? (
              <div className="rounded px-2 py-2 text-center text-[10px] mt-2"
                style={{ background: "rgba(77,255,184,0.05)", border: "1px solid rgba(77,255,184,0.15)", color: "#4dffb8" }}>
                No active warnings — scan looks clean
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {activeWarnings.map((w) => {
                  const borderColor = w.severity === "critical" ? "#ff5252" : w.severity === "warning" ? "#ffcc00" : "#00e5ff";
                  return (
                    <div key={w.id} className="rounded p-2"
                      style={{ background: `${borderColor}08`, border: `1px solid ${borderColor}30` }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Badge label={w.severity} severity={w.severity as Severity} />
                            <span className="text-[9px] uppercase" style={{ color: "#2a4050" }}>{w.type}</span>
                          </div>
                          <p className="text-[10px] leading-snug" style={{ color: borderColor }}>{w.message}</p>
                        </div>
                        <button onClick={() => ai.dismissWarning(w.id)}
                          className="text-[9px] px-1 py-0.5 rounded shrink-0"
                          style={{ color: "#2a4050", border: "1px solid #1e2530" }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {ai.dismissedWarnings.size > 0 && (
              <button
                onClick={() => useAIStore.setState({ dismissedWarnings: new Set() })}
                className="mt-3 w-full py-1 rounded text-[9px] transition-all"
                style={{ background: "#0a0c10", border: "1px solid #1e2530", color: "#2a4050" }}>
                Restore {ai.dismissedWarnings.size} dismissed warning{ai.dismissedWarnings.size !== 1 ? "s" : ""}
              </button>
            )}

            <div className={HDIV} />
            <SectionHdr>Biomechanical Rules</SectionHdr>
            <div className="flex flex-col gap-1 text-[9px]" style={{ color: "#1e2a33" }}>
              <p>· Max single-tooth movement: 5 mm (warning at 3 mm)</p>
              <p>· Max rotation: 25° (warning at 20°)</p>
              <p>· Collision margin: 0.05 mm clearance</p>
              <p>· Crowding warning: &gt;5 mm total</p>
            </div>
          </div>
        )}

        {/* ══════════════ OVERLAYS TAB ══════════════ */}
        {activeTab === "overlays" && (
          <div className="p-3 flex flex-col gap-0 text-[11px]">
            <SectionHdr>3D Visual Overlays</SectionHdr>
            <p className="text-[9px] mb-2 leading-relaxed" style={{ color: "#2a4050" }}>
              Toggle AI visualization layers in the 3D viewport.
              All overlays are read-only — they do not modify the scan.
            </p>

            <div className="flex flex-col gap-2">
              <Toggle label="Movement arrows" value={ai.showMovementArrows} onChange={ai.setShowMovementArrows} />
              <Toggle label="Collision heatmap" value={ai.showCollisionHeatmap} onChange={ai.setShowCollisionHeatmap} />
              <Toggle label="Arch symmetry guide" value={ai.showSymmetryGuide} onChange={ai.setShowSymmetryGuide} />
              <Toggle label="Midline indicator" value={ai.showMidlineGuide} onChange={ai.setShowMidlineGuide} />
              <Toggle label="Ideal arch overlay" value={ai.showIdealArch} onChange={ai.setShowIdealArch} />
              <Toggle label="Landmark points" value={ai.showLandmarks} onChange={ai.setShowLandmarks} />
            </div>

            <div className={HDIV} />
            <SectionHdr>Landmark Detection</SectionHdr>
            <RunBtn label="Detect Landmarks" status={ai.landmarkStatus} onRun={runLandmarks} disabled={!hasSeg} />
            {ai.landmarks.length > 0 && (
              <div className="mt-1.5 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
                <StatRow label="Total" value={ai.landmarks.length} />
                {(["cusp_tip", "incisor_edge", "contact_point", "gingival_margin", "arch_midline"] as const).map((type) => {
                  const n = ai.landmarks.filter((l) => l.type === type).length;
                  return n ? <StatRow key={type} label={type.replace(/_/g, " ")} value={n} /> : null;
                })}
              </div>
            )}

            <div className={HDIV} />
            <SectionHdr>Architecture</SectionHdr>
            <div className="rounded p-2 text-[9px] leading-relaxed"
              style={{ background: "#0a0c10", border: "1px solid #1a1d24", color: "#1e2a33" }}>
              <p className="font-semibold mb-1" style={{ color: "#2a4050" }}>Current: Geometric Mode</p>
              <p>All analysis uses deterministic geometry algorithms. No cloud inference or training required.</p>
              <p className="mt-1.5 font-semibold" style={{ color: "#2a4050" }}>Future ML plug-ins:</p>
              <p>· ONNX Runtime adapter ready</p>
              <p>· TensorFlow.js seam available</p>
              <p>· Landmark detection models</p>
              <p>· Root-aware movement prediction</p>
              <p>· Automatic segmentation AI</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
