/**
 * AIEngine — dental AI/ML analysis algorithms.
 *
 * All algorithms here are deterministic geometric methods.
 * The MLModelAdapter interface at the bottom provides a seam for
 * future plug-in of real neural network models without refactoring callers.
 */

import * as THREE from "three";
import type { ToothSegment } from "../segmentation/SegmentationEngine";
import type { ToothTransform } from "../movement/movementStore";

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface CollisionReport {
  pairs: CollisionPair[];
  totalPenetrationDepth: number;
  riskLevel: "none" | "low" | "moderate" | "high";
}

export interface CollisionPair {
  idA: string;
  idB: string;
  labelA: string;
  labelB: string;
  penetrationDepth: number;
  contactPoint: [number, number, number];
}

export interface Landmark {
  id: string;
  type: LandmarkType;
  label: string;
  position: THREE.Vector3;
  confidence: number;
  toothId?: string;
}

export type LandmarkType =
  | "cusp_tip"
  | "contact_point"
  | "arch_midline"
  | "molar_centroid"
  | "incisor_edge"
  | "gingival_margin";

export interface GingivaSegmentation {
  gingivaFaceIndices: number[];
  gingivaVertexIndices: Set<number>;
  volume: number;
  area: number;
}

export type ArchForm = "parabolic" | "elliptical" | "tapered" | "square" | "ovoid";

export interface ArchFormAnalysis {
  detectedForm: ArchForm;
  confidence: number;
  archWidth: number;
  archDepth: number;
  symmetryScore: number;
  idealArchPoints: THREE.Vector3[];
  recommendedForm: ArchForm;
}

export interface TreatmentPrediction {
  estimatedStages: number;
  totalMovementMm: number;
  maxSingleToothMovementMm: number;
  complexityScore: number;
  complexityLabel: "simple" | "moderate" | "complex" | "surgical";
  riskFactors: string[];
  recommendations: string[];
  predictedDurationWeeks: number;
}

export interface ToothNumberingResult {
  assignments: Record<string, { fdi: number; universal: number; confidence: number; label: string }>;
  method: "spatial" | "arch_position" | "size_heuristic";
  confidence: number;
}

export interface AlignmentSuggestion {
  segmentId: string;
  suggestedPosition: [number, number, number];
  suggestedRotation: [number, number, number];
  confidence: number;
  displacementMm: number;
  reason: string;
}

// ─── ML Model Adapter (seam for future ML integration) ────────────────────────

export interface MLModelAdapter {
  name: string;
  version: string;
  isLoaded: boolean;
  load(): Promise<void>;
  predict(input: Float32Array): Promise<Float32Array>;
  dispose(): void;
}

export class StubMLAdapter implements MLModelAdapter {
  name = "stub";
  version = "0.0.0";
  isLoaded = false;
  async load() { this.isLoaded = true; }
  async predict(input: Float32Array) { return new Float32Array(input.length); }
  dispose() {}
}

let _registeredModel: MLModelAdapter = new StubMLAdapter();

export function registerMLModel(adapter: MLModelAdapter) {
  _registeredModel = adapter;
}

export function getMLModel(): MLModelAdapter {
  return _registeredModel;
}

// ─── Collision Prediction ─────────────────────────────────────────────────────

export function predictCollisions(
  segments: ToothSegment[],
  transforms: Record<string, ToothTransform>,
  expandMarginMm = 0.1
): CollisionReport {
  const boxes = segments.map((seg) => {
    const t = transforms[seg.id];
    let box = seg.boundingBox.clone();
    if (t) {
      const mat = new THREE.Matrix4();
      mat.compose(
        new THREE.Vector3(...t.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.rotation, "XYZ")),
        new THREE.Vector3(...t.scale)
      );
      box.applyMatrix4(mat);
    }
    box.expandByScalar(expandMarginMm);
    return { id: seg.id, label: seg.label, box, centroid: seg.centroid.clone() };
  });

  const pairs: CollisionPair[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (!a.box.intersectsBox(b.box)) continue;

      const aCenter = new THREE.Vector3(); a.box.getCenter(aCenter);
      const bCenter = new THREE.Vector3(); b.box.getCenter(bCenter);
      const aSize = new THREE.Vector3(); a.box.getSize(aSize);
      const bSize = new THREE.Vector3(); b.box.getSize(bSize);

      const overlap = new THREE.Vector3(
        Math.max(0, (aSize.x + bSize.x) / 2 - Math.abs(aCenter.x - bCenter.x)),
        Math.max(0, (aSize.y + bSize.y) / 2 - Math.abs(aCenter.y - bCenter.y)),
        Math.max(0, (aSize.z + bSize.z) / 2 - Math.abs(aCenter.z - bCenter.z))
      );
      const depth = Math.min(overlap.x, overlap.y, overlap.z);
      const contact = aCenter.clone().add(bCenter).multiplyScalar(0.5);

      pairs.push({
        idA: a.id, idB: b.id,
        labelA: a.label, labelB: b.label,
        penetrationDepth: parseFloat(depth.toFixed(3)),
        contactPoint: [contact.x, contact.y, contact.z],
      });
    }
  }

  const totalDepth = pairs.reduce((s, p) => s + p.penetrationDepth, 0);
  const riskLevel: CollisionReport["riskLevel"] =
    pairs.length === 0 ? "none" :
    totalDepth < 0.5 ? "low" :
    totalDepth < 2 ? "moderate" : "high";

  return { pairs, totalPenetrationDepth: parseFloat(totalDepth.toFixed(3)), riskLevel };
}

