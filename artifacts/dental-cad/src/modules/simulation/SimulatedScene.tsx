import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "./simulationStore";
import { useSegmentationStore } from "../segmentation/segmentationStore";
import { useMovementStore } from "../movement/movementStore";
import { interpolateAtProgress } from "./TreatmentEngine";

// Re-export from TreatmentEngine so we don't import movementStore's version
function buildMatrixFromTransform(t: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }) {
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3(...t.position);
  const rot = new THREE.Euler(...t.rotation, "XYZ");
  const scl = new THREE.Vector3(...t.scale);
  mat.compose(pos, new THREE.Quaternion().setFromEuler(rot), scl);
  return mat;
}

function GhostTooth({ geometry, matrix }: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }) {
  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color="#c8d8e8"
          transparent
          opacity={0.18}
          roughness={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function SimulatedTooth({ geometry, matrix, color, isInitial }: {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  color: string;
  isInitial: boolean;
}) {
  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh geometry={geometry} castShadow>
        <meshPhysicalMaterial
          color={isInitial ? "#7fa8c0" : color}
          roughness={0.3}
          metalness={0.0}
          clearcoat={0.15}
          transparent={isInitial}
          opacity={isInitial ? 0.35 : 1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

const IDENTITY = { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] };

export default function SimulatedScene() {
  const { stages, progress, isPlaying, playbackSpeed, showSimulation, comparisonMode, setProgress, setCurrentTransforms } = useSimulationStore();
  const { result, metas } = useSegmentationStore();
  const { transforms: movementTransforms } = useMovementStore();

  // Advance progress each frame when playing
  useFrame((_, delta) => {
    if (!isPlaying || stages.length === 0) return;
    const newProgress = progress + delta / playbackSpeed;
    if (newProgress >= 1) {
      setProgress(0);
    } else {
      setProgress(newProgress);
    }
  });

  // Compute current interpolated transforms
  const currentTransforms = useMemo(() => {
    if (stages.length === 0) return {};
    return interpolateAtProgress(stages, progress);
  }, [stages, progress]);

  // Sync to store for external access
  useMemo(() => {
    setCurrentTransforms(currentTransforms);
  }, [currentTransforms]);

  if (!showSimulation || !result || stages.length === 0) return null;

  const segments = result.segments;

  return (
    <group>
      {/* Initial ghost (comparison mode) */}
      {comparisonMode === "ghost" &&
        segments.map((seg) => {
          const color = metas[seg.id]?.color ?? seg.color;
          const identityMatrix = new THREE.Matrix4().identity();
          return (
            <GhostTooth key={`ghost_${seg.id}`} geometry={seg.geometry} matrix={identityMatrix} />
          );
        })}

      {/* Final target ghost */}
      {comparisonMode === "ghost" &&
        segments.map((seg) => {
          const final = movementTransforms[seg.id];
          if (!final) return null;
          const mat = buildMatrixFromTransform(final);
          return (
            <mesh key={`final_${seg.id}`} geometry={seg.geometry} matrixAutoUpdate={false} matrix={mat}>
              <meshBasicMaterial color="#00e5ff" wireframe transparent opacity={0.1} />
            </mesh>
          );
        })}

      {/* Animated interpolated teeth */}
      {segments.map((seg) => {
        const t = currentTransforms[seg.id] ?? IDENTITY;
        const mat = buildMatrixFromTransform(t);
        const color = metas[seg.id]?.color ?? seg.color;
        return (
          <SimulatedTooth
            key={seg.id}
            geometry={seg.geometry}
            matrix={mat}
            color={color}
            isInitial={false}
          />
        );
      })}
    </group>
  );
}
