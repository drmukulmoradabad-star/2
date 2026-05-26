import { create } from "zustand";
import * as THREE from "three";
import type { RepairResult } from "./MeshEditEngine";

export type MeshEditTool =
  | "smooth"
  | "decimate"
  | "fill_holes"
  | "repair"
  | "sculpt_push"
  | "sculpt_pull"
  | "sculpt_smooth"
  | "sculpt_flatten"
  | "trim_x"
  | "trim_y"
  | "trim_z"
  | "margin_line"
  | "remesh"
  | "none";

export type OperationStatus = "idle" | "running" | "done" | "error";

export interface MeshEditHistoryEntry {
  label: string;
  geometry: THREE.BufferGeometry;
  timestamp: number;
}

interface MeshEditState {
  activeTool: MeshEditTool;
  setActiveTool: (t: MeshEditTool) => void;

  // Smooth
  smoothIterations: number;
  smoothFactor: number;
  smoothPreserveBoundary: boolean;
  setSmoothIterations: (v: number) => void;
  setSmoothFactor: (v: number) => void;
  setSmoothPreserveBoundary: (v: boolean) => void;

  // Decimate
  decimateRatio: number;
  decimatePreserveBoundary: boolean;
  setDecimateRatio: (v: number) => void;
  setDecimatePreserveBoundary: (v: boolean) => void;

  // Fill Holes
  fillMaxEdges: number;
  fillSmooth: boolean;
  setFillMaxEdges: (v: number) => void;
  setFillSmooth: (v: boolean) => void;
  holesFilled: number;
  setHolesFilled: (n: number) => void;

  // Repair results
  repairResult: Omit<RepairResult, "geometry"> | null;
  setRepairResult: (r: Omit<RepairResult, "geometry"> | null) => void;

  // Sculpt
  sculptRadius: number;
  sculptStrength: number;
  sculptFalloff: "linear" | "smooth" | "sharp";
  setSculptRadius: (v: number) => void;
  setSculptStrength: (v: number) => void;
  setSculptFalloff: (v: "linear" | "smooth" | "sharp") => void;

  // Trim
  trimAxis: "x" | "y" | "z";
  trimPosition: number;
  trimKeepSide: "positive" | "negative";
  setTrimAxis: (v: "x" | "y" | "z") => void;
  setTrimPosition: (v: number) => void;
  setTrimKeepSide: (v: "positive" | "negative") => void;

  // Remesh
  remeshEdgeLength: number;
  setRemeshEdgeLength: (v: number) => void;

  // Margin line
  marginCurvatureThreshold: number;
  setMarginCurvatureThreshold: (v: number) => void;
  marginPointCount: number;
  setMarginPointCount: (n: number) => void;
  showMarginLine: boolean;
  setShowMarginLine: (v: boolean) => void;

  // Operation statuses
  statuses: Record<string, OperationStatus>;
  setStatus: (op: string, status: OperationStatus) => void;

  // History (for undo within mesh edit)
  history: MeshEditHistoryEntry[];
  pushHistory: (label: string, geo: THREE.BufferGeometry) => void;
  popHistory: () => THREE.BufferGeometry | null;
  clearHistory: () => void;
}

export const useMeshEditStore = create<MeshEditState>((set, get) => ({
  activeTool: "none",
  setActiveTool: (t) => set({ activeTool: t }),

  smoothIterations: 3,
  smoothFactor: 0.5,
  smoothPreserveBoundary: true,
  setSmoothIterations: (v) => set({ smoothIterations: v }),
  setSmoothFactor: (v) => set({ smoothFactor: v }),
  setSmoothPreserveBoundary: (v) => set({ smoothPreserveBoundary: v }),

  decimateRatio: 0.5,
  decimatePreserveBoundary: true,
  setDecimateRatio: (v) => set({ decimateRatio: v }),
  setDecimatePreserveBoundary: (v) => set({ decimatePreserveBoundary: v }),

  fillMaxEdges: 100,
  fillSmooth: true,
  setFillMaxEdges: (v) => set({ fillMaxEdges: v }),
  setFillSmooth: (v) => set({ fillSmooth: v }),
  holesFilled: 0,
  setHolesFilled: (n) => set({ holesFilled: n }),

  repairResult: null,
  setRepairResult: (r) => set({ repairResult: r }),

  sculptRadius: 0.5,
  sculptStrength: 0.3,
  sculptFalloff: "smooth",
  setSculptRadius: (v) => set({ sculptRadius: v }),
  setSculptStrength: (v) => set({ sculptStrength: v }),
  setSculptFalloff: (v) => set({ sculptFalloff: v }),

  trimAxis: "y",
  trimPosition: 0,
  trimKeepSide: "positive",
  setTrimAxis: (v) => set({ trimAxis: v }),
  setTrimPosition: (v) => set({ trimPosition: v }),
  setTrimKeepSide: (v) => set({ trimKeepSide: v }),

  remeshEdgeLength: 0.5,
  setRemeshEdgeLength: (v) => set({ remeshEdgeLength: v }),

  marginCurvatureThreshold: 0.4,
  setMarginCurvatureThreshold: (v) => set({ marginCurvatureThreshold: v }),
  marginPointCount: 0,
  setMarginPointCount: (n) => set({ marginPointCount: n }),
  showMarginLine: true,
  setShowMarginLine: (v) => set({ showMarginLine: v }),

  statuses: {},
  setStatus: (op, status) =>
    set((s) => ({ statuses: { ...s.statuses, [op]: status } })),

  history: [],
  pushHistory: (label, geo) =>
    set((s) => ({
      history: [
        ...s.history.slice(-9),
        { label, geometry: geo.clone(), timestamp: Date.now() },
      ],
    })),
  popHistory: () => {
    const h = get().history;
    if (h.length === 0) return null;
    const last = h[h.length - 1];
    set({ history: h.slice(0, -1) });
    return last.geometry;
  },
  clearHistory: () => set({ history: [] }),
}));
