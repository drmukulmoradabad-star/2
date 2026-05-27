/**
 * AIOverlay — read-only 3D visualization of AI analysis results.
 *
 * Rendered inside the R3F Canvas scene. All objects are advisory only
 * and do not modify the underlying scan geometry.
 *
 * Layers:
 *  - Movement arrows (ArrowHelper per suggestion)
 *  - Collision heatmap (colored boxes on colliding tooth pairs)
 *  - Arch symmetry guide (center line + mirror indicators)
 *  - Midline indicator (vertical plane)
 *  - Ideal arch curve (spline overlay)
 *  - Landmark spheres (cusp tips, contact points, etc.)
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAIStore } from "./aiStore";
import { useSegmentationStore } from "@/modules/segmentation/segmentationStore";

// ─── Movement Arrow ───────────────────────────────────────────────────────────

function MovementArrow({
  origin, direction, magnitude, color,
}: {
  origin: [number, number, number];
  direction: [number, number, number];
  magnitude: number;
  color: string;
}) {
  const arrowRef = useRef<THREE.Group>(null);

  const arrow = useMemo(() => {
    const dir = new THREE.Vector3(...direction).normalize();
    const len = Math.min(magnitude * 0.5, 1.2);
    const helper = new THREE.ArrowHelper(
      dir,
      new THREE.Vector3(...origin),
      len,
      color,
      len * 0.35,
      len * 0.18
    );
    // Make it read-only look — slightly transparent
    (helper.line.material as THREE.LineBasicMaterial).transparent = true;
    (helper.line.material as THREE.LineBasicMaterial).opacity = 0.85;
    (helper.cone.material as THREE.MeshBasicMaterial).transparent = true;
    (helper.cone.material as THREE.MeshBasicMaterial).opacity = 0.85;
    return helper;
  }, [origin, direction, magnitude, color]);

  // Pulse animation
  const pulseT = useRef(Math.random() * Math.PI * 2);
  useFrame((_, dt) => {
    if (!arrowRef.current) return;
    pulseT.current += dt * 2;
    const s = 1 + 0.12 * Math.sin(pulseT.current);
    arrowRef.current.scale.setScalar(s);
  });

  return (
    <group ref={arrowRef}>
      <primitive object={arrow} />
    </group>
  );
}

// ─── Collision Box (bounding-box highlight for colliding teeth) ───────────────

function CollisionHighlight({
  boundingBox, severity,
}: {
  boundingBox: THREE.Box3;
  severity: "low" | "moderate" | "high";
}) {
  const color = severity === "high" ? "#ff5252" : severity === "moderate" ? "#ff8c40" : "#ffcc00";
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  boundingBox.getSize(size);
  boundingBox.getCenter(center);

  const boxGeo = useMemo(() => new THREE.BoxGeometry(size.x, size.y, size.z), [size.x, size.y, size.z]);
  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(boxGeo), [boxGeo]);

  const pulseT = useRef(0);
  const lineRef = useRef<THREE.LineSegments>(null);
  useFrame((_, dt) => {
    pulseT.current += dt * 4;
    if (lineRef.current) {
      (lineRef.current.material as THREE.LineBasicMaterial).opacity = 0.4 + 0.4 * Math.abs(Math.sin(pulseT.current));
    }
  });

  return (
    <group position={[center.x, center.y, center.z]}>
      <lineSegments ref={lineRef} geometry={edgesGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.7} depthTest={false} toneMapped={false} />
      </lineSegments>
      <mesh geometry={boxGeo}>
        <meshBasicMaterial color={color} transparent opacity={0.04} depthTest={false} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

// ─── Symmetry Guide ───────────────────────────────────────────────────────────

function SymmetryGuide({ centerX, minZ, maxZ, y }: {
  centerX: number; minZ: number; maxZ: number; y: number;
}) {
  const pts = useMemo(() => {
    const positions = new Float32Array([
      centerX, y, minZ - 0.5,
      centerX, y, maxZ + 0.5,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [centerX, minZ, maxZ, y]);

  return (
    <group>
      {/* Symmetry center line */}
      <primitive object={new THREE.Line(
        pts,
        new THREE.LineDashedMaterial({
          color: "#00e5ff",
          transparent: true,
          opacity: 0.4,
          depthTest: false,
          dashSize: 0.3,
          gapSize: 0.15,
          toneMapped: false,
        })
      )} />
      {/* Left mirror dot */}
      <mesh position={[centerX - 0.05, y, (minZ + maxZ) / 2]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.5} depthTest={false} />
      </mesh>
      {/* Right mirror dot */}
      <mesh position={[centerX + 0.05, y, (minZ + maxZ) / 2]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.5} depthTest={false} />
      </mesh>
    </group>
  );
}

// ─── Midline Guide ────────────────────────────────────────────────────────────

function MidlineGuide({ x, minY, maxY, minZ, maxZ }: {
  x: number; minY: number; maxY: number; minZ: number; maxZ: number;
}) {
  const planeGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.05, maxY - minY + 1);
    return g;
  }, [minY, maxY]);

  return (
    <group position={[x, (minY + maxY) / 2, (minZ + maxZ) / 2]} rotation={[0, Math.PI / 2, 0]}>
      <mesh geometry={planeGeo}>
        <meshBasicMaterial
          color="#ff9940"
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry attach="geometry" args={[planeGeo]} />
        <lineBasicMaterial attach="material" color="#ff9940" transparent opacity={0.4} depthTest={false} />
      </lineSegments>
    </group>
  );
}

