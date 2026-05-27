/**
 * LatticeDeformer — trilinear free-form deformation (FFD) cage.
 *
 * Creates a 3-D grid of control points that envelop the target geometry.
 * When control points are displaced, each vertex is updated via trilinear
 * interpolation of the surrounding 8 control-point displacements.
 *
 * Usage:
 *   const ld = new LatticeDeformer(geometry, 4, 3, 3);
 *   ld.moveControlPoint(idx, delta);
 *   ld.applyToGeometry();
 */

import * as THREE from "three";

export interface ControlPoint {
  index: number;       // flat index  i + j*nx + k*nx*ny
  ix: number;          // grid i (0..nx-1)
  iy: number;          // grid j (0..ny-1)
  iz: number;          // grid k (0..nz-1)
  restPosition: THREE.Vector3;    // world rest
  position: THREE.Vector3;        // current position (= rest + displacement)
  displacement: THREE.Vector3;    // delta from rest
}

export class LatticeDeformer {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly controlPoints: ControlPoint[];

  private _geo: THREE.BufferGeometry;
  private _restPositions: Float32Array;  // original vertex positions (snapshot)
  private _uvw: Float32Array;            // per-vertex (u,v,w) ∈ [0,1]^3
  private _bbox: THREE.Box3;
  private _bboxSize: THREE.Vector3;
  private _bboxMin: THREE.Vector3;

  /**
   * @param geometry  Target BufferGeometry (positions modified in-place)
   * @param nx        Lattice divisions along X (≥ 2)
   * @param ny        Lattice divisions along Y (≥ 2)
   * @param nz        Lattice divisions along Z (≥ 2)
   * @param padding   World-space padding around bounding box
   */
  constructor(
    geometry: THREE.BufferGeometry,
    nx = 4, ny = 3, nz = 3,
    padding = 0.05
  ) {
    this._geo = geometry;
    this.nx = Math.max(2, nx);
    this.ny = Math.max(2, ny);
    this.nz = Math.max(2, nz);

    // Compute padded bounding box
    geometry.computeBoundingBox();
    this._bbox    = geometry.boundingBox!.clone();
    this._bbox.min.subScalar(padding);
    this._bbox.max.addScalar(padding);
    this._bboxSize = new THREE.Vector3();
    this._bbox.getSize(this._bboxSize);
    this._bboxMin  = this._bbox.min.clone();

    // Snapshot rest positions
    const pos = geometry.attributes.position.array as Float32Array;
    this._restPositions = pos.slice();

    // Compute (u,v,w) for each vertex
    const count = geometry.attributes.position.count;
    this._uvw = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this._uvw[i*3]   = this._bboxSize.x > 0 ? (pos[i*3]   - this._bboxMin.x) / this._bboxSize.x : 0.5;
      this._uvw[i*3+1] = this._bboxSize.y > 0 ? (pos[i*3+1] - this._bboxMin.y) / this._bboxSize.y : 0.5;
      this._uvw[i*3+2] = this._bboxSize.z > 0 ? (pos[i*3+2] - this._bboxMin.z) / this._bboxSize.z : 0.5;
    }

