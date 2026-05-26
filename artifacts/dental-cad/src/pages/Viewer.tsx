import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useViewerStore } from "@/store/viewerStore";
import { useSegmentationStore } from "@/modules/segmentation/segmentationStore";
import { useMovementStore } from "@/modules/movement/movementStore";
import { useSimulationStore } from "@/modules/simulation/simulationStore";
import { useGetScan, getGetScanQueryKey, useListScans, useUploadScan, useExportScan, getListScansQueryKey } from "@workspace/api-client-react";
import { loadScanFile } from "@/modules/loader/ScanLoader";
import { segmentMesh } from "@/modules/segmentation/SegmentationEngine";
import ViewportCanvas from "@/modules/renderer/ViewportCanvas";
import ToolBar from "@/modules/toolbar/ToolBar";
import MeasurementPanel from "@/modules/measurements/MeasurementPanel";
import AnnotationPanel from "@/modules/annotations/AnnotationPanel";
import SegmentationPanel from "@/modules/segmentation/SegmentationPanel";
import MovementPanel from "@/modules/movement/MovementPanel";
import TreatmentPanel from "@/modules/simulation/TreatmentPanel";
import AnalysisPanel from "@/modules/analysis/AnalysisPanel";
import ExportPanel from "@/modules/export/ExportPanel";
import AIPanel from "@/modules/ai/AIPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default function Viewer() {
  const {
    activeScanId, geometry,
    materialMode, setMaterialMode,
    opacity, setOpacity,
    setGeometry, setActiveScanId,
    activeTool, setActiveTool,
  } = useViewerStore();

  const { setResult, syncMetasFromSegments, setShowSegmented, clearResult } = useSegmentationStore();
  const { initTransform } = useMovementStore();
  const { setShowSimulation } = useSimulationStore();

  const [isLoading, setIsLoading] = useState(false);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [showScanList, setShowScanList] = useState(false);
  const [activeTab, setActiveTab] = useState("properties");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: activeScan } = useGetScan(activeScanId ?? 0, {
    query: { enabled: !!activeScanId, queryKey: getGetScanQueryKey(activeScanId ?? 0) },
  });

  const { data: scans = [] } = useListScans();
  const uploadMutation = useUploadScan();
  const exportMutation = useExportScan();

  const handleFileLoad = useCallback(async (file: File) => {
    setIsLoading(true);
    clearResult();
    try {
      const geo = await loadScanFile(file);
      setGeometry(geo);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^.]+$/, ""));

      uploadMutation.mutate(
        { data: formData as any },
        {
          onSuccess: (scan) => {
            setActiveScanId(scan.id);
            queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
            toast({ title: "Scan loaded", description: scan.name });
          },
          onError: () => {
            toast({ title: "Upload failed", description: "Could not save scan to library", variant: "destructive" });
          },
        }
      );
    } catch (err) {
      toast({ title: "Load failed", description: "Could not parse scan file", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRunSegmentation = useCallback(async (opts: { angleThreshold: number; minFaces: number }) => {
    if (!geometry) {
      toast({ title: "No scan loaded", description: "Load a scan file first", variant: "destructive" });
      return;
    }
    setIsSegmenting(true);
    try {
      // Run in next tick to allow UI to update
      await new Promise((r) => setTimeout(r, 20));
      const result = segmentMesh(geometry, {
        angleThresholdDeg: opts.angleThreshold,
        minFaceCount: opts.minFaces,
        maxSegments: 32,
      });
      setResult(result);
      syncMetasFromSegments(result.segments);
      // Initialize movement transforms for each segment
      for (const seg of result.segments) initTransform(seg.id);
      setShowSegmented(true);
      toast({
        title: `Segmentation complete`,
        description: `${result.segments.length} tooth segment${result.segments.length !== 1 ? "s" : ""} detected`,
      });
    } catch (err) {
      toast({ title: "Segmentation failed", variant: "destructive" });
    } finally {
      setIsSegmenting(false);
    }
  }, [geometry]);

  const handleExport = useCallback(() => {
    if (!activeScanId || !activeScan) return;
    exportMutation.mutate(
      { id: activeScanId, data: { format: activeScan.fileFormat, binary: true } },
      {
        onSuccess: (blob) => {
          const url = URL.createObjectURL(blob as unknown as Blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${activeScan.name}.${activeScan.fileFormat}`;
          a.click();
          URL.revokeObjectURL(url);
        },
        onError: () => toast({ title: "Export failed", variant: "destructive" }),
      }
    );
  }, [activeScanId, activeScan]);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#0a0c10", color: "#c8d8e8" }}>
      {/* TOP MENUBAR */}
      <div
        className="flex items-center justify-between px-3 shrink-0"
        style={{
          height: 36,
          background: "#0e1117",
          borderBottom: "1px solid #1e2530",
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 mr-3">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2 C6 2 3 5 3 9 C3 13 6 18 10 18 C14 18 17 13 17 9 C17 5 14 2 10 2Z" fill="#00e5ff" opacity="0.2" />
              <path d="M10 4 C7 4 5 6.5 5 9 C5 12 7 16 10 16 C13 16 15 12 15 9 C15 6.5 13 4 10 4Z" stroke="#00e5ff" strokeWidth="1" fill="none" />
              <path d="M7 9 C7 7.5 8.3 6.5 10 6.5 C11.7 6.5 13 7.5 13 9" stroke="#00e5ff" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "#00e5ff", letterSpacing: "0.15em" }}>
              DentalCAD
            </span>
          </div>

          {["File", "View", "Tools", "Analysis", "Export"].map((menu) => (
            <button
              key={menu}
              className="text-[11px] px-2 py-0.5 rounded transition-colors"
              style={{ color: "#4a6070" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#c8d8e8"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#4a6070"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              {menu}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {activeScan && (
            <span className="text-[11px]" style={{ color: "#4a6070" }}>
              {activeScan.name}
              <span className="ml-2 uppercase text-[9px]" style={{ color: "#2a4050" }}>{activeScan.fileFormat}</span>
            </span>
          )}

          <div className="flex items-center gap-1 px-2 py-0.5 rounded" style={{ background: "#13161d", border: "1px solid #1e2530" }}>
            {(["solid", "wireframe", "transparent"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setMaterialMode(mode)}
                className="text-[10px] px-1.5 py-0.5 rounded capitalize transition-all"
                style={{
                  background: materialMode === mode ? "rgba(0,229,255,0.15)" : "transparent",
                  color: materialMode === mode ? "#00e5ff" : "#4a6070",
                  border: materialMode === mode ? "1px solid rgba(0,229,255,0.3)" : "1px solid transparent",
                }}
              >
                {mode.slice(0, 4)}
              </button>
            ))}
          </div>

          {materialMode === "transparent" && (
            <div className="flex items-center gap-2 w-24">
              <span className="text-[10px]" style={{ color: "#4a6070" }}>Alpha</span>
              <Slider
                min={0.1} max={1} step={0.05}
                value={[opacity]}
                onValueChange={([v]) => setOpacity(v)}
                className="w-16"
              />
            </div>
          )}

          <button
            onClick={() => setShowScanList(!showScanList)}
            className="text-[11px] px-2 py-1 rounded transition-all"
            style={{
              background: showScanList ? "rgba(0,229,255,0.15)" : "rgba(255,255,255,0.04)",
              border: "1px solid #1e2530",
              color: showScanList ? "#00e5ff" : "#7fa8c0",
            }}
          >
            Library
          </button>

          <button
            onClick={handleExport}
            disabled={!activeScanId || exportMutation.isPending}
            className="text-[11px] px-2 py-1 rounded transition-all disabled:opacity-30"
            style={{
              background: "rgba(0,229,255,0.1)",
              border: "1px solid rgba(0,229,255,0.3)",
              color: "#00e5ff",
            }}
          >
            {exportMutation.isPending ? "Exporting..." : "Export STL"}
          </button>

          <label
            className="text-[11px] px-2 py-1 rounded cursor-pointer transition-all"
            style={{
              background: "#13161d",
              border: "1px solid #2a3540",
              color: "#7fa8c0",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLLabelElement).style.borderColor = "rgba(0,229,255,0.4)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLLabelElement).style.borderColor = "#2a3540")}
          >
            {isLoading ? "Loading..." : "Open File"}
            <input
              type="file"
              accept=".stl,.obj,.ply"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileLoad(f); }}
            />
          </label>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT TOOLBAR */}
        <ToolBar onToolChange={(tool) => {
          setActiveTool(tool);
          // Auto-switch right panel when selecting segment/align tool
          if (tool === "segment") setActiveTab("segment");
          if (tool === "align") setActiveTab("movement");
        }} />

        {/* VIEWPORT */}
        <div className="flex-1 relative min-w-0">
          <ViewportCanvas onFileLoad={handleFileLoad} />

          {(isLoading || isSegmenting) && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(10,12,16,0.75)", zIndex: 20 }}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(0,229,255,0.2)", borderTopColor: "#00e5ff" }} />
                <p className="text-xs tracking-widest uppercase" style={{ color: "#00e5ff" }}>
                  {isSegmenting ? "Detecting Teeth..." : "Processing Mesh"}
                </p>
              </div>
            </div>
          )}

          {/* Scan Quick-Select Panel */}
          {showScanList && scans.length > 0 && (
            <div
              className="absolute top-2 right-2 w-64 rounded overflow-hidden"
              style={{ background: "#0e1117", border: "1px solid #1e2530", zIndex: 10 }}
            >
              <div className="px-3 py-2 text-[10px] uppercase tracking-widest" style={{ color: "#4a6070", borderBottom: "1px solid #1e2530" }}>
                Scan Library ({scans.length})
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
                {scans.map((scan) => (
                  <button
                    key={scan.id}
                    className="w-full text-left px-3 py-2 flex items-center justify-between transition-colors"
                    style={{
                      background: activeScanId === scan.id ? "rgba(0,229,255,0.08)" : "transparent",
                      borderLeft: activeScanId === scan.id ? "2px solid #00e5ff" : "2px solid transparent",
                    }}
                    onClick={async () => {
                      setActiveScanId(scan.id);
                      setShowScanList(false);
                      clearResult();
                      try {
                        const res = await fetch(`/api/scans/${scan.id}/file`);
                        const buffer = await res.arrayBuffer();
                        const file = new File([buffer], `${scan.name}.${scan.fileFormat}`);
                        const geo = await loadScanFile(file);
                        setGeometry(geo);
                      } catch {
                        toast({ title: "Failed to load scan", variant: "destructive" });
                      }
                    }}
                    onMouseEnter={(e) => { if (activeScanId !== scan.id) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={(e) => { if (activeScanId !== scan.id) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <div>
                      <p className="text-[11px] font-medium" style={{ color: "#c8d8e8" }}>{scan.name}</p>
                      <p className="text-[10px]" style={{ color: "#4a6070" }}>{scan.jaw} &bull; {formatBytes(scan.fileSize)}</p>
                    </div>
                    <span className="text-[9px] uppercase font-bold" style={{ color: "#2a4050" }}>{scan.fileFormat}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div
          className="flex flex-col shrink-0"
          style={{ width: 256, background: "#0e1117", borderLeft: "1px solid #1e2530" }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <TabsList
              className="shrink-0 rounded-none border-b grid grid-cols-9 h-8 p-0"
              style={{ background: "#0a0c10", borderColor: "#1e2530" }}
            >
              {[
                { value: "properties", label: "Prop" },
                { value: "measures", label: "Meas" },
                { value: "notes", label: "Ann" },
                { value: "segment", label: "Seg" },
                { value: "movement", label: "Mov" },
                { value: "simulation", label: "Sim" },
                { value: "analysis", label: "Anl" },
                { value: "export", label: "Exp" },
                { value: "ai", label: "AI" },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="text-[8px] uppercase tracking-wider rounded-none h-8 data-[state=active]:bg-transparent px-0"
                  style={{ color: "#4a6070" }}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="properties" className="flex-1 overflow-y-auto p-0 m-0">
              <PropertiesPanel scan={activeScan} activeTool={activeTool} />
            </TabsContent>
            <TabsContent value="measures" className="flex-1 overflow-y-auto p-0 m-0">
              <MeasurementPanel />
            </TabsContent>
            <TabsContent value="notes" className="flex-1 overflow-y-auto p-0 m-0">
              <AnnotationPanel />
            </TabsContent>
            <TabsContent value="segment" className="flex-1 overflow-y-auto p-0 m-0 flex flex-col">
              <SegmentationPanel
                onRunSegmentation={handleRunSegmentation}
                isRunning={isSegmenting}
              />
            </TabsContent>
            <TabsContent value="movement" className="flex-1 overflow-y-auto p-0 m-0 flex flex-col">
              <MovementPanel />
            </TabsContent>
            <TabsContent value="simulation" className="flex-1 overflow-y-auto p-0 m-0 flex flex-col">
              <TreatmentPanel
                onToast={(msg, desc) => toast({ title: msg, description: desc })}
              />
            </TabsContent>
            <TabsContent value="analysis" className="flex-1 overflow-y-auto p-0 m-0 flex flex-col">
              <AnalysisPanel />
            </TabsContent>
            <TabsContent value="export" className="flex-1 overflow-y-auto p-0 m-0 flex flex-col">
              <ExportPanel />
            </TabsContent>
            <TabsContent value="ai" className="flex-1 overflow-y-auto p-0 m-0 flex flex-col">
              <AIPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* BOTTOM STATUS BAR */}
      <div
        className="flex items-center px-3 gap-6 shrink-0"
        style={{
          height: 24,
          background: "#0a0c10",
          borderTop: "1px solid #1e2530",
          fontSize: 10,
          color: "#2a4050",
        }}
      >
        {activeScan ? (
          <>
            <span style={{ color: "#4a6070" }}>{activeScan.name}</span>
            <span>Vertices: <span style={{ color: "#7fa8c0" }}>{formatNum(activeScan.vertexCount)}</span></span>
            <span>Triangles: <span style={{ color: "#7fa8c0" }}>{formatNum(activeScan.triangleCount)}</span></span>
            <span>Size: <span style={{ color: "#7fa8c0" }}>{formatBytes(activeScan.fileSize)}</span></span>
            <span>Format: <span style={{ color: "#7fa8c0" }}>{activeScan.fileFormat.toUpperCase()}</span></span>
            {activeScan.jaw !== "unknown" && (
              <span>Jaw: <span style={{ color: "#7fa8c0", textTransform: "capitalize" }}>{activeScan.jaw}</span></span>
            )}
          </>
        ) : (
          <span>No scan loaded &mdash; drop an STL, OBJ, or PLY file to begin</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span style={{ color: "#1e2a33" }}>GPU: WebGL 2.0</span>
          <span style={{ color: activeTool !== "orbit" ? "#00e5ff" : "#1e2a33", textTransform: "capitalize" }}>
            Tool: {activeTool.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <Toaster />
    </div>
  );
}

function PropertiesPanel({ scan, activeTool }: { scan: any; activeTool: string }) {
  if (!scan) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#2a4050" }}>No scan loaded</p>
        <p className="text-[11px]" style={{ color: "#1e2a33" }}>Drop a file or open from the library</p>
      </div>
    );
  }

  const rows = [
    { label: "Name", value: scan.name },
    { label: "Format", value: scan.fileFormat.toUpperCase() },
    { label: "Jaw", value: scan.jaw, capitalize: true },
    { label: "Vertices", value: formatNum(scan.vertexCount) },
    { label: "Triangles", value: formatNum(scan.triangleCount) },
    { label: "File Size", value: formatBytes(scan.fileSize) },
    ...(scan.patientId ? [{ label: "Patient ID", value: scan.patientId }] : []),
    ...(scan.scannerModel ? [{ label: "Scanner", value: scan.scannerModel }] : []),
    { label: "Uploaded", value: new Date(scan.uploadedAt).toLocaleDateString() },
  ];

  return (
    <div className="p-3">
      <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "#2a4050" }}>Scan Properties</p>
      <div className="flex flex-col gap-0">
        {rows.map(({ label, value, capitalize }) => (
          <div key={label} className="flex justify-between py-1.5" style={{ borderBottom: "1px solid #13161d" }}>
            <span className="text-[10px]" style={{ color: "#3a5060" }}>{label}</span>
            <span className="text-[11px]" style={{ color: "#7fa8c0", textTransform: capitalize ? "capitalize" : undefined }}>
              {String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
