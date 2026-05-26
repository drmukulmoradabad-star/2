/**
 * MeshEditEngine — advanced mesh processing tools for dental scan editing.
 * Implements: smooth, decimate, fill holes, repair, trim, sculpt, margin line.
 * All operations return a new BufferGeometry (non-destructive pipeline).
 */

import * as THREE from "three";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MeshStats {
  vertexCount: number;
  triangleCount: number;
  edgeCount: number;
  openBoundaryEdges: number;
  nonManifoldEdges: number;
  degenerateTriangles: number;
  isWatertight: boolean;
  boundingBoxMm: { x: number; y: number; z: number };
  surfaceAreaMm2: number;
}

export interface SmoothOptions {
  iterations: number;
  factor: number;
  preserveBoundary: boolean;
}

export interface DecimateOptions {
  targetRatio: number;
  preserveBoundary: boolean;
  qualityThreshold: number;
}

export interface FillHoleOptions {
  maxHoleEdges: number;
  smooth: boolean;
}

export interface SculptOptions {
  mode: "push" | "pull" | "smooth" | "flatten";
  radius: number;
  strength: number;
  falloff: "linear" | "smooth" | "sharp";
  hitPoint: THREE.Vector3;
  hitNormal: THREE.Vector3;
}

export interface TrimOptions {
  plane: { normal: THREE.Vector3; constant: number };
  keepSide: "positive" | "negative";
  cap: boolean;
}

export interface MarginPoint {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  vertexIndex: number;
}

export type MeshEditOperation =
  | "smooth"
  | "decimate"
  | "fill_holes"
  | "repair"
  | "sculpt"
  | "trim"
  | "margin_line"
  | "remesh";

// ─── Stats ────────────────────────────────────────────────────────────────────

