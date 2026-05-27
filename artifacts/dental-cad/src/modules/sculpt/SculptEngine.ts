/**
 * SculptEngine — GPU-friendly real-time mesh deformation.
 *
 * Works entirely on raw Float32Array positions in geometry local space.
 * All algorithms are O(k) where k = vertices within brush radius.
 * Uses a uniform spatial grid for fast vertex neighbourhood queries.
 */

import * as THREE from "three";

// ─── Falloff ─────────────────────────────────────────────────────────────────

export type FalloffCurve = "smooth" | "linear" | "sharp" | "constant";

export function falloff(t: number, curve: FalloffCurve): number {
  const c = Math.max(0, Math.min(1, t));
  switch (curve) {
    case "linear":   return 1 - c;
    case "smooth":   return 1 - c * c * (3 - 2 * c);
    case "sharp":    return 1 - c * c;
    case "constant": return 1;
  }
}

// ─── Spatial Grid ─────────────────────────────────────────────────────────────

export class SpatialGrid {
  private cells = new Map<string, number[]>();
  readonly cellSize: number;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cy: number, cz: number): string {
    return `${cx},${cy},${cz}`;
  }

  build(positions: Float32Array, vertCount: number): void {
    this.cells.clear();
    const cs = this.cellSize;
    for (let i = 0; i < vertCount; i++) {
      const cx = Math.floor(positions[i * 3]     / cs);
      const cy = Math.floor(positions[i * 3 + 1] / cs);
      const cz = Math.floor(positions[i * 3 + 2] / cs);
      const k = this.key(cx, cy, cz);
      let cell = this.cells.get(k);
      if (!cell) { cell = []; this.cells.set(k, cell); }
      cell.push(i);
    }
  }

  /** Update a single vertex position in the grid (remove from old cell, add to new). */
  moveVertex(idx: number, oldPos: THREE.Vector3, newPos: THREE.Vector3): void {
    const cs = this.cellSize;
    const okx = Math.floor(oldPos.x / cs);
    const oky = Math.floor(oldPos.y / cs);
    const okz = Math.floor(oldPos.z / cs);
    const oldKey = this.key(okx, oky, okz);
    const oldCell = this.cells.get(oldKey);
    if (oldCell) {
      const i = oldCell.indexOf(idx);
      if (i !== -1) oldCell.splice(i, 1);
    }
    const nkx = Math.floor(newPos.x / cs);
    const nky = Math.floor(newPos.y / cs);
    const nkz = Math.floor(newPos.z / cs);
    const newKey = this.key(nkx, nky, nkz);
    let newCell = this.cells.get(newKey);
    if (!newCell) { newCell = []; this.cells.set(newKey, newCell); }
    newCell.push(idx);
  }

  /** Return all vertex indices within `radius` of `center`, with normalized distance t ∈ [0,1]. */
  queryRadius(
    center: THREE.Vector3,
    radius: number,
    positions: Float32Array
  ): Array<{ index: number; t: number }> {
    const cs = this.cellSize;
    const r2 = radius * radius;
    const minCx = Math.floor((center.x - radius) / cs);
    const maxCx = Math.floor((center.x + radius) / cs);
    const minCy = Math.floor((center.y - radius) / cs);
    const maxCy = Math.floor((center.y + radius) / cs);
    const minCz = Math.floor((center.z - radius) / cs);
    const maxCz = Math.floor((center.z + radius) / cs);

    const result: Array<{ index: number; t: number }> = [];

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const cell = this.cells.get(this.key(cx, cy, cz));
          if (!cell) continue;
          for (const idx of cell) {
            const dx = positions[idx * 3]     - center.x;
            const dy = positions[idx * 3 + 1] - center.y;
            const dz = positions[idx * 3 + 2] - center.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 <= r2) {
              result.push({ index: idx, t: Math.sqrt(d2) / radius });
            }
          }
        }
      }
    }
    return result;
  }
}

// ─── Neighbour adjacency ──────────────────────────────────────────────────────

