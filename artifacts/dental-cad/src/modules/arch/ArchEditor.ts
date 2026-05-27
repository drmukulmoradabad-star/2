/**
 * ArchEditor — jaw and dental arch manipulation algorithms.
 *
 * All operations work directly on BufferGeometry positions (in-place).
 * Dental arch is modelled as a parabola; vertices are influenced by their
 * distance from the arch centroid and projected arch position.
 *
 * v2 additions:
 *  - applyAsymmetricWidth — independent left/right quadrant width
 *  - applyArchFormPreset  — standard dental arch forms
 *  - applyRegionIsolation — localized expansion for anterior/posterior/left/right
 *  - computeArchCenterline — detect arch centroid row of vertices
 *  - applyGingivalSculpt  — gingiva-targeted height modification
 */

import * as THREE from "three";
import type { ArchPreset } from "./archEditStore";
import { ARCH_PRESETS } from "./ArchFormPresets";

// ─── Arch analysis ────────────────────────────────────────────────────────────

export interface ArchAnalysis {
  centroid: THREE.Vector3;
  axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  extents: [number, number, number];
  archWidth:  number;
  archDepth:  number;
  archHeight: number;
  vertCount:  number;
  /** Approximate gingival Y level (upper quartile of Y distribution) */
  gingivalY:  number;
}

export function analyzeArch(geo: THREE.BufferGeometry): ArchAnalysis {
  const pos = geo.attributes.position;
  const n = pos.count;

  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i);
  }
  cx /= n; cy /= n; cz /= n;
  const centroid = new THREE.Vector3(cx, cy, cz);

  geo.computeBoundingBox();
  const bbox = geo.boundingBox!;
  const size = new THREE.Vector3();
  bbox.getSize(size);

  // Gingival Y: average of top-quartile Y values
  const ys: number[] = [];
  for (let i = 0; i < n; i++) ys.push(pos.getY(i));
  ys.sort((a, b) => a - b);
  const topQuartileStart = Math.floor(n * 0.75);
  let gingivalY = 0;
  for (let i = topQuartileStart; i < n; i++) gingivalY += ys[i];
  gingivalY /= Math.max(1, n - topQuartileStart);

  const axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];

  return {
    centroid,
    axes,
    extents:    [size.x, size.y, size.z],
    archWidth:  size.x,
    archDepth:  size.z,
    archHeight: size.y,
    vertCount:  n,
    gingivalY,
  };
}

// ─── Weight functions ─────────────────────────────────────────────────────────

export type ArchRegion = "anterior" | "posterior" | "left" | "right" | "anteriorLeft" | "anteriorRight";

/** Returns [0,1] influence for a given region. */
function regionWeight(
  x: number, z: number,
  centroid: THREE.Vector3,
  halfDepth: number,
  region: ArchRegion
): number {
  const relZ = (z - centroid.z) / Math.max(halfDepth, 0.001);  // -1=post, +1=ant
  const relX = x - centroid.x;                                   // <0=left, >0=right

  switch (region) {
    case "anterior":
      return Math.max(0, relZ);
    case "posterior":
      return Math.max(0, -relZ);
    case "left":
      return relX < 0 ? 1 : 0;
    case "right":
      return relX > 0 ? 1 : 0;
    case "anteriorLeft":
      return relX < 0 ? Math.max(0, relZ) : 0;
    case "anteriorRight":
      return relX > 0 ? Math.max(0, relZ) : 0;
  }
}

// ─── Original operations ──────────────────────────────────────────────────────

export interface ArchTransformResult {
  geometry: THREE.BufferGeometry;
  verticesAffected: number;
}

