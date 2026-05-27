/**
 * SculptableMesh — replaces ScanMesh when sculpt mode is active.
 * Handles pointer events for real-time mesh deformation with:
 * - Direct Float32Array mutation (no geometry clone on each stroke)
 * - Invalidation-based render updates
 * - Animated brush cursor with falloff ring
 * - Undo stack snapshots
 */

import { useRef, useEffect, useCallback, useMemo } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useViewerStore } from "@/store/viewerStore";
import { useSculptStore } from "./sculptStore";
import { SculptEngine } from "./SculptEngine";
import type { ThreeEvent } from "@react-three/fiber";

// ─── Brush cursor ring ────────────────────────────────────────────────────────

function BrushCursor({
  worldPos,
  worldNormal,
  worldRadius,
  active,
  falloffRadius,
}: {
  worldPos: THREE.Vector3;
  worldNormal: THREE.Vector3;
  worldRadius: number;
  active: boolean;
  falloffRadius: number;
}) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const dotRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      worldNormal.clone().normalize()
    );

    if (outerRef.current) {
      outerRef.current.position.copy(worldPos).addScaledVector(worldNormal, 0.001);
      outerRef.current.quaternion.copy(q);
    }
    if (innerRef.current) {
      innerRef.current.position.copy(worldPos).addScaledVector(worldNormal, 0.001);
      innerRef.current.quaternion.copy(q);
    }
    if (dotRef.current) {
      dotRef.current.position.copy(worldPos).addScaledVector(worldNormal, 0.002);
      dotRef.current.quaternion.copy(q);
    }
  });

  const brushColor = active ? "#ff9940" : "#00e5ff";
  const innerColor = active ? "rgba(255,153,64,0.2)" : "rgba(0,229,255,0.2)";

  return (
    <group>
      {/* Outer falloff ring */}
      <mesh ref={outerRef}>
        <torusGeometry args={[worldRadius, worldRadius * 0.025, 8, 64]} />
        <meshBasicMaterial
          color={brushColor}
          transparent
          opacity={active ? 0.95 : 0.7}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>

      {/* Inner strength ring (50% radius) */}
      <mesh ref={innerRef}>
        <torusGeometry args={[worldRadius * 0.5, worldRadius * 0.015, 6, 32]} />
        <meshBasicMaterial
          color={brushColor}
          transparent
          opacity={0.35}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>

      {/* Center dot */}
      <mesh ref={dotRef}>
        <circleGeometry args={[worldRadius * 0.04, 8]} />
        <meshBasicMaterial
          color={brushColor}
          transparent
          opacity={0.9}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SculptableMeshProps {
  geometry: THREE.BufferGeometry;
  materialMode: "solid" | "wireframe" | "transparent";
  opacity: number;
}

export default function SculptableMesh({
  geometry,
  materialMode,
  opacity,
}: SculptableMeshProps) {
  const groupRef  = useRef<THREE.Group>(null);
  const meshRef   = useRef<THREE.Mesh>(null);
  const engineRef = useRef<SculptEngine | null>(null);
  const prevHitRef = useRef<THREE.Vector3 | null>(null);
  const strokeActiveRef = useRef(false);
  const { camera, invalidate } = useThree();

  const { materialMode: mm, activeTool } = useViewerStore();
  const {
    activeSculptTool,
    brushRadius,
    brushStrength,
    brushFalloff,
    symmetryEnabled,
    symmetryAxis,
    isSculpting, setIsSculpting,
    brushHit, setBrushHit,
    pushUndo, undo, redo,
    incStrokeCount,
  } = useSculptStore();

  const isSculptMode = activeTool === "sculpt";

  // ── Auto-fit geometry to viewport (same as ScanMesh) ─────────────────────
  useEffect(() => {
    if (!groupRef.current) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 6 / maxDim;
    groupRef.current.scale.setScalar(scale);
    groupRef.current.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    const camDist = maxDim * scale * 1.5;
    camera.position.set(0, camDist * 0.3, camDist);
    camera.lookAt(0, 0, 0);
  }, [geometry]);

  // ── Build / rebuild SculptEngine when geometry changes ────────────────────
  useEffect(() => {
    engineRef.current = new SculptEngine(geometry);
    return () => { engineRef.current = null; };
  }, [geometry]);

  // ── Convert world brush radius → local geometry radius ───────────────────
  const localRadius = useCallback(
    (worldR: number, obj: THREE.Object3D): number => {
      const pWorld = new THREE.Vector3();
      const pRim   = new THREE.Vector3(worldR, 0, 0);
      obj.worldToLocal(pWorld);
      obj.worldToLocal(pRim);
      return pRim.sub(pWorld).length();
    },
    []
  );

  // ── Pointer: move (hover + stroke) ───────────────────────────────────────
  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!isSculptMode || !engineRef.current || !e.face) return;
      e.stopPropagation();

      // World-space data for brush cursor
      const worldPos = e.point.clone();
      const worldNormal = e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize();
      setBrushHit({ position: worldPos, normal: worldNormal });

      if (!strokeActiveRef.current) return;

      // Convert to local geometry space
      const localHit = e.object.worldToLocal(e.point.clone());
      const localNorm = e.face.normal.clone().normalize();
      const lRadius = localRadius(brushRadius, e.object);

      // Compute delta for grab tool
      let delta = new THREE.Vector3();
      if (activeSculptTool === "grab" && prevHitRef.current) {
        const prevLocal = prevHitRef.current;
        delta.subVectors(localHit, prevLocal);
      }
      prevHitRef.current = localHit.clone();

      engineRef.current.applyStroke(
        activeSculptTool ?? "smooth",
        localHit,
        localNorm,
        delta,
        {
          radius: lRadius,
          strength: brushStrength,
          falloffCurve: brushFalloff,
          symmetry: symmetryEnabled,
          symmetryAxis,
        }
      );

      invalidate();
    },
    [isSculptMode, activeSculptTool, brushRadius, brushStrength, brushFalloff, symmetryEnabled, symmetryAxis]
  );

  // ── Pointer: down (begin stroke + snapshot for undo) ────────────────────
  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!isSculptMode || !activeSculptTool || !engineRef.current) return;
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

      // Save undo snapshot
      const pos = geometry.attributes.position.array as Float32Array;
      pushUndo(pos.slice());

      strokeActiveRef.current = true;
      setIsSculpting(true);

      // Apply first stroke sample immediately
      if (e.face) {
        const localHit = e.object.worldToLocal(e.point.clone());
        prevHitRef.current = localHit.clone();
        const lRadius = localRadius(brushRadius, e.object);
        engineRef.current.applyStroke(
          activeSculptTool,
          localHit,
          e.face.normal.clone().normalize(),
          new THREE.Vector3(),
          {
            radius: lRadius,
            strength: brushStrength,
            falloffCurve: brushFalloff,
            symmetry: symmetryEnabled,
            symmetryAxis,
          }
        );
        invalidate();
      }
    },
    [isSculptMode, activeSculptTool, brushRadius, brushStrength, brushFalloff, geometry, symmetryEnabled, symmetryAxis]
  );

  // ── Pointer: up (finalize stroke) ─────────────────────────────────────────
  const handlePointerUp = useCallback(
    (_e: ThreeEvent<PointerEvent>) => {
      if (!strokeActiveRef.current) return;
      strokeActiveRef.current = false;
      prevHitRef.current = null;
      setIsSculpting(false);
      engineRef.current?.finalizeStroke();
      incStrokeCount();
      invalidate();
    },
    [invalidate]
  );

  // ── Pointer leave ────────────────────────────────────────────────────────
  const handlePointerLeave = useCallback(() => {
    setBrushHit(null);
    if (strokeActiveRef.current) {
      strokeActiveRef.current = false;
      prevHitRef.current = null;
      setIsSculpting(false);
      engineRef.current?.finalizeStroke();
      invalidate();
    }
  }, [invalidate]);

  // ── Keyboard undo/redo ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSculptMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const snapshot = undo();
        if (snapshot && engineRef.current) {
          const pos = geometry.attributes.position.array as Float32Array;
          pos.set(snapshot);
          geometry.attributes.position.needsUpdate = true;
          engineRef.current.finalizeStroke();
          engineRef.current.rebuildGrid();
          invalidate();
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
        e.preventDefault();
        const current = (geometry.attributes.position.array as Float32Array).slice();
        const snapshot = redo(current);
        if (snapshot && engineRef.current) {
          const pos = geometry.attributes.position.array as Float32Array;
          pos.set(snapshot);
          geometry.attributes.position.needsUpdate = true;
          engineRef.current.finalizeStroke();
          engineRef.current.rebuildGrid();
          invalidate();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSculptMode, geometry, undo, redo, invalidate]);

  // ── Material ──────────────────────────────────────────────────────────────
  const isWireframe   = materialMode === "wireframe";
  const isTransparent = materialMode === "transparent";

  return (
    <group ref={groupRef}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        castShadow
        receiveShadow
        onPointerMove={isSculptMode ? handlePointerMove : undefined}
        onPointerDown={isSculptMode ? handlePointerDown : undefined}
        onPointerUp={isSculptMode ? handlePointerUp : undefined}
        onPointerLeave={isSculptMode ? handlePointerLeave : undefined}
      >
        <meshPhysicalMaterial
          color="#e8dcc8"
          roughness={0.3}
          metalness={0}
          reflectivity={0.2}
          clearcoat={0.1}
          clearcoatRoughness={0.3}
          wireframe={isWireframe}
          transparent={isTransparent}
          opacity={isTransparent ? opacity : 1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {isTransparent && (
        <mesh geometry={geometry}>
          <meshBasicMaterial color="#00e5ff" wireframe transparent opacity={0.08} />
        </mesh>
      )}

      {/* Brush cursor overlay */}
      {isSculptMode && brushHit && (
        <BrushCursor
          worldPos={brushHit.position}
          worldNormal={brushHit.normal}
          worldRadius={brushRadius}
          active={isSculpting}
          falloffRadius={brushRadius}
        />
      )}
    </group>
  );
}