export function computeMeshStats(geometry: THREE.BufferGeometry): MeshStats {
  const geo = geometry.index ? geometry : indexGeometry(geometry);
  const pos = geo.attributes.position;
  const idx = geo.index!;
  const vertCount = pos.count;
  const triCount = idx.count / 3;

  const edgeMap = new Map<string, number>();
  let degenerate = 0;
  let surfaceArea = 0;

  for (let f = 0; f < triCount; f++) {
    const i0 = idx.getX(f * 3), i1 = idx.getX(f * 3 + 1), i2 = idx.getX(f * 3 + 2);
    const p0 = new THREE.Vector3(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
    const p1 = new THREE.Vector3(pos.getX(i1), pos.getY(i1), pos.getZ(i1));
    const p2 = new THREE.Vector3(pos.getX(i2), pos.getY(i2), pos.getZ(i2));

    const cross = p1.clone().sub(p0).cross(p2.clone().sub(p0));
    const area = cross.length() * 0.5;
    if (area < 1e-10) { degenerate++; continue; }
    surfaceArea += area;

    const edges = [
      [Math.min(i0, i1), Math.max(i0, i1)],
      [Math.min(i1, i2), Math.max(i1, i2)],
      [Math.min(i2, i0), Math.max(i2, i0)],
    ];
    for (const [a, b] of edges) {
      const key = `${a}_${b}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
    }
  }

  let openBoundary = 0;
  let nonManifold = 0;
  for (const count of edgeMap.values()) {
    if (count === 1) openBoundary++;
    else if (count > 2) nonManifold++;
  }

  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox!.getSize(size);

  return {
    vertexCount: vertCount,
    triangleCount: triCount,
    edgeCount: edgeMap.size,
    openBoundaryEdges: openBoundary,
    nonManifoldEdges: nonManifold,
    degenerateTriangles: degenerate,
    isWatertight: openBoundary === 0 && nonManifold === 0,
    boundingBoxMm: {
      x: parseFloat(size.x.toFixed(2)),
      y: parseFloat(size.y.toFixed(2)),
      z: parseFloat(size.z.toFixed(2)),
    },
    surfaceAreaMm2: parseFloat(surfaceArea.toFixed(2)),
  };
}

// ─── Laplacian Smooth ─────────────────────────────────────────────────────────

export function smoothMesh(
  geometry: THREE.BufferGeometry,
  opts: SmoothOptions = { iterations: 3, factor: 0.5, preserveBoundary: true }
): THREE.BufferGeometry {
  const geo = geometry.clone();
  if (!geo.index) return geo;

  const pos = geo.attributes.position;
  const idx = geo.index;
  const vertCount = pos.count;
  const triCount = idx.count / 3;

  // Build vertex adjacency
  const adjacency: Set<number>[] = Array.from({ length: vertCount }, () => new Set<number>());
  const isBoundary = new Uint8Array(vertCount);

  const edgeMap = new Map<string, number>();
  for (let f = 0; f < triCount; f++) {
    const i0 = idx.getX(f * 3), i1 = idx.getX(f * 3 + 1), i2 = idx.getX(f * 3 + 2);
    adjacency[i0].add(i1); adjacency[i0].add(i2);
    adjacency[i1].add(i0); adjacency[i1].add(i2);
    adjacency[i2].add(i0); adjacency[i2].add(i1);

    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as [number, number][]) {
      const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
    }
  }

  if (opts.preserveBoundary) {
    for (const [key, count] of edgeMap.entries()) {
      if (count === 1) {
        const [a, b] = key.split("_").map(Number);
        isBoundary[a] = 1;
        isBoundary[b] = 1;
      }
    }
  }

  // Laplacian iterations
  for (let iter = 0; iter < opts.iterations; iter++) {
    const newPos = new Float32Array(vertCount * 3);
    for (let v = 0; v < vertCount; v++) {
      if (opts.preserveBoundary && isBoundary[v]) {
        newPos[v * 3] = pos.getX(v);
        newPos[v * 3 + 1] = pos.getY(v);
        newPos[v * 3 + 2] = pos.getZ(v);
        continue;
      }
      const neighbors = adjacency[v];
      if (neighbors.size === 0) {
        newPos[v * 3] = pos.getX(v);
        newPos[v * 3 + 1] = pos.getY(v);
        newPos[v * 3 + 2] = pos.getZ(v);
        continue;
      }
      let cx = 0, cy = 0, cz = 0;
      for (const nb of neighbors) {
        cx += pos.getX(nb);
        cy += pos.getY(nb);
        cz += pos.getZ(nb);
      }
      const n = neighbors.size;
      const lx = cx / n, ly = cy / n, lz = cz / n;
      const f = opts.factor;
      newPos[v * 3] = pos.getX(v) * (1 - f) + lx * f;
      newPos[v * 3 + 1] = pos.getY(v) * (1 - f) + ly * f;
      newPos[v * 3 + 2] = pos.getZ(v) * (1 - f) + lz * f;
    }
    // Apply
    for (let v = 0; v < vertCount; v++) {
      pos.setXYZ(v, newPos[v * 3], newPos[v * 3 + 1], newPos[v * 3 + 2]);
    }
    pos.needsUpdate = true;
  }

  geo.computeVertexNormals();
  return geo;
}

// ─── Mesh Decimation (Quadric Error Metric simplified) ────────────────────────

export function decimateMesh(
  geometry: THREE.BufferGeometry,
  opts: DecimateOptions = { targetRatio: 0.5, preserveBoundary: true, qualityThreshold: 0.01 }
): THREE.BufferGeometry {
  const geo = geometry.index ? geometry.clone() : indexGeometry(geometry);
  const pos = geo.attributes.position;
  const idx = geo.index!;
  const triCount = idx.count / 3;
  const targetTris = Math.max(4, Math.floor(triCount * opts.targetRatio));

  if (targetTris >= triCount) return geo;

  // Build edge collapse candidates sorted by edge length (greedy simplification)
  interface EdgeCandidate {
    i0: number;
    i1: number;
    lengthSq: number;
  }

  const edgeSet = new Map<string, EdgeCandidate>();
  for (let f = 0; f < triCount; f++) {
    const verts = [idx.getX(f * 3), idx.getX(f * 3 + 1), idx.getX(f * 3 + 2)];
    for (let k = 0; k < 3; k++) {
      const a = verts[k], b = verts[(k + 1) % 3];
      const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
      if (!edgeSet.has(key)) {
        const dx = pos.getX(a) - pos.getX(b);
        const dy = pos.getY(a) - pos.getY(b);
        const dz = pos.getZ(a) - pos.getZ(b);
        edgeSet.set(key, { i0: Math.min(a, b), i1: Math.max(a, b), lengthSq: dx * dx + dy * dy + dz * dz });
      }
    }
  }

  // Sort by length (collapse shortest edges first)
  const candidates = Array.from(edgeSet.values()).sort((a, b) => a.lengthSq - b.lengthSq);

  // Vertex remapping
  const remap = new Int32Array(pos.count);
  for (let i = 0; i < remap.length; i++) remap[i] = i;

  const find = (v: number): number => {
    while (remap[v] !== v) { remap[v] = remap[remap[v]]; v = remap[v]; }
    return v;
  };

  // Build boundary set
  const boundaryVerts = new Set<number>();
  if (opts.preserveBoundary) {
    const edgeCounts = new Map<string, number>();
    for (let f = 0; f < triCount; f++) {
      for (let k = 0; k < 3; k++) {
        const a = idx.getX(f * 3 + k), b = idx.getX(f * 3 + (k + 1) % 3);
        const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      }
    }
    for (const [key, count] of edgeCounts.entries()) {
      if (count === 1) {
        const [a, b] = key.split("_").map(Number);
        boundaryVerts.add(a);
        boundaryVerts.add(b);
      }
    }
  }

  let collapsed = 0;
  const removedTris = new Set<number>();

  for (const cand of candidates) {
    if (triCount - removedTris.size <= targetTris) break;
    const a = find(cand.i0), b = find(cand.i1);
    if (a === b) continue;
    if (opts.preserveBoundary && (boundaryVerts.has(a) || boundaryVerts.has(b))) continue;

    // Merge b into a
    remap[b] = a;
    // Move a to midpoint
    pos.setX(a, (pos.getX(a) + pos.getX(b)) * 0.5);
    pos.setY(a, (pos.getY(a) + pos.getY(b)) * 0.5);
    pos.setZ(a, (pos.getZ(a) + pos.getZ(b)) * 0.5);
    collapsed++;

    // Mark degenerate triangles
    for (let f = 0; f < triCount; f++) {
      if (removedTris.has(f)) continue;
      const v0 = find(idx.getX(f * 3)), v1 = find(idx.getX(f * 3 + 1)), v2 = find(idx.getX(f * 3 + 2));
      if (v0 === v1 || v1 === v2 || v0 === v2) removedTris.add(f);
    }
  }

  // Rebuild geometry with surviving triangles
  const survivingFaces: number[] = [];
  for (let f = 0; f < triCount; f++) {
    if (!removedTris.has(f)) {
      survivingFaces.push(find(idx.getX(f * 3)), find(idx.getX(f * 3 + 1)), find(idx.getX(f * 3 + 2)));
    }
  }

  // Compact vertices
  const usedVerts = new Set(survivingFaces);
  const newIdx = new Map<number, number>();
  let ni = 0;
  const newPositions: number[] = [];
  for (const v of usedVerts) {
    newIdx.set(v, ni++);
    newPositions.push(pos.getX(v), pos.getY(v), pos.getZ(v));
  }

  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
  newGeo.setIndex(survivingFaces.map((v) => newIdx.get(v) ?? 0));
  newGeo.computeVertexNormals();
  newGeo.computeBoundingBox();
  return newGeo;
}

// ─── Fill Holes ───────────────────────────────────────────────────────────────

export function fillHoles(
  geometry: THREE.BufferGeometry,
  opts: FillHoleOptions = { maxHoleEdges: 100, smooth: true }
): { geometry: THREE.BufferGeometry; holesFilled: number } {
  const geo = geometry.index ? geometry.clone() : indexGeometry(geometry);
  const pos = geo.attributes.position;
  const idx = geo.index!;
  const triCount = idx.count / 3;

  // Find boundary edges (edges referenced by exactly one triangle)
  const edgeAdj = new Map<string, number[]>();
  for (let f = 0; f < triCount; f++) {
    for (let k = 0; k < 3; k++) {
      const a = idx.getX(f * 3 + k);
      const b = idx.getX(f * 3 + (k + 1) % 3);
      const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
      if (!edgeAdj.has(key)) edgeAdj.set(key, []);
      edgeAdj.get(key)!.push(f);
    }
  }

  // Build boundary edge graph
  const boundaryNext = new Map<number, number>();
  for (const [key, faces] of edgeAdj.entries()) {
    if (faces.length === 1) {
      const [a, b] = key.split("_").map(Number);
      // Determine winding direction from the face
      const f = faces[0];
      const v0 = idx.getX(f * 3), v1 = idx.getX(f * 3 + 1), v2 = idx.getX(f * 3 + 2);
      // Boundary edge goes from a to b in face winding
      let from = a, to = b;
      for (let k = 0; k < 3; k++) {
        const va = [v0, v1, v2][k], vb = [v0, v1, v2][(k + 1) % 3];
        if (Math.min(va, vb) === a && Math.max(va, vb) === b) {
          from = va; to = vb;
          break;
        }
      }
      boundaryNext.set(from, to);
    }
  }

  // Trace boundary loops
  const visited = new Set<number>();
  const loops: number[][] = [];
  for (const start of boundaryNext.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let cur = start;
    let guard = 0;
    while (!visited.has(cur) && guard++ < 10000) {
      visited.add(cur);
      loop.push(cur);
      const next = boundaryNext.get(cur);
      if (next === undefined || next === start) break;
      cur = next;
    }
    if (loop.length >= 3 && loop.length <= opts.maxHoleEdges) loops.push(loop);
  }

  if (loops.length === 0) return { geometry: geo, holesFilled: 0 };

  // Fill each hole with a fan triangulation from centroid
  const newPositions = Array.from({ length: pos.count }, (_, i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
  const newIndices: number[] = [];
  for (let f = 0; f < triCount; f++) {
    newIndices.push(idx.getX(f * 3), idx.getX(f * 3 + 1), idx.getX(f * 3 + 2));
  }

  for (const loop of loops) {
    // Centroid
    let cx = 0, cy = 0, cz = 0;
    for (const v of loop) {
      cx += newPositions[v][0]; cy += newPositions[v][1]; cz += newPositions[v][2];
    }
    const n = loop.length;
    cx /= n; cy /= n; cz /= n;

    const centroidIdx = newPositions.length;
    newPositions.push([cx, cy, cz]);

    // Fan triangles (reversed winding to patch the hole from inside)
    for (let k = 0; k < loop.length; k++) {
      const a = loop[k], b = loop[(k + 1) % loop.length];
      newIndices.push(b, a, centroidIdx);
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(newPositions.flat(), 3));
  result.setIndex(newIndices);

  if (opts.smooth) {
    result.computeVertexNormals();
    const smoothed = smoothMesh(result, { iterations: 2, factor: 0.3, preserveBoundary: true });
    smoothed.computeVertexNormals();
    return { geometry: smoothed, holesFilled: loops.length };
  }

  result.computeVertexNormals();
  return { geometry: result, holesFilled: loops.length };
}

// ─── Mesh Repair ──────────────────────────────────────────────────────────────

export interface RepairResult {
  geometry: THREE.BufferGeometry;
  degeneratesRemoved: number;
  duplicatesWelded: number;
  normalsFlipped: number;
}

export function repairMesh(geometry: THREE.BufferGeometry): RepairResult {
  let geo = geometry.index ? geometry.clone() : indexGeometry(geometry);
  const pos = geo.attributes.position;
  const idx = geo.index!;
  let triCount = idx.count / 3;

  // Step 1: Weld duplicate vertices (within tolerance)
  const tolerance = 1e-5;
  const vertMap = new Map<string, number>();
  const remap = new Int32Array(pos.count);
  const newPositions: number[] = [];
  let weldCount = 0;

  for (let v = 0; v < pos.count; v++) {
    const x = Math.round(pos.getX(v) / tolerance) * tolerance;
    const y = Math.round(pos.getY(v) / tolerance) * tolerance;
    const z = Math.round(pos.getZ(v) / tolerance) * tolerance;
    const key = `${x}_${y}_${z}`;
    if (vertMap.has(key)) {
      remap[v] = vertMap.get(key)!;
      weldCount++;
    } else {
      const ni = newPositions.length / 3;
      vertMap.set(key, ni);
      remap[v] = ni;
      newPositions.push(pos.getX(v), pos.getY(v), pos.getZ(v));
    }
  }

  // Step 2: Remove degenerate triangles
  const newIndices: number[] = [];
  let degenerateCount = 0;
  for (let f = 0; f < triCount; f++) {
    const a = remap[idx.getX(f * 3)];
    const b = remap[idx.getX(f * 3 + 1)];
    const c = remap[idx.getX(f * 3 + 2)];
    if (a === b || b === c || a === c) { degenerateCount++; continue; }
    newIndices.push(a, b, c);
  }
  triCount = newIndices.length / 3;

  // Step 3: Fix flipped normals (make outward-facing majority consistent)
  // Use simple heuristic: ensure face normals point away from centroid
  const cx_sum = newPositions.filter((_, i) => i % 3 === 0).reduce((s, v) => s + v, 0) / (newPositions.length / 3);
  const cy_sum = newPositions.filter((_, i) => i % 3 === 1).reduce((s, v) => s + v, 0) / (newPositions.length / 3);
  const cz_sum = newPositions.filter((_, i) => i % 3 === 2).reduce((s, v) => s + v, 0) / (newPositions.length / 3);
  const centroid = new THREE.Vector3(cx_sum, cy_sum, cz_sum);

  let flippedCount = 0;
  const finalIndices: number[] = [];
  for (let f = 0; f < triCount; f++) {
    const a = newIndices[f * 3], b = newIndices[f * 3 + 1], c = newIndices[f * 3 + 2];
    const p0 = new THREE.Vector3(newPositions[a * 3], newPositions[a * 3 + 1], newPositions[a * 3 + 2]);
    const p1 = new THREE.Vector3(newPositions[b * 3], newPositions[b * 3 + 1], newPositions[b * 3 + 2]);
    const p2 = new THREE.Vector3(newPositions[c * 3], newPositions[c * 3 + 1], newPositions[c * 3 + 2]);
    const faceCenter = p0.clone().add(p1).add(p2).divideScalar(3);
    const normal = p1.clone().sub(p0).cross(p2.clone().sub(p0)).normalize();
    const toCenter = faceCenter.clone().sub(centroid).normalize();

    if (normal.dot(toCenter) < 0) {
      finalIndices.push(a, c, b);
      flippedCount++;
    } else {
      finalIndices.push(a, b, c);
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
  result.setIndex(finalIndices);
  result.computeVertexNormals();
  result.computeBoundingBox();

  return {
    geometry: result,
    degeneratesRemoved: degenerateCount,
    duplicatesWelded: weldCount,
    normalsFlipped: flippedCount,
  };
}

// ─── Sculpt (Push/Pull/Smooth/Flatten) ───────────────────────────────────────

export function sculptMesh(
  geometry: THREE.BufferGeometry,
  opts: SculptOptions
): THREE.BufferGeometry {
  const geo = geometry.clone();
  const pos = geo.attributes.position;
  const r2 = opts.radius * opts.radius;
  const { hitPoint, hitNormal, mode, strength } = opts;

  const falloffWeight = (distSq: number): number => {
    const t = 1 - distSq / r2;
    if (t <= 0) return 0;
    switch (opts.falloff) {
      case "linear": return t;
      case "smooth": return t * t * (3 - 2 * t);
      case "sharp": return t * t * t;
    }
  };

  const vertCount = pos.count;
  const affected: { v: number; w: number }[] = [];

  for (let v = 0; v < vertCount; v++) {
    const dx = pos.getX(v) - hitPoint.x;
    const dy = pos.getY(v) - hitPoint.y;
    const dz = pos.getZ(v) - hitPoint.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < r2) {
      affected.push({ v, w: falloffWeight(d2) });
    }
  }

  if (mode === "smooth") {
    // Laplacian smooth only the affected region
    const idx = geo.index;
    if (!idx) { geo.computeVertexNormals(); return geo; }
    const triCount = idx.count / 3;
    const adjacency: Map<number, number[]> = new Map();
    for (const { v } of affected) adjacency.set(v, []);
    for (let f = 0; f < triCount; f++) {
      const verts = [idx.getX(f * 3), idx.getX(f * 3 + 1), idx.getX(f * 3 + 2)];
      for (const va of verts) {
        if (!adjacency.has(va)) continue;
        for (const vb of verts) {
          if (vb !== va) adjacency.get(va)!.push(vb);
        }
      }
    }

    for (const { v, w } of affected) {
      const nbs = adjacency.get(v) ?? [];
      if (nbs.length === 0) continue;
      let cx = 0, cy = 0, cz = 0;
      for (const nb of nbs) { cx += pos.getX(nb); cy += pos.getY(nb); cz += pos.getZ(nb); }
      const n = nbs.length;
      const f = w * strength;
      pos.setX(v, pos.getX(v) * (1 - f) + (cx / n) * f);
      pos.setY(v, pos.getY(v) * (1 - f) + (cy / n) * f);
      pos.setZ(v, pos.getZ(v) * (1 - f) + (cz / n) * f);
    }
  } else if (mode === "flatten") {
    // Flatten toward the hit plane
    const d = hitPoint.dot(hitNormal);
    for (const { v, w } of affected) {
      const p = new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v));
      const dist = p.dot(hitNormal) - d;
      const proj = p.clone().sub(hitNormal.clone().multiplyScalar(dist));
      const f = w * strength;
      pos.setX(v, p.x * (1 - f) + proj.x * f);
      pos.setY(v, p.y * (1 - f) + proj.y * f);
      pos.setZ(v, p.z * (1 - f) + proj.z * f);
    }
  } else {
    // Push/Pull along hit normal
    const dir = mode === "push" ? -1 : 1;
    const delta = hitNormal.clone().multiplyScalar(strength * dir);
    for (const { v, w } of affected) {
      pos.setX(v, pos.getX(v) + delta.x * w);
      pos.setY(v, pos.getY(v) + delta.y * w);
      pos.setZ(v, pos.getZ(v) + delta.z * w);
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ─── Plane Trim ───────────────────────────────────────────────────────────────

export function trimMesh(
  geometry: THREE.BufferGeometry,
  opts: TrimOptions
): THREE.BufferGeometry {
  const geo = geometry.index ? geometry.clone() : indexGeometry(geometry);
  const pos = geo.attributes.position;
  const idx = geo.index!;
  const triCount = idx.count / 3;
  const { normal, constant } = opts.plane;
  const keep = opts.keepSide === "positive";

  const isSideV = (v: number) => {
    const d = pos.getX(v) * normal.x + pos.getY(v) * normal.y + pos.getZ(v) * normal.z + constant;
    return keep ? d >= 0 : d <= 0;
  };

  const newPositions = Array.from({ length: pos.count }, (_, i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
  const newIndices: number[] = [];

  for (let f = 0; f < triCount; f++) {
    const a = idx.getX(f * 3), b = idx.getX(f * 3 + 1), c = idx.getX(f * 3 + 2);
    const ka = isSideV(a), kb = isSideV(b), kc = isSideV(c);

    if (ka && kb && kc) {
      newIndices.push(a, b, c);
    } else if (ka && kb && !kc) {
      // Clip c
      const nc = newPositions.length;
      newPositions.push(interpPlane(newPositions, a, c, normal, constant));
      const nd = newPositions.length;
      newPositions.push(interpPlane(newPositions, b, c, normal, constant));
      newIndices.push(a, b, nc);
      newIndices.push(b, nd, nc);
    } else if (ka && !kb && kc) {
      const nc = newPositions.length;
      newPositions.push(interpPlane(newPositions, a, b, normal, constant));
      const nd = newPositions.length;
      newPositions.push(interpPlane(newPositions, c, b, normal, constant));
      newIndices.push(a, nc, c);
      newIndices.push(nc, nd, c);
    } else if (!ka && kb && kc) {
      const nc = newPositions.length;
      newPositions.push(interpPlane(newPositions, b, a, normal, constant));
      const nd = newPositions.length;
      newPositions.push(interpPlane(newPositions, c, a, normal, constant));
      newIndices.push(nc, b, c);
      newIndices.push(nc, c, nd);
    } else if (ka && !kb && !kc) {
      const nc = newPositions.length;
      newPositions.push(interpPlane(newPositions, a, b, normal, constant));
      const nd = newPositions.length;
      newPositions.push(interpPlane(newPositions, a, c, normal, constant));
      newIndices.push(a, nc, nd);
    } else if (!ka && kb && !kc) {
      const nc = newPositions.length;
      newPositions.push(interpPlane(newPositions, b, a, normal, constant));
      const nd = newPositions.length;
      newPositions.push(interpPlane(newPositions, b, c, normal, constant));
      newIndices.push(nc, b, nd);
    } else if (!ka && !kb && kc) {
      const nc = newPositions.length;
      newPositions.push(interpPlane(newPositions, c, a, normal, constant));
      const nd = newPositions.length;
      newPositions.push(interpPlane(newPositions, c, b, normal, constant));
      newIndices.push(nc, nd, c);
    }
    // all clipped: skip
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(newPositions.flat(), 3));
  result.setIndex(newIndices);
  result.computeVertexNormals();
  result.computeBoundingBox();
  return result;
}

function interpPlane(
  positions: number[][],
  a: number,
  b: number,
  normal: THREE.Vector3,
  constant: number
): number[] {
  const pa = positions[a], pb = positions[b];
  const da = pa[0] * normal.x + pa[1] * normal.y + pa[2] * normal.z + constant;
  const db = pb[0] * normal.x + pb[1] * normal.y + pb[2] * normal.z + constant;
  const t = da / (da - db);
  return [
    pa[0] + t * (pb[0] - pa[0]),
    pa[1] + t * (pb[1] - pa[1]),
    pa[2] + t * (pb[2] - pa[2]),
  ];
}

// ─── Margin Line Detection ─────────────────────────────────────────────────────

export function detectMarginLine(
  geometry: THREE.BufferGeometry,
  curvatureThreshold = 0.4
): MarginPoint[] {
  const geo = geometry.index ? geometry.clone() : indexGeometry(geometry);
  const pos = geo.attributes.position;
  const idx = geo.index!;
  const triCount = idx.count / 3;
  const vertCount = pos.count;

  // Compute per-vertex normals
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;

  // Build adjacency
  const adjacency: number[][] = Array.from({ length: vertCount }, () => []);
  for (let f = 0; f < triCount; f++) {
    const a = idx.getX(f * 3), b = idx.getX(f * 3 + 1), c = idx.getX(f * 3 + 2);
    adjacency[a].push(b, c);
    adjacency[b].push(a, c);
    adjacency[c].push(a, b);
  }

  // Detect high-curvature vertices (margin candidates)
  const marginPoints: MarginPoint[] = [];
  const nv = new THREE.Vector3();

  for (let v = 0; v < vertCount; v++) {
    const neighbors = adjacency[v];
    if (neighbors.length < 2) continue;

    nv.set(nor.getX(v), nor.getY(v), nor.getZ(v));
    let maxAngleDiff = 0;

    for (const nb of neighbors) {
      const nbN = new THREE.Vector3(nor.getX(nb), nor.getY(nb), nor.getZ(nb));
      const dot = Math.max(-1, Math.min(1, nv.dot(nbN)));
      const angle = Math.acos(dot);
      maxAngleDiff = Math.max(maxAngleDiff, angle);
    }

    if (maxAngleDiff > curvatureThreshold) {
      marginPoints.push({
        position: new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v)),
        normal: nv.clone(),
        vertexIndex: v,
      });
    }
  }

  // Sort by Z (cervical direction) to form a loop
  marginPoints.sort((a, b) => a.position.z - b.position.z);

  return marginPoints;
}

// ─── Geometry Index Helper ─────────────────────────────────────────────────────

function indexGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = geometry.clone();
  const pos = geo.attributes.position;
  const indices: number[] = [];
  for (let i = 0; i < pos.count; i++) indices.push(i);
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ─── Remesh (Isotropic uniform subdivision) ───────────────────────────────────

export function remeshUniform(
  geometry: THREE.BufferGeometry,
  targetEdgeLength = 0.5
): THREE.BufferGeometry {
  const geo = geometry.index ? geometry.clone() : indexGeometry(geometry);
  const pos = geo.attributes.position;
  const idx = geo.index!;
  const triCount = idx.count / 3;

  const newPositions: number[] = Array.from({ length: pos.count * 3 }, (_, i) => {
    const v = Math.floor(i / 3), c = i % 3;
    return c === 0 ? pos.getX(v) : c === 1 ? pos.getY(v) : pos.getZ(v);
  });
  const newIndices: number[] = [];
  const edgeMidpoints = new Map<string, number>();

  const getMidpoint = (a: number, b: number): number => {
    const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
    if (edgeMidpoints.has(key)) return edgeMidpoints.get(key)!;

    const ax = newPositions[a * 3], ay = newPositions[a * 3 + 1], az = newPositions[a * 3 + 2];
    const bx = newPositions[b * 3], by = newPositions[b * 3 + 1], bz = newPositions[b * 3 + 2];
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (len < targetEdgeLength) {
      // Don't subdivide short edges
      edgeMidpoints.set(key, -1);
      return -1;
    }

    const mi = newPositions.length / 3;
    newPositions.push((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    edgeMidpoints.set(key, mi);
    return mi;
  };

  for (let f = 0; f < triCount; f++) {
    const a = idx.getX(f * 3), b = idx.getX(f * 3 + 1), c = idx.getX(f * 3 + 2);
    const mab = getMidpoint(a, b);
    const mbc = getMidpoint(b, c);
    const mca = getMidpoint(c, a);

    const sub = [mab, mbc, mca].filter((m) => m !== -1).length;

    if (sub === 0) {
      newIndices.push(a, b, c);
    } else if (sub === 3) {
      newIndices.push(a, mab, mca);
      newIndices.push(mab, b, mbc);
      newIndices.push(mca, mbc, c);
      newIndices.push(mab, mbc, mca);
    } else if (sub === 1) {
      if (mab !== -1) { newIndices.push(a, mab, c); newIndices.push(mab, b, c); }
      else if (mbc !== -1) { newIndices.push(a, b, mbc); newIndices.push(a, mbc, c); }
      else { newIndices.push(a, b, mca); newIndices.push(b, c, mca); }
    } else {
      newIndices.push(a, b, c); // fallback
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
  result.setIndex(newIndices);
  result.computeVertexNormals();
  result.computeBoundingBox();
  return result;
}
