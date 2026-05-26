import { Suspense, useRef, useState, Component } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useViewerStore } from "@/store/viewerStore";
import { useSegmentationStore } from "@/modules/segmentation/segmentationStore";
import ScanMesh from "./ScanMesh";
import ViewControls from "./ViewControls";
import DropZone from "./DropZone";
import SegmentedScene from "@/modules/segmentation/SegmentedScene";

class WebGLErrorBoundary extends Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function checkWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("webgl2") || canvas.getContext("webgl");
    return !!ctx;
  } catch {
    return false;
  }
}

function EmptyScene() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 10, 10, 10]} />
        <meshBasicMaterial color="#1a1d24" wireframe transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function Scene() {
  const geometry = useViewerStore((s) => s.geometry);
  const materialMode = useViewerStore((s) => s.materialMode);
  const opacity = useViewerStore((s) => s.opacity);
  const showSegmented = useSegmentationStore((s) => s.showSegmented);
  const hasSegments = useSegmentationStore((s) => (s.result?.segments.length ?? 0) > 0);

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 8, 4]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-4, 2, -2]} intensity={0.4} color="#c8d8f0" />
      <pointLight position={[0, -3, 4]} intensity={0.6} color="#fff0d0" />

      {/* Raw scan mesh — hide when showing segmented view */}
      {geometry && (!showSegmented || !hasSegments) && (
        <ScanMesh geometry={geometry} materialMode={materialMode} opacity={opacity} />
      )}

      {/* Segmented individual tooth meshes */}
      <SegmentedScene />
    </>
  );
}

function WebGLUnavailable({ onFileLoad }: { onFileLoad: (file: File) => void }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: "#0a0c10" }}
    >
      <div
        className="flex flex-col items-center gap-5 p-10 rounded-lg"
        style={{ border: "1px solid #1e2530", background: "#0e1117", maxWidth: 420 }}
      >
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <rect x="4" y="4" width="48" height="48" rx="6" stroke="#1e3a4a" strokeWidth="1.5" />
          <path d="M16 28 L24 20 L32 28 L40 20" stroke="#00e5ff" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <circle cx="28" cy="34" r="6" stroke="#00e5ff" strokeWidth="1.5" opacity="0.4" />
          <path d="M22 34 Q28 28 34 34" stroke="#00e5ff" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-semibold tracking-wide mb-2" style={{ color: "#c8d8e8" }}>
            3D Viewport Ready
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "#4a6070" }}>
            WebGL is not available in this sandboxed preview. The viewer will render
            full 3D scans in a standard browser with GPU acceleration.
          </p>
        </div>
        <div
          className="w-full rounded p-3 text-[11px] leading-relaxed"
          style={{ background: "#0a0c10", border: "1px solid #1a1d24", color: "#3a5060" }}
        >
          <p className="font-mono">Helios 500 &bull; iTero Element &bull; 3Shape TRIOS</p>
          <p className="font-mono mt-0.5">STL &bull; OBJ &bull; PLY &bull; Up to 500 MB</p>
        </div>
        <label
          className="px-4 py-2 text-xs font-semibold tracking-wider rounded cursor-pointer transition-all"
          style={{
            background: "rgba(0,229,255,0.12)",
            border: "1px solid rgba(0,229,255,0.4)",
            color: "#00e5ff",
          }}
        >
          Browse Scan File
          <input
            type="file"
            accept=".stl,.obj,.ply"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileLoad(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}

interface ViewportCanvasProps {
  onFileLoad: (file: File) => void;
}

export default function ViewportCanvas({ onFileLoad }: ViewportCanvasProps) {
  const controlsRef = useRef<any>(null);
  const [webGLFailed, setWebGLFailed] = useState(() => !checkWebGL());
  const activeTool = useViewerStore((s) => s.activeTool);

  // Disable orbit when movement gizmo needs mouse
  const orbitEnabled = activeTool !== "align";

  return (
    <div className="relative w-full h-full" style={{ background: "#0a0c10" }}>
      {webGLFailed ? (
        <WebGLUnavailable onFileLoad={onFileLoad} />
      ) : (
        <WebGLErrorBoundary onError={() => setWebGLFailed(true)}>
          <Canvas
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: "high-performance",
              preserveDrawingBuffer: false,
              failIfMajorPerformanceCaveat: false,
            }}
            dpr={[1, 2]}
            shadows
            style={{ background: "#0a0c10" }}
            onCreated={({ gl }) => {
              if (!gl.getContext()) setWebGLFailed(true);
            }}
          >
            <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={45} near={0.01} far={1000} />
            <OrbitControls
              ref={controlsRef}
              enabled={orbitEnabled}
              enableDamping
              dampingFactor={0.05}
              screenSpacePanning={false}
              minDistance={0.5}
              maxDistance={100}
            />
            <Suspense fallback={null}>
              <Scene />
            </Suspense>
            <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
              <GizmoViewport axisColors={["#ff4d4d", "#4dff88", "#4d9fff"]} labelColor="white" />
            </GizmoHelper>
          </Canvas>
          <ViewControls controlsRef={controlsRef} />
          <DropZone onFileLoad={onFileLoad} />
        </WebGLErrorBoundary>
      )}
    </div>
  );
}
