/**
 * archEditStore — state management for interactive jaw & arch editing.
 *
 * Tracks arch curve control points, editing modes, presets, region masks,
 * and per-operation undo/redo separate from the sculpt undo stack.
 */

import { create } from "zustand";
import * as THREE from "three";

export type ArchPreset = "ovoid" | "tapered" | "square" | "narrow" | "broadU";
export type ArchRegion = "all" | "anterior" | "posterior" | "left" | "right" | "anteriorLeft" | "anteriorRight";
export type ArchEditTool =
  | "curve"       // interactive spline control points
  | "width"       // lateral width brush
  | "expand"      // arch expansion/contraction
  | "ridge"       // gingival ridge sculpt
  | "torque"      // arch torque/roll
  | "level";      // occlusal leveling

const MAX_ARCH_UNDO = 24;

export interface ArchControlPoint {
  id: string;
  position: THREE.Vector3;       // current position in local geometry space
  restPosition: THREE.Vector3;   // original position when arch was initialized
  influenceRadius: number;       // how far this CP affects nearby vertices
}

interface ArchEditState {
  // ── Mode ────────────────────────────────────────────────────────────────────
  isArchEditMode: boolean;
  activeArchTool: ArchEditTool;
  setIsArchEditMode: (v: boolean) => void;
  setActiveArchTool: (t: ArchEditTool) => void;

  // ── Arch curve control points ────────────────────────────────────────────
  controlPoints: ArchControlPoint[];
  selectedPointId: string | null;
  showCurve: boolean;
  isDraggingPoint: boolean;
  setControlPoints: (pts: ArchControlPoint[]) => void;
  setSelectedPointId: (id: string | null) => void;
  setShowCurve: (v: boolean) => void;
  setIsDraggingPoint: (v: boolean) => void;
  updateControlPoint: (id: string, newPos: THREE.Vector3) => void;
  resetControlPoints: () => void;

  // ── Preset arch forms ────────────────────────────────────────────────────
  activePreset: ArchPreset | null;
  setActivePreset: (p: ArchPreset | null) => void;

  // ── Region masking ───────────────────────────────────────────────────────
  activeRegion: ArchRegion;
  setActiveRegion: (r: ArchRegion) => void;

  // ── Deformation parameters ───────────────────────────────────────────────
  deformStrength: number;
  deformFalloff: number;           // sigma for Gaussian falloff
  toothIntegrityLock: boolean;     // prevent extreme distortion
  gingivaOnlyMode: boolean;        // restrict edits to gingival region
  symmetryEnabled: boolean;
  setDeformStrength: (v: number) => void;
  setDeformFalloff: (v: number) => void;
  setToothIntegrityLock: (v: boolean) => void;
  setGingivaOnlyMode: (v: boolean) => void;
  setSymmetryEnabled: (v: boolean) => void;

  // ── Asymmetric width ─────────────────────────────────────────────────────
  leftWidthFactor: number;
  rightWidthFactor: number;
  setLeftWidthFactor: (v: number) => void;
  setRightWidthFactor: (v: number) => void;

  // ── Undo / redo ──────────────────────────────────────────────────────────
  undoStack: Float32Array[];
  redoStack: Float32Array[];
  pushUndo: (snapshot: Float32Array) => void;
  undo: () => Float32Array | null;
  redo: (current: Float32Array) => Float32Array | null;
  clearHistory: () => void;

  // ── Stats ────────────────────────────────────────────────────────────────
  opCount: number;
  incOpCount: () => void;
  
  // ── Arch analysis cache ──────────────────────────────────────────────────
  archWidth: number;
  archDepth: number;
  archHeight: number;
  archCentroid: THREE.Vector3 | null;
  setArchAnalysis: (w: number, d: number, h: number, c: THREE.Vector3) => void;
}

let _cpCounter = 0;

export const useArchEditStore = create<ArchEditState>((set, get) => ({
  // ── Mode ─────────────────────────────────────────────────────────────────
  isArchEditMode: false,
  activeArchTool: "curve",
  setIsArchEditMode: (v) => set({ isArchEditMode: v }),
  setActiveArchTool: (t) => set({ activeArchTool: t }),

  // ── Control points ────────────────────────────────────────────────────────
  controlPoints: [],
  selectedPointId: null,
  showCurve: true,
  isDraggingPoint: false,
  setControlPoints: (pts) => set({ controlPoints: pts }),
  setSelectedPointId: (id) => set({ selectedPointId: id }),
  setShowCurve: (v) => set({ showCurve: v }),
  setIsDraggingPoint: (v) => set({ isDraggingPoint: v }),
  updateControlPoint: (id, newPos) =>
    set((s) => ({
      controlPoints: s.controlPoints.map((cp) =>
        cp.id === id ? { ...cp, position: newPos.clone() } : cp
      ),
    })),
  resetControlPoints: () =>
    set((s) => ({
      controlPoints: s.controlPoints.map((cp) => ({
        ...cp,
        position: cp.restPosition.clone(),
      })),
    })),

  // ── Presets ───────────────────────────────────────────────────────────────
  activePreset: null,
  setActivePreset: (p) => set({ activePreset: p }),

  // ── Region ────────────────────────────────────────────────────────────────
  activeRegion: "all",
  setActiveRegion: (r) => set({ activeRegion: r }),

  // ── Params ────────────────────────────────────────────────────────────────
  deformStrength: 0.5,
  deformFalloff: 1.0,
  toothIntegrityLock: true,
  gingivaOnlyMode: false,
  symmetryEnabled: false,
  setDeformStrength: (v) => set({ deformStrength: Math.max(0.01, Math.min(1, v)) }),
  setDeformFalloff: (v) => set({ deformFalloff: Math.max(0.1, Math.min(5, v)) }),
  setToothIntegrityLock: (v) => set({ toothIntegrityLock: v }),
  setGingivaOnlyMode: (v) => set({ gingivaOnlyMode: v }),
  setSymmetryEnabled: (v) => set({ symmetryEnabled: v }),

  // ── Asymmetric width ──────────────────────────────────────────────────────
  leftWidthFactor: 1.0,
  rightWidthFactor: 1.0,
  setLeftWidthFactor: (v) => set({ leftWidthFactor: Math.max(0.5, Math.min(2, v)) }),
  setRightWidthFactor: (v) => set({ rightWidthFactor: Math.max(0.5, Math.min(2, v)) }),

  // ── Undo ──────────────────────────────────────────────────────────────────
  undoStack: [],
  redoStack: [],
  pushUndo: (snapshot) =>
    set((s) => ({
      undoStack: [...s.undoStack.slice(-(MAX_ARCH_UNDO - 1)), snapshot],
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

  // ── Stats ─────────────────────────────────────────────────────────────────
  opCount: 0,
  incOpCount: () => set((s) => ({ opCount: s.opCount + 1 })),

  // ── Analysis cache ────────────────────────────────────────────────────────
  archWidth: 0,
  archDepth: 0,
  archHeight: 0,
  archCentroid: null,
  setArchAnalysis: (w, d, h, c) =>
    set({ archWidth: w, archDepth: d, archHeight: h, archCentroid: c.clone() }),
}));

/** Create a unique control point ID */
export function makeControlPointId(): string {
  return `cp_${++_cpCounter}_${Date.now()}`;
}
