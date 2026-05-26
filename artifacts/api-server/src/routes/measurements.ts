import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { measurementsTable, scansTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateMeasurementParams, CreateMeasurementBody, DeleteMeasurementParams } from "@workspace/api-zod";

const router = Router({ mergeParams: true });

router.get("/", async (req: Request, res: Response) => {
  const scanId = Number(req.params.id);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scan id" }); return; }
  const measurements = await db.select().from(measurementsTable)
    .where(eq(measurementsTable.scanId, scanId))
    .orderBy(measurementsTable.createdAt);
  res.json(measurements);
});

router.post("/", async (req: Request, res: Response) => {
  const params = CreateMeasurementParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid scan id" }); return; }
  const body = CreateMeasurementBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, params.data.id));
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }
  const [measurement] = await db.insert(measurementsTable).values({
    scanId: params.data.id,
    ...body.data,
  }).returning();
  res.status(201).json(measurement);
});

router.delete("/:measurementId", async (req: Request, res: Response) => {
  const params = DeleteMeasurementParams.safeParse({
    scanId: Number(req.params.id),
    measurementId: Number(req.params.measurementId),
  });
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  await db.delete(measurementsTable)
    .where(and(
      eq(measurementsTable.id, params.data.measurementId),
      eq(measurementsTable.scanId, params.data.scanId),
    ));
  res.status(204).send();
});

export { router as measurementsRouter };