// ─── Landmark Detection ───────────────────────────────────────────────────────

export function detectLandmarks(segments: ToothSegment[]): Landmark[] {
  const landmarks: Landmark[] = [];

  if (segments.length === 0) return landmarks;

  const allCentroids = segments.map((s) => s.centroid.clone());
  const mean = new THREE.Vector3();
  allCentroids.forEach((c) => mean.add(c));
  mean.divideScalar(allCentroids.length);

  landmarks.push({
    id: "arch_midline",
    type: "arch_midline",
    label: "Arch Midline",
    position: mean.clone(),
    confidence: 0.85,
  });

  for (const seg of segments) {
    const bb = seg.boundingBox;
    const size = new THREE.Vector3();
    bb.getSize(size);

    const topPoint = new THREE.Vector3(
      seg.centroid.x,
      bb.max.y,
      seg.centroid.z
    );
    landmarks.push({
      id: `cusp_${seg.id}`,
      type: "cusp_tip",
      label: `Cusp — ${seg.label}`,
      position: topPoint,
      confidence: 0.72,
      toothId: seg.id,
    });

    if (seg.fdiNumber && (
      (seg.fdiNumber >= 11 && seg.fdiNumber <= 22) ||
      (seg.fdiNumber >= 31 && seg.fdiNumber <= 42)
    )) {
      landmarks.push({
        id: `incisor_${seg.id}`,
        type: "incisor_edge",
        label: `Incisal Edge — ${seg.label}`,
        position: topPoint.clone(),
        confidence: 0.8,
        toothId: seg.id,
      });
    }

    const gingivalPoint = new THREE.Vector3(
      seg.centroid.x,
      bb.min.y,
      seg.centroid.z
    );
    landmarks.push({
      id: `gingival_${seg.id}`,
      type: "gingival_margin",
      label: `Gingival Margin — ${seg.label}`,
      position: gingivalPoint,
      confidence: 0.65,
      toothId: seg.id,
    });
  }

  const sorted = [...segments].sort((a, b) => a.centroid.x - b.centroid.x);
  for (let i = 0; i < sorted.length - 1; i++) {
    const ca = sorted[i].centroid;
    const cb = sorted[i + 1].centroid;
    landmarks.push({
      id: `contact_${sorted[i].id}_${sorted[i + 1].id}`,
      type: "contact_point",
      label: `Contact — ${sorted[i].label}/${sorted[i + 1].label}`,
      position: ca.clone().add(cb).multiplyScalar(0.5),
      confidence: 0.6,
    });
  }

  return landmarks;
}

// ─── Gingiva Segmentation ────────────────────────────────────────────────────

