import { useMovementStore } from "./movementStore";
import { useSegmentationStore } from "../segmentation/segmentationStore";
import { Slider } from "@/components/ui/slider";

function fmt(n: number) { return n.toFixed(2); }
function fmtDeg(n: number) { return ((n * 180) / Math.PI).toFixed(1) + "°"; }

export default function MovementPanel() {
  const {
    activeSegmentId, setActiveSegmentId,
    transformMode, setTransformMode,
    transformSpace, setTransformSpace,
    snapEnabled, setSnapEnabled,
    snapTranslation, setSnapTranslation,
    snapRotation, setSnapRotation,
    collisionEnabled, setCollisionEnabled,
    collidingPairs,
    getTransform, setTransform, resetTransform, resetAllTransforms,
    undo, redo, canUndo, canRedo, history, historyIndex,
    pushHistory,
  } = useMovementStore();

  const { result, metas } = useSegmentationStore();
  const segments = result?.segments ?? [];

  const t = activeSegmentId ? getTransform(activeSegmentId) : null;
  const activeMeta = activeSegmentId ? metas[activeSegmentId] : null;
  const activeColor = activeMeta?.color ?? "#00c8ff";

  const nudge = (axis: 0 | 1 | 2, delta: number) => {
    if (!activeSegmentId || !t) return;
    pushHistory("nudge");
    const pos = [...t.position] as [number, number, number];
    pos[axis] += delta;
    setTransform(activeSegmentId, { position: pos });
  };

  const rotNudge = (axis: 0 | 1 | 2, deltaDeg: number) => {
    if (!activeSegmentId || !t) return;
    pushHistory("rotate");
    const rot = [...t.rotation] as [number, number, number];
    rot[axis] += (deltaDeg * Math.PI) / 180;
    setTransform(activeSegmentId, { rotation: rot });
  };

  return (
    <div className="flex flex-col h-full text-[11px]" style={{ color: "#c8d8e8" }}>
      {/* Header */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid #1e2530" }}>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Movement</p>
      </div>

      {/* Undo/Redo */}
      <div className="flex gap-1 px-3 py-2 shrink-0" style={{ borderBottom: "1px solid #1a1d24" }}>
        <button
          onClick={undo} disabled={!canUndo()}
          className="flex-1 py-1 rounded text-[10px] transition-all disabled:opacity-30"
          style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
        >
          Undo
        </button>
        <button
          onClick={redo} disabled={!canRedo()}
          className="flex-1 py-1 rounded text-[10px] transition-all disabled:opacity-30"
          style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
        >
          Redo
        </button>
        <button
          onClick={resetAllTransforms}
          className="flex-1 py-1 rounded text-[10px] transition-all"
          style={{ background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", color: "#ff4d4d" }}
        >
          Reset All
        </button>
      </div>

      {/* Transform mode */}
      <div className="px-3 py-2 shrink-0 flex flex-col gap-2" style={{ borderBottom: "1px solid #1a1d24" }}>
        <div className="flex gap-1">
          {(["translate", "rotate", "scale"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTransformMode(m)}
              className="flex-1 py-1 rounded text-[9px] uppercase tracking-wider font-semibold transition-all capitalize"
              style={{
                background: transformMode === m ? "rgba(0,229,255,0.15)" : "#13161d",
                border: `1px solid ${transformMode === m ? "rgba(0,229,255,0.5)" : "#1e2530"}`,
                color: transformMode === m ? "#00e5ff" : "#4a6070",
              }}
            >
              {m.slice(0, 3)}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["world", "local"] as const).map((space) => (
            <button
              key={space}
              onClick={() => setTransformSpace(space)}
              className="flex-1 py-0.5 rounded text-[9px] uppercase tracking-wider transition-all capitalize"
              style={{
                background: transformSpace === space ? "rgba(0,229,255,0.08)" : "transparent",
                border: `1px solid ${transformSpace === space ? "rgba(0,229,255,0.3)" : "#1a1d24"}`,
                color: transformSpace === space ? "#00e5ff" : "#3a5060",
              }}
            >
              {space}
            </button>
          ))}
        </div>
      </div>

      {/* Active tooth */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid #1a1d24" }}>
        {!activeSegmentId ? (
          <p style={{ color: "#2a3a48" }}>Click a tooth in the viewport to select</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: activeColor }} />
              <span className="font-medium" style={{ color: "#c8d8e8" }}>
                {activeMeta?.label ?? activeSegmentId}
              </span>
              {activeMeta?.fdiNumber && (
                <span className="text-[9px] px-1.5 rounded font-mono" style={{ background: `${activeColor}20`, color: activeColor }}>
                  FDI {activeMeta.fdiNumber}
                </span>
              )}
            </div>

            {t && (
              <>
                {/* Position */}
                <div className="flex flex-col gap-1 mb-2">
                  <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: "#2a4050" }}>Position (mm)</p>
                  {(["X", "Y", "Z"] as const).map((ax, i) => (
                    <div key={ax} className="flex items-center gap-2">
                      <span className="w-3 text-[10px] font-mono" style={{ color: ["#ff4d4d", "#4dff88", "#4d9fff"][i] }}>{ax}</span>
                      <span className="font-mono text-[11px] flex-1" style={{ color: "#7fa8c0" }}>{fmt(t.position[i])}</span>
                      <div className="flex gap-0.5">
                        {[-1, -0.1, 0.1, 1].map((d) => (
                          <button
                            key={d}
                            onClick={() => nudge(i as 0 | 1 | 2, d)}
                            className="px-1 py-0.5 rounded text-[9px] transition-all"
                            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#4a6070", minWidth: 20 }}
                          >
                            {d > 0 ? "+" : ""}{d}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Rotation */}
                <div className="flex flex-col gap-1 mb-2">
                  <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: "#2a4050" }}>Rotation</p>
                  {(["X", "Y", "Z"] as const).map((ax, i) => (
                    <div key={ax} className="flex items-center gap-2">
                      <span className="w-3 text-[10px] font-mono" style={{ color: ["#ff4d4d", "#4dff88", "#4d9fff"][i] }}>{ax}</span>
                      <span className="font-mono text-[11px] flex-1" style={{ color: "#7fa8c0" }}>{fmtDeg(t.rotation[i])}</span>
                      <div className="flex gap-0.5">
                        {[-10, -1, 1, 10].map((d) => (
                          <button
                            key={d}
                            onClick={() => rotNudge(i as 0 | 1 | 2, d)}
                            className="px-1 py-0.5 rounded text-[9px] transition-all"
                            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#4a6070", minWidth: 20 }}
                          >
                            {d > 0 ? "+" : ""}{d}°
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Lock + Reset */}
                <div className="flex gap-1">
                  <button
                    onClick={() => setTransform(activeSegmentId, { isLocked: !t.isLocked })}
                    className="flex-1 py-1 rounded text-[10px] transition-all"
                    style={{
                      background: t.isLocked ? "rgba(255,204,0,0.1)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${t.isLocked ? "rgba(255,204,0,0.4)" : "#1e2530"}`,
                      color: t.isLocked ? "#ffcc00" : "#4a6070",
                    }}
                  >
                    {t.isLocked ? "Locked" : "Lock"}
                  </button>
                  <button
                    onClick={() => { pushHistory("reset"); resetTransform(activeSegmentId); }}
                    className="flex-1 py-1 rounded text-[10px] transition-all"
                    style={{ background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", color: "#ff4d4d" }}
                  >
                    Reset
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Snap controls */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid #1a1d24" }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Snap</p>
          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            className="relative w-8 h-4 rounded-full transition-all"
            style={{
              background: snapEnabled ? "rgba(0,229,255,0.3)" : "#1a1d24",
              border: `1px solid ${snapEnabled ? "rgba(0,229,255,0.5)" : "#2a3540"}`,
            }}
          >
            <span className="absolute top-0.5 w-3 h-3 rounded-full transition-all" style={{ left: snapEnabled ? "calc(100% - 14px)" : 2, background: snapEnabled ? "#00e5ff" : "#3a5060" }} />
          </button>
        </div>
        {snapEnabled && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span style={{ color: "#4a6070" }}>Translation (mm)</span>
              <div className="flex items-center gap-2">
                <Slider min={0.01} max={1} step={0.01} value={[snapTranslation]}
                  onValueChange={([v]) => setSnapTranslation(v)} className="w-16" />
                <span className="font-mono w-8 text-right" style={{ color: "#7fa8c0" }}>{snapTranslation.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: "#4a6070" }}>Rotation (°)</span>
              <div className="flex items-center gap-2">
                <Slider min={1} max={45} step={1} value={[snapRotation]}
                  onValueChange={([v]) => setSnapRotation(v)} className="w-16" />
                <span className="font-mono w-8 text-right" style={{ color: "#7fa8c0" }}>{snapRotation}°</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Collision */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid #1a1d24" }}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Collision Detection</p>
          <button
            onClick={() => setCollisionEnabled(!collisionEnabled)}
            className="relative w-8 h-4 rounded-full transition-all"
            style={{
              background: collisionEnabled ? "rgba(0,229,255,0.3)" : "#1a1d24",
              border: `1px solid ${collisionEnabled ? "rgba(0,229,255,0.5)" : "#2a3540"}`,
            }}
          >
            <span className="absolute top-0.5 w-3 h-3 rounded-full transition-all" style={{ left: collisionEnabled ? "calc(100% - 14px)" : 2, background: collisionEnabled ? "#00e5ff" : "#3a5060" }} />
          </button>
        </div>
        {collidingPairs.length > 0 && (
          <div className="mt-2 px-2 py-1.5 rounded" style={{ background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)" }}>
            <p className="text-[10px]" style={{ color: "#ff4d4d" }}>
              {collidingPairs.length} collision{collidingPairs.length > 1 ? "s" : ""} detected
            </p>
          </div>
        )}
      </div>

      {/* History */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#2a4050" }}>History</p>
        {history.length === 0 ? (
          <p style={{ color: "#1e2a33" }}>No history yet</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {[...history].reverse().map((entry, i) => {
              const realIdx = history.length - 1 - i;
              const isCurrent = realIdx === historyIndex;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 rounded"
                  style={{
                    background: isCurrent ? "rgba(0,229,255,0.06)" : "transparent",
                    color: isCurrent ? "#7fa8c0" : "#2a4050",
                  }}
                >
                  <span className="text-[10px]">{entry.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
