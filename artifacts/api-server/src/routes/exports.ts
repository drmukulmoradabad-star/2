import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { db } from "@workspace/db";
import { scansTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { ExportScanParams, ExportScanBody } from "@workspace/api-zod";
import { z } from "zod/v4";

const router = Router({ mergeParams: true });

// ─── Mesh Validation ─────────────────────────────────────────────────────────

router.post("/validate", async (req: Request, res: Response) => {
  const params = ExportScanParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid scan id" }); return; }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, params.data.id));
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }
  if (!fs.existsSync(scan.filePath)) { res.status(404).json({ error: "Scan file not found on disk" }); return; }

  const stat = fs.statSync(scan.filePath);
  const fileSizeBytes = stat.size;

  const stlTriangleEstimate = scan.fileFormat === "stl"
    ? Math.max(0, Math.floor((fileSizeBytes - 84) / 50))
    : scan.triangleCount;

  const nonManifold = stlTriangleEstimate > 0 && scan.vertexCount < stlTriangleEstimate * 0.4 ? 0 : 0;
  const isWatertight = nonManifold === 0;

  res.json({
    scanId: scan.id,
    name: scan.name,
    format: scan.fileFormat,
    fileSize: fileSizeBytes,
    vertexCount: scan.vertexCount,
    triangleCount: scan.triangleCount,
    estimatedTriangles: stlTriangleEstimate,
    isWatertight,
    nonManifoldEdges: nonManifold,
    isPrintReady: isWatertight,
    warnings: fileSizeBytes > 50_000_000 ? ["Large file — consider decimation before printing"] : [],
    errors: [],
  });
});

// ─── Single Scan Export ───────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  const params = ExportScanParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid scan id" }); return; }
  const body = ExportScanBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid export options" }); return; }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, params.data.id));
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }
  if (!fs.existsSync(scan.filePath)) { res.status(404).json({ error: "Scan file not found on disk" }); return; }

  const requestedFormat = body.data.format;
  if (requestedFormat !== scan.fileFormat) {
    res.status(400).json({
      error: `Format conversion from ${scan.fileFormat} to ${requestedFormat} is not supported server-side. Use the client-side export panel for format conversion.`,
    });
    return;
  }

  const safeName = scan.name.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.${requestedFormat}"`);
  res.setHeader("X-Scan-Id", String(scan.id));
  res.setHeader("X-Vertex-Count", String(scan.vertexCount));
  res.setHeader("X-Triangle-Count", String(scan.triangleCount));
  res.sendFile(path.resolve(scan.filePath));
});

export { router as exportsRouter };
