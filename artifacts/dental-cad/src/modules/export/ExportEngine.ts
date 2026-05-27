import * as THREE from "three";
import type { TreatmentStage } from "../simulation/TreatmentEngine";
import type { ToothSegment } from "../segmentation/SegmentationEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = "stl" | "obj" | "ply";
export type ExportMode = "binary" | "ascii";

export interface ExportOptions {
  format: ExportFormat;
  mode: ExportMode;
  name: string;
  compress: boolean;
  includeStages: boolean;
  stageNaming: StageNamingConvention;
  printingCompat: boolean;
}

export type StageNamingConvention = "numeric" | "clinical" | "iso" | "custom";

export interface ValidationResult {
  valid: boolean;
  vertexCount: number;
  triangleCount: number;
  degenerateTriangles: number;
  nonManifoldEdges: number;
  openBoundaries: number;
  selfIntersections: number;
  minFaceAngleDeg: number;
  maxAspectRatio: number;
  isWatertight: boolean;
  isPrintReady: boolean;
  warnings: string[];
  errors: string[];
}

export interface BatchExportItem {
  name: string;
  geometry: THREE.BufferGeometry;
  format: ExportFormat;
  mode: ExportMode;
}

// ─── STL Writer ───────────────────────────────────────────────────────────────

export function encodeSTL(geometry: THREE.BufferGeometry, binary = true): ArrayBuffer | string {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  geo.computeVertexNormals();

  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const triCount = pos.count / 3;

  if (binary) {
    const buf = new ArrayBuffer(80 + 4 + triCount * 50);
    const view = new DataView(buf);
    const header = "DentalCAD STL Export - Binary";
    for (let i = 0; i < 80; i++) {
      view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
    }
    view.setUint32(80, triCount, true);
    let offset = 84;
    for (let f = 0; f < triCount; f++) {
      const base = f * 3;
      const nx = nor.getX(base), ny = nor.getY(base), nz = nor.getZ(base);
      view.setFloat32(offset, nx, true); offset += 4;
      view.setFloat32(offset, ny, true); offset += 4;
      view.setFloat32(offset, nz, true); offset += 4;
      for (let k = 0; k < 3; k++) {
        const vi = base + k;
        view.setFloat32(offset, pos.getX(vi), true); offset += 4;
        view.setFloat32(offset, pos.getY(vi), true); offset += 4;
        view.setFloat32(offset, pos.getZ(vi), true); offset += 4;
      }
      view.setUint16(offset, 0, true); offset += 2;
    }
    return buf;
  } else {
    const lines: string[] = ["solid DentalCAD"];
    for (let f = 0; f < triCount; f++) {
      const base = f * 3;
      const nx = nor.getX(base).toFixed(6);
      const ny = nor.getY(base).toFixed(6);
      const nz = nor.getZ(base).toFixed(6);
      lines.push(`  facet normal ${nx} ${ny} ${nz}`);
      lines.push("    outer loop");
      for (let k = 0; k < 3; k++) {
        const vi = base + k;
        lines.push(`      vertex ${pos.getX(vi).toFixed(6)} ${pos.getY(vi).toFixed(6)} ${pos.getZ(vi).toFixed(6)}`);
      }
      lines.push("    endloop");
      lines.push("  endfacet");
    }
    lines.push("endsolid DentalCAD");
    return lines.join("\n");
  }
}

// ─── OBJ Writer ───────────────────────────────────────────────────────────────