// ─── Ideal Arch Curve ─────────────────────────────────────────────────────────

function IdealArchCurve({ points, y }: { points: THREE.Vector3[]; y: number }) {
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const pts = points.flatMap((p) => [p.x, y, p.z]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [points, y]);

  if (!geo) return null;

  return (
    <primitive object={new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: "#4dffb8",
        transparent: true,
        opacity: 0.5,
        depthTest: false,
        toneMapped: false,
      })
    )} />
  );
}

// ─── Landmark Sphere ──────────────────────────────────────────────────────────

function LandmarkSphere({
  position, type, confidence,
}: {
  position: [number, number, number];
  type: string;
  confidence: number;
}) {
  const color =
    type === "arch_midline"    ? "#ff9940" :
    type === "cusp_tip"        ? "#00e5ff" :
    type === "incisor_edge"    ? "#4dffb8" :
    type === "contact_point"   ? "#ffcc00" :
    type === "gingival_margin" ? "#ff6b6b" : "#7fa8c0";

  const radius = 0.04 + confidence * 0.03;

  return (
    <mesh position={position}>
      <sphereGeometry args={[radius, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.7 * confidence} depthTest={false} />
    </mesh>
  );
}

// ─── Main overlay component ───────────────────────────────────────────────────

export default function AIOverlay() {
  const ai = useAIStore();
  const { result: segResult } = useSegmentationStore();
  const segments = segResult?.segments ?? [];

  // Compute bounding extents from segments for guide placement
  const extents = useMemo(() => {
    if (segments.length === 0) return null;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const s of segments) {
      sumX += s.centroid.x; sumY += s.centroid.y; sumZ += s.centroid.z;
      minX = Math.min(minX, s.boundingBox.min.x);
      maxX = Math.max(maxX, s.boundingBox.max.x);
      minY = Math.min(minY, s.boundingBox.min.y);
      maxY = Math.max(maxY, s.boundingBox.max.y);
      minZ = Math.min(minZ, s.boundingBox.min.z);
      maxZ = Math.max(maxZ, s.boundingBox.max.z);
    }
    return {
      minX, maxX, minY, maxY, minZ, maxZ,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      centerZ: (minZ + maxZ) / 2,
    };
  }, [segments]);

  // Build collision segment map for heatmap
  const collidingSegMap = useMemo(() => {
    if (!ai.collisionReport || !ai.showCollisionHeatmap) return new Map<string, "low" | "moderate" | "high">();
    const map = new Map<string, "low" | "moderate" | "high">();
    for (const pair of ai.collisionReport.pairs) {
      const sev = pair.penetrationDepth > 1 ? "high" : pair.penetrationDepth > 0.3 ? "moderate" : "low";
      if (!map.has(pair.idA) || sev === "high") map.set(pair.idA, sev);
      if (!map.has(pair.idB) || sev === "high") map.set(pair.idB, sev);
    }
    return map;
  }, [ai.collisionReport, ai.showCollisionHeatmap]);

  const segMap = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);

  if (segments.length === 0 && ai.movementArrows.length === 0 && ai.landmarks.length === 0) {
    return null;
  }

  return (
    <group name="ai-overlay">

      {/* ── Movement arrows ──────────────────────────────────────────────── */}
      {ai.showMovementArrows && ai.movementArrows.map((arrow) => (
        <MovementArrow
          key={arrow.segmentId}
          origin={arrow.origin}
          direction={arrow.direction}
          magnitude={arrow.magnitude}
          color={arrow.color}
        />
      ))}

      {/* ── Collision heatmap boxes ──────────────────────────────────────── */}
      {ai.showCollisionHeatmap && collidingSegMap.size > 0 && (
        Array.from(collidingSegMap.entries()).map(([segId, sev]) => {
          const seg = segMap.get(segId);
          if (!seg) return null;
          return (
            <CollisionHighlight
              key={`col_${segId}`}
              boundingBox={seg.boundingBox}
              severity={sev}
            />
          );
        })
      )}

      {/* ── Arch symmetry guide ──────────────────────────────────────────── */}
      {ai.showSymmetryGuide && extents && (
        <SymmetryGuide
          centerX={extents.centerX}
          minZ={extents.minZ}
          maxZ={extents.maxZ}
          y={extents.maxY + 0.15}
        />
      )}

      {/* ── Midline indicator ────────────────────────────────────────────── */}
      {ai.showMidlineGuide && extents && (
        <MidlineGuide
          x={ai.midlineDeviation?.archMidlineX ?? extents.centerX}
          minY={extents.minY}
          maxY={extents.maxY}
          minZ={extents.minZ}
          maxZ={extents.maxZ}
        />
      )}

      {/* ── Ideal arch curve ─────────────────────────────────────────────── */}
      {ai.showIdealArch && ai.archFormAnalysis && ai.archFormAnalysis.idealArchPoints.length > 1 && extents && (
        <IdealArchCurve
          points={ai.archFormAnalysis.idealArchPoints.map((p) =>
            new THREE.Vector3(
              extents.centerX + p.x,
              extents.maxY + 0.2,
              extents.centerZ + p.z
            )
          )}
          y={extents.maxY + 0.2}
        />
      )}

      {/* ── Landmark spheres ─────────────────────────────────────────────── */}
      {ai.showLandmarks && ai.landmarks.map((lm) => (
        <LandmarkSphere
          key={lm.id}
          position={[lm.position.x, lm.position.y, lm.position.z]}
          type={lm.type}
          confidence={lm.confidence}
        />
      ))}

    </group>
  );
}
