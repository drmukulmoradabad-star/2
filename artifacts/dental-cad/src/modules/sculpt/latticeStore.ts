import { create } from "zustand";

interface LatticeState {
  isLatticeActive: boolean;
  latticeNx: number;
  latticeNy: number;
  latticeNz: number;
  selectedCPIndex: number | null;
  totalDisplacement: number;
  setIsLatticeActive: (v: boolean) => void;
  setLatticeNx: (v: number) => void;
  setLatticeNy: (v: number) => void;
  setLatticeNz: (v: number) => void;
  setSelectedCPIndex: (i: number | null) => void;
  setTotalDisplacement: (v: number) => void;
  resetLattice: () => void;
}

export const useLatticeStore = create<LatticeState>((set) => ({
  isLatticeActive: false,
  latticeNx: 4,
  latticeNy: 3,
  latticeNz: 3,
  selectedCPIndex: null,
  totalDisplacement: 0,
  setIsLatticeActive: (v) => set({ isLatticeActive: v }),
  setLatticeNx: (v) => set({ latticeNx: Math.max(2, Math.min(8, v)) }),
  setLatticeNy: (v) => set({ latticeNy: Math.max(2, Math.min(6, v)) }),
  setLatticeNz: (v) => set({ latticeNz: Math.max(2, Math.min(6, v)) }),
  setSelectedCPIndex: (i) => set({ selectedCPIndex: i }),
  setTotalDisplacement: (v) => set({ totalDisplacement: v }),
  resetLattice: () => set({ selectedCPIndex: null, totalDisplacement: 0 }),
}));
