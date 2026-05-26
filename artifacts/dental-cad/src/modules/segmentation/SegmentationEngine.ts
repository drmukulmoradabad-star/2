import * as THREE from "three";

export interface ToothSegment {
  id: string;
  fdiNumber: number | null;
  universalNumber: number | null;
  label: string;
  faceIndices: number[];
  vertexIndices: Set<number>;
  geometry: THREE.BufferGeometry;
  centroid: THREE.Vector3;
  boundingBox: THREE.Box3;
  color: string;
  isLocked: boolean;
}

export interface SegmentationResult {
  segments: ToothSegment[];
  faceSegmentMap: Int32Array;
  vertexSegmentMap: Int32Array;
}

// FDI notation colors per tooth quadrant
const TOOTH_COLORS = [
  "#00c8ff", "#00b8e6", "#00a8cc",
  "#4dffb8", "#33e6a0", "#1acc88",
  "#ffcc00", "#e6b800", "#cca300",
  "#ff6b6b", "#ff5252", "#ff3838",
  "#b87cff", "#a060e6", "#8844cc",
  "#ff9940", "#ff8020", "#e06010",
  "#60d9a0", "#40c888", "#20b870",
  "#ff80c0", "#ff60a8", "#e04090",
];

function buildFaceAdjacency(geometry: THREE.BufferGeometry): Map<number, number[]>[] {
  const posAttr = geometry.attributes.position;
  const indexAttr = geometry.index;
  const triCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;

  // edge key -> list of face indices sharing that edge
  const edgeToFaces = new Map<string, number[]>();

  const getIndex = (i: number) => indexAttr ? indexAttr.getX(i) : i;

  for (let f = 0; f < triCount; f++) {
    const i0 = getIndex(f * 3);
    const i1 = getIndex(f * 3 + 1);
    const i2 = getIndex(f * 3 + 2);
    const edges = [
      [Math.min(i0, i1), Math.max(i0, i1)],
      [Math.min(i1, i2), Math.max(i1, i2)],
      [Math.min(i2, i0), Math.max(i2, i0)],
    ];
    for (const [a, b] of edges) {
      const key = `${a}_${b}`;
      if (!edgeToFaces.has(key)) edgeToFaces.set(key, []);
      edgeToFaces.get(key)!.push(f);
    }
  }

  // face -> adjacent faces
  const adjacency: Map<number, number[]> = new Map();
  for (let f = 0; f < triCount; f++) adjacency.set(f, []);

  for (const faces of edgeToFaces.values()) {
    if (faces.length === 2) {
      adjacency.get(faces[0])!.push(faces[1]);
      adjacency.get(faces[1])!.push(faces[0]);
    }
  }

  return [adjacency];
}

