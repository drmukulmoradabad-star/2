/**
 * ArchEditor — jaw and dental arch manipulation algorithms.
 *
 * All operations work directly on BufferGeometry positions (in-place).
 * Dental arch is modelled as a parabola; vertices are influenced by their
 * distance from the arch centroid and projected arch position.
 */

import * as THREE from "three";

// ─── Arch analysis ────────────────────────────────────────────────────────────

export interface ArchAnalysis {
  centroid: THREE.Vector3;
  /** Principal axes sorted by variance (PCA) */
  axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  /** Extent along each principal axis */
  extents: [number, number, number];
  /** Arch width (left-right) in geometry units */
  archWidth: number;
  /** Arch depth (anterior-posterior) in geometry units */
  archDepth: number;
  /** Arch height in geometry units */
  archHeight: number;
  /** Number of vertices */
  vertCount: number;
}

export function analyzeArch(geo: THREE.BufferGeometry): ArchAnalysis {
  const pos = geo.attributes.position;
  const n = pos.count;

  // Centroid
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i);
  }
  cx /= n; cy /= n; cz /= n;
  const centroid = new THREE.Vector3(cx, cy, cz);

  // Covariance matrix (simplified PCA for bounding axes)
  let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
  for (let i = 0; i < n; i++) {
    const dx = pos.getX(i) - cx, dy = pos.getY(i) - cy, dz = pos.getZ(i) - cz;
    xx += dx * dx; yy += dy * dy; zz += dz * dz;
    xy += dx * dy; xz += dx * dz; yz += dy * dz;
  }

  // Use bounding box instead of full PCA for simplicity
  geo.computeBoundingBox();
  const bbox = geo.boundingBox!;
  const size = new THREE.Vector3();
  bbox.getSize(size);

  // Assume standard dental orientation: X=width, Y=height, Z=depth
  const axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];

  return {
    centroid,
    axes,
    extents: [size.x, size.y, size.z],
    archWidth:  size.x,
    archDepth:  size.z,
    archHeight: size.y,
    vertCount: n,
  };
}

// ─── Weight functions ─────────────────────────────────────────────────────────

/** Gaussian weight centered on centroid, radius = 0.5 * archWidth/2 */
function archWeight(
  px: number, py: number, pz: number,
  centroid: THREE.Vector3,
  sigma: number
): number {
  const dx = px - centroid.x;
  const dy = py - centroid.y;
  const dz = pz - centroid.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  return Math.exp(-d2 / (2 * sigma * sigma));
}

/** Lateral weight — vertices farther from arch center X=0 are affected more by width ops */
function lateralWeight(x: number, centroidX: number): number {
  const t = Math.abs(x - centroidX);
  return Math.min(1, t * 0.3);
}

// ─── Operations ──────────────────────────────────────────────────────────────

export interface ArchTransformResult {
  geometry: THREE.BufferGeometry;
  verticesAffected: number;
}

/**
 * Expand or contract the dental arch (moves teeth/gingiva outward/inward).
 * factor > 1 = expand, factor < 1 = contract, applied relative to arch centroid.
 */
export function expandArch(
  geo: THREE.BufferGeometry,
  factor: number,
  axis: "uniform" | "x" | "z" = "uniform"
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const { centroid } = analysis;

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const dx = x - centroid.x, dz = z - centroid.z;

    if (axis === "uniform" || axis === "x") {
      pos.setX(i, centroid.x + dx * factor);
    }
    if (axis === "uniform" || axis === "z") {
      pos.setZ(i, centroid.z + dz * factor);
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Adjust arch width by stretching/compressing along the lateral (X) axis.
 * Only moves vertices in the X direction; preserves Y and Z.
 */
export function adjustArchWidth(
  geo: THREE.BufferGeometry,
  factor: number
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const { centroid } = analysis;

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const dx = x - centroid.x;
    pos.setX(i, centroid.x + dx * factor);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Tilt the arch forward/backward (rotate around the arch width axis).
 * angledDeg > 0 = forward tilt, < 0 = backward tilt.
 */
export function tiltArch(
  geo: THREE.BufferGeometry,
  angleDeg: number,
  axis: "x" | "z" = "x"
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const { centroid } = analysis;

  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const mat = new THREE.Matrix4();

  if (axis === "x") {
    mat.makeRotationX(rad);
  } else {
    mat.makeRotationZ(rad);
  }

  const pt = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    pt.set(pos.getX(i) - centroid.x, pos.getY(i) - centroid.y, pos.getZ(i) - centroid.z);
    pt.applyMatrix4(mat);
    pos.setXYZ(i, pt.x + centroid.x, pt.y + centroid.y, pt.z + centroid.z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Translate the full arch along an axis.
 */
export function translateArch(
  geo: THREE.BufferGeometry,
  delta: THREE.Vector3
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  for (let i = 0; i < n; i++) {
    pos.setXYZ(i,
      pos.getX(i) + delta.x,
      pos.getY(i) + delta.y,
      pos.getZ(i) + delta.z
    );
  }
  pos.needsUpdate = true;
}

/**
 * Reshape alveolar ridge — modifies the gingival contour height.
 * heightDelta > 0 raises the ridge, < 0 lowers it.
 * Influence falls off with distance from the arch midline (Z axis).
 */
export function reshapeAlveolarRidge(
  geo: THREE.BufferGeometry,
  heightDelta: number,
  ridgeWidth: number
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const { centroid } = analysis;

  // Find vertices in the gingival region (top of arch)
  const maxY = analysis.archHeight * 0.5 + centroid.y;

  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const dz = z - centroid.z;

    // Height-based weight (affects top surface more)
    const yRatio = (y - centroid.y) / (maxY - centroid.y);
    if (yRatio < 0) continue;

    // Lateral distribution weight
    const lateralW = Math.exp(-(dz * dz) / (2 * ridgeWidth * ridgeWidth));
    const totalWeight = yRatio * lateralW * heightDelta;

    pos.setY(i, y + totalWeight);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Dental arch expansion — targeted lateral expansion using parabolic weight.
 * Simulates palate expander effect.
 */
export function expandArchParabolic(
  geo: THREE.BufferGeometry,
  expansionMm: number,
  anteriorWeight: number = 0.5
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

    // Anterior-posterior weighting (parabolic shape)
    const t = dz / (archDepth * 0.5); // -1 (posterior) to +1 (anterior)
    const apWeight = anteriorWeight + (1 - anteriorWeight) * (1 - t * t);

    // Move laterally
    const sign = dx >= 0 ? 1 : -1;
    pos.setX(i, x + sign * expansionMm * apWeight * Math.min(1, Math.abs(dx) / (analysis.archWidth * 0.1)));
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Torque arch — applies a rotation around the arch curve.
 * Useful for correcting arch form.
 */
export function torqueArch(
  geo: THREE.BufferGeometry,
  torqueDeg: number
): void {
  tiltArch(geo, torqueDeg, "z");
}

/**
 * Level arch — rotate to minimize vertical variation across the arch.
 * Projects all vertices onto the occlusal plane (best-fit plane).
 */
export function levelArch(
  geo: THREE.BufferGeometry,
  flattenFactor: number
): void {
  const pos = geo.attributes.position;
  const n = pos.count;
  const analysis = analyzeArch(geo);
  const avgY = analysis.centroid.y;

  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    pos.setY(i, y + (avgY - y) * flattenFactor);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}