export function encodeOBJ(geometry: THREE.BufferGeometry, name = "scan"): string {
  const geo = geometry.clone();
  geo.computeVertexNormals();

  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const idx = geo.index;
  const lines: string[] = [`# DentalCAD OBJ Export`, `# Vertices: ${pos.count}`, `o ${name}`, ""];

  for (let i = 0; i < pos.count; i++) {
    lines.push(`v ${pos.getX(i).toFixed(6)} ${pos.getY(i).toFixed(6)} ${pos.getZ(i).toFixed(6)}`);
  }
  lines.push("");

  if (uv) {
    for (let i = 0; i < uv.count; i++) {
      lines.push(`vt ${uv.getX(i).toFixed(6)} ${uv.getY(i).toFixed(6)}`);
    }
    lines.push("");
  }

  if (nor) {
    for (let i = 0; i < nor.count; i++) {
      lines.push(`vn ${nor.getX(i).toFixed(6)} ${nor.getY(i).toFixed(6)} ${nor.getZ(i).toFixed(6)}`);
    }
    lines.push("");
  }

  lines.push("g default");
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const getI = (i: number) => (idx ? idx.getX(i) : i) + 1;
  const hasUV = !!uv;
  const hasNor = !!nor;

  for (let f = 0; f < triCount; f++) {
    const a = getI(f * 3), b = getI(f * 3 + 1), c = getI(f * 3 + 2);
    if (hasNor && hasUV) lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    else if (hasNor) lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
    else lines.push(`f ${a} ${b} ${c}`);
  }

  return lines.join("\n");
}

// ─── PLY Writer ───────────────────────────────────────────────────────────────

export function encodePLY(geometry: THREE.BufferGeometry, binary = true): ArrayBuffer | string {
  const geo = geometry.clone();
  geo.computeVertexNormals();

  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const idx = geo.index;
  const vertCount = pos.count;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const getI = (i: number) => idx ? idx.getX(i) : i;

  const header = [
    "ply",
    `format ${binary ? "binary_little_endian" : "ascii"} 1.0`,
    "comment DentalCAD PLY Export",
    `element vertex ${vertCount}`,
    "property float x",
    "property float y",
    "property float z",
    nor ? "property float nx" : null,
    nor ? "property float ny" : null,
    nor ? "property float nz" : null,
    `element face ${triCount}`,
    "property list uchar int vertex_indices",
    "end_header",
  ].filter(Boolean).join("\n") + "\n";

  if (!binary) {
    const lines = [header];
    for (let i = 0; i < vertCount; i++) {
      let line = `${pos.getX(i).toFixed(6)} ${pos.getY(i).toFixed(6)} ${pos.getZ(i).toFixed(6)}`;
      if (nor) line += ` ${nor.getX(i).toFixed(6)} ${nor.getY(i).toFixed(6)} ${nor.getZ(i).toFixed(6)}`;
      lines.push(line);
    }
    for (let f = 0; f < triCount; f++) {
      lines.push(`3 ${getI(f * 3)} ${getI(f * 3 + 1)} ${getI(f * 3 + 2)}`);
    }
    return lines.join("\n");
  }

  const hasNormals = !!nor;
  const vertStride = hasNormals ? 24 : 12;
  const faceStride = 13;
  const headerBytes = new TextEncoder().encode(header);
  const total = headerBytes.length + vertCount * vertStride + triCount * faceStride;
  const buf = new ArrayBuffer(total);
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);

  bytes.set(headerBytes, 0);
  let offset = headerBytes.length;

  for (let i = 0; i < vertCount; i++) {
    view.setFloat32(offset, pos.getX(i), true); offset += 4;
    view.setFloat32(offset, pos.getY(i), true); offset += 4;
    view.setFloat32(offset, pos.getZ(i), true); offset += 4;
    if (hasNormals) {
      view.setFloat32(offset, nor!.getX(i), true); offset += 4;
      view.setFloat32(offset, nor!.getY(i), true); offset += 4;
      view.setFloat32(offset, nor!.getZ(i), true); offset += 4;
    }
  }
  for (let f = 0; f < triCount; f++) {
    view.setUint8(offset, 3); offset++;
    view.setInt32(offset, getI(f * 3), true); offset += 4;
    view.setInt32(offset, getI(f * 3 + 1), true); offset += 4;
    view.setInt32(offset, getI(f * 3 + 2), true); offset += 4;
  }
  return buf;
}