export function expandArch(
  geo: THREE.BufferGeometry,
  factor: number,
  axis: "uniform" | "x" | "z" = "uniform"
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const { centroid } = analyzeArch(geo);

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (axis === "uniform" || axis === "x") pos.setX(i, centroid.x + (x - centroid.x) * factor);
    if (axis === "uniform" || axis === "z") pos.setZ(i, centroid.z + (z - centroid.z) * factor);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

export function adjustArchWidth(geo: THREE.BufferGeometry, factor: number): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const { centroid } = analyzeArch(geo);

  for (let i = 0; i < n; i++) {
    pos.setX(i, centroid.x + (pos.getX(i) - centroid.x) * factor);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

export function tiltArch(geo: THREE.BufferGeometry, angleDeg: number, axis: "x" | "z" = "x"): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const { centroid } = analyzeArch(geo);
  const rad = (angleDeg * Math.PI) / 180;
  const mat = axis === "x" ? new THREE.Matrix4().makeRotationX(rad) : new THREE.Matrix4().makeRotationZ(rad);
  const pt = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    pt.set(pos.getX(i) - centroid.x, pos.getY(i) - centroid.y, pos.getZ(i) - centroid.z)
      .applyMatrix4(mat);
    pos.setXYZ(i, pt.x + centroid.x, pt.y + centroid.y, pt.z + centroid.z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

export function translateArch(geo: THREE.BufferGeometry, delta: THREE.Vector3): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  for (let i = 0; i < n; i++) {
    pos.setXYZ(i, pos.getX(i) + delta.x, pos.getY(i) + delta.y, pos.getZ(i) + delta.z);
  }
  pos.needsUpdate = true;
}

export function reshapeAlveolarRidge(
  geo: THREE.BufferGeometry,
  heightDelta: number,
  ridgeWidth: number
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const { centroid } = analysis;
  const maxY = analysis.gingivalY;

  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const yRatio = (y - centroid.y) / Math.max(0.001, maxY - centroid.y);
    if (yRatio < 0) continue;
    const dz = z - centroid.z;
    const lateralW = Math.exp(-(dz * dz) / (2 * ridgeWidth * ridgeWidth));
    pos.setY(i, y + yRatio * lateralW * heightDelta);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

export function expandArchParabolic(
  geo: THREE.BufferGeometry,
  expansionMm: number,
  anteriorWeight = 0.5
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const { centroid, archDepth } = analysis;

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dx = x - centroid.x;
    const dz = z - centroid.z;
    const t = dz / (archDepth * 0.5);
    const apWeight = anteriorWeight + (1 - anteriorWeight) * (1 - t * t);
    const sign = dx >= 0 ? 1 : -1;
    pos.setX(i, x + sign * expansionMm * apWeight * Math.min(1, Math.abs(dx) / (analysis.archWidth * 0.1)));
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

export function torqueArch(geo: THREE.BufferGeometry, torqueDeg: number): void {
  tiltArch(geo, torqueDeg, "z");
}

export function levelArch(geo: THREE.BufferGeometry, flattenFactor: number): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const { centroid } = analyzeArch(geo);
  const avgY = centroid.y;
  for (let i = 0; i < n; i++) {
    pos.setY(i, pos.getY(i) + (avgY - pos.getY(i)) * flattenFactor);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// ─── v2 additions ─────────────────────────────────────────────────────────────

/**
 * Adjust arch width independently for left and right quadrants.
 * Left = negative X from centroid, Right = positive X from centroid.
 * Smooth blend region around the centroid to avoid discontinuity.
 */
export function applyAsymmetricWidth(
  geo: THREE.BufferGeometry,
  leftFactor: number,
  rightFactor: number
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const { centroid } = analysis;
  const blendWidth = analysis.archWidth * 0.06;  // smooth transition zone

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const dx = x - centroid.x;

    // Smooth blend: left factor → right factor through centroid
    let factor: number;
    if (dx < -blendWidth) {
      factor = leftFactor;
    } else if (dx > blendWidth) {
      factor = rightFactor;
    } else {
      const t = (dx + blendWidth) / (2 * blendWidth);  // 0=left, 1=right
      const smooth = t * t * (3 - 2 * t);              // Hermite
      factor = leftFactor + (rightFactor - leftFactor) * smooth;
    }

    pos.setX(i, centroid.x + dx * factor);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Apply a standard arch form preset to the geometry.
 * Reshapes the lateral width profile to match the canonical arch form.
 *
 * Strategy: compute the current lateral profile vs. the target profile,
 * then warp vertices to match the target width at each A-P position.
 */
export function applyArchFormPreset(
  geo: THREE.BufferGeometry,
  preset: ArchPreset,
  strength = 1.0
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const { centroid, archWidth, archDepth } = analysis;
  const curve = ARCH_PRESETS[preset];
  const halfW = archWidth / 2;
  const halfD = archDepth / 2;

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dx = x - centroid.x;
    const dz = z - centroid.z;

    // Anterior-posterior normalized: 0=posterior, 1=anterior
    const apT = Math.max(0, Math.min(1, 0.5 - dz / (halfD * 2)));

    // Get target half-width at this A-P position from preset profile
    const targetHalfW = halfW * interpolatePresetProfile(curve.profile, apT);

    // Current half-width at this position (approximate by X distance)
    const currentHalfW = Math.max(0.001, Math.abs(dx));

    // Scale factor to match target
    if (currentHalfW < 0.0001) continue;
    const scaleFactor = targetHalfW / currentHalfW;
    const blendedFactor = 1.0 + (scaleFactor - 1.0) * strength;

    pos.setX(i, centroid.x + dx * blendedFactor);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function interpolatePresetProfile(profile: Array<[number, number]>, t: number): number {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < profile.length - 1; i++) {
    const [t0, w0] = profile[i];
    const [t1, w1] = profile[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return w0 + (w1 - w0) * f;
    }
  }
  return profile[profile.length - 1][1];
}

/**
 * Apply expansion to a specific arch region only.
 * factor > 1 = expand, < 1 = contract.
 */
export function applyRegionIsolation(
  geo: THREE.BufferGeometry,
  region: ArchRegion,
  factor: number
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const { centroid, archDepth } = analysis;
  const halfDepth = archDepth / 2;

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const w = regionWeight(x, z, centroid, halfDepth, region);
    if (w < 0.001) continue;

    const dx = x - centroid.x;
    const dz = z - centroid.z;

    // Blend between identity (factor=1) and full expansion based on region weight
    const blendedFactor = 1.0 + (factor - 1.0) * w;
    pos.setX(i, centroid.x + dx * blendedFactor);
    pos.setZ(i, centroid.z + dz * blendedFactor);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Targeted gingival surface contouring.
 * Only modifies vertices in the gingival Y range (top portion of arch).
 */
export function applyGingivalSculpt(
  geo: THREE.BufferGeometry,
  heightDelta: number,
  lateralSigma: number,
  gingivalBias = 0.7
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const { centroid, gingivalY, archHeight } = analysis;

  const gingivalThreshold = centroid.y + archHeight * gingivalBias * 0.5;

  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    if (y < gingivalThreshold) continue;

    // Height-based influence: 1 at gingivalY, 0 at threshold
    const yWeight = Math.max(0, (y - gingivalThreshold) / Math.max(0.001, gingivalY - gingivalThreshold));
    const z = pos.getZ(i);
    const dz = z - centroid.z;
    const lateralW = Math.exp(-(dz * dz) / (2 * lateralSigma * lateralSigma));

    pos.setY(i, y + heightDelta * yWeight * lateralW);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Compute a set of centerline vertices that approximate the arch curve.
 * Returns local-space positions sampled at intervals along the arch.
 */
export function computeArchCenterline(
  geo: THREE.BufferGeometry,
  nSlices = 9
): THREE.Vector3[] {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const { centroid, archDepth } = analysis;

  const halfDepth = archDepth / 2;
  const pts: THREE.Vector3[] = [];

  for (let s = 0; s < nSlices; s++) {
    // Normalize A-P position: -1=posterior, +1=anterior
    const apNorm = -1 + (s / (nSlices - 1)) * 2;
    const targetZ = centroid.z + apNorm * halfDepth;
    const sliceWidth = halfDepth / nSlices * 1.5;

    // Average X and Y of vertices in this Z slice
    let sumX = 0, sumY = 0, count = 0;
    for (let i = 0; i < n; i++) {
      const z = pos.getZ(i);
      if (Math.abs(z - targetZ) > sliceWidth) continue;
      sumX += pos.getX(i);
      sumY += pos.getY(i);
      count++;
    }

    if (count > 0) {
      pts.push(new THREE.Vector3(sumX / count, sumY / count, targetZ));
    } else {
      pts.push(new THREE.Vector3(centroid.x, centroid.y, targetZ));
    }
  }

  return pts;
}
