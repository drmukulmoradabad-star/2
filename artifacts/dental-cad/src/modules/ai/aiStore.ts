import { create } from "zustand";
import type {
  CollisionReport,
  Landmark,
  GingivaSegmentation,
  ArchFormAnalysis,
  TreatmentPrediction,
  ToothNumberingResult,
  AlignmentSuggestion,
} from "./AIEngine";

export type AITaskStatus = "idle" | "running" | "done" | "error";

interface AIState {
  // Collision
  collisionReport: CollisionReport | null;
  collisionStatus: AITaskStatus;
  setCollisionReport: (r: CollisionReport | null) => void;
  setCollisionStatus: (s: AITaskStatus) => void;

  // Landmarks
  landmarks: Landmark[];
  landmarkStatus: AITaskStatus;
  showLandmarks: boolean;
  setLandmarks: (l: Landmark[]) => void;
  setLandmarkStatus: (s: AITaskStatus) => void;
  setShowLandmarks: (v: boolean) => void;

  // Gingiva
  gingivaSegmentation: GingivaSegmentation | null;
  gingivaStatus: AITaskStatus;
  showGingiva: boolean;
  setGingivaSegmentation: (g: GingivaSegmentation | null) => void;
  setGingivaStatus: (s: AITaskStatus) => void;
  setShowGingiva: (v: boolean) => void;

  // Arch form
  archFormAnalysis: ArchFormAnalysis | null;
  archFormStatus: AITaskStatus;
  setArchFormAnalysis: (a: ArchFormAnalysis | null) => void;
  setArchFormStatus: (s: AITaskStatus) => void;

  // Treatment prediction
  treatmentPrediction: TreatmentPrediction | null;
  treatmentStatus: AITaskStatus;
  setTreatmentPrediction: (t: TreatmentPrediction | null) => void;
  setTreatmentStatus: (s: AITaskStatus) => void;

  // Tooth numbering
  toothNumbering: ToothNumberingResult | null;
  numberingStatus: AITaskStatus;
  setToothNumbering: (r: ToothNumberingResult | null) => void;
  setNumberingStatus: (s: AITaskStatus) => void;

  // Alignment suggestions
  alignmentSuggestions: AlignmentSuggestion[];
  alignmentStatus: AITaskStatus;
  setAlignmentSuggestions: (s: AlignmentSuggestion[]) => void;
  setAlignmentStatus: (s: AITaskStatus) => void;

  // Global reset
  clearAll: () => void;
}

export const useAIStore = create<AIState>((set) => ({
  collisionReport: null,
  collisionStatus: "idle",
  setCollisionReport: (r) => set({ collisionReport: r }),
  setCollisionStatus: (s) => set({ collisionStatus: s }),

  landmarks: [],
  landmarkStatus: "idle",
  showLandmarks: false,
  setLandmarks: (l) => set({ landmarks: l }),
  setLandmarkStatus: (s) => set({ landmarkStatus: s }),
  setShowLandmarks: (v) => set({ showLandmarks: v }),

  gingivaSegmentation: null,
  gingivaStatus: "idle",
  showGingiva: false,
  setGingivaSegmentation: (g) => set({ gingivaSegmentation: g }),
  setGingivaStatus: (s) => set({ gingivaStatus: s }),
  setShowGingiva: (v) => set({ showGingiva: v }),

  archFormAnalysis: null,
  archFormStatus: "idle",
  setArchFormAnalysis: (a) => set({ archFormAnalysis: a }),
  setArchFormStatus: (s) => set({ archFormStatus: s }),

  treatmentPrediction: null,
  treatmentStatus: "idle",
  setTreatmentPrediction: (t) => set({ treatmentPrediction: t }),
  setTreatmentStatus: (s) => set({ treatmentStatus: s }),

  toothNumbering: null,
  numberingStatus: "idle",
  setToothNumbering: (r) => set({ toothNumbering: r }),
  setNumberingStatus: (s) => set({ numberingStatus: s }),

  alignmentSuggestions: [],
  alignmentStatus: "idle",
  setAlignmentSuggestions: (s) => set({ alignmentSuggestions: s }),
  setAlignmentStatus: (s) => set({ alignmentStatus: s }),

  clearAll: () => set({
    collisionReport: null, collisionStatus: "idle",
    landmarks: [], landmarkStatus: "idle",
    gingivaSegmentation: null, gingivaStatus: "idle",
    archFormAnalysis: null, archFormStatus: "idle",
    treatmentPrediction: null, treatmentStatus: "idle",
    toothNumbering: null, numberingStatus: "idle",
    alignmentSuggestions: [], alignmentStatus: "idle",
  }),
}));
