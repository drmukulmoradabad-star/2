import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TreatmentStage, StageTransforms } from "./TreatmentEngine";

export type ComparisonMode = "none" | "ghost" | "split";

interface SimulationState {
  // Stages
  stages: TreatmentStage[];
  stageCount: number;
  setStages: (s: TreatmentStage[]) => void;
  setStageCount: (n: number) => void;

  // Playback
  progress: number; // 0-1 across all stages
  isPlaying: boolean;
  playbackSpeed: number; // seconds to complete full cycle
  setProgress: (p: number) => void;
  setPlaying: (v: boolean) => void;
  setPlaybackSpeed: (s: number) => void;

  // Display
  comparisonMode: ComparisonMode;
  setComparisonMode: (m: ComparisonMode) => void;
  showSimulation: boolean;
  setShowSimulation: (v: boolean) => void;

  // Current interpolated transforms (computed externally, stored for scene use)
  currentTransforms: StageTransforms;
  setCurrentTransforms: (t: StageTransforms) => void;

  // Helpers
  getCurrentStageIndex: () => number;
  getCurrentStageLabel: () => string;
}

export const useSimulationStore = create<SimulationState>()(
  persist(
    (set, get) => ({
      stages: [],
      stageCount: 14,
      setStages: (stages) => set({ stages }),
      setStageCount: (n) => set({ stageCount: n }),

      progress: 0,
      isPlaying: false,
      playbackSpeed: 8,
      setProgress: (progress) => set({ progress: Math.max(0, Math.min(1, progress)) }),
      setPlaying: (isPlaying) => set({ isPlaying }),
      setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),

      comparisonMode: "none",
      setComparisonMode: (comparisonMode) => set({ comparisonMode }),
      showSimulation: false,
      setShowSimulation: (showSimulation) => set({ showSimulation }),

      currentTransforms: {},
      setCurrentTransforms: (currentTransforms) => set({ currentTransforms }),

      getCurrentStageIndex: () => {
        const { stages, progress } = get();
        if (!stages.length) return 0;
        return Math.round(progress * (stages.length - 1));
      },
      getCurrentStageLabel: () => {
        const { stages } = get();
        const idx = get().getCurrentStageIndex();
        return stages[idx]?.label ?? "—";
      },
    }),
    {
      name: "dental-cad-simulation",
      partialize: (s) => ({ stageCount: s.stageCount, playbackSpeed: s.playbackSpeed }),
    }
  )
);
