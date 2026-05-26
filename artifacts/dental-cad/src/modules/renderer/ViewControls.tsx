import * as THREE from "three";

const VIEWS = [
  { label: "TOP", icon: "⬆", position: [0, 8, 0] as [number, number, number], up: [0, 0, -1] as [number, number, number] },
  { label: "FRONT", icon: "⬤", position: [0, 0, 8] as [number, number, number], up: [0, 1, 0] as [number, number, number] },
  { label: "LEFT", icon: "◀", position: [-8, 0, 0] as [number, number, number], up: [0, 1, 0] as [number, number, number] },
  { label: "RIGHT", icon: "▶", position: [8, 0, 0] as [number, number, number], up: [0, 1, 0] as [number, number, number] },
  { label: "BOTTOM", icon: "⬇", position: [0, -8, 0] as [number, number, number], up: [0, 0, 1] as [number, number, number] },
];

interface ViewControlsProps {
  controlsRef: React.RefObject<any>;
}

export default function ViewControls({ controlsRef }: ViewControlsProps) {
  const snapToView = (position: [number, number, number], up: [number, number, number]) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object as THREE.Camera;
    camera.position.set(...position);
    camera.up.set(...up);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  return (
    <div className="absolute top-4 left-4 flex flex-col gap-1">
      {VIEWS.map((view) => (
        <button
          key={view.label}
          onClick={() => snapToView(view.position, view.up)}
          title={view.label}
          className="w-9 h-7 text-[10px] font-mono font-bold tracking-wider rounded transition-all duration-150"
          style={{
            background: "rgba(14,17,23,0.85)",
            border: "1px solid rgba(0,229,255,0.2)",
            color: "#7fa8c0",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,229,255,0.7)";
            (e.currentTarget as HTMLButtonElement).style.color = "#00e5ff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,229,255,0.2)";
            (e.currentTarget as HTMLButtonElement).style.color = "#7fa8c0";
          }}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}
