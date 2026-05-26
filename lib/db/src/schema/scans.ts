import { pgTable, serial, text, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fileFormatEnum = pgEnum("file_format", ["stl", "obj", "ply"]);
export const jawEnum = pgEnum("jaw_type", ["upper", "lower", "both", "unknown"]);
export const measurementTypeEnum = pgEnum("measurement_type", ["distance", "angle", "area", "perimeter", "depth"]);

export const patientsTable = pgTable("patients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  caseNotes: text("case_notes"),
  referringDentist: text("referring_dentist"),
  treatmentPlan: text("treatment_plan"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;

export const scansTable = pgTable("scans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  fileFormat: fileFormatEnum("file_format").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  vertexCount: integer("vertex_count").notNull().default(0),
  triangleCount: integer("triangle_count").notNull().default(0),
  jaw: jawEnum("jaw").notNull().default("unknown"),
  patientId: text("patient_id"),
  patientDbId: integer("patient_db_id").references(() => patientsTable.id, { onDelete: "set null" }),
  scannerModel: text("scanner_model"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const measurementsTable = pgTable("measurements", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().references(() => scansTable.id, { onDelete: "cascade" }),
  type: measurementTypeEnum("type").notNull(),
  label: text("label").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  pointA: text("point_a"),
  pointB: text("point_b"),
  pointC: text("point_c"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const annotationsTable = pgTable("annotations", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().references(() => scansTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  notes: text("notes"),
  position: text("position").notNull(),
  color: text("color").notNull().default("#00e5ff"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScanSchema = createInsertSchema(scansTable).omit({ id: true, uploadedAt: true, updatedAt: true });
export const insertMeasurementSchema = createInsertSchema(measurementsTable).omit({ id: true, createdAt: true });
export const insertAnnotationSchema = createInsertSchema(annotationsTable).omit({ id: true, createdAt: true });

export type InsertScan = z.infer<typeof insertScanSchema>;
export type Scan = typeof scansTable.$inferSelect;
export type InsertMeasurement = z.infer<typeof insertMeasurementSchema>;
export type Measurement = typeof measurementsTable.$inferSelect;
export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;
export type Annotation = typeof annotationsTable.$inferSelect;