export function buildAdjacency(
  indexArray: ArrayLike<number>,
  faceCount: number,
  vertCount: number
): number[][] {
  const adj: Set<number>[] = Array.from({ length: vertCount }, () => new Set<number>());
  for (let f = 0; f < faceCount; f++) {
    const a = indexArray[f * 3], b = indexArray[f * 3 + 1], c = indexArray[f * 3 + 2];
    adj[a].add(b); adj[a].add(c);
    adj[b].add(a); adj[b].add(c);
    adj[c].add(a); adj[c].add(b);
  }
  return adj.map((s) => [...s]);
}

// ─── Brush Algorithms ─────────────────────────────────────────────────────────

export interface BrushParams {
  radius: number;
  strength: number;
  falloffCurve: FalloffCurve;
  symmetry?: boolean;
  symmetryAxis?: "x" | "y" | "z";
}

const _tmp = new THREE.Vector3();
const _sym = new THREE.Vector3();

/** Common helper: find affected vertices */
function affected(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  p: BrushParams
): Array<{ index: number; weight: number }> {
  const hits = grid.queryRadius(center, p.radius, positions);
  return hits.map(({ index, t }) => ({ index, weight: falloff(t, p.falloffCurve) * p.strength }));
}

// ── Grab ──────────────────────────────────────────────────────────────────────
export function applyGrab(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  delta: THREE.Vector3,
  p: BrushParams
): void {
  for (const { index: i, weight: w } of affected(positions, grid, center, p)) {
    positions[i * 3]     += delta.x * w;
    positions[i * 3 + 1] += delta.y * w;
    positions[i * 3 + 2] += delta.z * w;
  }
  if (p.symmetry) {
    const sc = mirrorPoint(center, p.symmetryAxis!);
    const sd = mirrorVector(delta, p.symmetryAxis!);
    for (const { index: i, weight: w } of affected(positions, grid, sc, { ...p, symmetry: false })) {
      positions[i * 3]     += sd.x * w;
      positions[i * 3 + 1] += sd.y * w;
      positions[i * 3 + 2] += sd.z * w;
    }
  }
}

// ── Smooth ────────────────────────────────────────────────────────────────────
export function applySmooth(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  p: BrushParams,
  adjacency?: number[][]
): void {
  const verts = affected(positions, grid, center, p);
  const neighborRadius = grid.cellSize * 2;

  for (const { index: i, weight: w } of verts) {
    let cx = 0, cy = 0, cz = 0, count = 0;

    if (adjacency) {
      // Proper adjacency-based smooth (indexed geometry)
      for (const nb of adjacency[i]) {
        cx += positions[nb * 3];
        cy += positions[nb * 3 + 1];
        cz += positions[nb * 3 + 2];
        count++;
      }
    } else {
      // Spatial-based smooth (non-indexed geometry)
      _tmp.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      const nbs = grid.queryRadius(_tmp, neighborRadius, positions);
      for (const { index: nb } of nbs) {
        if (nb === i) continue;
        cx += positions[nb * 3];
        cy += positions[nb * 3 + 1];
        cz += positions[nb * 3 + 2];
        count++;
      }
    }

    if (count === 0) continue;
    cx /= count; cy /= count; cz /= count;

    positions[i * 3]     += (cx - positions[i * 3])     * w;
    positions[i * 3 + 1] += (cy - positions[i * 3 + 1]) * w;
    positions[i * 3 + 2] += (cz - positions[i * 3 + 2]) * w;
  }
}

// ── Inflate ───────────────────────────────────────────────────────────────────
export function applyInflate(
  positions: Float32Array,
  normals: Float32Array | null,
  grid: SpatialGrid,
  center: THREE.Vector3,
  direction: 1 | -1,
  p: BrushParams
): void {
  for (const { index: i, weight: w } of affected(positions, grid, center, p)) {
    if (normals) {
      positions[i * 3]     += normals[i * 3]     * w * direction;
      positions[i * 3 + 1] += normals[i * 3 + 1] * w * direction;
      positions[i * 3 + 2] += normals[i * 3 + 2] * w * direction;
    } else {
      // Approx: inflate toward centroid
      const bx = positions[i * 3] - center.x;
      const by = positions[i * 3 + 1] - center.y;
      const bz = positions[i * 3 + 2] - center.z;
      const len = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      positions[i * 3]     += (bx / len) * w * direction;
      positions[i * 3 + 1] += (by / len) * w * direction;
      positions[i * 3 + 2] += (bz / len) * w * direction;
    }
  }
}

