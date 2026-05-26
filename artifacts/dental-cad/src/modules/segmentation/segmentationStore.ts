import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as THREE from "three";
import type { ToothSegment, SegmentationResult } from "./SegmentationEngine";

export interface SegmentMeta {
  id: string;
  fdiNumber: number | null;
  universalNumber: number | null;
  label: string;
  color: string;
  isLocked: boolean;
  isHidden: boolean;
}

interface SegmentationState {
  // Raw segmentation result (not persisted — geometry can't serialize)
  result: SegmentationResult | null;
  setResult: (r: SegmentationResult) => void;
  clearResult: () => void;

  // Persistent metadata keyed by segment id
  metas: Record<string, SegmentMeta>;
  setMeta: (id: string, patch: Partial<SegmentMeta>) => void;
  syncMetasFromSegments: (segments: ToothSegment[]) => void;

  // Selection
  activeSegmentId: string | null;
  setActiveSegmentId: (id: string | null) => void;

  // Brush
  brushRadius: number;
  setBrushRadius: (r: number) => void;
  paintTargetSegmentId: string | null;
  setPaintTargetSegmentId: (id: string | null) => void;

  // Mode
  showSegmented: boolean;
  setShowSegmented: (v: boolean) => void;

  // Helpers
  getActiveMeta: () => SegmentMeta | null;
  getSegmentColor: (id: string) => string;
}

export const useSegmentationStore = create<SegmentationState>()(
  persist(
    (set, get) => ({
      result: null,
      setResult: (r) => set({ result: r }),
      clearResult: () => set({ result: null, activeSegmentId: null }),

      metas: {},
      setMeta: (id, patch) =>
        set((s) => ({ metas: { ...s.metas, [id]: { ...s.metas[id], ...patch } } })),
      syncMetasFromSegments: (segments) =>
        set((s) => {
          const next = { ...s.metas };
          for (const seg of segments) {
            if (!next[seg.id]) {
              next[seg.id] = {
                id: seg.id,
                fdiNumber: seg.fdiNumber,
                universalNumber: seg.universalNumber,
                label: seg.label,
                color: seg.color,
                isLocked: false,
                isHidden: false,
              };
            }
          }
          return { metas: next };
        }),

      activeSegmentId: null,
      setActiveSegmentId: (id) => set({ activeSegmentId: id }),

      brushRadius: 0.3,
      setBrushRadius: (r) => set({ brushRadius: r }),
      paintTargetSegmentId: null,
      setPaintTargetSegmentId: (id) => set({ paintTargetSegmentId: id }),

      showSegmented: false,
      setShowSegmented: (v) => set({ showSegmented: v }),

      getActiveMeta: () => {
        const { activeSegmentId, metas } = get();
        return activeSegmentId ? metas[activeSegmentId] ?? null : null;
      },
      getSegmentColor: (id) => get().metas[id]?.color ?? "#00c8ff",
    }),
    {
      name: "dental-cad-segmentation",
      partialize: (s) => ({ metas: s.metas }),
    }
  )
);
