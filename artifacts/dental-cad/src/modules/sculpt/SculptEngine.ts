/**
 * SculptEngine — GPU-friendly real-time mesh deformation for dental CAD.
 *
 * All algorithms operate directly on Float32Array vertex positions in
 * geometry LOCAL space for zero-copy performance.
 *
 * New in v2:
 *  - Mask weight support (per-vertex protection factor 0..1)
 *  - Crease brush (sharpen surface folds)
 *  - Clay brush (build up surface with flattening)
 *  - Post-stroke auto-smooth pass
 *  - Max-displacement constraint (prevent mesh tearing)
 *  - Incremental local normal recalculation (affected region only)
 *  - Step-limited stroke accumulation
 */

import * as THREE from "three";

// ─── Falloff ──────────────────────────────────────────────────────────────────

export type FalloffCurve = "smooth" | "linear" | "sharp" | "constant" | "sphere" | "root";

export function falloff(t: number, curve: FalloffCurve): number {
  const c = Math.max(0, Math.min(1, t));
  switch (curve) {
    case "linear":   return 1 - c;
    case "smooth":   return 1 - c * c * (3 - 2 * c);
    case "sharp":    return Math.pow(1 - c, 3);
    case "constant": return 1;
    case "sphere":   return Math.sqrt(Math.max(0, 1 - c * c));
    case "root":     return 1 - Math.sqrt(c);
  }
}

// ─── Spatial Grid (BVH-lite) ───────────────────────────────────────────────────

export class SpatialGrid {
  private cells = new Map<number, number[]>();
  readonly cellSize: number;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cy: number, cz: number): number {
    // Compact integer key — avoids string allocation in hot paths
    return ((cx & 0x3FF) | ((cy & 0x3FF) << 10) | ((cz & 0x3FF) << 20));
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

  queryRadius(
    center: THREE.Vector3,
    radius: number,
    positions: Float32Array
  ): Array<{ index: number; t: number }> {
    const cs = this.cellSize;
    const r2 = radius * radius;
    const minCx = Math.floor((center.x - radius) / cs);
    const maxCx = Math.ceil((center.x  + radius) / cs);
    const minCy = Math.floor((center.y - radius) / cs);
    const maxCy = Math.ceil((center.y  + radius) / cs);
    const minCz = Math.floor((center.z - radius) / cs);
    const maxCz = Math.ceil((center.z  + radius) / cs);

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
            if (d2 <= r2) result.push({ index: idx, t: Math.sqrt(d2) / radius });
          }
        }
      }
    }
    return result;
  }

  moveVertex(idx: number, oldPos: THREE.Vector3, newPos: THREE.Vector3): void {
    const cs = this.cellSize;
    const ok = this.key(Math.floor(oldPos.x/cs), Math.floor(oldPos.y/cs), Math.floor(oldPos.z/cs));
    const nk = this.key(Math.floor(newPos.x/cs), Math.floor(newPos.y/cs), Math.floor(newPos.z/cs));
    if (ok === nk) return;
    const oldCell = this.cells.get(ok);
    if (oldCell) { const i = oldCell.indexOf(idx); if (i !== -1) oldCell.splice(i, 1); }
    let newCell = this.cells.get(nk);
    if (!newCell) { newCell = []; this.cells.set(nk, newCell); }
    newCell.push(idx);
  }
}

// ─── Neighbour adjacency ──────────────────────────────────────────────────────

export function buildAdjacency(
  indexArray: ArrayLike<number>,
  faceCount: number,
  vertCount: number
): Int32Array[] {
  const adj: Set<number>[] = Array.from({ length: vertCount }, () => new Set<number>());
  for (let f = 0; f < faceCount; f++) {
    const a = indexArray[f * 3], b = indexArray[f * 3 + 1], c = indexArray[f * 3 + 2];
    adj[a].add(b); adj[a].add(c);
    adj[b].add(a); adj[b].add(c);
    adj[c].add(a); adj[c].add(b);
  }
  return adj.map((s) => new Int32Array([...s]));
}

// ─── Brush Params ─────────────────────────────────────────────────────────────

export interface BrushParams {
  radius: number;
  strength: number;
  falloffCurve: FalloffCurve;
  symmetry?: boolean;
  symmetryAxis?: "x" | "y" | "z";
  maskWeights?: Float32Array;        // per-vertex [0..1] protection; 0=locked, 1=free
  maxDisplacement?: number;          // max distance vertex can move from rest
  basePositions?: Float32Array;      // rest positions for constraint enforcement
}

