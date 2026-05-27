/**
 * ArchFormPresets — standard dental arch form definitions.
 *
 * Encodes the canonical arch forms used in clinical orthodontics:
 *   ovoid, tapered, square, narrow, broadU
 *
 * Each preset is defined as a set of normalized control point positions
 * along a parabola, scaled to the patient's arch dimensions at application time.
 */

import * as THREE from "three";
import type { ArchPreset } from "./archEditStore";

/**
 * Normalized arch form control points.
 * Each point: [t, lateralOffset] where
 *   t ∈ [0,1] — position along anterior-posterior axis (0=anterior, 1=posterior)
 *   lateralOffset ∈ [0,1] — half-width at that position (normalized)
 */
export interface PresetCurve {
  name: string;
  label: string;
  description: string;
  color: string;
  /** Normalized [t, width] pairs along arch. t=0 anterior, t=1 posterior. */
  profile: Array<[number, number]>;
}

export const ARCH_PRESETS: Record<ArchPreset, PresetCurve> = {
  ovoid: {
    name: "ovoid",
    label: "Ovoid",
    description: "Rounded, egg-shaped arch. Most common form — equal anterior and posterior width.",
    color: "#00e5ff",
    profile: [
      [0.0, 0.40],
      [0.1, 0.52],
      [0.2, 0.72],
      [0.3, 0.88],
      [0.4, 0.98],
      [0.5, 1.00],
      [0.6, 0.98],
      [0.7, 0.94],
      [0.8, 0.88],
      [0.9, 0.82],
      [1.0, 0.76],
    ],
  },
  tapered: {
    name: "tapered",
    label: "Tapered",
    description: "V-shaped arch. Narrow anterior, wider posterior — common in Class II patients.",
    color: "#ff9940",
    profile: [
      [0.0, 0.20],
      [0.1, 0.30],
      [0.2, 0.48],
      [0.3, 0.66],
      [0.4, 0.82],
      [0.5, 0.94],
      [0.6, 1.00],
      [0.7, 1.00],
      [0.8, 0.98],
      [0.9, 0.94],
      [1.0, 0.90],
    ],
  },
  square: {
    name: "square",
    label: "Square",
    description: "Broad, flat anterior arch form. Wide inter-canine width.",
    color: "#44ffb0",
    profile: [
      [0.0, 0.70],
      [0.1, 0.84],
      [0.2, 0.96],
      [0.3, 1.00],
      [0.4, 1.00],
      [0.5, 1.00],
      [0.6, 0.98],
      [0.7, 0.96],
      [0.8, 0.92],
      [0.9, 0.88],
      [1.0, 0.84],
    ],
  },
  narrow: {
    name: "narrow",
    label: "Narrow",
    description: "High-arched, constricted form. Requires palatal expansion.",
    color: "#ff4488",
    profile: [
      [0.0, 0.22],
      [0.1, 0.30],
      [0.2, 0.42],
      [0.3, 0.56],
      [0.4, 0.68],
      [0.5, 0.76],
      [0.6, 0.82],
      [0.7, 0.86],
      [0.8, 0.88],
      [0.9, 0.88],
      [1.0, 0.86],
    ],
  },
  broadU: {
    name: "broadU",
    label: "Broad U",
    description: "Wide U-shaped arch. Consistent width anterior to posterior.",
    color: "#b0a0ff",
    profile: [
      [0.0, 0.60],
      [0.1, 0.76],
      [0.2, 0.92],
      [0.3, 1.00],
      [0.4, 1.00],
      [0.5, 1.00],
      [0.6, 1.00],
      [0.7, 1.00],
      [0.8, 1.00],
      [0.9, 0.98],
      [1.0, 0.96],
    ],
  },
};

/**
 * Generate control point world positions for a preset, given the
 * current arch geometry dimensions.
 *
 * @param preset    Arch form preset name
 * @param centroid  Arch centroid in geometry space
 * @param halfWidth Half-width of the arch (archWidth / 2)
 * @param halfDepth Half-depth of the arch (archDepth / 2)
 * @param yLevel    Y position of the arch curve plane
 * @param nPoints   Number of control points to generate (odd number recommended)
 * @returns Control point positions in local geometry space
 */
export function generatePresetControlPoints(
  preset: ArchPreset,
  centroid: THREE.Vector3,
  halfWidth: number,
  halfDepth: number,
  yLevel: number,
  nPoints = 9
): THREE.Vector3[] {
  const curve = ARCH_PRESETS[preset];
  const pts: THREE.Vector3[] = [];

  // Mirror: generate left side, then right (symmetric)
  for (let i = 0; i < nPoints; i++) {
    const t = i / (nPoints - 1);      // 0 = full-left, 1 = full-right

    // Map t → arch-relative coords: lateralRatio in [-1,1], apRatio in [0,1]
    const lateralRatio = (t - 0.5) * 2;  // -1 = left, +1 = right
    const apT = 1 - Math.abs(lateralRatio); // 0 at edges, 1 at midline anterior

    // Find width at this anterior position by interpolating preset profile
    const profileT = apT;
    const widthAtT = interpolateProfile(curve.profile, profileT);

    const x = centroid.x + lateralRatio * halfWidth * widthAtT;
    const z = centroid.z + (1 - apT) * halfDepth * 0.8;   // posterior when apT small

    pts.push(new THREE.Vector3(x, yLevel, z));
  }

  return pts;
}

function interpolateProfile(profile: Array<[number, number]>, t: number): number {
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
 * Catmull-Rom spline sample through control points.
 * Returns interpolated position at parameter u ∈ [0,1].
 */
export function catmullRomSample(pts: THREE.Vector3[], u: number): THREE.Vector3 {
  if (pts.length === 0) return new THREE.Vector3();
  if (pts.length === 1) return pts[0].clone();

  const n = pts.length;
  const scaled = u * (n - 1);
  const i = Math.min(Math.floor(scaled), n - 2);
  const t = scaled - i;

  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[Math.min(n - 1, i + 1)];
  const p3 = pts[Math.min(n - 1, i + 2)];

  const alpha = 0.5;
  return new THREE.Vector3(
    catmullRom(p0.x, p1.x, p2.x, p3.x, t, alpha),
    catmullRom(p0.y, p1.y, p2.y, p3.y, t, alpha),
    catmullRom(p0.z, p1.z, p2.z, p3.z, t, alpha)
  );
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number, alpha: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return alpha * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/** Sample N evenly-spaced points along the Catmull-Rom spline */
export function sampleSpline(pts: THREE.Vector3[], resolution = 64): THREE.Vector3[] {
  if (pts.length < 2) return pts.map((p) => p.clone());
  return Array.from({ length: resolution }, (_, i) =>
    catmullRomSample(pts, i / (resolution - 1))
  );
}
