import { useRef, useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useAnalysisStore } from "./analysisStore";
import { useViewerStore } from "@/store/viewerStore";
import { useSegmentationStore } from "../segmentation/segmentationStore";

function MeasurementPoint({ position, color, size = 0.04 }: { position: [number, number, number]; color: string; size?: number }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 10, 10]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function DistanceLine({ points, color, value, unit }: {
  points: [number, number, number][];
  color: string;
  value: number;
  unit: string;
}) {
  if (points.length < 2) return null;
  const mid: [number, number, number] = [
    (points[0][0] + points[1][0]) / 2,
    (points[0][1] + points[1][1]) / 2 + 0.15,
    (points[0][2] + points[1][2]) / 2,
  ];

  return (
    <>
      <Line
        points={points as any}
        color={color}
        lineWidth={2}
        dashed={false}
      />
      <Html position={mid} center style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
        <div
          style={{
            background: "rgba(10,12,16,0.85)",
            border: `1px solid ${color}`,
            color,
            padding: "2px 6px",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "monospace",
            fontWeight: "bold",
          }}
        >
          {value.toFixed(2)} {unit}
        </div>
      </Html>
    </>
  );
}

function AngleLine({ points, color, value }: { points: [number, number, number][]; color: string; value: number }) {
  if (points.length < 3) return null;
  const vertex = points[1];
  // Draw two rays from vertex
  const lineA = [vertex, points[0]] as any;
  const lineB = [vertex, points[2]] as any;
  const labelPos: [number, number, number] = [
    vertex[0],
    vertex[1] + 0.2,
    vertex[2],
  ];

  return (
    <>
      <Line points={lineA} color={color} lineWidth={2} />
      <Line points={lineB} color={color} lineWidth={2} />
      <Html position={labelPos} center style={{ pointerEvents: "none" }}>
        <div style={{ background: "rgba(10,12,16,0.85)", border: `1px solid ${color}`, color, padding: "2px 6px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", fontWeight: "bold" }}>
          {value.toFixed(1)}°
        </div>
      </Html>
    </>
  );
}

/** Invisible mesh that captures pointer events for placing measurement points */
function MeasurementCaptureMesh() {
  const { activeTool, addPendingPoint, pendingPoints, requiredPoints } = useAnalysisStore();
  const viewerTool = useViewerStore((s) => s.activeTool);
  const { result } = useSegmentationStore();
  const isActive = viewerTool === "measure_distance" || viewerTool === "measure_angle";

  if (!isActive || !result) return null;

  return (
    <>
      {result.segments.map((seg) => (
        <mesh
          key={seg.id}
          geometry={seg.geometry}
          visible={false}
          onClick={(e) => {
            e.stopPropagation();
            const p = e.point;
            addPendingPoint([p.x, p.y, p.z]);
          }}
        />
      ))}
    </>
  );
}

/** Pending point preview lines while placing */
function PendingMeasurement() {
  const { pendingPoints, activeTool } = useAnalysisStore();
  const viewerTool = useViewerStore((s) => s.activeTool);
  const isActive = viewerTool === "measure_distance" || viewerTool === "measure_angle";

  if (!isActive || pendingPoints.length === 0) return null;

  const color = activeTool === "angle" ? "#ffcc00" : "#00e5ff";

  return (
    <>
      {pendingPoints.map((pt, i) => (
        <MeasurementPoint key={i} position={pt} color={color} size={0.05} />
      ))}
      {pendingPoints.length >= 2 && (
        <Line
          points={pendingPoints as any}
          color={color}
          lineWidth={1.5}
          dashed
          dashSize={0.1}
          gapSize={0.05}
        />
      )}
    </>
  );
}

export default function MeasurementScene() {
  const { measurements } = useAnalysisStore();

  return (
    <group>
      {/* Rendered measurements */}
      {measurements.map((m) => (
        <group key={m.id}>
          {m.points.map((pt, i) => (
            <MeasurementPoint key={i} position={pt} color={m.color} />
          ))}
          {m.type === "angle" ? (
            <AngleLine points={m.points as [number, number, number][]} color={m.color} value={m.value} />
          ) : (
            <DistanceLine points={m.points as [number, number, number][]} color={m.color} value={m.value} unit={m.unit} />
          )}
        </group>
      ))}

      {/* Capture mesh for clicks */}
      <MeasurementCaptureMesh />

      {/* Pending measurement preview */}
      <PendingMeasurement />
    </group>
  );
}