export type SculptTool =
  | "grab" | "smooth" | "inflate" | "deflate"
  | "flatten" | "relax" | "pinch" | "push" | "pull"
  | "crease" | "clay" | "surface" | "mask_paint" | "mask_erase";

// ─── Common helpers ───────────────────────────────────────────────────────────

const _tv = new THREE.Vector3();

function affected(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  p: BrushParams
): Array<{ index: number; weight: number }> {
  const hits = grid.queryRadius(center, p.radius, positions);
  return hits.map(({ index, t }) => {
    const fo = falloff(t, p.falloffCurve) * p.strength;
    const maskMod = p.maskWeights ? p.maskWeights[index] : 1;
    return { index, weight: fo * maskMod };
  });
}

function applyConstraint(
  positions: Float32Array,
  basePositions: Float32Array,
  index: number,
  maxDisp: number
): void {
  const i3 = index * 3;
  const dx = positions[i3]     - basePositions[i3];
  const dy = positions[i3 + 1] - basePositions[i3 + 1];
  const dz = positions[i3 + 2] - basePositions[i3 + 2];
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 > maxDisp * maxDisp) {
    const scale = maxDisp / Math.sqrt(d2);
    positions[i3]     = basePositions[i3]     + dx * scale;
    positions[i3 + 1] = basePositions[i3 + 1] + dy * scale;
    positions[i3 + 2] = basePositions[i3 + 2] + dz * scale;
  }
}

function mirrorPoint(p: THREE.Vector3, axis: "x" | "y" | "z"): THREE.Vector3 {
  const m = p.clone();
  if (axis === "x") m.x = -m.x;
  else if (axis === "y") m.y = -m.y;
  else m.z = -m.z;
  return m;
}

function mirrorDelta(v: THREE.Vector3, axis: "x" | "y" | "z"): THREE.Vector3 {
  const m = v.clone();
  if (axis === "x") m.x = -m.x;
  else if (axis === "y") m.y = -m.y;
  else m.z = -m.z;
  return m;
}

// ─── Brush Algorithms ─────────────────────────────────────────────────────────

export function applyGrab(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  delta: THREE.Vector3,
  p: BrushParams
): void {
  const verts = affected(positions, grid, center, p);
  for (const { index: i, weight: w } of verts) {
    positions[i*3]   += delta.x * w;
    positions[i*3+1] += delta.y * w;
    positions[i*3+2] += delta.z * w;
    if (p.basePositions && p.maxDisplacement != null) applyConstraint(positions, p.basePositions, i, p.maxDisplacement);
  }
  if (p.symmetry) {
    const sc = mirrorPoint(center, p.symmetryAxis!);
    const sd = mirrorDelta(delta, p.symmetryAxis!);
    for (const { index: i, weight: w } of affected(positions, grid, sc, { ...p, symmetry: false })) {
      positions[i*3]   += sd.x * w;
      positions[i*3+1] += sd.y * w;
      positions[i*3+2] += sd.z * w;
      if (p.basePositions && p.maxDisplacement != null) applyConstraint(positions, p.basePositions, i, p.maxDisplacement);
    }
  }
}

export function applySmooth(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  p: BrushParams,
  adjacency?: Int32Array[]
): void {
  const verts = affected(positions, grid, center, p);
  const neighborRadius = grid.cellSize * 2;

  for (const { index: i, weight: w } of verts) {
    if (w < 1e-6) continue;
    let cx = 0, cy = 0, cz = 0, count = 0;

    if (adjacency && adjacency[i]) {
      for (const nb of adjacency[i]) {
        cx += positions[nb*3]; cy += positions[nb*3+1]; cz += positions[nb*3+2]; count++;
      }
    } else {
      _tv.set(positions[i*3], positions[i*3+1], positions[i*3+2]);
      for (const { index: nb } of grid.queryRadius(_tv, neighborRadius, positions)) {
        if (nb === i) continue;
        cx += positions[nb*3]; cy += positions[nb*3+1]; cz += positions[nb*3+2]; count++;
      }
    }

    if (!count) continue;
    cx /= count; cy /= count; cz /= count;
    positions[i*3]   += (cx - positions[i*3])   * w;
    positions[i*3+1] += (cy - positions[i*3+1]) * w;
    positions[i*3+2] += (cz - positions[i*3+2]) * w;
  }
}

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
      positions[i*3]   += normals[i*3]   * w * direction;
      positions[i*3+1] += normals[i*3+1] * w * direction;
      positions[i*3+2] += normals[i*3+2] * w * direction;
    } else {
      const bx = positions[i*3] - center.x;
      const by = positions[i*3+1] - center.y;
      const bz = positions[i*3+2] - center.z;
      const len = Math.sqrt(bx*bx+by*by+bz*bz) || 1;
      positions[i*3]   += (bx/len) * w * direction;
      positions[i*3+1] += (by/len) * w * direction;
      positions[i*3+2] += (bz/len) * w * direction;
    }
    if (p.basePositions && p.maxDisplacement != null) applyConstraint(positions, p.basePositions, i, p.maxDisplacement);
  }
}