function computeFaceNormal(geometry: THREE.BufferGeometry, faceIdx: number): THREE.Vector3 {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const getI = (i: number) => idx ? idx.getX(i) : i;

  const i0 = getI(faceIdx * 3);
  const i1 = getI(faceIdx * 3 + 1);
  const i2 = getI(faceIdx * 3 + 2);

  const v0 = new THREE.Vector3(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
  const v1 = new THREE.Vector3(pos.getX(i1), pos.getY(i1), pos.getZ(i1));
  const v2 = new THREE.Vector3(pos.getX(i2), pos.getY(i2), pos.getZ(i2));

  return new THREE.Vector3().crossVectors(v1.sub(v0), v2.sub(v0)).normalize();
}

/**
 * Main segmentation function using dihedral angle threshold for boundary detection.
 * Faces connected by concave edges (angle > threshold) are treated as separate regions.
 */
export function segmentMesh(
  geometry: THREE.BufferGeometry,
  options: {
    angleThresholdDeg?: number;
    minFaceCount?: number;
    maxSegments?: number;
  } = {}
): SegmentationResult {
  const {
    angleThresholdDeg = 30,
    minFaceCount = 50,
    maxSegments = 32,
  } = options;

  const cosThreshold = Math.cos((angleThresholdDeg * Math.PI) / 180);
  const pos = geometry.attributes.position;
  const idxAttr = geometry.index;
  const triCount = idxAttr ? idxAttr.count / 3 : pos.count / 3;

  if (triCount < 10) {
    return { segments: [], faceSegmentMap: new Int32Array(triCount).fill(-1), vertexSegmentMap: new Int32Array(pos.count).fill(-1) };
  }

  // Precompute face normals
  const faceNormals: THREE.Vector3[] = [];
  for (let f = 0; f < triCount; f++) {
    faceNormals.push(computeFaceNormal(geometry, f));
  }

  // Build adjacency
  const [adjacency] = buildFaceAdjacency(geometry);

  // BFS flood fill — skip edges where normals diverge beyond threshold (concave valley)
  const faceSegmentMap = new Int32Array(triCount).fill(-1);
  let segId = 0;

  for (let startFace = 0; startFace < triCount; startFace++) {
    if (faceSegmentMap[startFace] !== -1) continue;

    const queue: number[] = [startFace];
    faceSegmentMap[startFace] = segId;
    let head = 0;

    while (head < queue.length) {
      const face = queue[head++];
      const neighbors = adjacency.get(face) || [];
      for (const nb of neighbors) {
        if (faceSegmentMap[nb] !== -1) continue;
        const dot = faceNormals[face].dot(faceNormals[nb]);
        if (dot >= cosThreshold) {
          faceSegmentMap[nb] = segId;
          queue.push(nb);
        }
      }
    }
    segId++;
  }

  // Count faces per segment
  const segFaceCounts = new Map<number, number>();
  for (let f = 0; f < triCount; f++) {
    const s = faceSegmentMap[f];
    segFaceCounts.set(s, (segFaceCounts.get(s) || 0) + 1);
  }

  // Merge small segments into nearest neighbor
  const smallSegs = new Set<number>();
  for (const [s, count] of segFaceCounts) {
    if (count < minFaceCount) smallSegs.add(s);
  }

  if (smallSegs.size > 0) {
    for (let f = 0; f < triCount; f++) {
      if (!smallSegs.has(faceSegmentMap[f])) continue;
      const neighbors = adjacency.get(f) || [];
      for (const nb of neighbors) {
        if (!smallSegs.has(faceSegmentMap[nb])) {
          faceSegmentMap[f] = faceSegmentMap[nb];
          break;
        }
      }
    }
  }

  // Normalize segment IDs to be contiguous
  const idRemap = new Map<number, number>();
  let nextId = 0;
  for (let f = 0; f < triCount; f++) {
    const old = faceSegmentMap[f];
    if (!idRemap.has(old)) idRemap.set(old, nextId++);
    faceSegmentMap[f] = idRemap.get(old)!;
  }

  const totalSegs = nextId;

  // Sort segments by size (largest first, likely gum vs teeth)
  const segFaces: number[][] = Array.from({ length: totalSegs }, () => []);
  for (let f = 0; f < triCount; f++) segFaces[faceSegmentMap[f]].push(f);

  // Sort by face count desc
  const sorted = segFaces
    .map((faces, id) => ({ id, faces }))
    .sort((a, b) => b.faces.length - a.faces.length);

  // Limit to maxSegments (exclude largest which is often gum/base)
  const toothSegs = sorted.slice(1, maxSegments + 1);

  // Build vertex segment map
  const getI = (i: number) => idxAttr ? idxAttr.getX(i) : i;
  const vertexSegmentMap = new Int32Array(pos.count).fill(-1);

  const segments: ToothSegment[] = toothSegs.map((seg, idx) => {
    const vertexIndices = new Set<number>();
    for (const f of seg.faces) {
      vertexIndices.add(getI(f * 3));
      vertexIndices.add(getI(f * 3 + 1));
      vertexIndices.add(getI(f * 3 + 2));
      vertexSegmentMap[getI(f * 3)] = idx;
      vertexSegmentMap[getI(f * 3 + 1)] = idx;
      vertexSegmentMap[getI(f * 3 + 2)] = idx;
    }

    // Build sub-geometry
    const subGeo = extractSubGeometry(geometry, seg.faces);

    // Compute centroid
    subGeo.computeBoundingBox();
    const centroid = new THREE.Vector3();
    subGeo.boundingBox!.getCenter(centroid);

    // Assign FDI-like numbering (simple sequential assignment)
    const fdiNumber = toothFDIFromIndex(idx, toothSegs.length);

    return {
      id: `tooth_${idx}`,
      fdiNumber,
      universalNumber: fdiToUniversal(fdiNumber),
      label: fdiNumber ? `FDI ${fdiNumber}` : `Segment ${idx + 1}`,
      faceIndices: seg.faces,
      vertexIndices,
      geometry: subGeo,
      centroid,
      boundingBox: subGeo.boundingBox!.clone(),
      color: TOOTH_COLORS[idx % TOOTH_COLORS.length],
      isLocked: false,
    };
  });

  // Update faceSegmentMap for excluded faces
  for (let f = 0; f < triCount; f++) {
    const remapped = sorted.findIndex((s) => s.id === faceSegmentMap[f]);
    faceSegmentMap[f] = remapped <= 0 ? -1 : remapped - 1; // -1 for gum/base
  }

  return { segments, faceSegmentMap, vertexSegmentMap };
}

function extractSubGeometry(geometry: THREE.BufferGeometry, faceIndices: number[]): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const idxAttr = geometry.index;
  const getI = (i: number) => idxAttr ? idxAttr.getX(i) : i;

  const oldToNew = new Map<number, number>();
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  const newIndices: number[] = [];

  for (const f of faceIndices) {
    for (let k = 0; k < 3; k++) {
      const oldIdx = getI(f * 3 + k);
      if (!oldToNew.has(oldIdx)) {
        const newIdx = newPositions.length / 3;
        oldToNew.set(oldIdx, newIdx);
        newPositions.push(pos.getX(oldIdx), pos.getY(oldIdx), pos.getZ(oldIdx));
        if (norm) newNormals.push(norm.getX(oldIdx), norm.getY(oldIdx), norm.getZ(oldIdx));
      }
      newIndices.push(oldToNew.get(oldIdx)!);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
  if (newNormals.length > 0) geo.setAttribute("normal", new THREE.Float32BufferAttribute(newNormals, 3));
  geo.setIndex(newIndices);
  if (!norm || newNormals.length === 0) geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

/** Paint vertex colors on original geometry for visual segmentation */
export function applySegmentColors(
  geometry: THREE.BufferGeometry,
  segments: ToothSegment[],
  vertexSegmentMap: Int32Array,
  activeSegmentId: string | null,
  gumColor = "#2a1f1f"
): void {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const gumRgb = hexToRgb(gumColor);

  for (let v = 0; v < pos.count; v++) {
    const segIdx = vertexSegmentMap[v];
    if (segIdx < 0 || segIdx >= segments.length) {
      colors[v * 3] = gumRgb[0];
      colors[v * 3 + 1] = gumRgb[1];
      colors[v * 3 + 2] = gumRgb[2];
    } else {
      const seg = segments[segIdx];
      const isActive = seg.id === activeSegmentId;
      const rgb = hexToRgb(isActive ? "#ffffff" : seg.color);
      const boost = isActive ? 1.2 : 1.0;
      colors[v * 3] = Math.min(1, rgb[0] * boost);
      colors[v * 3 + 1] = Math.min(1, rgb[1] * boost);
      colors[v * 3 + 2] = Math.min(1, rgb[2] * boost);
    }
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}

export function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** Detect which segment was clicked via face index from raycaster */
export function getFaceSegment(faceIndex: number, faceSegmentMap: Int32Array): number {
  return faceSegmentMap[faceIndex] ?? -1;
}

/** Brush paint: assign faces within brush radius to a segment */
export function brushPaintFaces(
  geometry: THREE.BufferGeometry,
  hitPoint: THREE.Vector3,
  brushRadius: number,
  targetSegmentIdx: number,
  faceSegmentMap: Int32Array
): Int32Array {
  const pos = geometry.attributes.position;
  const idxAttr = geometry.index;
  const triCount = idxAttr ? idxAttr.count / 3 : pos.count / 3;
  const getI = (i: number) => idxAttr ? idxAttr.getX(i) : i;

  const newMap = new Int32Array(faceSegmentMap);
  const r2 = brushRadius * brushRadius;

  for (let f = 0; f < triCount; f++) {
    const i0 = getI(f * 3);
    const cx = (pos.getX(i0) + pos.getX(getI(f * 3 + 1)) + pos.getX(getI(f * 3 + 2))) / 3;
    const cy = (pos.getY(i0) + pos.getY(getI(f * 3 + 1)) + pos.getY(getI(f * 3 + 2))) / 3;
    const cz = (pos.getZ(i0) + pos.getZ(getI(f * 3 + 1)) + pos.getZ(getI(f * 3 + 2))) / 3;
    const dx = cx - hitPoint.x, dy = cy - hitPoint.y, dz = cz - hitPoint.z;
    if (dx * dx + dy * dy + dz * dz < r2) newMap[f] = targetSegmentIdx;
  }
  return newMap;
}

// Simplified FDI assignment based on position
function toothFDIFromIndex(idx: number, total: number): number | null {
  // Common tooth counts: upper 14, lower 14 (incl wisdom)
  const fdiUpper = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const fdiLower = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  const all = [...fdiUpper, ...fdiLower];
  return all[idx] ?? null;
}

function fdiToUniversal(fdi: number | null): number | null {
  if (!fdi) return null;
  const map: Record<number, number> = {
    18: 1, 17: 2, 16: 3, 15: 4, 14: 5, 13: 6, 12: 7, 11: 8,
    21: 9, 22: 10, 23: 11, 24: 12, 25: 13, 26: 14, 27: 15, 28: 16,
    38: 17, 37: 18, 36: 19, 35: 20, 34: 21, 33: 22, 32: 23, 31: 24,
    41: 25, 42: 26, 43: 27, 44: 28, 45: 29, 46: 30, 47: 31, 48: 32,
  };
  return map[fdi] ?? null;
}
