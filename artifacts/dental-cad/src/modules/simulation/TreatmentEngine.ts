import * as THREE from "three";
import type { ToothTransform } from "../movement/movementStore";
import type { ToothSegment } from "../segmentation/SegmentationEngine";

export type StageTransforms = Record<string, {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}>;

export interface TreatmentStage {
  index: number;
  label: string;
  transforms: StageTransforms;
}

const IDENTITY_TRANSFORM = {
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: [1, 1, 1] as [number, number, number],
};

/** Ease in-out cubic */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Interpolate two transforms using LERP (position/scale) and SLERP (rotation) */
export function interpolateTransform(
  from: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] },
  to: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] },
  t: number,
  ease = true
): { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] } {
  const et = ease ? easeInOut(t) : t;

  // Position LERP
  const pos = new THREE.Vector3(...from.position).lerp(new THREE.Vector3(...to.position), et);

  // Rotation SLERP via quaternions
  const qFrom = new THREE.Quaternion().setFromEuler(new THREE.Euler(...from.rotation, "XYZ"));
  const qTo = new THREE.Quaternion().setFromEuler(new THREE.Euler(...to.rotation, "XYZ"));
  qFrom.slerp(qTo, et);
  const euler = new THREE.Euler().setFromQuaternion(qFrom, "XYZ");

  // Scale LERP
  const scl = new THREE.Vector3(...from.scale).lerp(new THREE.Vector3(...to.scale), et);

  return {
    position: [pos.x, pos.y, pos.z],
    rotation: [euler.x, euler.y, euler.z],
    scale: [scl.x, scl.y, scl.z],
  };
}

/**
 * Generate aligner stages by linearly dividing the total movement into `count` equal steps.
 * Stage 0 = identity (all teeth at rest positions from segmentation).
 * Stage N = final positions (from movementStore transforms).
 */
export function generateStages(
  finalTransforms: Record<string, ToothTransform>,
  segmentIds: string[],
  count: number
): TreatmentStage[] {
  const stages: TreatmentStage[] = [];

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const stageTransforms: StageTransforms = {};

    for (const id of segmentIds) {
      const final = finalTransforms[id] ?? { ...IDENTITY_TRANSFORM, segmentId: id, isLocked: false };
      stageTransforms[id] = interpolateTransform(IDENTITY_TRANSFORM, final, t, false);
    }

    stages.push({
      index: i,
      label: i === 0 ? "Initial" : i === count ? "Final" : `Stage ${i}`,
      transforms: stageTransforms,
    });
  }

  return stages;
}

/**
 * Interpolate between two adjacent stages for smooth animation.
 * progress: 0.0 = first stage, 1.0 = last stage
 */
export function interpolateAtProgress(
  stages: TreatmentStage[],
  progress: number
): StageTransforms {
  if (stages.length === 0) return {};
  if (stages.length === 1) return stages[0].transforms;

  const maxIdx = stages.length - 1;
  const scaledProgress = Math.max(0, Math.min(1, progress)) * maxIdx;
  const lo = Math.floor(scaledProgress);
  const hi = Math.min(maxIdx, Math.ceil(scaledProgress));
  const t = scaledProgress - lo;

  if (lo === hi) return stages[lo].transforms;

  const fromStage = stages[lo].transforms;
  const toStage = stages[hi].transforms;
  const result: StageTransforms = {};

  for (const id of Object.keys({ ...fromStage, ...toStage })) {
    const from = fromStage[id] ?? IDENTITY_TRANSFORM;
    const to = toStage[id] ?? IDENTITY_TRANSFORM;
    result[id] = interpolateTransform(from, to, t, true);
  }

  return result;
}

/**
 * Compute arch alignment targets using parabolic curve fitting.
 * Returns suggested target transforms for each tooth.
 */
