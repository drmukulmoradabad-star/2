/**
 * SculptableMesh v2 — interactive mesh deformation for dental CAD.
 *
 * New in v2:
 *  - Scroll wheel: adjust brush radius (+ Shift = strength)
 *  - Mask overlay: masked vertices shown as a tinted Points layer
 *  - Auto-smooth post-stroke pass
 *  - Constraint system (max displacement from base)
 *  - Mask paint / erase stroke mode
 *  - Base-position capture on first sculpt
 *  - Animated brush cursor with falloff gradient disk
 */

import { useRef, useEffect, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useViewerStore } from "@/store/viewerStore";
import { useSculptStore } from "./sculptStore";
import { useLatticeStore } from "./latticeStore";
import { SculptEngine } from "./SculptEngine";
import LatticeGizmo from "./LatticeGizmo";
import type { ThreeEvent } from "@react-three/fiber";

// ─── Brush cursor ─────────────────────────────────────────────────────────────

function BrushCursor({
  pos, normal, radius, active, maskMode,
}: {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  radius: number;
  active: boolean;
  maskMode: string;
}) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const diskRef  = useRef<THREE.Mesh>(null);
  const dotRef   = useRef<THREE.Mesh>(null);
  const pulseRef = useRef(0);

  const color = maskMode !== "off" ? "#ff4488" : (active ? "#ff9940" : "#00e5ff");

  useFrame((_, dt) => {
    pulseRef.current = (pulseRef.current + dt * 2) % (Math.PI * 2);
    const pulse = 0.55 + 0.1 * Math.sin(pulseRef.current);

    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal.clone().normalize()
    );

    [outerRef, innerRef, diskRef, dotRef].forEach((ref, i) => {
      if (!ref.current) return;
      ref.current.position.copy(pos).addScaledVector(normal, 0.001 * (i + 1));
      ref.current.quaternion.copy(q);
    });

    if (outerRef.current) {
      const mat = outerRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = active ? pulse : 0.65;
    }
  });

  return (
    <group renderOrder={999}>
      {/* Falloff gradient disk */}
      <mesh ref={diskRef}>
        <circleGeometry args={[radius, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.06}
          depthTest={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Outer boundary ring */}
      <mesh ref={outerRef}>
        <torusGeometry args={[radius, radius * 0.022, 8, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>

      {/* Inner 50% ring */}
      <mesh ref={innerRef}>
        <torusGeometry args={[radius * 0.5, radius * 0.014, 6, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>

      {/* Center dot */}
      <mesh ref={dotRef}>
        <circleGeometry args={[radius * 0.04, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.95}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// ─── Mask overlay (tinted Points at masked vertices) ──────────────────────────

function MaskOverlay({
  geometry,
  maskWeights,
  groupRef,
}: {
  geometry: THREE.BufferGeometry;
  maskWeights: Float32Array;
  groupRef: React.RefObject<THREE.Group>;
}) {
  const pointsGeo = useRef(new THREE.BufferGeometry());

  useEffect(() => {
    const positions = geometry.attributes.position.array as Float32Array;
    const count = geometry.attributes.position.count;

    // Collect masked verts (weight < 0.5)
    const masked: number[] = [];
    for (let i = 0; i < count; i++) {
      if (maskWeights[i] < 0.5) {
        masked.push(positions[i*3], positions[i*3+1], positions[i*3+2]);
      }
    }
    if (!masked.length) {
      pointsGeo.current.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
      return;
    }
    pointsGeo.current.setAttribute("position", new THREE.Float32BufferAttribute(masked, 3));
  }, [maskWeights, geometry]);

  return (
    <points geometry={pointsGeo.current}>
      <pointsMaterial
        color="#ff4488"
        size={0.015}
        transparent
        opacity={0.7}
        depthTest={false}
        toneMapped={false}
        sizeAttenuation
      />
    </points>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  geometry: THREE.BufferGeometry;
  materialMode: "solid" | "wireframe" | "transparent";
  opacity: number;
}

export default function SculptableMesh({ geometry, materialMode, opacity }: Props) {
  const groupRef        = useRef<THREE.Group>(null!);
  const groupScaleRef   = useRef(1);
  const meshRef         = useRef<THREE.Mesh>(null);
  const engineRef       = useRef<SculptEngine | null>(null);
  const prevHitRef      = useRef<THREE.Vector3 | null>(null);
  const strokeActiveRef = useRef(false);
  const lastHitRef      = useRef<THREE.Vector3>(new THREE.Vector3());
  const { camera, invalidate } = useThree();

  const { activeTool } = useViewerStore();
  const {
    activeSculptTool,
    brushRadius, setBrushRadius,
    brushStrength, setBrushStrength,
    brushFalloff,
    symmetryEnabled, symmetryAxis,
    isSculpting, setIsSculpting,
    brushHit, setBrushHit,
    pushUndo, undo, redo,
    incStrokeCount,
    maskMode, maskWeights, initMask,
    basePositions, setBasePositions,
    constraintsEnabled, maxDisplacement,
    autoSmooth, autoSmoothStrength,
  } = useSculptStore();

  const { isLatticeActive } = useLatticeStore();
  const isSculptMode = activeTool === "sculpt";
  const isMaskMode   = maskMode !== "off";

  // ── Auto-fit ──────────────────────────────────────────────────────────────
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
    groupScaleRef.current = scale;
    groupRef.current.scale.setScalar(scale);
    groupRef.current.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    const camDist = maxDim * scale * 1.5;
    camera.position.set(0, camDist * 0.3, camDist);
    camera.lookAt(0, 0, 0);
  }, [geometry]);

  // ── Build SculptEngine ────────────────────────────────────────────────────
  useEffect(() => {
    engineRef.current = new SculptEngine(geometry);
    return () => { engineRef.current = null; };
  }, [geometry]);

  // ── Init mask when entering sculpt mode ──────────────────────────────────
  useEffect(() => {
    if (isSculptMode) {
      initMask(geometry.attributes.position.count);
      // Capture base positions if not yet done
      if (!basePositions) {
        setBasePositions((geometry.attributes.position.array as Float32Array).slice());
      }
    }
  }, [isSculptMode, geometry]);

  // ── Local radius helper ───────────────────────────────────────────────────
  const toLocalRadius = useCallback((worldR: number, obj: THREE.Object3D): number => {
    const pw = new THREE.Vector3();
    const pr = new THREE.Vector3(worldR, 0, 0);
    obj.worldToLocal(pw);
    obj.worldToLocal(pr);
    return pr.sub(pw).length();
  }, []);

  // ── Scroll wheel: radius (Shift = strength) ──────────────────────────────
  useEffect(() => {
    if (!isSculptMode) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      if (e.shiftKey) {
        setBrushStrength(brushStrength + delta * 0.5);
      } else {
        setBrushRadius(brushRadius + delta * brushRadius);
      }
      invalidate();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [isSculptMode, brushRadius, brushStrength]);

  // ── Keyboard undo/redo ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSculptMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const snap = undo();
        if (snap && engineRef.current) {
          (geometry.attributes.position.array as Float32Array).set(snap);
          geometry.attributes.position.needsUpdate = true;
          engineRef.current.finalizeStroke();
          engineRef.current.rebuildGrid();
          invalidate();
        }
      }
      if (e.key === "y" || (e.shiftKey && e.key === "z")) {
        e.preventDefault();
        const current = (geometry.attributes.position.array as Float32Array).slice();
        const snap = redo(current);
        if (snap && engineRef.current) {
          (geometry.attributes.position.array as Float32Array).set(snap);
          geometry.attributes.position.needsUpdate = true;
          engineRef.current.finalizeStroke();
          engineRef.current.rebuildGrid();
          invalidate();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSculptMode, geometry, undo, redo]);

  // ── Pointer: move ─────────────────────────────────────────────────────────
  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!isSculptMode || !engineRef.current || !e.face) return;
    e.stopPropagation();

    const worldPos    = e.point.clone();
    const worldNormal = e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize();
    setBrushHit({ position: worldPos, normal: worldNormal });
    lastHitRef.current.copy(worldPos);

    if (!strokeActiveRef.current) return;

    const localHit  = e.object.worldToLocal(e.point.clone());
    const localNorm = e.face.normal.clone().normalize();
    const lRadius   = toLocalRadius(brushRadius, e.object);

    // ── Mask painting mode ──────────────────────────────────────────────
    if (isMaskMode) {
      if (maskWeights) {
        engineRef.current.applyMaskStroke(maskWeights, localHit, maskMode as "paint" | "erase", {
          radius: lRadius,
          strength: brushStrength,
          falloffCurve: brushFalloff,
        });
        invalidate();
      }
      return;
    }

    // ── Sculpt mode ──────────────────────────────────────────────────────
    let delta = new THREE.Vector3();
    if (activeSculptTool === "grab" && prevHitRef.current) {
      delta.subVectors(localHit, prevHitRef.current);
    }
    prevHitRef.current = localHit.clone();

    const bp = {
      radius: lRadius,
      strength: brushStrength,
      falloffCurve: brushFalloff,
      symmetry: symmetryEnabled,
      symmetryAxis,
      maskWeights: maskWeights ?? undefined,
      ...(constraintsEnabled && basePositions ? {
        basePositions: (() => {
          // Convert base world positions to local space equivalently
          return basePositions;
        })(),
        maxDisplacement: toLocalRadius(maxDisplacement, e.object),
      } : {}),
    };

    engineRef.current.applyStroke(
      activeSculptTool ?? "smooth",
      localHit, localNorm, delta, bp
    );
    invalidate();
  }, [isSculptMode, isMaskMode, maskMode, maskWeights, activeSculptTool, brushRadius, brushStrength, brushFalloff, symmetryEnabled, symmetryAxis, constraintsEnabled, basePositions, maxDisplacement]);

  // ── Pointer: down ─────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!isSculptMode || !engineRef.current) return;
    if (!isMaskMode && !activeSculptTool) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    // Snapshot for undo (skip for mask-only strokes)
    if (!isMaskMode) {
      const pos = geometry.attributes.position.array as Float32Array;
      pushUndo(pos.slice());
    }

    strokeActiveRef.current = true;
    setIsSculpting(true);

    if (e.face) {
      const localHit = e.object.worldToLocal(e.point.clone());
      prevHitRef.current = localHit.clone();
      const lRadius = toLocalRadius(brushRadius, e.object);

      if (isMaskMode && maskWeights) {
        engineRef.current.applyMaskStroke(maskWeights, localHit, maskMode as "paint" | "erase", {
          radius: lRadius, strength: brushStrength, falloffCurve: brushFalloff,
        });
      } else if (activeSculptTool) {
        engineRef.current.applyStroke(
          activeSculptTool, localHit, e.face.normal.clone().normalize(),
          new THREE.Vector3(),
          { radius: lRadius, strength: brushStrength, falloffCurve: brushFalloff,
            symmetry: symmetryEnabled, symmetryAxis, maskWeights: maskWeights ?? undefined }
        );
      }
      invalidate();
    }
  }, [isSculptMode, isMaskMode, maskMode, maskWeights, activeSculptTool, brushRadius, brushStrength, brushFalloff, geometry, symmetryEnabled, symmetryAxis]);

  // ── Pointer: up ───────────────────────────────────────────────────────────
  const handlePointerUp = useCallback((_e: ThreeEvent<PointerEvent>) => {
    if (!strokeActiveRef.current) return;
    strokeActiveRef.current = false;
    prevHitRef.current = null;
    setIsSculpting(false);
    if (engineRef.current && !isMaskMode) {
      engineRef.current.finalizeStroke(
        autoSmooth,
        autoSmoothStrength,
        engineRef.current ? (() => {
          // Convert last hit to local
          if (!meshRef.current) return lastHitRef.current;
          return meshRef.current.worldToLocal(lastHitRef.current.clone());
        })() : undefined,
        toLocalRadius(brushRadius, meshRef.current!)
      );
    }
    incStrokeCount();
    invalidate();
  }, [isMaskMode, autoSmooth, autoSmoothStrength, brushRadius]);

  // ── Pointer: leave ────────────────────────────────────────────────────────
  const handlePointerLeave = useCallback(() => {
    setBrushHit(null);
    if (strokeActiveRef.current) {
      strokeActiveRef.current = false;
      prevHitRef.current = null;
      setIsSculpting(false);
      engineRef.current?.finalizeStroke(false);
      invalidate();
    }
  }, []);

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
          color={isMaskMode ? "#ddd0bc" : "#e8dcc8"}
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

      {/* Wireframe overlay in transparent mode */}
      {isTransparent && (
        <mesh geometry={geometry}>
          <meshBasicMaterial color="#00e5ff" wireframe transparent opacity={0.08} />
        </mesh>
      )}

      {/* Mask overlay */}
      {isSculptMode && maskWeights && (
        <MaskOverlay
          geometry={geometry}
          maskWeights={maskWeights}
          groupRef={groupRef}
        />
      )}

      {/* Brush cursor */}
      {isSculptMode && brushHit && !isLatticeActive && (
        <BrushCursor
          pos={brushHit.position}
          normal={brushHit.normal}
          radius={brushRadius}
          active={isSculpting}
          maskMode={maskMode}
        />
      )}

      {/* Lattice deformation cage */}
      {isSculptMode && isLatticeActive && (
        <LatticeGizmo
          geometry={geometry}
          groupScale={groupScaleRef.current}
          onDeformed={invalidate}
        />
      )}
    </group>
  );
}
