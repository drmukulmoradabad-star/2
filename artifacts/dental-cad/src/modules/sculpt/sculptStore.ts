import { create } from "zustand";
import type { SculptTool, FalloffCurve } from "./SculptEngine";
import * as THREE from "three";

export type { SculptTool };

export interface BrushHit {
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

const MAX_UNDO = 24;

interface SculptState {
  // Active sculpt tool (null = sculpt mode off)
  activeSculptTool: SculptTool | null;
  setActiveSculptTool: (t: SculptTool | null) => void;

  // Brush params
  brushRadius: number;
  brushStrength: number;
  brushFalloff: FalloffCurve;
  setBrushRadius: (v: number) => void;
  setBrushStrength: (v: number) => void;
  setBrushFalloff: (v: FalloffCurve) => void;

  // Symmetry
  symmetryEnabled: boolean;
  symmetryAxis: "x" | "y" | "z";
  setSymmetryEnabled: (v: boolean) => void;
  setSymmetryAxis: (v: "x" | "y" | "z") => void;

  // Runtime state
  isSculpting: boolean;
  setIsSculpting: (v: boolean) => void;
  brushHit: BrushHit | null;
  setBrushHit: (h: BrushHit | null) => void;

  // Undo stack (stores Float32Array snapshots of vertex positions)
  undoStack: Float32Array[];
  redoStack: Float32Array[];
  pushUndo: (snapshot: Float32Array) => void;
  undo: () => Float32Array | null;
  redo: (current: Float32Array) => Float32Array | null;
  clearHistory: () => void;

  // Stats
  strokeCount: number;
  incStrokeCount: () => void;
}

export const useSculptStore = create<SculptState>((set, get) => ({
  activeSculptTool: null,
  setActiveSculptTool: (t) => set({ activeSculptTool: t }),

  brushRadius: 0.4,
  brushStrength: 0.3,
  brushFalloff: "smooth",
  setBrushRadius: (v) => set({ brushRadius: v }),
  setBrushStrength: (v) => set({ brushStrength: v }),
  setBrushFalloff: (v) => set({ brushFalloff: v }),

  symmetryEnabled: false,
  symmetryAxis: "x",
  setSymmetryEnabled: (v) => set({ symmetryEnabled: v }),
  setSymmetryAxis: (v) => set({ symmetryAxis: v }),

  isSculpting: false,
  setIsSculpting: (v) => set({ isSculpting: v }),
  brushHit: null,
  setBrushHit: (h) => set({ brushHit: h }),

  undoStack: [],
  redoStack: [],
  pushUndo: (snapshot) =>
    set((s) => ({
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), snapshot],
      redoStack: [],
    })),
  undo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return null;
    const top = undoStack[undoStack.length - 1];
    set((s) => ({ undoStack: s.undoStack.slice(0, -1) }));
    return top;
  },
  redo: (current) => {
    const { redoStack } = get();
    if (redoStack.length === 0) return null;
    const top = redoStack[redoStack.length - 1];
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, current.slice()],
    }));
    return top;
  },
  clearHistory: () => set({ undoStack: [], redoStack: [] }),

  strokeCount: 0,
  incStrokeCount: () => set((s) => ({ strokeCount: s.strokeCount + 1 })),
}));