export function computeArchAlignment(
  segments: ToothSegment[],
  fdiMetas: Record<string, { fdiNumber: number | null }>,
  stiffness = 0.8 // 0-1, how strongly to pull toward arch
): Record<string, { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }> {
  if (segments.length < 3) return {};

  const centroids = segments.map((s) => s.centroid.clone());
  const mean = new THREE.Vector3();
  for (const c of centroids) mean.add(c);
  mean.divideScalar(centroids.length);

  // PCA: find dominant axis
  const cov = new THREE.Matrix3();
  const entries: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const c of centroids) {
    const d = c.clone().sub(mean);
    entries[0] += d.x * d.x; entries[1] += d.x * d.y; entries[2] += d.x * d.z;
    entries[3] += d.y * d.x; entries[4] += d.y * d.y; entries[5] += d.y * d.z;
    entries[6] += d.z * d.x; entries[7] += d.z * d.y; entries[8] += d.z * d.z;
  }
  cov.set(...(entries as [number, number, number, number, number, number, number, number, number]));

  // Primary arch axis (longest spread)
  const xs = centroids.map((c) => c.x);
  const zs = centroids.map((c) => c.z);
  const archSpanX = Math.max(...xs) - Math.min(...xs);
  const archSpanZ = Math.max(...zs) - Math.min(...zs);
  const archAxis = archSpanX >= archSpanZ ? "x" : "z";
  const depthAxis = archSpanX >= archSpanZ ? "z" : "x";

  // Get arch parameter for each tooth (position along arch axis)
  const params = centroids.map((c) => archAxis === "x" ? c.x : c.z);
  const depths = centroids.map((c) => depthAxis === "x" ? c.x : c.z);
  const minP = Math.min(...params);
  const maxP = Math.max(...params);
  const rangeP = maxP - minP || 1;

  // Fit parabola: depth = a * (param - vertex)^2 + d0
  // Using least squares
  const n = segments.length;
  let sumP = 0, sumP2 = 0, sumP3 = 0, sumP4 = 0, sumD = 0, sumPD = 0, sumP2D = 0;
  for (let i = 0; i < n; i++) {
    const p = params[i], d = depths[i];
    sumP += p; sumP2 += p * p; sumP3 += p * p * p; sumP4 += p * p * p * p;
    sumD += d; sumPD += p * d; sumP2D += p * p * d;
  }
  // Solve for [a, b, c] in d = a*p^2 + b*p + c
  const mat = [
    [sumP4, sumP3, sumP2],
    [sumP3, sumP2, sumP],
    [sumP2, sumP, n],
  ];
  const rhs = [sumP2D, sumPD, sumD];
  const [a, b, c] = solveLinear3(mat, rhs);

  // Target positions: redistribute teeth evenly along arch
  const sortedParams = [...params].sort((x, y) => x - y);
  const targetParams = segments.map((_, i) => {
    const t = i / (n - 1);
    return minP + t * rangeP;
  });

  // Sort segments by arch parameter so we assign correct target param
  const indexedSegs = segments.map((seg, i) => ({ seg, i, p: params[i] }));
  indexedSegs.sort((a, b) => a.p - b.p);

  const targets: Record<string, { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }> = {};

  indexedSegs.forEach(({ seg, i }, sortedIdx) => {
    const targetP = minP + (sortedIdx / Math.max(n - 1, 1)) * rangeP;
    const targetD = a * targetP * targetP + b * targetP + c;
    const origCentroid = centroids[i];

    const targetPos = origCentroid.clone();
    if (archAxis === "x") {
      targetPos.x = origCentroid.x * (1 - stiffness) + targetP * stiffness;
      targetPos.z = origCentroid.z * (1 - stiffness) + targetD * stiffness;
    } else {
      targetPos.z = origCentroid.z * (1 - stiffness) + targetP * stiffness;
      targetPos.x = origCentroid.x * (1 - stiffness) + targetD * stiffness;
    }

    // Delta from current position (identity transform = centroid is the rest position)
    targets[seg.id] = {
      position: [
        targetPos.x - origCentroid.x,
        0,
        targetPos.z - origCentroid.z,
      ],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
  });

  return targets;
}

/** Compute distance between two 3D points in mm */
export function computeDistance(a: [number, number, number], b: [number, number, number]): number {
  return new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
}

/** Compute angle at vertex b, with rays b→a and b→c, in degrees */
export function computeAngle(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
): number {
  const ba = new THREE.Vector3(...a).sub(new THREE.Vector3(...b)).normalize();
  const bc = new THREE.Vector3(...c).sub(new THREE.Vector3(...b)).normalize();
  return (Math.acos(Math.max(-1, Math.min(1, ba.dot(bc)))) * 180) / Math.PI;
}

/** Solve 3x3 linear system Ax=b via Gaussian elimination */
function solveLinear3(A: number[][], b: number[]): [number, number, number] {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];
    if (Math.abs(m[col][col]) < 1e-10) continue;
    for (let row = col + 1; row < 3; row++) {
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= 3; k++) m[row][k] -= factor * m[col][k];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    x[i] = m[i][3];
    for (let j = i + 1; j < 3; j++) x[i] -= m[i][j] * x[j];
    x[i] /= m[i][i] || 1;
  }
  return x as [number, number, number];
}
