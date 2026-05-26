import { useViewerStore } from "@/store/viewerStore";
import { useListAnnotations, useDeleteAnnotation, getListAnnotationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function AnnotationPanel() {
  const activeScanId = useViewerStore((s) => s.activeScanId);
  const queryClient = useQueryClient();

  const { data: annotations = [], isLoading } = useListAnnotations(
    activeScanId ?? 0,
    { query: { enabled: !!activeScanId, queryKey: getListAnnotationsQueryKey(activeScanId ?? 0) } }
  );

  const deleteMutation = useDeleteAnnotation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAnnotationsQueryKey(activeScanId ?? 0) });
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
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-8 rounded mb-1 animate-pulse" style={{ background: "#1a1d24" }} />
        ))}
      </div>
    );
  }

  if (annotations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center px-4">
        <p className="text-xs" style={{ color: "#2a3a48" }}>No annotations yet</p>
        <p className="text-[10px] mt-1" style={{ color: "#1e2a33" }}>Use the annotate tool to add</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      {annotations.map((a) => (
        <div
          key={a.id}
          className="flex items-start justify-between px-2 py-1.5 rounded group"
          style={{ background: "#13161d", border: "1px solid transparent" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "#1e2530")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "transparent")}
        >
          <div className="flex items-start gap-2 min-w-0">
            <span
              className="w-3 h-3 rounded-full shrink-0 mt-0.5"
              style={{ background: a.color }}
            />
            <div className="min-w-0">
              <p className="text-[11px] font-medium truncate" style={{ color: "#c8d8e8" }}>{a.label}</p>
              {a.notes && (
                <p className="text-[10px] truncate" style={{ color: "#4a6070" }}>{a.notes}</p>
              )}
            </div>
          </div>
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
            onClick={() => deleteMutation.mutate({ scanId: activeScanId, annotationId: a.id })}
            style={{ color: "#4a2a2a" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#ff4d4d")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#4a2a2a")}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
