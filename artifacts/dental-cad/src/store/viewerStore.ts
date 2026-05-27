import { create } from 'zustand';
import * as THREE from 'three';

export type ToolType =
  | 'orbit'
  | 'select'
  | 'measure_distance'
  | 'measure_angle'
  | 'annotate'
  | 'segment'
  | 'align'
  | 'section'
  | 'sculpt';

interface ViewerState {
  activeScanId: number | null;
  geometry: THREE.BufferGeometry | null;
  materialMode: 'solid' | 'wireframe' | 'transparent';
  opacity: number;
  activeTool: ToolType;
  selectedMeasurements: number[];
  selectedAnnotations: number[];
  setActiveScanId: (id: number | null) => void;
  setGeometry: (geometry: THREE.BufferGeometry | null) => void;
  setMaterialMode: (mode: 'solid' | 'wireframe' | 'transparent') => void;
  setOpacity: (opacity: number) => void;
  setActiveTool: (tool: ToolType) => void;
  toggleMeasurementSelection: (id: number) => void;
  toggleAnnotationSelection: (id: number) => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  activeScanId: null,
  geometry: null,
  materialMode: 'solid',
  opacity: 1,
  activeTool: 'orbit',
  selectedMeasurements: [],
  selectedAnnotations: [],
  setActiveScanId: (id) => set({ activeScanId: id }),
  setGeometry: (geometry) => set({ geometry }),
  setMaterialMode: (mode) => set({ materialMode: mode }),
  setOpacity: (opacity) => set({ opacity }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  toggleMeasurementSelection: (id) => set((state) => ({
    selectedMeasurements: state.selectedMeasurements.includes(id)
      ? state.selectedMeasurements.filter(mId => mId !== id)
      : [...state.selectedMeasurements, id]
  })),
  toggleAnnotationSelection: (id) => set((state) => ({
    selectedAnnotations: state.selectedAnnotations.includes(id)
      ? state.selectedAnnotations.filter(aId => aId !== id)
      : [...state.selectedAnnotations, id]
  }))
}));
