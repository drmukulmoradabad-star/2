/**
 * LatticeGizmo — interactive FFD (free-form deformation) cage rendered inside
 * the auto-fit group of SculptableMesh.
 *
 * All positions are in MESH LOCAL space.
 * Drag interactions use a camera-aligned plane to find movement deltas.
 */

import { useRef, useEffect, useMemo, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { LatticeDeformer } from "./LatticeDeformer";
import { useLatticeStore } from "./latticeStore";

interface LatticeGizmoProps {
  geometry: THREE.BufferGeometry;
  /** The parent group that auto-fits the mesh. Used for world↔local conversion. */
  groupScale: number;
  onDeformed: () => void;   // called after each deformation so parent can invalidate
}

export default function LatticeGizmo({ geometry, groupScale, onDeformed }: LatticeGizmoProps) {
  const { camera, invalidate } = useThree();
  const { latticeNx: nx, latticeNy: ny, latticeNz: nz, setSelectedCPIndex, selectedCPIndex, setTotalDisplacement } = useLatticeStore();

  const deformerRef  = useRef<LatticeDeformer | null>(null);
  const cageRef      = useRef<THREE.LineSegments>(null);
  const cageGeoRef   = useRef<THREE.BufferGeometry | null>(null);

  // Drag state
  const dragActiveRef    = useRef(false);
  const dragCPIdxRef     = useRef(-1);
  const dragPlaneRef     = useRef(new THREE.Plane());
  const dragPrevRef      = useRef(new THREE.Vector3());
  const dragRaycaster    = useMemo(() => new THREE.Raycaster(), []);
  const dragNDC          = useRef(new THREE.Vector2());

  // Build / rebuild deformer when params or geometry change
  useEffect(() => {
    deformerRef.current = new LatticeDeformer(geometry, nx, ny, nz);
    updateCage();
    return () => { deformerRef.current = null; };
  }, [geometry, nx, ny, nz]);

  function updateCage() {
    const ld = deformerRef.current;
    if (!ld || !cageRef.current) return;
    const geo = ld.buildCageGeometry();
    if (cageRef.current.geometry) cageRef.current.geometry.dispose();
    cageRef.current.geometry = geo;
    cageGeoRef.current = geo;
  }

  // Control point sphere meshes — one per CP
  const cpMeshes = useRef<THREE.Mesh[]>([]);
  const cpGroupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const ld = deformerRef.current;
    if (!ld || !cpGroupRef.current) return;

    // Remove existing
    while (cpGroupRef.current.children.length) {
      cpGroupRef.current.remove(cpGroupRef.current.children[0]);
    }
    cpMeshes.current = [];

    const sphereGeo = new THREE.SphereGeometry(0.025 / groupScale, 8, 8);

    ld.controlPoints.forEach((cp) => {
      const mat = new THREE.MeshBasicMaterial({
        color: "#00e5ff",
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(cp.position);
      mesh.userData.cpIdx = cp.index;
      cpGroupRef.current!.add(mesh);
      cpMeshes.current.push(mesh);
    });
  }, [geometry, nx, ny, nz, groupScale]);

  // Sync mesh positions from deformer each frame
  useFrame(() => {
    const ld = deformerRef.current;
    if (!ld) return;
    ld.controlPoints.forEach((cp, i) => {
      const mesh = cpMeshes.current[i];
      if (mesh) mesh.position.copy(cp.position);
    });
  });

  // ── Pointer: down on a control point ──────────────────────────────────────
  const handleCPPointerDown = useCallback((e: ThreeEvent<PointerEvent>, cpIdx: number) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    dragActiveRef.current = true;
    dragCPIdxRef.current  = cpIdx;
    setSelectedCPIndex(cpIdx);

    // Build drag plane: camera-normal plane through the CP world position
    const ld = deformerRef.current;
    if (!ld) return;
    const cp = ld.controlPoints[cpIdx];
    if (!cp) return;

    // Camera forward direction (world)
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);

    // CP world position = local * groupScale (assuming no rotation)
    const cpWorld = cp.position.clone().multiplyScalar(groupScale);
    dragPlaneRef.current.setFromNormalAndCoplanarPoint(camDir.negate(), cpWorld);
    dragPrevRef.current.copy(cpWorld);
  }, [camera, groupScale]);

  // ── Pointer: move (drag a CP) ─────────────────────────────────────────────
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragActiveRef.current || dragCPIdxRef.current < 0) return;
    const ld = deformerRef.current;
    if (!ld) return;

    // NDC of pointer
    const rect = (e.target as HTMLElement).getBoundingClientRect?.() ??
      { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    dragNDC.current.set(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    dragRaycaster.setFromCamera(dragNDC.current, camera);
    const worldHit = new THREE.Vector3();
    if (!dragRaycaster.ray.intersectPlane(dragPlaneRef.current, worldHit)) return;

    // Delta in world space → convert to local by dividing by group scale
    const worldDelta = worldHit.clone().sub(dragPrevRef.current);
    const localDelta = worldDelta.divideScalar(groupScale);

    ld.moveControlPoint(dragCPIdxRef.current, localDelta);
    ld.applyToGeometry();
    setTotalDisplacement(ld.getTotalDisplacementMagnitude());

    dragPrevRef.current.copy(worldHit);
    updateCage();
    onDeformed();
    invalidate();
  }, [camera, groupScale, onDeformed]);

  // ── Pointer: up ───────────────────────────────────────────────────────────
  const handlePointerUp = useCallback(() => {
    dragActiveRef.current   = false;
    dragCPIdxRef.current    = -1;
  }, []);

  // Attach window-level move/up for captured drag
  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup",   handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup",   handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Reset button (called from panel via store)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!(window as any).__latticeResetFn) {
      (window as any).__latticeResetFn = () => {
        deformerRef.current?.reset();
        updateCage();
        setTotalDisplacement(0);
        setSelectedCPIndex(null);
        onDeformed();
        invalidate();
      };
    }
    return () => { delete (window as any).__latticeResetFn; };
  }, [onDeformed]);

  return (
    <group renderOrder={100}>
      {/* Cage edges */}
      <lineSegments ref={cageRef}>
        <lineBasicMaterial
          color="#00e5ff"
          transparent
          opacity={0.35}
          depthTest={false}
          toneMapped={false}
        />
      </lineSegments>

      {/* Control points */}
      <group ref={cpGroupRef}>
        {/* Rendered via imperative Three.js objects above */}
      </group>

      {/* Invisible proxy meshes for raycasting/pointerdown events */}
      {deformerRef.current?.controlPoints.map((cp) => {
        const isSelected = selectedCPIndex === cp.index;
        const size = 0.04 / groupScale;
        return (
          <mesh
            key={cp.index}
            position={cp.position}
            onPointerDown={(e) => handleCPPointerDown(e, cp.index)}
            renderOrder={200}
          >
            <sphereGeometry args={[size, 8, 8]} />
            <meshBasicMaterial
              color={isSelected ? "#ff9940" : "#00e5ff"}
              transparent
              opacity={isSelected ? 0.95 : 0.7}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
