import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { scansRouter } from "./scans";
import { measurementsRouter } from "./measurements";
import { annotationsRouter } from "./annotations";
import { exportsRouter } from "./exports";
import { patientsRouter } from "./patients";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/patients", patientsRouter);
router.use("/scans", scansRouter);
router.use("/scans/:id/measurements", measurementsRouter);
router.use("/scans/:id/annotations", annotationsRouter);
router.use("/scans/:id/export", exportsRouter);
router.use("/openai", openaiRouter);

export default router;
