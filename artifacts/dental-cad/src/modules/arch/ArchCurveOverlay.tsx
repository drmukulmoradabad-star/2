/**
 * ArchCurveOverlay — interactive 3D arch curve with draggable control points.
 *
 * Renders inside the R3F Canvas scene when arch edit mode is active.
 * Control point spheres can be dragged to reshape the arch; vertex
 * deformation is applied in real-time via a soft-select grab algorithm.
 *
 * Architecture:
 *   - Control points live in archEditStore (local geometry space)
 *   - Drag delta → applyArchCurveDeform() pushes affected vertices
 *   - Spline is sampled from control points and rendered as a tube line
 *   - Orbit controls are disabled while dragging
 */

import { useRef, useCallback, useMemo, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useArchEditStore } from "./archEditStore";
import { useViewerStore } from "@/store/viewerStore";
import { sampleSpline } from "./ArchFormPresets";
import type { ThreeEvent } from "@react-three/fiber";

// ─── Soft-select deformation ──────────────────────────────────────────────────

function gaussianWeight(dist: number, sigma: number): number {
  return Math.exp(-(dist * dist) / (2 * sigma * sigma));
}

function applyControlPointDeform(
  positions: Float32Array,
  cpPos: THREE.Vector3,
  delta: THREE.Vector3,
  sigma: number,
  strength: number,
  vertCount: number
): void {
  const r2max = (sigma * 3) * (sigma * 3);
  for (let i = 0; i < vertCount; i++) {
    const dx = positions[i * 3]     - cpPos.x;
    const dy = positions[i * 3 + 1] - cpPos.y;
    const dz = positions[i * 3 + 2] - cpPos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2max) continue;
    const w = gaussianWeight(Math.sqrt(d2), sigma) * strength;
    positions[i * 3]     += delta.x * w;
    positions[i * 3 + 1] += delta.y * w;
    positions[i * 3 + 2] += delta.z * w;
  }
}

// ─── Spline tube line ─────────────────────────────────────────────────────────

function ArchSplineLine({
  controlPoints,
  color,
}: {
  controlPoints: THREE.Vector3[];
  color: string;
}) {
  const lineObj = useMemo(() => {
    return new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.7,
        depthTest: false,
        toneMapped: false,
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  // Dispose geometry on unmount
  useEffect(() => () => { lineObj.geometry.dispose(); }, [lineObj]);

  // Update geometry when control points change
  useEffect(() => {
    if (controlPoints.length < 2) { lineObj.visible = false; return; }
    const sampled = sampleSpline(controlPoints, 80);
    const pts = new Float32Array(sampled.length * 3);
    for (let i = 0; i < sampled.length; i++) {
      pts[i * 3]     = sampled[i].x;
      pts[i * 3 + 1] = sampled[i].y;
      pts[i * 3 + 2] = sampled[i].z;
    }
    lineObj.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    lineObj.geometry.attributes.position.needsUpdate = true;
    lineObj.visible = true;
  }, [controlPoints, lineObj]);

  return <primitive object={lineObj} />;
}

// ─── Single control point sphere ──────────────────────────────────────────────

interface ControlSphereProps {
  id: string;
  position: THREE.Vector3;
  isSelected: boolean;
  sphereRadius: number;
  onDragStart: (id: string, worldPos: THREE.Vector3, event: ThreeEvent<PointerEvent>) => void;
  onDragMove: (id: string, worldDelta: THREE.Vector3) => void;
  onDragEnd: (id: string) => void;
  onSelect: (id: string) => void;
}

function ControlSphere({
  id, position, isSelected, sphereRadius,
  onDragStart, onDragMove, onDragEnd, onSelect,
}: ControlSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const dragging = useRef(false);
  const prevWorld = useRef(new THREE.Vector3());
  const pulseRef = useRef(0);
  const { camera, gl } = useThree();

  useFrame((_, dt) => {
    if (!meshRef.current) return;
    pulseRef.current = (pulseRef.current + dt * 3) % (Math.PI * 2);
    const scale = isSelected
      ? 1 + 0.15 * Math.sin(pulseRef.current)
      : 1.0;
    meshRef.current.scale.setScalar(scale);
  });

  const getWorldFromEvent = useCallback((e: ThreeEvent<PointerEvent>): THREE.Vector3 => {
    return e.point.clone();
  }, []);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragging.current = true;
    prevWorld.current.copy(e.point);
    onSelect(id);
    onDragStart(id, e.point, e);
    gl.domElement.style.cursor = "grabbing";
  }, [id, onDragStart, onSelect, gl]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    e.stopPropagation();
    const worldPos = getWorldFromEvent(e);
    const delta = worldPos.clone().sub(prevWorld.current);
    prevWorld.current.copy(worldPos);
    onDragMove(id, delta);
  }, [id, onDragMove, getWorldFromEvent]);

  const handlePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    e.stopPropagation();
    dragging.current = false;
    onDragEnd(id);
    gl.domElement.style.cursor = "";
  }, [id, onDragEnd, gl]);

  const color = isSelected ? "#ff9940" : "#00e5ff";

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      renderOrder={100}
    >
      <sphereGeometry args={[sphereRadius, 16, 12]} />
      <meshPhysicalMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isSelected ? 0.8 : 0.3}
        roughness={0.2}
        metalness={0.6}
        transparent
        opacity={0.9}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// ─── Influence radius ring ─────────────────────────────────────────────────────

