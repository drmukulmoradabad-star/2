import { create } from "zustand";
import type { SculptTool, FalloffCurve } from "./SculptEngine";
import * as THREE from "three";

export type { SculptTool };

export interface BrushHit {
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

/** A named sculpt layer — stores per-vertex position DELTAS from the base mesh. */
export interface SculptLayer {
  id: string;
  name: string;
  deltas: Float32Array | null;   // null = not yet modified (saves memory)
  visible: boolean;
  opacity: number;               // 0..1
}

export type MaskMode = "off" | "paint" | "erase";

const MAX_UNDO = 32;
let _layerCounter = 1;

interface SculptState {
  // ── Active sculpt tool ───────────────────────────────────────────────────
  activeSculptTool: SculptTool | null;
  setActiveSculptTool: (t: SculptTool | null) => void;

  // ── Brush params ────────────────────────────────────────────────────────
  brushRadius: number;
  brushStrength: number;
  brushFalloff: FalloffCurve;
  setBrushRadius: (v: number) => void;
  setBrushStrength: (v: number) => void;
  setBrushFalloff: (v: FalloffCurve) => void;

  // ── Symmetry ─────────────────────────────────────────────────────────────
  symmetryEnabled: boolean;
  symmetryAxis: "x" | "y" | "z";
  setSymmetryEnabled: (v: boolean) => void;
  setSymmetryAxis: (v: "x" | "y" | "z") => void;

  // ── Runtime state ────────────────────────────────────────────────────────
  isSculpting: boolean;
  setIsSculpting: (v: boolean) => void;
  brushHit: BrushHit | null;
  setBrushHit: (h: BrushHit | null) => void;

  // ── Undo / redo ──────────────────────────────────────────────────────────
  undoStack: Float32Array[];
  redoStack: Float32Array[];
  pushUndo: (snapshot: Float32Array) => void;
  undo: () => Float32Array | null;
  redo: (current: Float32Array) => Float32Array | null;
  clearHistory: () => void;

  // ── Mask ─────────────────────────────────────────────────────────────────
  maskMode: MaskMode;
  /** Per-vertex mask weights [0..1]. 0=fully locked, 1=fully deformable. */
  maskWeights: Float32Array | null;
  setMaskMode: (m: MaskMode) => void;
  initMask: (vertCount: number) => void;
  clearMask: () => void;
  invertMask: () => void;
  fillMask: () => void;        // lock everything
  clearAllMask: () => void;   // unlock everything

  // ── Sculpt Layers ─────────────────────────────────────────────────────────
  layers: SculptLayer[];
  activeLayerIdx: number;
  /** Base (pre-sculpt) positions, captured when sculpt mode is first entered. */
  basePositions: Float32Array | null;
  setBasePositions: (p: Float32Array) => void;
  addLayer: () => void;
  deleteLayer: (idx: number) => void;
  renameLayer: (idx: number, name: string) => void;
  setLayerVisible: (idx: number, v: boolean) => void;
  setLayerOpacity: (idx: number, v: number) => void;
  setActiveLayerIdx: (idx: number) => void;
  mergeLayerDown: (idx: number) => void;

  // ── Constraints / stability ───────────────────────────────────────────────
  constraintsEnabled: boolean;
  maxDisplacement: number;
  autoSmooth: boolean;
  autoSmoothStrength: number;
  setConstraintsEnabled: (v: boolean) => void;
  setMaxDisplacement: (v: number) => void;
  setAutoSmooth: (v: boolean) => void;
  setAutoSmoothStrength: (v: number) => void;