// ── Flatten ───────────────────────────────────────────────────────────────────
export function applyFlatten(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  hitNormal: THREE.Vector3,
  p: BrushParams
): void {
  const d = center.dot(hitNormal);
  for (const { index: i, weight: w } of affected(positions, grid, center, p)) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const dist = px * hitNormal.x + py * hitNormal.y + pz * hitNormal.z - d;
    positions[i * 3]     -= hitNormal.x * dist * w;
    positions[i * 3 + 1] -= hitNormal.y * dist * w;
    positions[i * 3 + 2] -= hitNormal.z * dist * w;
  }
}

// ── Relax ─────────────────────────────────────────────────────────────────────
// Equalizes edge lengths — good for surface fairing
export function applyRelax(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  p: BrushParams,
  adjacency?: number[][]
): void {
  const verts = affected(positions, grid, center, p);
  const neighborRadius = grid.cellSize * 2;

  for (const { index: i, weight: w } of verts) {
    let tx = 0, ty = 0, tz = 0, count = 0;
    const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
    let sumLen = 0;

    if (adjacency) {
      for (const nb of adjacency[i]) {
        const dx = positions[nb * 3] - px;
        const dy = positions[nb * 3 + 1] - py;
        const dz = positions[nb * 3 + 2] - pz;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        sumLen += len;
        tx += positions[nb * 3];
        ty += positions[nb * 3 + 1];
        tz += positions[nb * 3 + 2];
        count++;
      }
    } else {
      _tmp.set(px, py, pz);
      const nbs = grid.queryRadius(_tmp, neighborRadius, positions);
      for (const { index: nb } of nbs) {
        if (nb === i) continue;
        const dx = positions[nb * 3] - px;
        const dy = positions[nb * 3 + 1] - py;
        const dz = positions[nb * 3 + 2] - pz;
        sumLen += Math.sqrt(dx * dx + dy * dy + dz * dz);
        tx += positions[nb * 3];
        ty += positions[nb * 3 + 1];
        tz += positions[nb * 3 + 2];
        count++;
      }
    }

    if (count === 0) continue;
    const avgLen = sumLen / count;
    const centX = tx / count, centY = ty / count, centZ = tz / count;

    // Move toward centroid, constrained by average edge length
    const dcx = centX - px, dcy = centY - py, dcz = centZ - pz;
    const dcLen = Math.sqrt(dcx * dcx + dcy * dcy + dcz * dcz) || 1;
    const targetLen = Math.min(dcLen, avgLen);
    const nx = px + (dcx / dcLen) * targetLen;
    const ny = py + (dcy / dcLen) * targetLen;
    const nz = pz + (dcz / dcLen) * targetLen;

    positions[i * 3]     += (nx - px) * w;
    positions[i * 3 + 1] += (ny - py) * w;
    positions[i * 3 + 2] += (nz - pz) * w;
  }
}

// ── Pinch ─────────────────────────────────────────────────────────────────────
export function applyPinch(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  p: BrushParams
): void {
  for (const { index: i, weight: w } of affected(positions, grid, center, p)) {
    const dx = center.x - positions[i * 3];
    const dy = center.y - positions[i * 3 + 1];
    const dz = center.z - positions[i * 3 + 2];
    positions[i * 3]     += dx * w * 0.5;
    positions[i * 3 + 1] += dy * w * 0.5;
    positions[i * 3 + 2] += dz * w * 0.5;
  }
}

// ── Push / Pull ───────────────────────────────────────────────────────────────
export function applyPushPull(
  positions: Float32Array,
  normals: Float32Array | null,
  grid: SpatialGrid,
  center: THREE.Vector3,
  hitNormal: THREE.Vector3,
  direction: 1 | -1,
  p: BrushParams
): void {
  for (const { index: i, weight: w } of affected(positions, grid, center, p)) {
    const nx = normals ? normals[i * 3]     : hitNormal.x;
    const ny = normals ? normals[i * 3 + 1] : hitNormal.y;
    const nz = normals ? normals[i * 3 + 2] : hitNormal.z;
    positions[i * 3]     += nx * w * direction;
    positions[i * 3 + 1] += ny * w * direction;
    positions[i * 3 + 2] += nz * w * direction;
  }
}

