import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";

export function computeNormals(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }
  return geometry;
}

export function loadSTL(buffer: ArrayBuffer): THREE.BufferGeometry {
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);
  return computeNormals(geometry);
}

export function loadOBJ(text: string): THREE.BufferGeometry {
  const loader = new OBJLoader();
  const object = loader.parse(text);
  const geometries: THREE.BufferGeometry[] = [];
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      geometries.push(geo);
    }
  });
  if (geometries.length === 0) throw new Error("No geometry found in OBJ file");
  const merged = geometries.length === 1
    ? geometries[0]
    : mergeGeometries(geometries);
  return computeNormals(merged);
}

export function loadPLY(buffer: ArrayBuffer): THREE.BufferGeometry {
  const loader = new PLYLoader();
  const geometry = loader.parse(buffer);
  return computeNormals(geometry);
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let indexOffset = 0;

  for (const geo of geometries) {
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (norm) normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) {
        indices.push(geo.index.array[i] + indexOffset);
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices.push(i + indexOffset);
      }
    }
    indexOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length > 0) {
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  }
  merged.setIndex(indices);
  return merged;
}

export async function loadScanFile(file: File): Promise<THREE.BufferGeometry> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "stl") {
    const buffer = await file.arrayBuffer();
    return loadSTL(buffer);
  } else if (ext === "obj") {
    const text = await file.text();
    return loadOBJ(text);
  } else if (ext === "ply") {
    const buffer = await file.arrayBuffer();
    return loadPLY(buffer);
  }
  throw new Error(`Unsupported file format: ${ext}`);
}