    // Build control-point grid
    this.controlPoints = [];
    for (let k = 0; k < this.nz; k++) {
      for (let j = 0; j < this.ny; j++) {
        for (let i2 = 0; i2 < this.nx; i2++) {
          const u = i2 / (this.nx - 1);
          const v = j  / (this.ny - 1);
          const w = k  / (this.nz - 1);
          const rest = new THREE.Vector3(
            this._bboxMin.x + u * this._bboxSize.x,
            this._bboxMin.y + v * this._bboxSize.y,
            this._bboxMin.z + w * this._bboxSize.z
          );
          this.controlPoints.push({
            index: i2 + j * this.nx + k * this.nx * this.ny,
            ix: i2, iy: j, iz: k,
            restPosition: rest.clone(),
            position: rest.clone(),
            displacement: new THREE.Vector3(),
          });
        }
      }
    }
  }

  /** Move a control point by a world-space delta. */
  moveControlPoint(cpIndex: number, delta: THREE.Vector3): void {
    const cp = this.controlPoints[cpIndex];
    if (!cp) return;
    cp.displacement.add(delta);
    cp.position.copy(cp.restPosition).add(cp.displacement);
  }

  /** Set a control point's absolute world position. */
  setControlPoint(cpIndex: number, pos: THREE.Vector3): void {
    const cp = this.controlPoints[cpIndex];
    if (!cp) return;
    cp.position.copy(pos);
    cp.displacement.subVectors(pos, cp.restPosition);
  }

  /** Reset all control points to rest state. */
  reset(): void {
    for (const cp of this.controlPoints) {
      cp.displacement.set(0, 0, 0);
      cp.position.copy(cp.restPosition);
    }
    // Restore rest positions
    const pos = this._geo.attributes.position.array as Float32Array;
    pos.set(this._restPositions);
    this._geo.attributes.position.needsUpdate = true;
    this._geo.computeVertexNormals();
  }

  /** Apply all control-point displacements to the geometry via trilinear interpolation. */
  applyToGeometry(): void {
    const pos  = this._geo.attributes.position.array as Float32Array;
    const rest = this._restPositions;
    const uvw  = this._uvw;
    const count = this._geo.attributes.position.count;
    const { nx, ny, nz } = this;
    const cps = this.controlPoints;

    for (let vi = 0; vi < count; vi++) {
      let u = uvw[vi*3], v = uvw[vi*3+1], w = uvw[vi*3+2];
      // Clamp to [0,1]
      u = Math.max(0, Math.min(1, u));
      v = Math.max(0, Math.min(1, v));
      w = Math.max(0, Math.min(1, w));

      // Lattice cell
      const iU = Math.min(Math.floor(u * (nx - 1)), nx - 2);
      const iV = Math.min(Math.floor(v * (ny - 1)), ny - 2);
      const iW = Math.min(Math.floor(w * (nz - 1)), nz - 2);

      // Local coords within cell
      const lu = u * (nx - 1) - iU;
      const lv = v * (ny - 1) - iV;
      const lw = w * (nz - 1) - iW;

      // Trilinear interpolation of displacements across 8 corners
      let dx = 0, dy = 0, dz = 0;
      for (let dk = 0; dk <= 1; dk++) {
        for (let dj = 0; dj <= 1; dj++) {
          for (let di = 0; di <= 1; di++) {
            const ci = iU + di;
            const cj = iV + dj;
            const ck = iW + dk;
            if (ci >= nx || cj >= ny || ck >= nz) continue;
            const cpIdx = ci + cj * nx + ck * nx * ny;
            const cp = cps[cpIdx];
            if (!cp) continue;

            const wu = di === 0 ? (1 - lu) : lu;
            const wv = dj === 0 ? (1 - lv) : lv;
            const ww = dk === 0 ? (1 - lw) : lw;
            const w3 = wu * wv * ww;

            dx += cp.displacement.x * w3;
            dy += cp.displacement.y * w3;
            dz += cp.displacement.z * w3;
          }
        }
      }

      pos[vi*3]   = rest[vi*3]   + dx;
      pos[vi*3+1] = rest[vi*3+1] + dy;
      pos[vi*3+2] = rest[vi*3+2] + dz;
    }

    this._geo.attributes.position.needsUpdate = true;
  }

  /** Build a THREE.LineSegments geometry representing the lattice cage edges. */
  buildCageGeometry(): THREE.BufferGeometry {
    const { nx, ny, nz, controlPoints: cps } = this;
    const cpIdx = (i: number, j: number, k: number) => i + j * nx + k * nx * ny;
    const lines: number[] = [];

    const addEdge = (a: number, b: number) => {
      const ca = cps[a], cb = cps[b];
      if (!ca || !cb) return;
      lines.push(ca.position.x, ca.position.y, ca.position.z);
      lines.push(cb.position.x, cb.position.y, cb.position.z);
    };

    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i2 = 0; i2 < nx; i2++) {
          if (i2 < nx - 1) addEdge(cpIdx(i2, j, k), cpIdx(i2+1, j, k));
          if (j  < ny - 1) addEdge(cpIdx(i2, j, k), cpIdx(i2, j+1, k));
          if (k  < nz - 1) addEdge(cpIdx(i2, j, k), cpIdx(i2, j, k+1));
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    return geo;
  }

  /** Get total displacement magnitude (useful for stats). */
  getTotalDisplacementMagnitude(): number {
    return this.controlPoints.reduce((acc, cp) => acc + cp.displacement.length(), 0);
  }
}
