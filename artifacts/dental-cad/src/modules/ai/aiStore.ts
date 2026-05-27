import { create } from "zustand";
import type {
  CollisionReport,
  Landmark,
  GingivaSegmentation,
  ArchFormAnalysis,
  TreatmentPrediction,
  ToothNumberingResult,
  AlignmentSuggestion,
  SpacingAnalysis,
  RotationAnalysis,
  MidlineDeviation,
  OverbiteOverjet,
  AlignmentScore,
  RealtimeWarning,
  MovementArrow,
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

  // ── v2 additions ───────────────────────────────────────────────────────────

  // Spacing & crowding
  spacingAnalysis: SpacingAnalysis | null;
  spacingStatus: AITaskStatus;
  setSpacingAnalysis: (a: SpacingAnalysis | null) => void;
  setSpacingStatus: (s: AITaskStatus) => void;

  // Rotation
  rotationAnalysis: RotationAnalysis | null;
  rotationStatus: AITaskStatus;
  setRotationAnalysis: (a: RotationAnalysis | null) => void;
  setRotationStatus: (s: AITaskStatus) => void;

  // Midline
  midlineDeviation: MidlineDeviation | null;
  midlineStatus: AITaskStatus;
  setMidlineDeviation: (m: MidlineDeviation | null) => void;
  setMidlineStatus: (s: AITaskStatus) => void;

  // Overbite/Overjet
  overbiteOverjet: OverbiteOverjet | null;
  overbiteStatus: AITaskStatus;
  setOverbiteOverjet: (o: OverbiteOverjet | null) => void;
  setOverbiteStatus: (s: AITaskStatus) => void;

  // Alignment score
  alignmentScore: AlignmentScore | null;
  alignmentScoreStatus: AITaskStatus;
  setAlignmentScore: (s: AlignmentScore | null) => void;
  setAlignmentScoreStatus: (s: AITaskStatus) => void;

  // Real-time warnings
  realtimeWarnings: RealtimeWarning[];
  warningsEnabled: boolean;
  setRealtimeWarnings: (w: RealtimeWarning[]) => void;
  setWarningsEnabled: (v: boolean) => void;
  dismissWarning: (id: string) => void;
  dismissedWarnings: Set<string>;

  // Movement arrows (3D overlay)
  movementArrows: MovementArrow[];
  showMovementArrows: boolean;
  setMovementArrows: (a: MovementArrow[]) => void;
  setShowMovementArrows: (v: boolean) => void;

  // Overlay toggles
  showCollisionHeatmap: boolean;
  showSymmetryGuide: boolean;
  showMidlineGuide: boolean;
  showIdealArch: boolean;
  setShowCollisionHeatmap: (v: boolean) => void;
  setShowSymmetryGuide: (v: boolean) => void;
  setShowMidlineGuide: (v: boolean) => void;
  setShowIdealArch: (v: boolean) => void;

  // Dismissed suggestions
  dismissedSuggestions: Set<string>;
  dismissSuggestion: (id: string) => void;
  restoreSuggestions: () => void;

  // Global
  lastRunAll: number | null;
  setLastRunAll: (t: number) => void;
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

  spacingAnalysis: null,
  spacingStatus: "idle",
  setSpacingAnalysis: (a) => set({ spacingAnalysis: a }),
  setSpacingStatus: (s) => set({ spacingStatus: s }),

  rotationAnalysis: null,
  rotationStatus: "idle",
  setRotationAnalysis: (a) => set({ rotationAnalysis: a }),
  setRotationStatus: (s) => set({ rotationStatus: s }),

  midlineDeviation: null,
  midlineStatus: "idle",
  setMidlineDeviation: (m) => set({ midlineDeviation: m }),
  setMidlineStatus: (s) => set({ midlineStatus: s }),

  overbiteOverjet: null,
  overbiteStatus: "idle",
  setOverbiteOverjet: (o) => set({ overbiteOverjet: o }),
  setOverbiteStatus: (s) => set({ overbiteStatus: s }),

  alignmentScore: null,
  alignmentScoreStatus: "idle",
  setAlignmentScore: (s) => set({ alignmentScore: s }),
  setAlignmentScoreStatus: (s) => set({ alignmentScoreStatus: s }),

  realtimeWarnings: [],
  warningsEnabled: true,
  dismissedWarnings: new Set(),
  setRealtimeWarnings: (w) => set({ realtimeWarnings: w }),
  setWarningsEnabled: (v) => set({ warningsEnabled: v }),
  dismissWarning: (id) => set((st) => ({
    dismissedWarnings: new Set([...st.dismissedWarnings, id]),
  })),

  movementArrows: [],
  showMovementArrows: false,
  setMovementArrows: (a) => set({ movementArrows: a }),
  setShowMovementArrows: (v) => set({ showMovementArrows: v }),

  showCollisionHeatmap: false,
  showSymmetryGuide: false,
  showMidlineGuide: false,
  showIdealArch: false,
  setShowCollisionHeatmap: (v) => set({ showCollisionHeatmap: v }),
  setShowSymmetryGuide: (v) => set({ showSymmetryGuide: v }),
  setShowMidlineGuide: (v) => set({ showMidlineGuide: v }),
  setShowIdealArch: (v) => set({ showIdealArch: v }),

  dismissedSuggestions: new Set(),
  dismissSuggestion: (id) => set((st) => ({
    dismissedSuggestions: new Set([...st.dismissedSuggestions, id]),
  })),
  restoreSuggestions: () => set({ dismissedSuggestions: new Set() }),

  lastRunAll: null,
  setLastRunAll: (t) => set({ lastRunAll: t }),

  clearAll: () => set({
    collisionReport: null, collisionStatus: "idle",
    landmarks: [], landmarkStatus: "idle",
    gingivaSegmentation: null, gingivaStatus: "idle",
    archFormAnalysis: null, archFormStatus: "idle",
    treatmentPrediction: null, treatmentStatus: "idle",
    toothNumbering: null, numberingStatus: "idle",
    alignmentSuggestions: [], alignmentStatus: "idle",
    spacingAnalysis: null, spacingStatus: "idle",
    rotationAnalysis: null, rotationStatus: "idle",
    midlineDeviation: null, midlineStatus: "idle",
    overbiteOverjet: null, overbiteStatus: "idle",
    alignmentScore: null, alignmentScoreStatus: "idle",
    realtimeWarnings: [], movementArrows: [],
    dismissedWarnings: new Set(), dismissedSuggestions: new Set(),
    lastRunAll: null,
  }),
}));
