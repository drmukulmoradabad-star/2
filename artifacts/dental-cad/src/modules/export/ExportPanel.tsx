import { useState, useCallback } from "react";
import { useViewerStore } from "@/store/viewerStore";
import { useSegmentationStore } from "@/modules/segmentation/segmentationStore";
import { useSimulationStore } from "@/modules/simulation/simulationStore";
import { useMovementStore } from "@/modules/movement/movementStore";
import {
  validateMesh, serializeGeometry, packageToZip, triggerDownload,
  getStageFilename, applyTransformToGeometry, mergeGeometries,
  type ExportFormat, type ExportMode, type StageNamingConvention, type ValidationResult,
} from "./ExportEngine";
import { useListScans } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const BTN =
  "text-[11px] px-3 py-1.5 rounded transition-all disabled:opacity-30 w-full";
const SECTION = "mb-4";
const LABEL = "text-[10px] uppercase tracking-widest mb-1.5 block";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
      style={{ background: ok ? "#00e5ff" : "#ff5252", flexShrink: 0 }}
    />
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #13161d" }}>
      <span className="text-[10px]" style={{ color: "#3a5060" }}>{label}</span>
      <span className="text-[11px]" style={{ color: "#7fa8c0" }}>{value}</span>
    </div>
  );
}

export default function ExportPanel() {
  const { geometry } = useViewerStore();
  const { result: segResult } = useSegmentationStore();
  const { stages } = useSimulationStore();
  const { transforms } = useMovementStore();
  const { data: scans = [] } = useListScans();
  const { toast } = useToast();

  const [format, setFormat] = useState<ExportFormat>("stl");
  const [mode, setMode] = useState<ExportMode>("binary");
  const [stageNaming, setStageNaming] = useState<StageNamingConvention>("clinical");
  const [compress, setCompress] = useState(true);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [batchIds, setBatchIds] = useState<Set<number>>(new Set());

  const canExport = !!geometry;
  const hasStages = stages.length > 0;
  const hasSegments = (segResult?.segments.length ?? 0) > 0;

  const handleValidate = useCallback(async () => {
    if (!geometry) return;
    setIsValidating(true);
    await new Promise((r) => setTimeout(r, 20));
    try {
      const result = validateMesh(geometry);
      setValidation(result);
    } catch {
      toast({ title: "Validation failed", variant: "destructive" });
    } finally {
      setIsValidating(false);
    }
  }, [geometry]);

  const handleExportCurrent = useCallback(async () => {
    if (!geometry) return;
    setIsExporting(true);
    try {
      const { data, ext } = serializeGeometry(geometry, format, mode, "scan");
      triggerDownload(data, `scan.${ext}`);
      toast({ title: "Export complete", description: `scan.${ext}` });
    } catch (err) {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }, [geometry, format, mode]);

  const handleExportSegments = useCallback(async () => {
    if (!segResult || !geometry) return;
    setIsExporting(true);
    try {
      const files: Array<{ name: string; data: ArrayBuffer | string }> = [];

      for (const seg of segResult.segments) {
        const t = transforms[seg.id];
        let geo = seg.geometry.clone();
        if (t) geo = applyTransformToGeometry(geo, t.position, t.rotation, t.scale);
        const { data, ext } = serializeGeometry(geo, format, mode, seg.label);
        const name = `${seg.label.replace(/\s+/g, "_").toLowerCase()}.${ext}`;
        files.push({ name, data });
      }

      if (compress) {
        const zip = await packageToZip(files);
        triggerDownload(zip, `teeth_segments_${format}.zip`);
      } else {
        for (const f of files) triggerDownload(f.data, f.name);
      }
      toast({ title: "Segments exported", description: `${files.length} files` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }, [segResult, geometry, transforms, format, mode, compress]);

  const handleExportStages = useCallback(async () => {
    if (!stages.length || !segResult || !geometry) return;
    setIsExporting(true);
    try {
      const files: Array<{ name: string; data: ArrayBuffer | string }> = [];

      for (const stage of stages) {
        const geos = segResult.segments.map((seg) => {
          const t = stage.transforms[seg.id];
          let geo = seg.geometry.clone();
          if (t) geo = applyTransformToGeometry(geo, t.position, t.rotation, t.scale);
          return geo;
        });

        const merged = mergeGeometries(geos);
        const stageName = getStageFilename(stage, "treatment", stageNaming);
        const { data, ext } = serializeGeometry(merged, format, mode, stageName);
        files.push({ name: `${stageName}.${ext}`, data });
      }

      if (compress) {
        const zip = await packageToZip(files);
        triggerDownload(zip, `treatment_stages_${format}.zip`);
      } else {
        for (const f of files) triggerDownload(f.data, f.name);
      }
      toast({ title: "Stages exported", description: `${files.length} stages as ${compress ? "ZIP" : "individual files"}` });
    } catch {
      toast({ title: "Stage export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }, [stages, segResult, geometry, format, mode, stageNaming, compress]);

  const handleBatchExport = useCallback(async () => {
    if (batchIds.size === 0) return;
    setIsExporting(true);
    try {
      const files: Array<{ name: string; data: ArrayBuffer | string }> = [];
      for (const scanId of batchIds) {
        const scan = scans.find((s) => s.id === scanId);
        if (!scan) continue;
        try {
          const res = await fetch(`/api/scans/${scanId}/file`);
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          files.push({ name: `${scan.name}.${scan.fileFormat}`, data: buf });
        } catch { continue; }
      }
      if (files.length === 0) { toast({ title: "No files retrieved", variant: "destructive" }); return; }
      const zip = await packageToZip(files);
      triggerDownload(zip, `batch_export_${files.length}_scans.zip`);
      toast({ title: "Batch export complete", description: `${files.length} scans packaged` });
    } catch {
      toast({ title: "Batch export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }, [batchIds, scans]);

  return (
    <div className="p-3 text-[11px]" style={{ color: "#c8d8e8" }}>

      {/* FORMAT */}
      <div className={SECTION}>
        <span className={LABEL} style={{ color: "#2a4050" }}>Output Format</span>
        <div className="grid grid-cols-3 gap-1">
          {(["stl", "obj", "ply"] as ExportFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className="py-1.5 rounded text-[11px] uppercase font-bold tracking-wide transition-all"
              style={{
                background: format === f ? "rgba(0,229,255,0.15)" : "#13161d",
                border: `1px solid ${format === f ? "rgba(0,229,255,0.4)" : "#1e2530"}`,
                color: format === f ? "#00e5ff" : "#4a6070",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* MODE */}
      <div className={SECTION}>
        <span className={LABEL} style={{ color: "#2a4050" }}>Encoding</span>
        <div className="grid grid-cols-2 gap-1">
          {(["binary", "ascii"] as ExportMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="py-1.5 rounded text-[11px] capitalize transition-all"
              style={{
                background: mode === m ? "rgba(0,229,255,0.1)" : "#13161d",
                border: `1px solid ${mode === m ? "rgba(0,229,255,0.3)" : "#1e2530"}`,
                color: mode === m ? "#00e5ff" : "#4a6070",
              }}
            >
              {m} {m === "binary" ? "(compact)" : "(readable)"}
            </button>
          ))}
        </div>
      </div>

      {/* OPTIONS */}
      <div className={SECTION}>
        <span className={LABEL} style={{ color: "#2a4050" }}>Options</span>
        <button
          onClick={() => setCompress(!compress)}
          className="flex items-center gap-2 w-full py-1.5 px-2 rounded transition-all"
          style={{ background: "#13161d", border: "1px solid #1e2530" }}
        >
          <span
            className="w-3 h-3 rounded-sm flex-shrink-0 transition-all"
            style={{ background: compress ? "#00e5ff" : "transparent", border: "1px solid #2a4050" }}
          />
          <span style={{ color: compress ? "#c8d8e8" : "#4a6070" }}>Compress to ZIP</span>
        </button>
      </div>

      {/* VALIDATION */}
      <div className={SECTION}>
        <span className={LABEL} style={{ color: "#2a4050" }}>Mesh Validation</span>
        <button
          onClick={handleValidate}
          disabled={!canExport || isValidating}
          className={BTN}
          style={{
            background: "#13161d",
            border: "1px solid #1e2530",
            color: canExport ? "#7fa8c0" : "#2a4050",
          }}
        >
          {isValidating ? "Validating..." : "Run Mesh Validation"}
        </button>

        {validation && (
          <div className="mt-2 rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1e2530" }}>
            <div className="flex items-center gap-1.5 mb-2">
              <span
                className="text-[10px] font-bold uppercase"
                style={{ color: validation.valid ? "#00e5ff" : "#ff5252" }}
              >
                {validation.isPrintReady ? "Print Ready" : validation.valid ? "Valid" : "Issues Found"}
              </span>
              {validation.isWatertight && (
                <span className="text-[9px] px-1 rounded" style={{ background: "rgba(0,229,255,0.1)", color: "#00e5ff" }}>
                  Watertight
                </span>
              )}
            </div>
            <Row label="Triangles" value={validation.triangleCount.toLocaleString()} />
            <Row label="Vertices" value={validation.vertexCount.toLocaleString()} />
            <Row label="Degenerate Tris" value={validation.degenerateTriangles} />
            <Row label="Non-Manifold" value={validation.nonManifoldEdges} />
            <Row label="Open Boundaries" value={validation.openBoundaries} />
            <Row label="Min Face Angle" value={`${validation.minFaceAngleDeg}°`} />
            <Row label="Max Aspect Ratio" value={`${validation.maxAspectRatio}×`} />

            {validation.errors.map((e, i) => (
              <div key={i} className="flex items-start gap-1.5 mt-1.5">
                <StatusDot ok={false} />
                <span className="text-[10px]" style={{ color: "#ff5252" }}>{e}</span>
              </div>
            ))}
            {validation.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 mt-1.5">
                <StatusDot ok={true} />
                <span className="text-[10px]" style={{ color: "#ffcc00" }}>{w}</span>
              </div>
            ))}

            {/* 3D Printing compat */}
            <div className="mt-2 pt-2" style={{ borderTop: "1px solid #1e2530" }}>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-wider" style={{ color: "#2a4050" }}>3D Print Compat</span>
              </div>
              {[
                { label: "Manifold", ok: validation.nonManifoldEdges === 0 },
                { label: "Watertight", ok: validation.isWatertight },
                { label: "No Degenerates", ok: validation.degenerateTriangles === 0 },
                { label: "Face Angles ≥ 5°", ok: validation.minFaceAngleDeg >= 5 },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-1.5 mt-1">
                  <StatusDot ok={ok} />
                  <span className="text-[10px]" style={{ color: ok ? "#4a6070" : "#ff5252" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* EXPORT CURRENT */}
      <div className={SECTION}>
        <span className={LABEL} style={{ color: "#2a4050" }}>Export Current Scan</span>
        <button
          onClick={handleExportCurrent}
          disabled={!canExport || isExporting}
          className={BTN}
          style={{
            background: canExport ? "rgba(0,229,255,0.1)" : "#13161d",
            border: `1px solid ${canExport ? "rgba(0,229,255,0.3)" : "#1e2530"}`,
            color: canExport ? "#00e5ff" : "#2a4050",
          }}
        >
          {isExporting ? "Exporting..." : `Export as ${format.toUpperCase()} (${mode})`}
        </button>
      </div>

      {/* EXPORT SEGMENTS */}
      {hasSegments && (
        <div className={SECTION}>
          <span className={LABEL} style={{ color: "#2a4050" }}>Export Individual Teeth</span>
          <button
            onClick={handleExportSegments}
            disabled={isExporting}
            className={BTN}
            style={{
              background: "rgba(76,255,184,0.08)",
              border: "1px solid rgba(76,255,184,0.25)",
              color: "#4dffb8",
            }}
          >
            {isExporting ? "Exporting..." : `Export ${segResult!.segments.length} Teeth${compress ? " (ZIP)" : ""}`}
          </button>
          <p className="mt-1 text-[10px]" style={{ color: "#2a4050" }}>
            Each tooth as a separate {format.toUpperCase()} with applied transforms
          </p>
        </div>
      )}

      {/* EXPORT TREATMENT STAGES */}
      {hasStages && (
        <div className={SECTION}>
          <span className={LABEL} style={{ color: "#2a4050" }}>Export Treatment Stages</span>
          <div className="mb-1.5">
            <span className="text-[10px] block mb-1" style={{ color: "#3a5060" }}>Naming Convention</span>
            <div className="grid grid-cols-2 gap-1">
              {(["numeric", "clinical", "iso", "custom"] as StageNamingConvention[]).map((n) => (
                <button
                  key={n}
                  onClick={() => setStageNaming(n)}
                  className="py-1 rounded text-[10px] capitalize transition-all"
                  style={{
                    background: stageNaming === n ? "rgba(178,124,255,0.15)" : "#13161d",
                    border: `1px solid ${stageNaming === n ? "rgba(178,124,255,0.35)" : "#1e2530"}`,
                    color: stageNaming === n ? "#b87cff" : "#4a6070",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px]" style={{ color: "#2a4050" }}>
              {stageNaming === "numeric" && "scan_stage_01.stl"}
              {stageNaming === "clinical" && "scan_initial.stl / scan_final.stl"}
              {stageNaming === "iso" && "scan_T001.stl"}
              {stageNaming === "custom" && "scan_Stage-1.stl"}
            </p>
          </div>
          <button
            onClick={handleExportStages}
            disabled={isExporting || !hasSegments}
            className={BTN}
            style={{
              background: "rgba(178,124,255,0.1)",
              border: "1px solid rgba(178,124,255,0.3)",
              color: "#b87cff",
            }}
          >
            {isExporting ? "Exporting..." : `Export ${stages.length} Stages${compress ? " (ZIP)" : ""}`}
          </button>
          {!hasSegments && (
            <p className="mt-1 text-[10px]" style={{ color: "#ff5252" }}>Run segmentation first</p>
          )}
        </div>
      )}

      {/* BATCH EXPORT */}
      {scans.length > 0 && (
        <div className={SECTION}>
          <span className={LABEL} style={{ color: "#2a4050" }}>Batch Export from Library</span>
          <div
            className="rounded overflow-hidden mb-1.5"
            style={{ border: "1px solid #1e2530", maxHeight: 120, overflowY: "auto" }}
          >
            {scans.map((scan) => (
              <button
                key={scan.id}
                onClick={() => {
                  const next = new Set(batchIds);
                  if (next.has(scan.id)) next.delete(scan.id);
                  else next.add(scan.id);
                  setBatchIds(next);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 transition-all"
                style={{
                  background: batchIds.has(scan.id) ? "rgba(0,229,255,0.07)" : "transparent",
                  borderLeft: batchIds.has(scan.id) ? "2px solid #00e5ff" : "2px solid transparent",
                }}
              >
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{
                    background: batchIds.has(scan.id) ? "#00e5ff" : "transparent",
                    border: "1px solid #2a4050",
                  }}
                />
                <span className="text-[10px] truncate" style={{ color: batchIds.has(scan.id) ? "#c8d8e8" : "#4a6070" }}>
                  {scan.name}
                </span>
                <span className="ml-auto text-[9px] uppercase" style={{ color: "#2a4050" }}>{scan.fileFormat}</span>
              </button>
            ))}
          </div>
          <button
            onClick={handleBatchExport}
            disabled={batchIds.size === 0 || isExporting}
            className={BTN}
            style={{
              background: batchIds.size > 0 ? "rgba(255,153,64,0.1)" : "#13161d",
              border: `1px solid ${batchIds.size > 0 ? "rgba(255,153,64,0.3)" : "#1e2530"}`,
              color: batchIds.size > 0 ? "#ff9940" : "#2a4050",
            }}
          >
            {isExporting ? "Packaging..." : `Batch Export ${batchIds.size} Scan${batchIds.size !== 1 ? "s" : ""} (ZIP)`}
          </button>
        </div>
      )}
    </div>
  );
}