export function segmentGingiva(
  geometry: THREE.BufferGeometry,
  toothSegments: ToothSegment[]
): GingivaSegmentation {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const getI = (i: number) => idx ? idx.getX(i) : i;

  const toothFaces = new Set<number>();
  for (const seg of toothSegments) {
    for (const f of seg.faceIndices) toothFaces.add(f);
  }

  const gingivaFaces: number[] = [];
  const gingivaVerts = new Set<number>();

  for (let f = 0; f < triCount; f++) {
    if (!toothFaces.has(f)) {
      gingivaFaces.push(f);
      gingivaVerts.add(getI(f * 3));
      gingivaVerts.add(getI(f * 3 + 1));
      gingivaVerts.add(getI(f * 3 + 2));
    }
  }

  let area = 0;
  for (const f of gingivaFaces) {
    const i0 = getI(f * 3), i1 = getI(f * 3 + 1), i2 = getI(f * 3 + 2);
    const p0 = new THREE.Vector3(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
    const p1 = new THREE.Vector3(pos.getX(i1), pos.getY(i1), pos.getZ(i1));
    const p2 = new THREE.Vector3(pos.getX(i2), pos.getY(i2), pos.getZ(i2));
    area += p1.sub(p0).cross(p2.sub(p0)).length() * 0.5;
  }

  return {
    gingivaFaceIndices: gingivaFaces,
    gingivaVertexIndices: gingivaVerts,
    volume: 0,
    area: parseFloat(area.toFixed(2)),
  };
}

// ─── Arch Form Analysis ───────────────────────────────────────────────────────

export function analyzeArchForm(segments: ToothSegment[]): ArchFormAnalysis {
  if (segments.length < 4) {
    return {
      detectedForm: "parabolic", confidence: 0, archWidth: 0, archDepth: 0,
      symmetryScore: 0, idealArchPoints: [], recommendedForm: "parabolic"
    };
  }

  const centroids = segments.map((s) => s.centroid.clone());
  const xs = centroids.map((c) => c.x);
  const zs = centroids.map((c) => c.z);
  const archWidth = Math.max(...xs) - Math.min(...xs);
  const archDepth = Math.max(...zs) - Math.min(...zs);
  const widthDepthRatio = archWidth / (archDepth || 1);

  let detectedForm: ArchForm;
  let confidence: number;

  if (widthDepthRatio > 1.8) {
    detectedForm = "square"; confidence = 0.75;
  } else if (widthDepthRatio > 1.4) {
    detectedForm = "ovoid"; confidence = 0.8;
  } else if (widthDepthRatio > 1.1) {
    detectedForm = "elliptical"; confidence = 0.78;
  } else if (widthDepthRatio > 0.8) {
    detectedForm = "parabolic"; confidence = 0.82;
  } else {
    detectedForm = "tapered"; confidence = 0.7;
  }

  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  let asymmetry = 0;
  for (const c of centroids) {
    const distLeft = Math.abs(c.x - (midX - archWidth / 4));
    const distRight = Math.abs(c.x - (midX + archWidth / 4));
    asymmetry += Math.abs(distLeft - distRight);
  }
  const symmetryScore = Math.max(0, 1 - asymmetry / (segments.length * archWidth * 0.5));

  const idealArchPoints = generateIdealArchPoints(archWidth, archDepth, detectedForm);

  const recommendedForm: ArchForm =
    symmetryScore > 0.8 ? detectedForm :
    widthDepthRatio > 1.5 ? "ovoid" : "parabolic";

  return {
    detectedForm,
    confidence: parseFloat(confidence.toFixed(2)),
    archWidth: parseFloat(archWidth.toFixed(2)),
    archDepth: parseFloat(archDepth.toFixed(2)),
    symmetryScore: parseFloat(symmetryScore.toFixed(2)),
    idealArchPoints,
    recommendedForm,
  };
}

function generateIdealArchPoints(width: number, depth: number, form: ArchForm, n = 16): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const halfW = width / 2;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1;
    let x = t * halfW;
    let z: number;
    switch (form) {
      case "parabolic": z = -depth * t * t + depth * 0.5; break;
      case "elliptical": z = depth * 0.5 * Math.sqrt(Math.max(0, 1 - (t * t))); break;
      case "square": z = i < n / 3 || i > 2 * n / 3 ? 0 : depth * 0.5; break;
      case "tapered": z = -depth * 0.6 * t * t; break;
      case "ovoid": z = depth * 0.45 * Math.sqrt(Math.max(0, 1 - 0.7 * t * t)); break;
      default: z = -depth * t * t + depth * 0.3;
    }
    points.push(new THREE.Vector3(x, 0, z));
  }
  return points;
}

// ─── AI Tooth Numbering ───────────────────────────────────────────────────────