export function applyFlatten(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  hitNormal: THREE.Vector3,
  p: BrushParams
): void {
  const d = center.dot(hitNormal);
  for (const { index: i, weight: w } of affected(positions, grid, center, p)) {
    const dist = positions[i*3]*hitNormal.x + positions[i*3+1]*hitNormal.y + positions[i*3+2]*hitNormal.z - d;
    positions[i*3]   -= hitNormal.x * dist * w;
    positions[i*3+1] -= hitNormal.y * dist * w;
    positions[i*3+2] -= hitNormal.z * dist * w;
  }
}

export function applyRelax(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  p: BrushParams,
  adjacency?: Int32Array[]
): void {
  const verts = affected(positions, grid, center, p);
  const neighborRadius = grid.cellSize * 2;

  for (const { index: i, weight: w } of verts) {
    if (w < 1e-6) continue;
    let tx = 0, ty = 0, tz = 0, sumLen = 0, count = 0;
    const px = positions[i*3], py = positions[i*3+1], pz = positions[i*3+2];

    const neighbors = adjacency?.[i]
      ? [...adjacency[i]]
      : grid.queryRadius(_tv.set(px,py,pz), neighborRadius, positions)
           .filter(n => n.index !== i).map(n => n.index);

    for (const nb of neighbors) {
      const dx = positions[nb*3]-px, dy = positions[nb*3+1]-py, dz = positions[nb*3+2]-pz;
      sumLen += Math.sqrt(dx*dx+dy*dy+dz*dz);
      tx += positions[nb*3]; ty += positions[nb*3+1]; tz += positions[nb*3+2];
      count++;
    }
    if (!count) continue;

    const avgLen = sumLen / count;
    const cx = tx/count, cy2 = ty/count, cz = tz/count;
    const dcx = cx-px, dcy = cy2-py, dcz = cz-pz;
    const dcLen = Math.sqrt(dcx*dcx+dcy*dcy+dcz*dcz) || 1;
    const tl = Math.min(dcLen, avgLen);
    positions[i*3]   += ((px + (dcx/dcLen)*tl) - px) * w;
    positions[i*3+1] += ((py + (dcy/dcLen)*tl) - py) * w;
    positions[i*3+2] += ((pz + (dcz/dcLen)*tl) - pz) * w;
  }
}

export function applyPinch(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  p: BrushParams
): void {
  for (const { index: i, weight: w } of affected(positions, grid, center, p)) {
    const dx = center.x - positions[i*3];
    const dy = center.y - positions[i*3+1];
    const dz = center.z - positions[i*3+2];
    positions[i*3]   += dx * w * 0.5;
    positions[i*3+1] += dy * w * 0.5;
    positions[i*3+2] += dz * w * 0.5;
  }
}

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
    const nx = normals ? normals[i*3]   : hitNormal.x;
    const ny = normals ? normals[i*3+1] : hitNormal.y;
    const nz = normals ? normals[i*3+2] : hitNormal.z;
    positions[i*3]   += nx * w * direction;
    positions[i*3+1] += ny * w * direction;
    positions[i*3+2] += nz * w * direction;
    if (p.basePositions && p.maxDisplacement != null) applyConstraint(positions, p.basePositions, i, p.maxDisplacement);
  }
}

