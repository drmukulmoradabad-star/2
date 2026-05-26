import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { db } from "@workspace/db";
import { scansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetScanParams,
  UpdateScanParams,
  UpdateScanBody,
  DeleteScanParams,
  GetScanFileParams,
} from "@workspace/api-zod";

const router = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".stl", ".obj", ".ply"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only STL, OBJ, and PLY files are allowed"));
    }
  },
});

function getFileFormat(filename: string): "stl" | "obj" | "ply" {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".stl") return "stl";
  if (ext === ".obj") return "obj";
  return "ply";
}

function estimateMeshStats(filePath: string, format: string): { vertexCount: number; triangleCount: number } {
  try {
    if (format === "stl") {
      const header = Buffer.alloc(84);
      const fd = fs.openSync(filePath, "r");
      fs.readSync(fd, header, 0, 84, 0);
      fs.closeSync(fd);
      const firstBytes = header.slice(0, 5).toString("ascii");
      if (firstBytes !== "solid") {
        const triangles = header.readUInt32LE(80);
        return { vertexCount: triangles * 3, triangleCount: triangles };
      }
    }
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const estimatedTris = Math.floor(fileSize / (format === "stl" ? 50 : 200));
    return { vertexCount: Math.floor(estimatedTris * 1.5), triangleCount: estimatedTris };
  } catch {
    return { vertexCount: 0, triangleCount: 0 };
  }
}

router.get("/stats", async (req: Request, res: Response) => {
  const scans = await db.select().from(scansTable);
  const totalFileSize = scans.reduce((sum, s) => sum + s.fileSize, 0);
  const avgVertexCount = scans.length > 0 ? Math.round(scans.reduce((sum, s) => sum + s.vertexCount, 0) / scans.length) : 0;
  const avgTriangleCount = scans.length > 0 ? Math.round(scans.reduce((sum, s) => sum + s.triangleCount, 0) / scans.length) : 0;
  const formatBreakdown: Record<string, number> = {};
  const jawBreakdown: Record<string, number> = {};
  for (const scan of scans) {
    formatBreakdown[scan.fileFormat] = (formatBreakdown[scan.fileFormat] || 0) + 1;
    jawBreakdown[scan.jaw] = (jawBreakdown[scan.jaw] || 0) + 1;
  }
  res.json({ totalScans: scans.length, totalFileSize, avgVertexCount, avgTriangleCount, formatBreakdown, jawBreakdown });
});

router.get("/", async (_req: Request, res: Response) => {
  const scans = await db.select().from(scansTable).orderBy(scansTable.uploadedAt);
  res.json(scans);
});

router.post("/", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const format = getFileFormat(req.file.originalname);
  const stats = estimateMeshStats(req.file.path, format);
  const name = req.body.name || path.basename(req.file.originalname, path.extname(req.file.originalname));
  const [scan] = await db.insert(scansTable).values({
    name,
    description: req.body.description || null,
    fileFormat: format,
    filePath: req.file.path,
    fileSize: req.file.size,
    vertexCount: stats.vertexCount,
    triangleCount: stats.triangleCount,
    jaw: (req.body.jaw as "upper" | "lower" | "both" | "unknown") || "unknown",
    patientId: req.body.patientId || null,
    scannerModel: req.body.scannerModel || null,
  }).returning();
  res.status(201).json(scan);
});

router.get("/:id", async (req: Request, res: Response) => {
  const parsed = GetScanParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, parsed.data.id));
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }
  res.json(scan);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const parsed = UpdateScanParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = UpdateScanBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [scan] = await db.update(scansTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(scansTable.id, parsed.data.id))
    .returning();
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }
  res.json(scan);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const parsed = DeleteScanParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [scan] = await db.delete(scansTable).where(eq(scansTable.id, parsed.data.id)).returning();
  if (scan?.filePath) {
    try { fs.unlinkSync(scan.filePath); } catch { }
  }
  res.status(204).send();
});

router.get("/:id/file", async (req: Request, res: Response) => {
  const parsed = GetScanFileParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, parsed.data.id));
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }
  if (!fs.existsSync(scan.filePath)) { res.status(404).json({ error: "File not found on disk" }); return; }
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${scan.name}.${scan.fileFormat}"`);
  res.sendFile(scan.filePath);
});

export { router as scansRouter };
