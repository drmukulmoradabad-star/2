import { useState, useCallback } from "react";
import { useSimulationStore } from "./simulationStore";
import { useSegmentationStore } from "../segmentation/segmentationStore";
import { useMovementStore } from "../movement/movementStore";
import { generateStages, computeArchAlignment } from "./TreatmentEngine";
import { Slider } from "@/components/ui/slider";

export default function TreatmentPanel({ onToast }: { onToast?: (msg: string, desc?: string) => void }) {
  const {
    stages, stageCount, setStages, setStageCount,
    progress, setProgress, isPlaying, setPlaying,
    playbackSpeed, setPlaybackSpeed,
    comparisonMode, setComparisonMode,
    showSimulation, setShowSimulation,
    getCurrentStageLabel,
  } = useSimulationStore();

  const { result, metas } = useSegmentationStore();
  const { transforms, setTransform } = useMovementStore();

  const [isGenerating, setIsGenerating] = useState(false);

  const segmentIds = result?.segments.map((s) => s.id) ?? [];
  const hasSegments = segmentIds.length > 0;
  const hasStages = stages.length > 0;

  const handleGenerate = useCallback(async () => {
    if (!hasSegments) { onToast?.("No teeth segmented", "Run segmentation first"); return; }
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 20));
    const newStages = generateStages(transforms, segmentIds, stageCount);
    setStages(newStages);
    setProgress(0);
    setShowSimulation(true);
    setIsGenerating(false);
    onToast?.(`${newStages.length} aligner stages generated`, `${segmentIds.length} teeth tracked`);
  }, [transforms, segmentIds, stageCount]);

  const handleArchAlign = useCallback(async () => {
    if (!result?.segments.length) { onToast?.("No segments detected"); return; }
    const targets = computeArchAlignment(result.segments, metas);
    for (const [id, t] of Object.entries(targets)) {
      setTransform(id, { position: t.position, rotation: t.rotation, scale: t.scale });
    }
    onToast?.("Arch alignment applied", "Movement transforms updated — regenerate stages to simulate");
  }, [result, metas]);

  const stageLabel = getCurrentStageLabel();
  const currentStageIdx = stages.length > 1 ? Math.round(progress * (stages.length - 1)) : 0;

  return (
    <div className="flex flex-col h-full text-[11px]" style={{ color: "#c8d8e8" }}>
      {/* Header */}
      <div className="px-3 py-2 shrink-0 flex items-center justify-between" style={{ borderBottom: "1px solid #1e2530" }}>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Treatment Simulation</p>
        <button
          onClick={() => setShowSimulation(!showSimulation)}
          disabled={!hasStages}
          className="relative w-8 h-4 rounded-full transition-all disabled:opacity-30"
          style={{ background: showSimulation ? "rgba(0,229,255,0.3)" : "#1a1d24", border: `1px solid ${showSimulation ? "rgba(0,229,255,0.5)" : "#2a3540"}` }}
        >
          <span className="absolute top-0.5 w-3 h-3 rounded-full transition-all" style={{ left: showSimulation ? "calc(100% - 14px)" : 2, background: showSimulation ? "#00e5ff" : "#3a5060" }} />
        </button>
      </div>

      {/* Generate controls */}
      <div className="px-3 py-2 shrink-0 flex flex-col gap-2" style={{ borderBottom: "1px solid #1a1d24" }}>
        <div className="flex justify-between items-center">
          <span style={{ color: "#4a6070" }}>Aligner stages</span>
          <div className="flex items-center gap-2">
            <Slider min={4} max={40} step={2} value={[stageCount]}
              onValueChange={([v]) => setStageCount(v)} className="w-20" />
            <span className="font-mono w-4" style={{ color: "#7fa8c0" }}>{stageCount}</span>
          </div>
        </div>

        <div className="flex gap-1">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !hasSegments}
            className="flex-1 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-all disabled:opacity-40"
            style={{ background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.4)", color: "#00e5ff" }}
          >
            {isGenerating ? "Generating..." : "Generate Stages"}
          </button>
          <button
            onClick={handleArchAlign}
            disabled={!hasSegments}
            className="flex-1 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-all disabled:opacity-40"
            style={{ background: "rgba(77,255,184,0.08)", border: "1px solid rgba(77,255,184,0.3)", color: "#4dffb8" }}
          >
            Arch Align
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-3 py-3 shrink-0 flex flex-col gap-3" style={{ borderBottom: "1px solid #1a1d24" }}>
        {/* Stage indicator */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Timeline</span>
          <span className="text-[11px] font-mono" style={{ color: "#00e5ff" }}>
            {hasStages ? `${stageLabel} (${currentStageIdx}/${stages.length - 1})` : "No stages"}
          </span>
        </div>

        {/* Progress slider */}
        <div className="flex flex-col gap-1">
          <Slider
            min={0} max={1} step={0.001}
            value={[progress]}
            onValueChange={([v]) => { setProgress(v); setPlaying(false); }}
            disabled={!hasStages}
            className="w-full"
          />
          <div className="flex justify-between text-[9px]" style={{ color: "#2a4050" }}>
            <span>Initial</span>
            <span>{Math.round(progress * 100)}%</span>
            <span>Final</span>
          </div>
        </div>

        {/* Stage dots */}
        {hasStages && (
          <div className="flex gap-0.5 flex-wrap">
            {stages.map((stage, i) => {
              const isActive = i === currentStageIdx;
              return (
                <button
                  key={i}
                  title={stage.label}
                  onClick={() => { setProgress(i / Math.max(1, stages.length - 1)); setPlaying(false); }}
                  className="w-3 h-3 rounded-sm transition-all"
                  style={{
                    background: isActive ? "#00e5ff" : i < currentStageIdx ? "rgba(0,229,255,0.3)" : "#1a1d24",
                    border: isActive ? "1px solid #00e5ff" : "1px solid #1e2530",
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Playback controls */}
      <div className="px-3 py-2 shrink-0 flex flex-col gap-2" style={{ borderBottom: "1px solid #1a1d24" }}>
        <div className="flex gap-1">
          <button
            onClick={() => setProgress(0)}
            className="px-2 py-1.5 rounded text-[10px] transition-all"
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#4a6070" }}
          >
            ⏮
          </button>
          <button
            onClick={() => setProgress(Math.max(0, progress - 1 / Math.max(1, stages.length - 1)))}
            className="px-2 py-1.5 rounded text-[10px] transition-all"
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#4a6070" }}
          >
            ◀
          </button>
          <button
            onClick={() => setPlaying(!isPlaying)}
            disabled={!hasStages}
            className="flex-1 py-1.5 rounded text-[10px] font-semibold transition-all disabled:opacity-30"
            style={{
              background: isPlaying ? "rgba(255,77,77,0.12)" : "rgba(0,229,255,0.12)",
              border: `1px solid ${isPlaying ? "rgba(255,77,77,0.4)" : "rgba(0,229,255,0.4)"}`,
              color: isPlaying ? "#ff4d4d" : "#00e5ff",
            }}
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button
            onClick={() => setProgress(Math.min(1, progress + 1 / Math.max(1, stages.length - 1)))}
            className="px-2 py-1.5 rounded text-[10px] transition-all"
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#4a6070" }}
          >
            ▶
          </button>
          <button
            onClick={() => setProgress(1)}
            className="px-2 py-1.5 rounded text-[10px] transition-all"
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#4a6070" }}
          >
            ⏭
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span style={{ color: "#4a6070" }}>Cycle duration</span>
          <div className="flex gap-1">
            {[4, 8, 16, 32].map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className="px-1.5 py-0.5 rounded text-[9px] transition-all"
                style={{
                  background: playbackSpeed === s ? "rgba(0,229,255,0.12)" : "#13161d",
                  border: `1px solid ${playbackSpeed === s ? "rgba(0,229,255,0.4)" : "#1e2530"}`,
                  color: playbackSpeed === s ? "#00e5ff" : "#3a5060",
                }}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison mode */}
      <div className="px-3 py-2 shrink-0 flex flex-col gap-1.5" style={{ borderBottom: "1px solid #1a1d24" }}>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Comparison</p>
        <div className="flex gap-1">
          {(["none", "ghost", "split"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setComparisonMode(mode)}
              className="flex-1 py-1 rounded text-[9px] uppercase tracking-wider capitalize transition-all"
              style={{
                background: comparisonMode === mode ? "rgba(0,229,255,0.12)" : "#13161d",
                border: `1px solid ${comparisonMode === mode ? "rgba(0,229,255,0.4)" : "#1e2530"}`,
                color: comparisonMode === mode ? "#00e5ff" : "#3a5060",
              }}
            >
              {mode === "none" ? "Off" : mode === "ghost" ? "Ghost" : "Side"}
            </button>
          ))}
        </div>
        {comparisonMode === "ghost" && (
          <p className="text-[10px]" style={{ color: "#2a4050" }}>Initial shown as translucent overlay</p>
        )}
      </div>

      {/* Stage list */}
      {hasStages && (
        <div className="flex-1 overflow-y-auto">
          <p className="px-3 pt-2 text-[10px] uppercase tracking-widest mb-1" style={{ color: "#2a4050" }}>Stages</p>
          {stages.map((stage, i) => {
            const isActive = i === currentStageIdx;
            const isPast = i < currentStageIdx;
            return (
              <button
                key={i}
                onClick={() => { setProgress(i / Math.max(1, stages.length - 1)); setPlaying(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 transition-colors text-left"
                style={{
                  background: isActive ? "rgba(0,229,255,0.07)" : "transparent",
                  borderLeft: `2px solid ${isActive ? "#00e5ff" : "transparent"}`,
                }}
              >
                <span
                  className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                  style={{
                    background: isActive ? "#00e5ff" : isPast ? "rgba(0,229,255,0.2)" : "#1a1d24",
                    color: isActive ? "#0a0c10" : isPast ? "#00e5ff" : "#3a5060",
                  }}
                >
                  {i}
                </span>
                <span className="text-[11px]" style={{ color: isActive ? "#c8d8e8" : isPast ? "#4a6070" : "#3a5060" }}>
                  {stage.label}
                </span>
                {stage.index === 0 && <span className="ml-auto text-[9px]" style={{ color: "#2a4050" }}>START</span>}
                {stage.index === stages.length - 1 && <span className="ml-auto text-[9px]" style={{ color: "#4dffb8" }}>FINAL</span>}
              </button>
            );
          })}
        </div>
      )}

      {!hasStages && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-2">
          <p style={{ color: "#2a3a48" }}>No treatment plan yet</p>
          <p className="text-[10px]" style={{ color: "#1e2a33" }}>
            1. Segment teeth<br />
            2. Move teeth to final positions<br />
            3. Generate aligner stages
          </p>
        </div>
      )}
    </div>
  );
}
