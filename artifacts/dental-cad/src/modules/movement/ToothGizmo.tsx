import { useRef, useEffect, useCallback } from "react";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { useMovementStore, buildMatrix, detectCollisions } from "./movementStore";
import type { ToothSegment } from "../segmentation/SegmentationEngine";

interface ToothGizmoProps {
  segmentId: string;
  segments: ToothSegment[];
}

export default function ToothGizmo({ segmentId, segments }: ToothGizmoProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const isDragging = useRef(false);

  const {
    getTransform,
    setTransform,
    pushHistory,
    transformMode,
    transformSpace,
    snapEnabled,
    snapTranslation,
    snapRotation,
    collisionEnabled,
    setCollidingPairs,
  } = useMovementStore();

  const t = getTransform(segmentId);

  const snapT = snapEnabled ? snapTranslation : null;
  const snapR = snapEnabled ? (snapRotation * Math.PI) / 180 : null;
  const snapS = snapEnabled ? 0.05 : null;

  // Sync group position from store when segmentId changes
  useEffect(() => {
    if (!groupRef.current) return;
    const stored = getTransform(segmentId);
    const mat = buildMatrix(stored);
    mat.decompose(
      groupRef.current.position,
      groupRef.current.quaternion,
      groupRef.current.scale
    );
  }, [segmentId]);

  const handleChange = useCallback(() => {
    if (!groupRef.current) return;
    const obj = groupRef.current;
    const newT = {
      position: [obj.position.x, obj.position.y, obj.position.z] as [number, number, number],
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z] as [number, number, number],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z] as [number, number, number],
    };
    setTransform(segmentId, newT);

    if (collisionEnabled) {
      const allTransforms = useMovementStore.getState().transforms;
      const pairs = detectCollisions(
        segments.map((s) => ({ id: s.id, boundingBox: s.boundingBox })),
        { ...allTransforms, [segmentId]: { segmentId, ...newT, isLocked: t.isLocked } }
      );
      setCollidingPairs(pairs);
    }
  }, [segmentId, segments, collisionEnabled, t.isLocked]);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    pushHistory(`Move ${segmentId}`);
  }, [segmentId, pushHistory]);

  if (t.isLocked) return null;

  return (
    <TransformControls
      mode={transformMode}
      space={transformSpace}
      translationSnap={snapT}
      rotationSnap={snapR}
      scaleSnap={snapS}
      onChange={handleChange}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <group ref={groupRef}>
        {/* invisible anchor at centroid */}
        <mesh visible={false}>
          <sphereGeometry args={[0.001]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </TransformControls>
  );
}