// ─── Mesh Validation ─────────────────────────────────────────────────────────

export function validateMesh(geometry: THREE.BufferGeometry): ValidationResult {
  let geo = geometry.clone();
  if (!geo.index) geo = geo.toNonIndexed() as THREE.BufferGeometry;
  geo.computeVertexNormals();
  geo.computeBoundingBox();

  const pos = geo.attributes.position;
  const idx = geo.index;
  const getI = (i: number) => idx ? idx.getX(i) : i;
  const vertCount = pos.count;
  const triCount = idx ? idx.count / 3 : pos.count / 3;

  const warnings: string[] = [];
  const errors: string[] = [];
  let degenerateCount = 0;
  let minAngle = 180;
  let maxAspect = 0;

  const edgeMap = new Map<string, number>();
  let nonManifold = 0;

  const v = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));

  for (let f = 0; f < triCount; f++) {
    const i0 = getI(f * 3), i1 = getI(f * 3 + 1), i2 = getI(f * 3 + 2);
    const p0 = v(i0), p1 = v(i1), p2 = v(i2);

    const e01 = p1.clone().sub(p0);
    const e12 = p2.clone().sub(p1);
    const e20 = p0.clone().sub(p2);
    const area2 = e01.clone().cross(e20.clone().negate()).length();
    if (area2 < 1e-10) { degenerateCount++; continue; }

    const l01 = e01.length(), l12 = e12.length(), l20 = e20.length();
    const maxEdge = Math.max(l01, l12, l20);
    const minEdge = Math.min(l01, l12, l20);
    if (minEdge > 0) maxAspect = Math.max(maxAspect, maxEdge / minEdge);

    const angles = [
      (Math.acos(Math.max(-1, Math.min(1, e01.normalize().dot(e20.clone().negate().normalize())))) * 180) / Math.PI,
      (Math.acos(Math.max(-1, Math.min(1, e12.normalize().dot(e01.clone().negate().normalize())))) * 180) / Math.PI,
    ];
    angles.push(180 - angles[0] - angles[1]);
    for (const a of angles) if (a > 0) minAngle = Math.min(minAngle, a);

    const edges = [
      [Math.min(i0, i1), Math.max(i0, i1)],
      [Math.min(i1, i2), Math.max(i1, i2)],
      [Math.min(i2, i0), Math.max(i2, i0)],
    ];
    for (const [a, b] of edges) {
      const key = `${a}_${b}`;
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
    }
  }

  let openBoundaries = 0;
  for (const count of edgeMap.values()) {
    if (count === 1) openBoundaries++;
    if (count > 2) nonManifold++;
  }

  const isWatertight = openBoundaries === 0 && nonManifold === 0;

  if (degenerateCount > 0) errors.push(`${degenerateCount} degenerate triangles detected`);
  if (nonManifold > 0) errors.push(`${nonManifold} non-manifold edges — repair before printing`);
  if (openBoundaries > 0) warnings.push(`${openBoundaries} open boundary edges — mesh is not watertight`);
  if (minAngle < 10) warnings.push(`Minimum face angle is ${minAngle.toFixed(1)}°  — some triangles are very thin`);
  if (maxAspect > 20) warnings.push(`High aspect ratio triangles (${maxAspect.toFixed(1)}×) — remeshing recommended`);
  if (vertCount < 100) warnings.push("Very low vertex count — model may lack detail");
  if (triCount > 2_000_000) warnings.push("Very high polygon count — consider decimation for printing");

  const isPrintReady = isWatertight && degenerateCount === 0 && minAngle >= 5;

  return {
    valid: errors.length === 0,
    vertexCount: vertCount,
    triangleCount: triCount,
    degenerateTriangles: degenerateCount,
    nonManifoldEdges: nonManifold,
    openBoundaries,
    selfIntersections: 0,
    minFaceAngleDeg: minAngle === 180 ? 0 : parseFloat(minAngle.toFixed(1)),
    maxAspectRatio: parseFloat(maxAspect.toFixed(1)),
    isWatertight,
    isPrintReady,
    warnings,
    errors,
  };
}

