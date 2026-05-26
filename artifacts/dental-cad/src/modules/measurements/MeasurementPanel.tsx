import { useViewerStore } from "@/store/viewerStore";
import { useListMeasurements, useDeleteMeasurement, getListMeasurementsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function MeasurementPanel() {
  const activeScanId = useViewerStore((s) => s.activeScanId);
  const queryClient = useQueryClient();

  const { data: measurements = [], isLoading } = useListMeasurements(
    activeScanId ?? 0,
    { query: { enabled: !!activeScanId, queryKey: getListMeasurementsQueryKey(activeScanId ?? 0) } }
  );

  const deleteMutation = useDeleteMeasurement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMeasurementsQueryKey(activeScanId ?? 0) });
      },
    },
  });

  if (!activeScanId) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center px-4">
        <p className="text-xs" style={{ color: "#2a3a48" }}>No scan loaded</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-3 py-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-8 rounded mb-1 animate-pulse" style={{ background: "#1a1d24" }} />
        ))}
      </div>
    );
  }

  if (measurements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center px-4">
        <p className="text-xs" style={{ color: "#2a3a48" }}>No measurements yet</p>
        <p className="text-[10px] mt-1" style={{ color: "#1e2a33" }}>Use the measure tools to add</p>
      </div>
    );
  }

  const typeColor: Record<string, string> = {
    distance: "#00e5ff",
    angle: "#7cb8ff",
    area: "#a8ff7c",
    perimeter: "#ffb87c",
    depth: "#c87cff",
  };

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      {measurements.map((m) => (
        <div
          key={m.id}
          className="flex items-center justify-between px-2 py-1.5 rounded group"
          style={{ background: "#13161d", border: "1px solid transparent" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "#1e2530")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "transparent")}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-[9px] font-bold uppercase tracking-widest px-1 py-0.5 rounded"
              style={{
                background: `${typeColor[m.type] || "#00e5ff"}20`,
                color: typeColor[m.type] || "#00e5ff",
              }}
            >
              {m.type.slice(0, 4)}
            </span>
            <span className="text-[11px] truncate" style={{ color: "#8098a8" }}>{m.label}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono" style={{ color: "#c8d8e8" }}>
              {m.value.toFixed(2)}<span className="text-[9px] ml-0.5" style={{ color: "#4a6070" }}>{m.unit}</span>
            </span>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => deleteMutation.mutate({ scanId: activeScanId, measurementId: m.id })}
              style={{ color: "#4a2a2a" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#ff4d4d")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#4a2a2a")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
