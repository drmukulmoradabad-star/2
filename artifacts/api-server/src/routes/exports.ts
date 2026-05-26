import { Router, Request, Response } from "express";
import fs from "fs";
import { db } from "@workspace/db";
import { scansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ExportScanParams, ExportScanBody } from "@workspace/api-zod";

const router = Router({ mergeParams: true });

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
    res.status(400).json({ error: `Format conversion from ${scan.fileFormat} to ${requestedFormat} is not yet supported. Export in the original format: ${scan.fileFormat}` });
    return;
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${scan.name}.${requestedFormat}"`);
  res.sendFile(scan.filePath);
});

export { router as exportsRouter };