export function runAIToothNumbering(
  segments: ToothSegment[],
  jaw: "upper" | "lower" | "both" | "unknown" = "unknown"
): ToothNumberingResult {
  if (segments.length === 0) {
    return { assignments: {}, method: "spatial", confidence: 0 };
  }

  const sorted = [...segments].sort((a, b) => a.centroid.x - b.centroid.x);
  const n = sorted.length;

  const fdiUpper = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const fdiLower = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  const fdiMap = jaw === "lower" ? fdiLower : fdiUpper;

  const universalMap: Record<number, number> = {
    18: 1, 17: 2, 16: 3, 15: 4, 14: 5, 13: 6, 12: 7, 11: 8,
    21: 9, 22: 10, 23: 11, 24: 12, 25: 13, 26: 14, 27: 15, 28: 16,
    38: 17, 37: 18, 36: 19, 35: 20, 34: 21, 33: 22, 32: 23, 31: 24,
    41: 25, 42: 26, 43: 27, 44: 28, 45: 29, 46: 30, 47: 31, 48: 32,
  };

  const assignments: ToothNumberingResult["assignments"] = {};
  const startOffset = Math.max(0, Math.floor((fdiMap.length - n) / 2));

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    const fdi = fdiMap[startOffset + i] ?? null;
    const universal = fdi ? (universalMap[fdi] ?? null) : null;

    const bb = new THREE.Vector3(); seg.boundingBox.getSize(bb);
    const sizeConfidence = bb.x > 0.2 && bb.y > 0.2 ? 0.8 : 0.5;
    const posConfidence = n >= 4 ? 0.85 : 0.65;
    const confidence = Math.min(0.95, (sizeConfidence + posConfidence) / 2);

    assignments[seg.id] = {
      fdi: fdi ?? 0,
      universal: universal ?? 0,
      confidence: parseFloat(confidence.toFixed(2)),
      label: fdi ? `FDI ${fdi}` : `Tooth ${i + 1}`,
    };
  }

  const avgConf = Object.values(assignments).reduce((s, a) => s + a.confidence, 0) / n;
  return {
    assignments,
    method: "arch_position",
    confidence: parseFloat(avgConf.toFixed(2)),
  };
}

// ─── Treatment Prediction ────────────────────────────────────────────────────

export function predictTreatment(
  segments: ToothSegment[],
  finalTransforms: Record<string, ToothTransform>
): TreatmentPrediction {
  if (segments.length === 0) {
    return {
      estimatedStages: 0, totalMovementMm: 0, maxSingleToothMovementMm: 0,
      complexityScore: 0, complexityLabel: "simple", riskFactors: [],
      recommendations: [], predictedDurationWeeks: 0,
    };
  }

  let totalMovement = 0;
  let maxMovement = 0;
  const riskFactors: string[] = [];
  const recommendations: string[] = [];

  for (const seg of segments) {
    const t = finalTransforms[seg.id];
    if (!t) continue;
    const posVec = new THREE.Vector3(...t.position);
    const dist = posVec.length();
    totalMovement += dist;
    maxMovement = Math.max(maxMovement, dist);

    const rotMag = Math.sqrt(t.rotation.reduce((s, r) => s + r * r, 0)) * (180 / Math.PI);
    if (rotMag > 20) riskFactors.push(`High rotation on ${seg.label} (${rotMag.toFixed(0)}°)`);
    if (dist > 3) riskFactors.push(`Large displacement on ${seg.label} (${dist.toFixed(1)} mm)`);
  }

  const stagesPerMm = 4;
  const baseStages = Math.ceil(maxMovement * stagesPerMm);
  const estimatedStages = Math.max(4, Math.min(40, baseStages));

  const complexityScore = Math.min(1, (maxMovement / 5 + riskFactors.length / 4) * 0.5);
  const complexityLabel: TreatmentPrediction["complexityLabel"] =
    complexityScore < 0.25 ? "simple" :
    complexityScore < 0.5 ? "moderate" :
    complexityScore < 0.8 ? "complex" : "surgical";

  const weeksPerStage = 2;
  const predictedDurationWeeks = estimatedStages * weeksPerStage;

  if (maxMovement < 1) recommendations.push("Minor alignment — clear aligner candidate");
  if (maxMovement >= 1 && maxMovement < 3) recommendations.push("Moderate movement — standard aligner protocol");
  if (maxMovement >= 3) recommendations.push("Significant movement — consider attachments or auxiliaries");
  if (riskFactors.length === 0) recommendations.push("No high-risk movements detected");
  if (segments.length < 6) recommendations.push("Partial arch — verify occlusion on opposing arch");

  return {
    estimatedStages,
    totalMovementMm: parseFloat(totalMovement.toFixed(2)),
    maxSingleToothMovementMm: parseFloat(maxMovement.toFixed(2)),
    complexityScore: parseFloat(complexityScore.toFixed(2)),
    complexityLabel,
    riskFactors,
    recommendations,
    predictedDurationWeeks,
  };
}