// ─── Mirror helpers ───────────────────────────────────────────────────────────

function mirrorPoint(p: THREE.Vector3, axis: "x" | "y" | "z"): THREE.Vector3 {
  const m = p.clone();
  if (axis === "x") m.x = -m.x;
  else if (axis === "y") m.y = -m.y;
  else m.z = -m.z;
  return m;
}

function mirrorVector(v: THREE.Vector3, axis: "x" | "y" | "z"): THREE.Vector3 {
  const m = v.clone();
  if (axis === "x") m.x = -m.x;
  else if (axis === "y") m.y = -m.y;
  else m.z = -m.z;
  return m;
}

// ─── SculptEngine class ───────────────────────────────────────────────────────

export type SculptTool =
  | "grab" | "smooth" | "inflate" | "deflate"
  | "flatten" | "relax" | "pinch" | "push" | "pull";

export class SculptEngine {
  readonly grid: SpatialGrid;
  private adjacency: number[][] | null = null;
  private _geo: THREE.BufferGeometry;

  constructor(geometry: THREE.BufferGeometry) {
    this._geo = geometry;
    const pos = geometry.attributes.position;
    const vertCount = pos.count;
    const positions = pos.array as Float32Array;

    // Compute adaptive cell size from bounding box
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox!.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const cellSize = maxDim / 40;

    this.grid = new SpatialGrid(cellSize);
    this.grid.build(positions, vertCount);

    // Build adjacency if indexed
    if (geometry.index) {
      const idx = geometry.index.array as ArrayLike<number>;
      this.adjacency = buildAdjacency(idx, idx.length / 3, vertCount);
    }
  }

  get positions(): Float32Array {
    return this._geo.attributes.position.array as Float32Array;
  }

  get normals(): Float32Array | null {
    const na = this._geo.attributes.normal;
    return na ? (na.array as Float32Array) : null;
  }

  /** Apply a sculpt stroke at the given hit point. */
  applyStroke(
    tool: SculptTool,
    hitPoint: THREE.Vector3,
    hitNormal: THREE.Vector3,
    delta: THREE.Vector3,
    p: BrushParams
  ): void {
    const pos = this.positions;
    const nor = this.normals;
    const { grid, adjacency } = this;

    switch (tool) {
      case "grab":
        applyGrab(pos, grid, hitPoint, delta, p);
        break;
      case "smooth":
        applySmooth(pos, grid, hitPoint, p, adjacency ?? undefined);
        break;
      case "inflate":
        applyInflate(pos, nor, grid, hitPoint, 1, p);
        break;
      case "deflate":
        applyInflate(pos, nor, grid, hitPoint, -1, p);
        break;
      case "flatten":
        applyFlatten(pos, grid, hitPoint, hitNormal, p);
        break;
      case "relax":
        applyRelax(pos, grid, hitPoint, p, adjacency ?? undefined);
        break;
      case "pinch":
        applyPinch(pos, grid, hitPoint, p);
        break;
      case "push":
        applyPushPull(pos, nor, grid, hitPoint, hitNormal, -1, p);
        break;
      case "pull":
        applyPushPull(pos, nor, grid, hitPoint, hitNormal, 1, p);
        break;
    }

    this._geo.attributes.position.needsUpdate = true;
  }

  /** Recompute normals after stroke ends. */
  finalizeStroke(): void {
    this._geo.computeVertexNormals();
    if (this._geo.attributes.normal) {
      this._geo.attributes.normal.needsUpdate = true;
    }
  }

  /** Rebuild spatial grid (call after large-scale position changes). */
  rebuildGrid(): void {
    const pos = this._geo.attributes.position;
    this.grid.build(pos.array as Float32Array, pos.count);
  }
}