// ─── Geometry Serializer (format dispatch) ────────────────────────────────────

export function serializeGeometry(
  geometry: THREE.BufferGeometry,
  format: ExportFormat,
  mode: ExportMode,
  name = "scan"
): { data: ArrayBuffer | string; mime: string; ext: string } {
  switch (format) {
    case "stl": {
      const data = encodeSTL(geometry, mode === "binary");
      return { data, mime: "model/stl", ext: "stl" };
    }
    case "obj": {
      const data = encodeOBJ(geometry, name);
      return { data, mime: "text/plain", ext: "obj" };
    }
    case "ply": {
      const data = encodePLY(geometry, mode === "binary");
      return { data, mime: "application/octet-stream", ext: "ply" };
    }
  }
}

// ─── Stage Naming ─────────────────────────────────────────────────────────────

export function getStageFilename(
  stage: TreatmentStage,
  baseName: string,
  convention: StageNamingConvention
): string {
  const safe = baseName.replace(/[^a-zA-Z0-9_-]/g, "_");
  switch (convention) {
    case "numeric":
      return `${safe}_stage_${String(stage.index).padStart(2, "0")}`;
    case "clinical":
      return `${safe}_${stage.label.replace(/\s+/g, "_").toLowerCase()}`;
    case "iso":
      return `${safe}_T${String(stage.index).padStart(3, "0")}`;
    case "custom":
      return `${safe}_${stage.label.replace(/\s+/g, "-")}`;
    default:
      return `${safe}_stage_${stage.index}`;
  }
}

// ─── Apply Transform to Geometry ──────────────────────────────────────────────

export function applyTransformToGeometry(
  geometry: THREE.BufferGeometry,
  position: [number, number, number],
  rotation: [number, number, number],
  scale: [number, number, number]
): THREE.BufferGeometry {
  const geo = geometry.clone();
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3(...position);
  const rot = new THREE.Euler(...rotation, "XYZ");
  const scl = new THREE.Vector3(...scale);
  mat.compose(pos, new THREE.Quaternion().setFromEuler(rot), scl);
  geo.applyMatrix4(mat);
  return geo;
}

// ─── Merge Geometries ────────────────────────────────────────────────────────

export function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalTris = 0;

  const nonIndexed = geos.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    ng.computeVertexNormals();
    totalVerts += ng.attributes.position.count;
    totalTris += ng.attributes.position.count / 3;
    return ng;
  });

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let vOffset = 0;

  for (const ng of nonIndexed) {
    const p = ng.attributes.position;
    const n = ng.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      positions[vOffset * 3] = p.getX(i);
      positions[vOffset * 3 + 1] = p.getY(i);
      positions[vOffset * 3 + 2] = p.getZ(i);
      if (n) {
        normals[vOffset * 3] = n.getX(i);
        normals[vOffset * 3 + 1] = n.getY(i);
        normals[vOffset * 3 + 2] = n.getZ(i);
      }
      vOffset++;
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.computeBoundingBox();
  return merged;
}

// ─── ZIP packager (uses JSZip dynamically) ────────────────────────────────────

export async function packageToZip(
  files: Array<{ name: string; data: ArrayBuffer | string }>
): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const { name, data } of files) {
    if (typeof data === "string") zip.file(name, data);
    else zip.file(name, data);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

// ─── Trigger Download ────────────────────────────────────────────────────────

export function triggerDownload(data: ArrayBuffer | string | Blob, filename: string): void {
  let blob: Blob;
  if (data instanceof Blob) blob = data;
  else if (typeof data === "string") blob = new Blob([data], { type: "text/plain" });
  else blob = new Blob([data], { type: "application/octet-stream" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