// ─── Spacing & Crowding Analysis ─────────────────────────────────────────────

export interface ToothGap {
  idA: string; idB: string;
  labelA: string; labelB: string;
  gap: number;
  status: "contact" | "spaced" | "crowded";
}

export interface SpacingAnalysis {
  toothGaps: ToothGap[];
  totalCrowding: number;
  spacingCount: number;
  crowdingCount: number;
  crowdingLevel: "none" | "mild" | "moderate" | "severe";
  recommendations: string[];
}

export function analyzeSpacingCrowding(segments: ToothSegment[]): SpacingAnalysis {
  if (segments.length < 2) {
    return { toothGaps: [], totalCrowding: 0, spacingCount: 0, crowdingCount: 0, crowdingLevel: "none", recommendations: [] };
  }

  const sorted = [...segments].sort((a, b) => a.centroid.x - b.centroid.x);
  const gaps: ToothGap[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const aSize = new THREE.Vector3(); a.boundingBox.getSize(aSize);
    const bSize = new THREE.Vector3(); b.boundingBox.getSize(bSize);
    const centerDist = Math.abs(b.centroid.x - a.centroid.x);
    const expectedContact = (aSize.x + bSize.x) / 2;
    const gap = centerDist - expectedContact;
    const status: ToothGap["status"] = gap < -0.1 ? "crowded" : gap > 0.5 ? "spaced" : "contact";
    gaps.push({ idA: a.id, idB: b.id, labelA: a.label, labelB: b.label, gap: parseFloat(gap.toFixed(2)), status });
  }

  const totalCrowding = gaps.filter((g) => g.status === "crowded").reduce((s, g) => s + Math.abs(g.gap), 0);
  const crowdingCount = gaps.filter((g) => g.status === "crowded").length;
  const spacingCount = gaps.filter((g) => g.status === "spaced").length;

  const crowdingLevel: SpacingAnalysis["crowdingLevel"] =
    totalCrowding === 0 ? "none" :
    totalCrowding < 2 ? "mild" :
    totalCrowding < 5 ? "moderate" : "severe";

  const recommendations: string[] = [];
  if (crowdingLevel === "none" && spacingCount === 0) recommendations.push("Ideal spacing — no intervention needed");
  if (crowdingLevel === "mild") recommendations.push("Mild crowding — IPR or minor expansion may resolve");
  if (crowdingLevel === "moderate") recommendations.push("Moderate crowding — consider extraction or arch expansion");
  if (crowdingLevel === "severe") recommendations.push("Severe crowding — comprehensive treatment planning required");
  if (spacingCount > 2) recommendations.push(`${spacingCount} spacing gaps detected — consider closure mechanics`);

  return { toothGaps: gaps, totalCrowding: parseFloat(totalCrowding.toFixed(2)), spacingCount, crowdingCount, crowdingLevel, recommendations };
}

// ─── Rotation Analysis ────────────────────────────────────────────────────────

export interface RotationEntry {
  id: string; label: string;
  estimatedRotation: number;
  severity: "normal" | "mild" | "moderate" | "severe";
}

export interface RotationAnalysis {
  teeth: RotationEntry[];
  maxRotation: number;
  meanRotation: number;
  rotatedCount: number;
}

export function analyzeRotations(
  segments: ToothSegment[],
  transforms: Record<string, ToothTransform>
): RotationAnalysis {
  const teeth: RotationEntry[] = [];

  for (const seg of segments) {
    const t = transforms[seg.id];
    const rotY = t ? Math.abs(t.rotation[1]) * (180 / Math.PI) : 0;
    const severity: RotationEntry["severity"] =
      rotY < 5 ? "normal" : rotY < 15 ? "mild" : rotY < 25 ? "moderate" : "severe";
    teeth.push({ id: seg.id, label: seg.label, estimatedRotation: parseFloat(rotY.toFixed(1)), severity });
  }

  const rots = teeth.map((t) => t.estimatedRotation);
  return {
    teeth,
    maxRotation: rots.length ? parseFloat(Math.max(...rots).toFixed(1)) : 0,
    meanRotation: rots.length ? parseFloat((rots.reduce((s, r) => s + r, 0) / rots.length).toFixed(1)) : 0,
    rotatedCount: teeth.filter((t) => t.severity !== "normal").length,
  };
}