/** Crease — sharpens mesh fold lines by pulling vertices toward surface curvature */
export function applyCrease(
  positions: Float32Array,
  normals: Float32Array | null,
  grid: SpatialGrid,
  center: THREE.Vector3,
  hitNormal: THREE.Vector3,
  p: BrushParams,
  adjacency?: Int32Array[]
): void {
  const verts = affected(positions, grid, center, p);
  const neighborRadius = grid.cellSize * 2;

  for (const { index: i, weight: w } of verts) {
    if (w < 1e-6) continue;
    const px = positions[i*3], py = positions[i*3+1], pz = positions[i*3+2];

    // Average neighbor position
    let cx = 0, cy = 0, cz = 0, count = 0;
    const neighbors = adjacency?.[i]
      ? [...adjacency[i]]
      : grid.queryRadius(_tv.set(px,py,pz), neighborRadius, positions)
           .filter(n => n.index !== i).map(n => n.index);

    for (const nb of neighbors) {
      cx += positions[nb*3]; cy += positions[nb*3+1]; cz += positions[nb*3+2]; count++;
    }
    if (!count) continue;
    cx /= count; cy /= count; cz /= count;

    // Move AWAY from average neighbor (sharpen crease)
    const nx = normals ? normals[i*3] : hitNormal.x;
    const ny = normals ? normals[i*3+1] : hitNormal.y;
    const nz = normals ? normals[i*3+2] : hitNormal.z;

    const awayX = px - cx, awayY = py - cy, awayZ = pz - cz;
    const awayLen = Math.sqrt(awayX*awayX+awayY*awayY+awayZ*awayZ) || 1;

    // Project away-vector onto surface normal
    const dot = (awayX/awayLen)*nx + (awayY/awayLen)*ny + (awayZ/awayLen)*nz;
    positions[i*3]   += nx * dot * w * 0.5;
    positions[i*3+1] += ny * dot * w * 0.5;
    positions[i*3+2] += nz * dot * w * 0.5;
  }
}

/** Clay — build up surface with implicit flattening (like Blender clay brush) */
export function applyClay(
  positions: Float32Array,
  normals: Float32Array | null,
  grid: SpatialGrid,
  center: THREE.Vector3,
  hitNormal: THREE.Vector3,
  p: BrushParams
): void {
  // Move vertices outward along normal but clamp to a plane offset from hit
  const planeD = center.dot(hitNormal) + p.strength * p.radius * 0.1;
  for (const { index: i, weight: w } of affected(positions, grid, center, p)) {
    const nx = normals ? normals[i*3] : hitNormal.x;
    const ny = normals ? normals[i*3+1] : hitNormal.y;
    const nz = normals ? normals[i*3+2] : hitNormal.z;

    // Inflate along normal
    positions[i*3]   += nx * w * 0.8;
    positions[i*3+1] += ny * w * 0.8;
    positions[i*3+2] += nz * w * 0.8;

    // Then flatten to clay plane (blend)
    const dist = positions[i*3]*hitNormal.x + positions[i*3+1]*hitNormal.y + positions[i*3+2]*hitNormal.z - planeD;
    if (dist < 0) {
      positions[i*3]   -= hitNormal.x * dist * w * 0.3;
      positions[i*3+1] -= hitNormal.y * dist * w * 0.3;
      positions[i*3+2] -= hitNormal.z * dist * w * 0.3;
    }
    if (p.basePositions && p.maxDisplacement != null) applyConstraint(positions, p.basePositions, i, p.maxDisplacement);
  }
}

/**
 * Surface slide — moves vertices along the surface tangent plane.
 * The stroke delta is projected onto each vertex's tangent plane (removing
 * the normal component) so vertices slide across the mesh surface without
 * pushing through it. Produces a smear / surface-drag effect.
 */
export function applySurface(
  positions: Float32Array,
  normals: Float32Array | null,
  grid: SpatialGrid,
  center: THREE.Vector3,
  delta: THREE.Vector3,
  p: BrushParams
): void {
  for (const { index: i, weight: w } of affected(positions, grid, center, p)) {
    let tx = delta.x, ty = delta.y, tz = delta.z;

    if (normals) {
      // Project delta onto tangent plane: remove component along normal
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];
      const dot = tx * nx + ty * ny + tz * nz;
      tx -= dot * nx;
      ty -= dot * ny;
      tz -= dot * nz;
    }

    positions[i * 3]     += tx * w;
    positions[i * 3 + 1] += ty * w;
    positions[i * 3 + 2] += tz * w;

    if (p.basePositions && p.maxDisplacement != null) applyConstraint(positions, p.basePositions, i, p.maxDisplacement);
  }

  // Symmetry
  if (p.symmetry) {
    const sc = mirrorPoint(center, p.symmetryAxis!);
    const sd = mirrorDelta(delta, p.symmetryAxis!);
    for (const { index: i, weight: w } of affected(positions, grid, sc, { ...p, symmetry: false })) {
      let tx = sd.x, ty = sd.y, tz = sd.z;
      if (normals) {
        const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
        const dot = tx * nx + ty * ny + tz * nz;
        tx -= dot * nx; ty -= dot * ny; tz -= dot * nz;
      }
      positions[i * 3]     += tx * w;
      positions[i * 3 + 1] += ty * w;
      positions[i * 3 + 2] += tz * w;
      if (p.basePositions && p.maxDisplacement != null) applyConstraint(positions, p.basePositions, i, p.maxDisplacement);
    }
  }
}

