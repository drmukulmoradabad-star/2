import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as THREE from "three";

export interface ToothTransform {
  segmentId: string;
  position: [number, number, number];
  rotation: [number, number, number]; // euler XYZ in radians
  scale: [number, number, number];
  isLocked: boolean;
}

interface HistoryEntry {
  transforms: Record<string, ToothTransform>;
  label: string;
}

export type TransformMode = "translate" | "rotate" | "scale";
export type TransformSpace = "local" | "world";

interface MovementState {
  // Per-tooth transforms
  transforms: Record<string, ToothTransform>;
  getTransform: (id: string) => ToothTransform;
  setTransform: (id: string, t: Partial<ToothTransform>) => void;
  resetTransform: (id: string) => void;
  resetAllTransforms: () => void;
  initTransform: (id: string) => void;

  // History (undo/redo)
  history: HistoryEntry[];
  historyIndex: number;
  pushHistory: (label: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Gizmo state
  activeSegmentId: string | null;
  setActiveSegmentId: (id: string | null) => void;
  transformMode: TransformMode;
  setTransformMode: (m: TransformMode) => void;
  transformSpace: TransformSpace;
  setTransformSpace: (s: TransformSpace) => void;

  // Snap
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  snapTranslation: number; // mm
  setSnapTranslation: (v: number) => void;
  snapRotation: number; // degrees
  setSnapRotation: (v: number) => void;

  // Collision
  collisionEnabled: boolean;
  setCollisionEnabled: (v: boolean) => void;
  collidingPairs: [string, string][];
  setCollidingPairs: (pairs: [string, string][]) => void;
}

const DEFAULT_TRANSFORM: Omit<ToothTransform, "segmentId"> = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  isLocked: false,
};

export const useMovementStore = create<MovementState>()(
  persist(
    (set, get) => ({
      transforms: {},

      getTransform: (id) =>
        get().transforms[id] ?? { segmentId: id, ...DEFAULT_TRANSFORM },

      setTransform: (id, patch) =>
        set((s) => ({
          transforms: {
            ...s.transforms,
            [id]: { ...get().getTransform(id), ...patch },
          },
        })),

      resetTransform: (id) =>
        set((s) => ({
          transforms: {
            ...s.transforms,
            [id]: { segmentId: id, ...DEFAULT_TRANSFORM },
          },
        })),

      resetAllTransforms: () => {
        const { transforms } = get();
        const reset: Record<string, ToothTransform> = {};
        for (const id of Object.keys(transforms)) {
          reset[id] = { segmentId: id, ...DEFAULT_TRANSFORM };
        }
        set({ transforms: reset });
      },

      initTransform: (id) => {
        const { transforms } = get();
        if (!transforms[id]) {
          set((s) => ({
            transforms: {
              ...s.transforms,
              [id]: { segmentId: id, ...DEFAULT_TRANSFORM },
            },
          }));
        }
      },

      // History
      history: [],
      historyIndex: -1,

      pushHistory: (label) => {
        const { transforms, history, historyIndex } = get();
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push({ transforms: structuredClone(transforms), label });
        // Cap history at 50
        const capped = newHistory.slice(-50);
        set({ history: capped, historyIndex: capped.length - 1 });
      },

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex <= 0) return;
        const prev = history[historyIndex - 1];
        set({ transforms: structuredClone(prev.transforms), historyIndex: historyIndex - 1 });
      },

      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex >= history.length - 1) return;
        const next = history[historyIndex + 1];
        set({ transforms: structuredClone(next.transforms), historyIndex: historyIndex + 1 });
      },

      canUndo: () => get().historyIndex > 0,
      canRedo: () => get().historyIndex < get().history.length - 1,

      // Gizmo
      activeSegmentId: null,
      setActiveSegmentId: (id) => set({ activeSegmentId: id }),
      transformMode: "translate",
      setTransformMode: (m) => set({ transformMode: m }),
      transformSpace: "local",
      setTransformSpace: (s) => set({ transformSpace: s }),

      // Snap
      snapEnabled: false,
      setSnapEnabled: (v) => set({ snapEnabled: v }),
      snapTranslation: 0.1,
      setSnapTranslation: (v) => set({ snapTranslation: v }),
      snapRotation: 5,
      setSnapRotation: (v) => set({ snapRotation: v }),

      // Collision
      collisionEnabled: true,
      setCollisionEnabled: (v) => set({ collisionEnabled: v }),
      collidingPairs: [],
      setCollidingPairs: (pairs) => set({ collidingPairs: pairs }),
    }),
    {
      name: "dental-cad-movement",
      partialize: (s) => ({ transforms: s.transforms }),
    }
  )
);

/** Build THREE.Matrix4 from a ToothTransform */
export function buildMatrix(t: ToothTransform): THREE.Matrix4 {
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3(...t.position);
  const rot = new THREE.Euler(...t.rotation, "XYZ");
  const scl = new THREE.Vector3(...t.scale);
  mat.compose(pos, new THREE.Quaternion().setFromEuler(rot), scl);
  return mat;
}

/** Detect bounding-box collisions among all transformed segments */
export function detectCollisions(
  segments: Array<{ id: string; boundingBox: THREE.Box3 }>,
  transforms: Record<string, ToothTransform>
): [string, string][] {
  const boxes = segments.map((seg) => {
    const t = transforms[seg.id];
    if (!t) return { id: seg.id, box: seg.boundingBox.clone() };
    const mat = buildMatrix(t);
    const box = seg.boundingBox.clone().applyMatrix4(mat);
    return { id: seg.id, box };
  });

  const pairs: [string, string][] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].box.intersectsBox(boxes[j].box)) {
        pairs.push([boxes[i].id, boxes[j].id]);
      }
    }
  }
  return pairs;
}