function InfluenceRing({
  position,
  radius,
  normal,
}: {
  position: THREE.Vector3;
  radius: number;
  normal: THREE.Vector3;
}) {
  const q = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize()),
    [normal]
  );

  return (
    <mesh position={position} quaternion={q} renderOrder={99}>
      <torusGeometry args={[radius, radius * 0.012, 6, 48]} />
      <meshBasicMaterial
        color="#00e5ff"
        transparent
        opacity={0.18}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// ─── Main overlay component ───────────────────────────────────────────────────

export default function ArchCurveOverlay() {
  const { geometry, activeTool } = useViewerStore();
  const {
    controlPoints, selectedPointId, showCurve, isDraggingPoint,
    setSelectedPointId, setIsDraggingPoint, updateControlPoint,
    deformStrength, deformFalloff, symmetryEnabled,
    pushUndo, incOpCount,
  } = useArchEditStore();

  const { invalidate } = useThree();
  const groupRef = useRef<THREE.Group>(null!);

  // Keep group in sync with the mesh's group transform
  // (the mesh group applies a scale + position to fit the viewport)
  // We mount this overlay INSIDE the same scene, relying on the
  // same local coordinate space by operating on raw geometry positions.

  // ─── Compute sphere radius relative to arch size ─────────────────────────
  const sphereRadius = useMemo(() => {
    if (!geometry) return 0.1;
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox!.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const scale = 6 / maxDim;  // same scale as SculptableMesh
    return 0.12 / scale;
  }, [geometry]);

  // ─── Transform: local geometry → scaled world ────────────────────────────
  const { localToWorld, worldToLocal, groupScale } = useMemo(() => {
    if (!geometry) return { localToWorld: new THREE.Matrix4(), worldToLocal: new THREE.Matrix4(), groupScale: 1 };
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const scale = 6 / maxDim;

    const l2w = new THREE.Matrix4()
      .makeScale(scale, scale, scale)
      .setPosition(-center.x * scale, -center.y * scale, -center.z * scale);
    const w2l = l2w.clone().invert();
    return { localToWorld: l2w, worldToLocal: w2l, groupScale: scale };
  }, [geometry]);

  // ─── Convert CP local positions to world positions for display ────────────
  const worldCPs = useMemo(() =>
    controlPoints.map((cp) => cp.position.clone().applyMatrix4(localToWorld)),
    [controlPoints, localToWorld]
  );

  // ─── Drag handlers ────────────────────────────────────────────────────────
  const handleDragStart = useCallback((_id: string, _worldPos: THREE.Vector3, _e: ThreeEvent<PointerEvent>) => {
    if (!geometry) return;
    // Snapshot undo
    const pos = geometry.attributes.position.array as Float32Array;
    pushUndo(pos.slice());
    setIsDraggingPoint(true);
    incOpCount();
  }, [geometry, pushUndo, setIsDraggingPoint, incOpCount]);

  const handleDragMove = useCallback((id: string, worldDelta: THREE.Vector3) => {
    if (!geometry) return;

    // Convert world delta to local geometry delta (undo scale)
    const localDelta = worldDelta.clone().divideScalar(groupScale);

    // Find current CP in local space
    const cp = controlPoints.find((c) => c.id === id);
    if (!cp) return;

    // Apply deformation to geometry
    const positions = geometry.attributes.position.array as Float32Array;
    const vertCount = geometry.attributes.position.count;
    const localSigma = deformFalloff * (1 / groupScale);

    applyControlPointDeform(
      positions, cp.position, localDelta,
      localSigma, deformStrength, vertCount
    );

    // Mirror symmetry (X axis)
    if (symmetryEnabled) {
      const mirroredPos = cp.position.clone();
      mirroredPos.x = -mirroredPos.x;
      const mirroredDelta = localDelta.clone();
      mirroredDelta.x = -mirroredDelta.x;
      applyControlPointDeform(
        positions, mirroredPos, mirroredDelta,
        localSigma, deformStrength, vertCount
      );
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    if (geometry.attributes.normal) geometry.attributes.normal.needsUpdate = true;

    // Update the control point position
    updateControlPoint(id, cp.position.clone().add(localDelta));

    invalidate();
  }, [geometry, controlPoints, deformStrength, deformFalloff, symmetryEnabled, groupScale, updateControlPoint, invalidate]);

  const handleDragEnd = useCallback((_id: string) => {
    setIsDraggingPoint(false);
  }, [setIsDraggingPoint]);

  const handleSelect = useCallback((id: string) => {
    setSelectedPointId(id);
  }, [setSelectedPointId]);

  if (!geometry || !showCurve || controlPoints.length === 0 || activeTool !== "sculpt") {
    return null;
  }

  // Determine arch normal (pointing up in local space, then transform)
  const archNormal = new THREE.Vector3(0, 1, 0).transformDirection(localToWorld).normalize();

  return (
    <group ref={groupRef}>
      {/* Arch spline curve */}
      {worldCPs.length >= 2 && (
        <ArchSplineLine controlPoints={worldCPs} color="#00e5ff" />
      )}

      {/* Control point spheres */}
      {controlPoints.map((cp, idx) => {
        const worldPos = worldCPs[idx];
        if (!worldPos) return null;
        const isSelected = cp.id === selectedPointId;

        return (
          <group key={cp.id}>
            <ControlSphere
              id={cp.id}
              position={worldPos}
              isSelected={isSelected}
              sphereRadius={sphereRadius}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onSelect={handleSelect}
            />

            {/* Influence ring when selected */}
            {isSelected && (
              <InfluenceRing
                position={worldPos}
                radius={deformFalloff * 3 * groupScale * 0.3}
                normal={archNormal}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
