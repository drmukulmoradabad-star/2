import { useRef, useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSegmentationStore } from "./segmentationStore";
import { useMovementStore, buildMatrix } from "../movement/movementStore";
import { hexToRgb } from "./SegmentationEngine";
import ToothGizmo from "../movement/ToothGizmo";

interface SegmentedSceneProps {
  onSegmentClick?: (segmentId: string) => void;
}

function ToothMesh({ segmentId, geometry, color, isActive, isHidden, isColliding }: {
  segmentId: string;
  geometry: THREE.BufferGeometry;
  color: string;
  isActive: boolean;
  isHidden: boolean;
  isColliding: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { setActiveSegmentId } = useSegmentationStore();
  const { setActiveSegmentId: setMovementActiveId } = useMovementStore();
  const transform = useMovementStore((s) => s.getTransform(segmentId));

  const matrix = useMemo(() => buildMatrix(transform), [
    transform.position[0], transform.position[1], transform.position[2],
    transform.rotation[0], transform.rotation[1], transform.rotation[2],
    transform.scale[0], transform.scale[1], transform.scale[2],
  ]);

  if (isHidden) return null;

  const emissiveColor = isActive ? "#004466" : isColliding ? "#440000" : "#000000";
  const emissiveIntensity = isActive ? 0.4 : isColliding ? 0.5 : 0;

  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation();
          setActiveSegmentId(segmentId);
          setMovementActiveId(segmentId);
        }}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial
          color={color}
          roughness={0.3}
          metalness={0.0}
          clearcoat={0.15}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          side={THREE.DoubleSide}
        />
      </mesh>
      {isActive && (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color="#00e5ff"
            wireframe
            transparent
            opacity={0.15}
          />
        </mesh>
      )}
    </group>
  );
}

export default function SegmentedScene() {
  const { result, activeSegmentId, metas, showSegmented } = useSegmentationStore();
  const { activeSegmentId: movActiveId, collidingPairs } = useMovementStore();

  if (!result || !showSegmented) return null;

  const collidingSet = new Set<string>();
  for (const [a, b] of collidingPairs) { collidingSet.add(a); collidingSet.add(b); }

  const effectiveActive = activeSegmentId ?? movActiveId;

  return (
    <group>
      {result.segments.map((seg) => {
        const meta = metas[seg.id];
        const color = meta?.color ?? seg.color;
        const isHidden = meta?.isHidden ?? false;
        const isActive = seg.id === effectiveActive;
        const isColliding = collidingSet.has(seg.id);

        return (
          <ToothMesh
            key={seg.id}
            segmentId={seg.id}
            geometry={seg.geometry}
            color={color}
            isActive={isActive}
            isHidden={isHidden}
            isColliding={isColliding}
          />
        );
      })}

      {effectiveActive && (
        <ToothGizmo
          key={effectiveActive}
          segmentId={effectiveActive}
          segments={result.segments}
        />
      )}
    </group>
  );
}
