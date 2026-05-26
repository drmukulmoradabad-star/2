import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { patientsTable, scansTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

interface PatientBody {
  name?: string;
  dateOfBirth?: string;
  gender?: string;
  contactPhone?: string;
  contactEmail?: string;
  caseNotes?: string;
  referringDentist?: string;
  treatmentPlan?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// List all patients with scan counts
router.get("/", async (_req: Request, res: Response) => {
  const patients = await db.select().from(patientsTable).orderBy(patientsTable.createdAt);
  const allScans = await db.select({ id: scansTable.id, patientDbId: scansTable.patientDbId }).from(scansTable);
  const scanCounts: Record<number, number> = {};
  for (const scan of allScans) {
    if (scan.patientDbId) scanCounts[scan.patientDbId] = (scanCounts[scan.patientDbId] || 0) + 1;
  }
  res.json(patients.map((p) => ({ ...p, scanCount: scanCounts[p.id] || 0 })));
});

// Get single patient with their scans
router.get("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, id));
  if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }
  const scans = await db.select().from(scansTable).where(eq(scansTable.patientDbId, id));
  res.json({ ...patient, scans });
});

// Create patient
router.post("/", async (req: Request, res: Response) => {
  const b = req.body as PatientBody;
  if (!b?.name || typeof b.name !== "string" || !b.name.trim()) {
    res.status(400).json({ error: "name is required" }); return;
  }
  const [patient] = await db.insert(patientsTable).values({
    name: b.name.trim(),
    dateOfBirth: str(b.dateOfBirth),
    gender: str(b.gender),
    contactPhone: str(b.contactPhone),
    contactEmail: str(b.contactEmail),
    caseNotes: str(b.caseNotes),
    referringDentist: str(b.referringDentist),
    treatmentPlan: str(b.treatmentPlan),
  }).returning();
  res.status(201).json(patient);
});

// Update patient
router.patch("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const b = req.body as PatientBody;
  const updates: Partial<typeof patientsTable.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (str(b.name)) updates.name = (b.name as string).trim();
  if ("dateOfBirth" in b) updates.dateOfBirth = str(b.dateOfBirth);
  if ("gender" in b) updates.gender = str(b.gender);
  if ("contactPhone" in b) updates.contactPhone = str(b.contactPhone);
  if ("contactEmail" in b) updates.contactEmail = str(b.contactEmail);
  if ("caseNotes" in b) updates.caseNotes = str(b.caseNotes);
  if ("referringDentist" in b) updates.referringDentist = str(b.referringDentist);
  if ("treatmentPlan" in b) updates.treatmentPlan = str(b.treatmentPlan);
  const [patient] = await db.update(patientsTable).set(updates).where(eq(patientsTable.id, id)).returning();
  if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }
  res.json(patient);
});

// Delete patient
router.delete("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(scansTable).set({ patientDbId: null }).where(eq(scansTable.patientDbId, id));
  await db.delete(patientsTable).where(eq(patientsTable.id, id));
  res.status(204).end();
});

// Assign a scan to a patient
router.post("/:id/scans/:scanId", async (req: Request, res: Response) => {
  const patientId = Number(req.params.id);
  const scanId = Number(req.params.scanId);
  if (!patientId || !scanId) { res.status(400).json({ error: "Invalid ids" }); return; }
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, patientId));
  if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }
  const [scan] = await db.update(scansTable).set({ patientDbId: patientId }).where(eq(scansTable.id, scanId)).returning();
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }
  res.json(scan);
});

// Remove a scan from a patient
router.delete("/:id/scans/:scanId", async (req: Request, res: Response) => {
  const scanId = Number(req.params.scanId);
  if (!scanId) { res.status(400).json({ error: "Invalid scan id" }); return; }
  const [scan] = await db.update(scansTable).set({ patientDbId: null }).where(eq(scansTable.id, scanId)).returning();
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }
  res.json(scan);
});

export { router as patientsRouter };