// ─── Midline Deviation ────────────────────────────────────────────────────────

export interface MidlineDeviation {
  upperMidlineX: number;
  lowerMidlineX: number;
  archMidlineX: number;
  deviation: number;
  direction: "left" | "right" | "centered";
  severity: "none" | "mild" | "moderate" | "severe";
  recommendation: string;
}

export function detectMidlineDeviation(segments: ToothSegment[]): MidlineDeviation {
  if (segments.length < 4) {
    return {
      upperMidlineX: 0, lowerMidlineX: 0, archMidlineX: 0,
      deviation: 0, direction: "centered", severity: "none",
      recommendation: "Insufficient segments for midline analysis",
    };
  }

  const xs = segments.map((s) => s.centroid.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const archMidlineX = (minX + maxX) / 2;

  // Upper/lower split by Z (anterior teeth have higher Z)
  const sorted = [...segments].sort((a, b) => b.centroid.z - a.centroid.z);
  const anteriorCount = Math.max(2, Math.floor(sorted.length * 0.4));
  const anteriorTeeth = sorted.slice(0, anteriorCount);
  const midPoints = anteriorTeeth.map((s) => s.centroid.x);
  const upperMidlineX = midPoints.reduce((s, x) => s + x, 0) / midPoints.length;
  const lowerMidlineX = archMidlineX; // approximate

  const deviation = Math.abs(upperMidlineX - archMidlineX);
  const direction: MidlineDeviation["direction"] =
    Math.abs(deviation) < 0.2 ? "centered" : upperMidlineX < archMidlineX ? "left" : "right";

  const severity: MidlineDeviation["severity"] =
    deviation < 0.5 ? "none" : deviation < 1.5 ? "mild" : deviation < 3 ? "moderate" : "severe";

  const recommendation =
    severity === "none" ? "Midline centered — no correction needed" :
    severity === "mild" ? `Mild ${direction} deviation (${deviation.toFixed(1)} mm) — monitor` :
    severity === "moderate" ? `Moderate ${direction} shift — consider midline correction mechanics` :
    `Severe midline deviation — surgical or complex mechanics may be required`;

  return {
    upperMidlineX: parseFloat(upperMidlineX.toFixed(2)),
    lowerMidlineX: parseFloat(lowerMidlineX.toFixed(2)),
    archMidlineX: parseFloat(archMidlineX.toFixed(2)),
    deviation: parseFloat(deviation.toFixed(2)),
    direction, severity, recommendation,
  };
}

// ─── Overbite / Overjet ───────────────────────────────────────────────────────

export interface OverbiteOverjet {
  estimatedOverbite: number;
  estimatedOverjet: number;
  overbiteClass: "normal" | "reduced" | "deep_bite" | "open_bite";
  overjetClass: "normal" | "reduced" | "increased";
  recommendations: string[];
}

export function estimateOverbiteOverjet(segments: ToothSegment[]): OverbiteOverjet {
  if (segments.length < 4) {
    return { estimatedOverbite: 0, estimatedOverjet: 0, overbiteClass: "normal", overjetClass: "normal", recommendations: [] };
  }

  // Estimate from bounding-box geometry
  const ys = segments.map((s) => s.centroid.y);
  const yRange = Math.max(...ys) - Math.min(...ys);
  const estimatedOverbite = parseFloat((yRange * 0.15).toFixed(2));
  const estimatedOverjet = parseFloat((yRange * 0.10).toFixed(2));

  const overbiteClass: OverbiteOverjet["overbiteClass"] =
    estimatedOverbite < 0.5 ? "open_bite" :
    estimatedOverbite < 1.5 ? "reduced" :
    estimatedOverbite < 4.0 ? "normal" : "deep_bite";

  const overjetClass: OverbiteOverjet["overjetClass"] =
    estimatedOverjet < 0.5 ? "reduced" :
    estimatedOverjet < 4.0 ? "normal" : "increased";

  const recommendations: string[] = [];
  if (overbiteClass === "deep_bite") recommendations.push("Deep bite detected — intrusion mechanics may be indicated");
  if (overbiteClass === "open_bite") recommendations.push("Open bite — consider vertical control mechanics");
  if (overbiteClass === "normal") recommendations.push("Overbite within normal range");
  if (overjetClass === "increased") recommendations.push("Increased overjet — maxillary retraction or mandibular advancement may be needed");
  if (overjetClass === "normal") recommendations.push("Overjet within normal range");

  return { estimatedOverbite, estimatedOverjet, overbiteClass, overjetClass, recommendations };
}

// ─── Alignment Quality Score ──────────────────────────────────────────────────

export interface AlignmentScore {
  overall: number;    // 0-100
  spacing: number;
  symmetry: number;
  rotation: number;
  midline: number;
  archForm: number;
  grade: "A" | "B" | "C" | "D" | "F";
  label: "Excellent" | "Good" | "Fair" | "Poor" | "Critical";
  details: string[];
}

export function computeAlignmentScore(
  segments: ToothSegment[],
  transforms: Record<string, ToothTransform>
): AlignmentScore {
  if (segments.length < 3) {
    return { overall: 0, spacing: 0, symmetry: 0, rotation: 0, midline: 0, archForm: 0, grade: "F", label: "Critical", details: ["Insufficient segments"] };
  }

  // Spacing sub-score
  const spacing_analysis = analyzeSpacingCrowding(segments);
  const spacingScore = Math.max(0, 100 - spacing_analysis.totalCrowding * 15 - spacing_analysis.spacingCount * 5);

  // Symmetry sub-score
  const archForm = analyzeArchForm(segments);
  const symmetryScore = archForm.symmetryScore * 100;

  // Rotation sub-score
  const rotAnalysis = analyzeRotations(segments, transforms);
  const rotationScore = Math.max(0, 100 - rotAnalysis.meanRotation * 3 - rotAnalysis.rotatedCount * 5);

  // Midline sub-score
  const midline = detectMidlineDeviation(segments);
  const midlineScore = Math.max(0, 100 - midline.deviation * 20);

  // Arch form sub-score
  const archFormScore = archForm.confidence * 100;

  const overall = Math.round((spacingScore * 0.3 + symmetryScore * 0.25 + rotationScore * 0.2 + midlineScore * 0.15 + archFormScore * 0.1));

  const grade: AlignmentScore["grade"] =
    overall >= 90 ? "A" : overall >= 75 ? "B" : overall >= 60 ? "C" : overall >= 45 ? "D" : "F";
  const label: AlignmentScore["label"] =
    overall >= 90 ? "Excellent" : overall >= 75 ? "Good" : overall >= 60 ? "Fair" : overall >= 45 ? "Poor" : "Critical";

  const details: string[] = [];
  if (spacingScore < 70) details.push(`Spacing issues reducing score (${spacingScore.toFixed(0)}/100)`);
  if (symmetryScore < 70) details.push(`Arch asymmetry detected (${symmetryScore.toFixed(0)}/100)`);
  if (rotationScore < 70) details.push(`Rotation irregularities (${rotationScore.toFixed(0)}/100)`);
  if (midlineScore < 70) details.push(`Midline deviation (${midlineScore.toFixed(0)}/100)`);
  if (details.length === 0) details.push("All sub-scores within acceptable range");

  return {
    overall: Math.min(100, Math.max(0, overall)),
    spacing: Math.round(Math.min(100, spacingScore)),
    symmetry: Math.round(Math.min(100, symmetryScore)),
    rotation: Math.round(Math.min(100, rotationScore)),
    midline: Math.round(Math.min(100, midlineScore)),
    archForm: Math.round(Math.min(100, archFormScore)),
    grade, label, details,
  };
}

// ─── Real-time Warnings ───────────────────────────────────────────────────────

export interface RealtimeWarning {
  id: string;
  type: "collision" | "overextension" | "rotation" | "spacing" | "biomechanical" | "integrity";
  severity: "info" | "warning" | "critical";
  message: string;
  toothIds: string[];
}

export function generateRealtimeWarnings(
  segments: ToothSegment[],
  transforms: Record<string, ToothTransform>
): RealtimeWarning[] {
  const warnings: RealtimeWarning[] = [];

  if (segments.length === 0) return warnings;

  // Collision warnings
  const collisions = predictCollisions(segments, transforms, 0.05);
  for (const pair of collisions.pairs) {
    warnings.push({
      id: `col_${pair.idA}_${pair.idB}`,
      type: "collision",
      severity: pair.penetrationDepth > 1 ? "critical" : "warning",
      message: `${pair.labelA} ↔ ${pair.labelB}: ${pair.penetrationDepth.toFixed(2)} mm overlap`,
      toothIds: [pair.idA, pair.idB],
    });
  }

  // Rotation warnings
  const rots = analyzeRotations(segments, transforms);
  for (const tooth of rots.teeth) {
    if (tooth.severity === "severe") {
      warnings.push({
        id: `rot_${tooth.id}`,
        type: "rotation",
        severity: "warning",
        message: `${tooth.label}: ${tooth.estimatedRotation}° rotation exceeds safe limit`,
        toothIds: [tooth.id],
      });
    }
  }

  // Overextension warnings (large translation)
  for (const seg of segments) {
    const t = transforms[seg.id];
    if (!t) continue;
    const dist = new THREE.Vector3(...t.position).length();
    if (dist > 5) {
      warnings.push({
        id: `ext_${seg.id}`,
        type: "overextension",
        severity: "critical",
        message: `${seg.label}: ${dist.toFixed(1)} mm movement exceeds biomechanical limit`,
        toothIds: [seg.id],
      });
    } else if (dist > 3) {
      warnings.push({
        id: `ext_${seg.id}`,
        type: "overextension",
        severity: "warning",
        message: `${seg.label}: ${dist.toFixed(1)} mm movement — large single-tooth displacement`,
        toothIds: [seg.id],
      });
    }
  }

  // Spacing warnings
  const spacing = analyzeSpacingCrowding(segments);
  if (spacing.crowdingLevel === "severe") {
    warnings.push({
      id: "spacing_severe",
      type: "spacing",
      severity: "critical",
      message: `Severe crowding (${spacing.totalCrowding.toFixed(1)} mm) — extraction consideration advised`,
      toothIds: [],
    });
  }

  return warnings;
}

// ─── Movement Arrows (for 3D overlay) ────────────────────────────────────────

export interface MovementArrow {
  segmentId: string;
  label: string;
  origin: [number, number, number];
  direction: [number, number, number];
  magnitude: number;
  color: string;
  confidence: number;
}

export function computeMovementArrows(
  suggestions: AlignmentSuggestion[],
  segments: ToothSegment[]
): MovementArrow[] {
  const segMap = new Map(segments.map((s) => [s.id, s]));
  const arrows: MovementArrow[] = [];

  for (const sug of suggestions) {
    const seg = segMap.get(sug.segmentId);
    if (!seg) continue;

    const dx = sug.suggestedPosition[0] - seg.centroid.x;
    const dy = sug.suggestedPosition[1] - seg.centroid.y;
    const dz = sug.suggestedPosition[2] - seg.centroid.z;
    const mag = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
    const color = sug.displacementMm < 1 ? "#4dffb8" : sug.displacementMm < 2 ? "#ffcc00" : "#ff5252";

    arrows.push({
      segmentId: sug.segmentId,
      label: seg.label,
      origin: [seg.centroid.x, seg.centroid.y, seg.centroid.z],
      direction: [dx / mag, dy / mag, dz / mag],
      magnitude: sug.displacementMm,
      color,
      confidence: sug.confidence,
    });
  }

  return arrows;
}

// ─── Smart Alignment Suggestions ─────────────────────────────────────────────

export function computeSmartAlignmentSuggestions(
  segments: ToothSegment[],
  currentTransforms: Record<string, ToothTransform>
): AlignmentSuggestion[] {
  if (segments.length < 3) return [];

  const suggestions: AlignmentSuggestion[] = [];
  const xs = segments.map((s) => s.centroid.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const archWidth = maxX - minX || 1;
  const sorted = [...segments].sort((a, b) => a.centroid.x - b.centroid.x);

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    const t = i / (sorted.length - 1);
    const idealX = minX + t * archWidth;
    const dx = idealX - seg.centroid.x;
    const disp = Math.abs(dx);

    if (disp < 0.05) continue;

    const ct = currentTransforms[seg.id];
    const curPos = ct?.position ?? ([0, 0, 0] as [number, number, number]);
    suggestions.push({
      segmentId: seg.id,
      suggestedPosition: [curPos[0] + dx, curPos[1], curPos[2]],
      suggestedRotation: ct?.rotation ?? [0, 0, 0],
      confidence: Math.max(0.5, 1 - disp / archWidth),
      displacementMm: parseFloat(disp.toFixed(2)),
      reason: disp > 1 ? "Significant spacing irregularity" : "Minor crowding detected",
    });
  }

  return suggestions.sort((a, b) => b.displacementMm - a.displacementMm);
}
