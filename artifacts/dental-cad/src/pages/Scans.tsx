import { useState } from "react";
import { useLocation } from "wouter";
import { useListScans, useGetScanStats, useDeleteScan, getListScansQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useViewerStore } from "@/store/viewerStore";
import { loadScanFile } from "@/modules/loader/ScanLoader";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

const JAW_COLOR: Record<string, string> = {
  upper: "#4d9fff",
  lower: "#a8ff7c",
  both: "#ffb87c",
  unknown: "#3a5060",
};

export default function Scans() {
  const [, navigate] = useLocation();
  const { setActiveScanId, setGeometry } = useViewerStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: scans = [], isLoading } = useListScans();
  const { data: stats } = useGetScanStats();
  const deleteMutation = useDeleteScan({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
        toast({ title: "Scan deleted" });
      },
    },
  });

  const filtered = scans.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.patientId?.toLowerCase().includes(search.toLowerCase()))
  );

  const openInViewer = async (scan: typeof scans[0]) => {
    setActiveScanId(scan.id);
    try {
      const res = await fetch(`/api/scans/${scan.id}/file`);
      const buffer = await res.arrayBuffer();
      const file = new File([buffer], `${scan.name}.${scan.fileFormat}`);
      const geo = await loadScanFile(file);
      setGeometry(geo);
      navigate("/");
    } catch {
      toast({ title: "Failed to open scan", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col h-screen" style={{ background: "#0a0c10", color: "#c8d8e8" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 shrink-0"
        style={{ height: 52, background: "#0e1117", borderBottom: "1px solid #1e2530" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-[11px] flex items-center gap-1.5 transition-colors"
            style={{ color: "#4a6070" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#00e5ff")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#4a6070")}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M8 2 L3 6 L8 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
            Viewer
          </button>
          <span style={{ color: "#1e2530" }}>/</span>
          <h1 className="text-sm font-semibold tracking-wide" style={{ color: "#c8d8e8" }}>Scan Library</h1>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Search scans..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-[11px] px-3 py-1.5 rounded outline-none transition-all w-48"
            style={{
              background: "#13161d",
              border: "1px solid #1e2530",
              color: "#c8d8e8",
            }}
            onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = "rgba(0,229,255,0.4)")}
            onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = "#1e2530")}
          />
          <button
            onClick={() => navigate("/patients")}
            className="text-[11px] px-3 py-1.5 rounded transition-all"
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
          >
            Patients
          </button>
          <button
            onClick={() => navigate("/")}
            className="text-[11px] px-3 py-1.5 rounded transition-all"
            style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.3)", color: "#00e5ff" }}
          >
            Open Viewer
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div
          className="flex items-center gap-8 px-6 py-3 shrink-0"
          style={{ background: "#0c0e13", borderBottom: "1px solid #1a1d24" }}
        >
          {[
            { label: "Total Scans", value: stats.totalScans },
            { label: "Total Storage", value: formatBytes(stats.totalFileSize) },
            { label: "Avg Vertices", value: formatNum(stats.avgVertexCount) },
            { label: "Avg Triangles", value: formatNum(stats.avgTriangleCount) },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>{label}</span>
              <span className="text-base font-semibold font-mono" style={{ color: "#7fa8c0" }}>{value}</span>
            </div>
          ))}
          <div className="flex gap-4 ml-auto">
            {Object.entries(stats.formatBreakdown || {}).map(([fmt, count]) => (
              <div key={fmt} className="flex flex-col items-center">
                <span className="text-[10px] uppercase font-bold" style={{ color: "#4a6070" }}>{fmt}</span>
                <span className="text-xs font-mono" style={{ color: "#7fa8c0" }}>{String(count)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(0,229,255,0.2)", borderTopColor: "#00e5ff" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-sm" style={{ color: "#2a4050" }}>{search ? "No scans match your search" : "No scans in library"}</p>
            <button
              onClick={() => navigate("/")}
              className="text-xs px-4 py-2 rounded transition-all"
              style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)", color: "#00e5ff" }}
            >
              Go to Viewer to upload
            </button>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: "1px solid #1a1d24" }}>
                {["Name", "Format", "Jaw", "Vertices", "Triangles", "File Size", "Scanner", "Uploaded", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest font-medium"
                    style={{ color: "#2a4050", background: "#0c0e13" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((scan) => (
                <tr
                  key={scan.id}
                  className="transition-colors cursor-pointer"
                  style={{ borderBottom: "1px solid #111418" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.015)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "transparent")}
                  onClick={() => openInViewer(scan)}
                >
                  <td className="px-4 py-2.5">
                    <span className="text-[12px] font-medium" style={{ color: "#c8d8e8" }}>{scan.name}</span>
                    {scan.patientId && (
                      <p className="text-[10px]" style={{ color: "#3a5060" }}>ID: {scan.patientId}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: "#1a1d24", color: "#4a6070" }}>
                      {scan.fileFormat}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="text-[10px] capitalize px-1.5 py-0.5 rounded"
                      style={{ background: `${JAW_COLOR[scan.jaw]}15`, color: JAW_COLOR[scan.jaw] }}
                    >
                      {scan.jaw}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "#7fa8c0" }}>{formatNum(scan.vertexCount)}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "#7fa8c0" }}>{formatNum(scan.triangleCount)}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "#4a6070" }}>{formatBytes(scan.fileSize)}</td>
                  <td className="px-4 py-2.5 text-[11px]" style={{ color: "#3a5060" }}>{scan.scannerModel || "—"}</td>
                  <td className="px-4 py-2.5 text-[11px]" style={{ color: "#3a5060" }}>
                    {new Date(scan.uploadedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openInViewer(scan)}
                        className="text-[10px] px-2 py-1 rounded transition-all"
                        style={{ background: "rgba(0,229,255,0.08)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.2)" }}
                      >
                        View
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate({ id: scan.id })}
                        className="text-[10px] px-2 py-1 rounded transition-all"
                        style={{ background: "rgba(255,77,77,0.08)", color: "#ff4d4d", border: "1px solid rgba(255,77,77,0.2)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Toaster />
    </div>
  );
}
