import { create } from "zustand";
import { persist } from "zustand/middleware";
import { computeDistance, computeAngle } from "../simulation/TreatmentEngine";

export type MeasurementType = "distance" | "angle" | "arch_width" | "overbite" | "overjet" | "spacing";

export interface AnalysisMeasurement {
  id: string;
  type: MeasurementType;
  label: string;
  points: [number, number, number][];
  value: number;
  unit: "mm" | "deg";
  color: string;
  createdAt: string;
}

const TYPE_COLORS: Record<MeasurementType, string> = {
  distance: "#00e5ff",
  angle: "#ffcc00",
  arch_width: "#4dffb8",
  overbite: "#ff6b6b",
  overjet: "#ff9940",
  spacing: "#b87cff",
};

const TYPE_POINT_COUNT: Record<MeasurementType, number> = {
  distance: 2,
  angle: 3,
  arch_width: 2,
  overbite: 2,
  overjet: 2,
  spacing: 2,
};

function genId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function computeValue(type: MeasurementType, points: [number, number, number][]): { value: number; unit: "mm" | "deg" } {
  switch (type) {
    case "angle":
      return { value: computeAngle(points[0], points[1], points[2]), unit: "deg" };
    case "distance":
    case "arch_width":
    case "overbite":
    case "spacing": {
      const d = computeDistance(points[0], points[1]);
      return { value: d, unit: "mm" };
    }
    case "overjet": {
      // Horizontal distance only (XZ plane)
      const a = points[0], b = points[1];
      const d = Math.sqrt((a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2);
      return { value: d, unit: "mm" };
    }
    default:
      return { value: 0, unit: "mm" };
  }
}

const LABEL_MAP: Record<MeasurementType, string> = {
  distance: "Distance",
  angle: "Angle",
  arch_width: "Arch Width",
  overbite: "Overbite",
  overjet: "Overjet",
  spacing: "Spacing",
};

interface AnalysisState {
  measurements: AnalysisMeasurement[];
  activeTool: MeasurementType | null;
  pendingPoints: [number, number, number][];

  setActiveTool: (t: MeasurementType | null) => void;
  addPendingPoint: (p: [number, number, number]) => void;
  clearPendingPoints: () => void;
  finalizeMeasurement: () => AnalysisMeasurement | null;
  deleteMeasurement: (id: string) => void;
  clearAll: () => void;
  exportCsv: () => void;
  requiredPoints: () => number;
}

export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set, get) => ({
      measurements: [],
      activeTool: null,
      pendingPoints: [],

      setActiveTool: (activeTool) => set({ activeTool, pendingPoints: [] }),

      addPendingPoint: (p) => {
        const { pendingPoints, activeTool } = get();
        const required = activeTool ? TYPE_POINT_COUNT[activeTool] : 2;
        const next = [...pendingPoints, p];
        set({ pendingPoints: next });

        // Auto-finalize when enough points collected
        if (next.length >= required) {
          setTimeout(() => get().finalizeMeasurement(), 0);
        }
      },

      clearPendingPoints: () => set({ pendingPoints: [] }),

      finalizeMeasurement: () => {
        const { activeTool, pendingPoints, measurements } = get();
        if (!activeTool) return null;
        const required = TYPE_POINT_COUNT[activeTool];
        if (pendingPoints.length < required) return null;

        const points = pendingPoints.slice(0, required) as [number, number, number][];
        const { value, unit } = computeValue(activeTool, points);

        const m: AnalysisMeasurement = {
          id: genId(),
          type: activeTool,
          label: LABEL_MAP[activeTool],
          points,
          value,
          unit,
          color: TYPE_COLORS[activeTool],
          createdAt: new Date().toISOString(),
        };

        set({ measurements: [...measurements, m], pendingPoints: [] });
        return m;
      },

      deleteMeasurement: (id) =>
        set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),

      clearAll: () => set({ measurements: [], pendingPoints: [] }),

      exportCsv: () => {
        const { measurements } = get();
        const rows = [
          ["Label", "Type", "Value", "Unit", "Point 1", "Point 2", "Point 3", "Created"],
          ...measurements.map((m) => [
            m.label,
            m.type,
            m.value.toFixed(3),
            m.unit,
            m.points[0]?.map((v) => v.toFixed(3)).join(";") ?? "",
            m.points[1]?.map((v) => v.toFixed(3)).join(";") ?? "",
            m.points[2]?.map((v) => v.toFixed(3)).join(";") ?? "",
            m.createdAt,
          ]),
        ];
        const csv = rows.map((r) => r.join(",")).join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `measurements_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },

      requiredPoints: () => {
        const { activeTool } = get();
        return activeTool ? TYPE_POINT_COUNT[activeTool] : 2;
      },
    }),
    {
      name: "dental-cad-analysis",
      partialize: (s) => ({ measurements: s.measurements }),
    }
  )
);
