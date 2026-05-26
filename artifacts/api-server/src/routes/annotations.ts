import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { annotationsTable, scansTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateAnnotationParams, CreateAnnotationBody, DeleteAnnotationParams } from "@workspace/api-zod";

const router = Router({ mergeParams: true });

router.get("/", async (req: Request, res: Response) => {
  const scanId = Number(req.params.id);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scan id" }); return; }
  const annotations = await db.select().from(annotationsTable)
    .where(eq(annotationsTable.scanId, scanId))
    .orderBy(annotationsTable.createdAt);
  res.json(annotations);
});

router.post("/", async (req: Request, res: Response) => {
  const params = CreateAnnotationParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid scan id" }); return; }
  const body = CreateAnnotationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, params.data.id));
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }
  const [annotation] = await db.insert(annotationsTable).values({
    scanId: params.data.id,
    ...body.data,
  }).returning();
  res.status(201).json(annotation);
});

router.delete("/:annotationId", async (req: Request, res: Response) => {
  const params = DeleteAnnotationParams.safeParse({
    scanId: Number(req.params.id),
    annotationId: Number(req.params.annotationId),
  });
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  await db.delete(annotationsTable)
    .where(and(
      eq(annotationsTable.id, params.data.annotationId),
      eq(annotationsTable.scanId, params.data.scanId),
    ));
  res.status(204).send();
});

export { router as annotationsRouter };