  // ── Stats ────────────────────────────────────────────────────────────────
  strokeCount: number;
  incStrokeCount: () => void;
}

export const useSculptStore = create<SculptState>((set, get) => ({
  // ── Tool ────────────────────────────────────────────────────────────────
  activeSculptTool: null,
  setActiveSculptTool: (t) => set({ activeSculptTool: t }),

  // ── Brush ────────────────────────────────────────────────────────────────
  brushRadius: 0.4,
  brushStrength: 0.3,
  brushFalloff: "smooth",
  setBrushRadius: (v) => set({ brushRadius: Math.max(0.02, Math.min(5, v)) }),
  setBrushStrength: (v) => set({ brushStrength: Math.max(0.01, Math.min(1, v)) }),
  setBrushFalloff: (v) => set({ brushFalloff: v }),

  // ── Symmetry ─────────────────────────────────────────────────────────────
  symmetryEnabled: false,
  symmetryAxis: "x",
  setSymmetryEnabled: (v) => set({ symmetryEnabled: v }),
  setSymmetryAxis: (v) => set({ symmetryAxis: v }),

  // ── Runtime ──────────────────────────────────────────────────────────────
  isSculpting: false,
  setIsSculpting: (v) => set({ isSculpting: v }),
  brushHit: null,
  setBrushHit: (h) => set({ brushHit: h }),

  // ── Undo ─────────────────────────────────────────────────────────────────
  undoStack: [],
  redoStack: [],
  pushUndo: (snapshot) =>
    set((s) => ({
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), snapshot],
      redoStack: [],
    })),
  undo: () => {
    const { undoStack } = get();
    if (!undoStack.length) return null;
    const top = undoStack[undoStack.length - 1];
    set((s) => ({ undoStack: s.undoStack.slice(0, -1) }));
    return top;
  },
  redo: (current) => {
    const { redoStack } = get();
    if (!redoStack.length) return null;
    const top = redoStack[redoStack.length - 1];
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, current.slice()],
    }));
    return top;
  },
  clearHistory: () => set({ undoStack: [], redoStack: [] }),

  // ── Mask ──────────────────────────────────────────────────────────────────
  maskMode: "off",
  maskWeights: null,
  setMaskMode: (m) => set({ maskMode: m }),
  initMask: (vertCount) => {
    const { maskWeights } = get();
    if (!maskWeights || maskWeights.length !== vertCount) {
      const w = new Float32Array(vertCount);
      w.fill(1);
      set({ maskWeights: w });
    }
  },
  clearMask: () => {
    const { maskWeights } = get();
    if (maskWeights) { maskWeights.fill(1); set({ maskWeights: maskWeights.slice() }); }
  },
  invertMask: () => {
    const { maskWeights } = get();
    if (maskWeights) {
      for (let i = 0; i < maskWeights.length; i++) maskWeights[i] = 1 - maskWeights[i];
      set({ maskWeights: maskWeights.slice() });
    }
  },
  fillMask: () => {
    const { maskWeights } = get();
    if (maskWeights) { maskWeights.fill(0); set({ maskWeights: maskWeights.slice() }); }
  },
  clearAllMask: () => {
    const { maskWeights } = get();
    if (maskWeights) { maskWeights.fill(1); set({ maskWeights: maskWeights.slice() }); }
  },

  // ── Layers ────────────────────────────────────────────────────────────────
  layers: [{ id: "base", name: "Base", deltas: null, visible: true, opacity: 1 }],
  activeLayerIdx: 0,
  basePositions: null,
  setBasePositions: (p) => set({ basePositions: p }),
  addLayer: () =>
    set((s) => ({
      layers: [
        ...s.layers,
        {
          id: `layer_${_layerCounter++}`,
          name: `Layer ${_layerCounter}`,
          deltas: null,
          visible: true,
          opacity: 1,
        },
      ],
      activeLayerIdx: s.layers.length,
    })),
  deleteLayer: (idx) =>
    set((s) => {
      if (s.layers.length <= 1) return s;
      const layers = s.layers.filter((_, i) => i !== idx);
      return { layers, activeLayerIdx: Math.min(s.activeLayerIdx, layers.length - 1) };
    }),
  renameLayer: (idx, name) =>
    set((s) => {
      const layers = [...s.layers];
      layers[idx] = { ...layers[idx], name };
      return { layers };
    }),
  setLayerVisible: (idx, v) =>
    set((s) => {
      const layers = [...s.layers];
      layers[idx] = { ...layers[idx], visible: v };
      return { layers };
    }),
  setLayerOpacity: (idx, v) =>
    set((s) => {
      const layers = [...s.layers];
      layers[idx] = { ...layers[idx], opacity: v };
      return { layers };
    }),
  setActiveLayerIdx: (idx) => set({ activeLayerIdx: idx }),
  mergeLayerDown: (idx) =>
    set((s) => {
      if (idx === 0 || !s.basePositions) return s;
      // Flatten layers[idx] into layers[idx-1]
      const above = s.layers[idx];
      const below = s.layers[idx - 1];
      if (!above.deltas) return s;
      const newDeltas = below.deltas ? below.deltas.slice() : new Float32Array(above.deltas.length);
      for (let i = 0; i < newDeltas.length; i++) {
        newDeltas[i] += (above.deltas[i] ?? 0) * above.opacity;
      }
      const layers = [...s.layers];
      layers[idx - 1] = { ...below, deltas: newDeltas };
      return { layers: layers.filter((_, i) => i !== idx), activeLayerIdx: Math.max(0, idx - 1) };
    }),

  // ── Constraints ───────────────────────────────────────────────────────────
  constraintsEnabled: false,
  maxDisplacement: 1.5,
  autoSmooth: false,
  autoSmoothStrength: 0.4,
  setConstraintsEnabled: (v) => set({ constraintsEnabled: v }),
  setMaxDisplacement: (v) => set({ maxDisplacement: v }),
  setAutoSmooth: (v) => set({ autoSmooth: v }),
  setAutoSmoothStrength: (v) => set({ autoSmoothStrength: v }),

  // ── Stats ─────────────────────────────────────────────────────────────────
  strokeCount: 0,
  incStrokeCount: () => set((s) => ({ strokeCount: s.strokeCount + 1 })),
}));
