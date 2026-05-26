import { useRef, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

interface ScanMeshProps {
  geometry: THREE.BufferGeometry;
  materialMode: "solid" | "wireframe" | "transparent";
  opacity: number;
}

export default function ScanMesh({ geometry, materialMode, opacity }: ScanMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, controls } = useThree();

  useEffect(() => {
    if (!meshRef.current) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 6 / maxDim;
    meshRef.current.scale.setScalar(scale);
    meshRef.current.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    const camDist = maxDim * scale * 1.5;
    camera.position.set(0, camDist * 0.3, camDist);
    camera.lookAt(0, 0, 0);
    if ((controls as any)?.target) {
      (controls as any).target.set(0, 0, 0);
      (controls as any).update?.();
    }
  }, [geometry]);

  const isWireframe = materialMode === "wireframe";
  const isTransparent = materialMode === "transparent";

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#e8dcc8"
          roughness={0.3}
          metalness={0.0}
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
    </group>
  );
}