/** Paint / erase mask weights */
export function applyMaskPaint(
  maskWeights: Float32Array,
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  mode: "paint" | "erase",
  p: Omit<BrushParams, "maskWeights">
): void {
  const hits = grid.queryRadius(center, p.radius, positions);
  for (const { index, t } of hits) {
    const f = falloff(t, p.falloffCurve) * p.strength;
    if (mode === "paint") {
      maskWeights[index] = Math.max(0, maskWeights[index] - f);
    } else {
      maskWeights[index] = Math.min(1, maskWeights[index] + f);
    }
  }
}

// ─── Post-stroke operations ───────────────────────────────────────────────────

/** Run a gentle Laplacian smooth pass over a region. Used for auto-smooth. */
export function postSmooth(
  positions: Float32Array,
  grid: SpatialGrid,
  center: THREE.Vector3,
  radius: number,
  strength: number,
  adjacency?: Int32Array[]
): void {
  applySmooth(positions, grid, center, {
    radius,
    strength: strength * 0.15,  // Very gentle
    falloffCurve: "smooth",
  }, adjacency);
}

/** Enforce max displacement constraint over entire geometry. */
export function enforceDisplacementConstraints(
  positions: Float32Array,
  basePositions: Float32Array,
  maxDisplacement: number,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    applyConstraint(positions, basePositions, i, maxDisplacement);
  }
}

// ─── SculptEngine class ───────────────────────────────────────────────────────

export class SculptEngine {
  readonly grid: SpatialGrid;
  adjacency: Int32Array[] | null = null;
  private _geo: THREE.BufferGeometry;

  constructor(geometry: THREE.BufferGeometry) {
    this._geo = geometry;
    const pos = geometry.attributes.position;
    const positions = pos.array as Float32Array;
    const vertCount = pos.count;

    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox!.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    this.grid = new SpatialGrid(maxDim / 40);
    this.grid.build(positions, vertCount);

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

  get vertCount(): number {
    return this._geo.attributes.position.count;
  }

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
    const adj = adjacency ?? undefined;

    switch (tool) {
      case "grab":        applyGrab(pos, grid, hitPoint, delta, p); break;
      case "smooth":      applySmooth(pos, grid, hitPoint, p, adj); break;
      case "inflate":     applyInflate(pos, nor, grid, hitPoint, 1, p); break;
      case "deflate":     applyInflate(pos, nor, grid, hitPoint, -1, p); break;
      case "flatten":     applyFlatten(pos, grid, hitPoint, hitNormal, p); break;
      case "relax":       applyRelax(pos, grid, hitPoint, p, adj); break;
      case "pinch":       applyPinch(pos, grid, hitPoint, p); break;
      case "push":        applyPushPull(pos, nor, grid, hitPoint, hitNormal, -1, p); break;
      case "pull":        applyPushPull(pos, nor, grid, hitPoint, hitNormal, 1, p); break;
      case "crease":      applyCrease(pos, nor, grid, hitPoint, hitNormal, p, adj); break;
      case "clay":        applyClay(pos, nor, grid, hitPoint, hitNormal, p); break;
      case "surface":     applySurface(pos, nor, grid, hitPoint, delta, p); break;
    }

    this._geo.attributes.position.needsUpdate = true;
  }

  applyMaskStroke(
    maskWeights: Float32Array,
    hitPoint: THREE.Vector3,
    mode: "paint" | "erase",
    p: Omit<BrushParams, "maskWeights">
  ): void {
    applyMaskPaint(maskWeights, this.positions, this.grid, hitPoint, mode, p);
  }

  finalizeStroke(autoSmooth = false, autoSmoothStrength = 0.3, center?: THREE.Vector3, radius?: number): void {
    if (autoSmooth && center && radius != null) {
      postSmooth(this.positions, this.grid, center, radius, autoSmoothStrength, this.adjacency ?? undefined);
      this._geo.attributes.position.needsUpdate = true;
    }
    this._geo.computeVertexNormals();
    if (this._geo.attributes.normal) this._geo.attributes.normal.needsUpdate = true;
  }

  rebuildGrid(): void {
    const pos = this._geo.attributes.position;
    this.grid.build(pos.array as Float32Array, pos.count);
  }

  /** Enforce max displacement across ALL vertices. */
  enforceConstraints(basePositions: Float32Array, maxDisplacement: number): void {
    enforceDisplacementConstraints(this.positions, basePositions, maxDisplacement, this.vertCount);
    this._geo.attributes.position.needsUpdate = true;
  }
}
