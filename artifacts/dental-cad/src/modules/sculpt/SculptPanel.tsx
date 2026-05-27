/**
 * SculptPanel — professional sculpting tool UI matching 3Shape / exocad aesthetics.
 * Controls: tool selection, brush radius/strength/falloff, symmetry, undo.
 */

import { useCallback } from "react";
import { useSculptStore } from "./sculptStore";
import { useViewerStore } from "@/store/viewerStore";
import { Slider } from "@/components/ui/slider";
import type { SculptTool, FalloffCurve } from "./SculptEngine";

// ─── Style helpers ─────────────────────────────────────────────────────────────

const SECTION_HDR = "text-[9px] uppercase tracking-[0.15em] font-semibold mb-2";
const DIVIDER = "my-3 border-t border-[#1a1d24]";

function Toggle({
  value, onChange, label,
}: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px]" style={{ color: "#4a6070" }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        className="relative w-9 h-5 rounded-full transition-all"
        style={{
          background: value ? "rgba(0,229,255,0.2)" : "#0e1117",
          border: `1px solid ${value ? "rgba(0,229,255,0.5)" : "#1e2530"}`,
        }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
          style={{
            left: value ? "calc(100% - 18px)" : 2,
            background: value ? "#00e5ff" : "#2a3a4a",
          }}
        />
      </button>
    </div>
  );
}

// ─── Tool definition ──────────────────────────────────────────────────────────

interface ToolDef {
  id: SculptTool;
  label: string;
  shortcut: string;
  description: string;
  icon: React.ReactNode;
}

const TOOLS: ToolDef[] = [
  {
    id: "grab",
    label: "Grab",
    shortcut: "G",
    description: "Drag surface region with soft-selection falloff",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <path d="M5 4v5M7.5 3v6M10 4v5M12.5 5.5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M5 9a2.5 2.5 0 002.5 2.5h2.5A2.5 2.5 0 0015 9" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: "smooth",
    label: "Smooth",
    shortcut: "S",
    description: "Laplacian surface relaxation",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <path d="M2 10 Q5 4 8 8 Q11 12 14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M2 12 Q5 8 8 10 Q11 12 14 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.5"/>
      </svg>
    ),
  },
  {
    id: "inflate",
    label: "Inflate",
    shortcut: "I",
    description: "Push surface outward along normals",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/>
      </svg>
    ),
  },
  {
    id: "deflate",
    label: "Deflate",
    shortcut: "D",
    description: "Push surface inward along normals",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/>
      </svg>
    ),
  },
  {
    id: "flatten",
    label: "Flatten",
    shortcut: "F",
    description: "Project region onto hit plane",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <path d="M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M4 5 Q8 3 12 5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.6"/>
        <path d="M4 11 Q8 13 12 11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.6"/>
      </svg>
    ),
  },
  {
    id: "relax",
    label: "Relax",
    shortcut: "R",
    description: "Equalize edge lengths — surface fairing",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <path d="M3 13 L8 3 L13 13Z" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.6"/>
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    ),
  },
  {
    id: "pinch",
    label: "Pinch",
    shortcut: "P",
    description: "Pull vertices toward brush center",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <path d="M3 4 L8 8 L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M3 12 L8 8 L13 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </svg>
    ),
  },
  {
    id: "pull",
    label: "Pull",
    shortcut: "U",
    description: "Pull surface outward along normal direction",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <path d="M8 12 L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M5 7 L8 4 L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M4 12 Q8 10 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.5"/>
      </svg>
    ),
  },
  {
    id: "push",
    label: "Push",
    shortcut: "H",
    description: "Push surface inward along normal direction",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <path d="M8 4 L8 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M5 9 L8 12 L11 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M4 4 Q8 6 12 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.5"/>
      </svg>
    ),
  },
];

const FALLOFF_OPTIONS: { id: FalloffCurve; label: string }[] = [
  { id: "smooth",   label: "Smooth" },
  { id: "linear",   label: "Linear" },
  { id: "sharp",    label: "Sharp" },
  { id: "constant", label: "Const" },
];

// ─── Falloff curve preview ─────────────────────────────────────────────────────

function FalloffPreview({ curve }: { curve: FalloffCurve }) {
  const points: string[] = [];
  const W = 48, H = 20;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    let y: number;
    switch (curve) {
      case "linear":   y = t; break;
      case "smooth":   y = t * t * (3 - 2 * t); break;
      case "sharp":    y = t * t; break;
      case "constant": y = 0; break;
    }
    points.push(`${(t * W).toFixed(1)},${((1 - y) * H).toFixed(1)}`);
  }
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#00e5ff"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <line x1="0" y1={H} x2={W} y2={H} stroke="#1e2530" strokeWidth="0.5" />
    </svg>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────────────

export default function SculptPanel() {
  const {
    activeSculptTool, setActiveSculptTool,
    brushRadius, setBrushRadius,
    brushStrength, setBrushStrength,
    brushFalloff, setBrushFalloff,
    symmetryEnabled, setSymmetryEnabled,
    symmetryAxis, setSymmetryAxis,
    undoStack, redoStack,
    strokeCount,
  } = useSculptStore();

  const { activeTool, setActiveTool } = useViewerStore();
  const isSculptMode = activeTool === "sculpt";

  const toggleSculptMode = useCallback(() => {
    if (isSculptMode) {
      setActiveTool("orbit");
      setActiveSculptTool(null);
    } else {
      setActiveTool("sculpt");
      if (!activeSculptTool) setActiveSculptTool("smooth");
    }
  }, [isSculptMode, activeSculptTool]);

  const selectTool = useCallback(
    (id: SculptTool) => {
      setActiveSculptTool(id);
      if (!isSculptMode) setActiveTool("sculpt");
    },
    [isSculptMode]
  );

  return (
    <div className="flex flex-col h-full text-[11px] overflow-y-auto" style={{ color: "#c8d8e8" }}>
      {/* ── Header / Mode toggle ──────────────────────────────────────────── */}
      <div
        className="px-3 py-2 shrink-0 flex items-center justify-between"
        style={{ borderBottom: "1px solid #1e2530", background: "#0a0c10" }}
      >
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>Sculpt</p>
          {isSculptMode && (
            <p className="text-[9px] mt-0.5" style={{ color: "#3a8060" }}>
              {strokeCount} stroke{strokeCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {undoStack.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#13161d", color: "#4a6070", border: "1px solid #1e2530" }}>
              Ctrl+Z undo ({undoStack.length})
            </span>
          )}
          <button
            onClick={toggleSculptMode}
            className="text-[10px] px-3 py-1 rounded font-semibold transition-all"
            style={{
              background: isSculptMode ? "rgba(0,229,255,0.15)" : "#13161d",
              border: `1px solid ${isSculptMode ? "rgba(0,229,255,0.5)" : "#1e2530"}`,
              color: isSculptMode ? "#00e5ff" : "#4a6070",
            }}
          >
            {isSculptMode ? "Active" : "Enable"}
          </button>
        </div>
      </div>

      <div className="p-3">
        {/* ── Tool Grid ─────────────────────────────────────────────────── */}
        <p className={SECTION_HDR} style={{ color: "#2a4050" }}>Sculpt Tools</p>
        <div className="grid grid-cols-3 gap-1 mb-1">
          {TOOLS.map((tool) => {
            const active = isSculptMode && activeSculptTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => selectTool(tool.id)}
                title={`${tool.description} [${tool.shortcut}]`}
                className="flex flex-col items-center gap-1 py-2 rounded transition-all"
                style={{
                  background: active ? "rgba(0,229,255,0.12)" : "#0e1117",
                  border: `1px solid ${active ? "rgba(0,229,255,0.4)" : "#1a1d24"}`,
                  color: active ? "#00e5ff" : "#4a6070",
                }}
              >
                <span className={active ? "text-[#00e5ff]" : "text-[#3a5060]"}>{tool.icon}</span>
                <span className="text-[9px] uppercase tracking-wider">{tool.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active tool hint */}
        {isSculptMode && activeSculptTool && (
          <div
            className="mb-3 px-2 py-1.5 rounded text-[9px] leading-relaxed"
            style={{ background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.12)", color: "#4a7080" }}
          >
            {TOOLS.find((t) => t.id === activeSculptTool)?.description}
          </div>
        )}

        <div className={DIVIDER} />

        {/* ── Brush Settings ───────────────────────────────────────────── */}
        <p className={SECTION_HDR} style={{ color: "#2a4050" }}>Brush</p>

        <div className="flex flex-col gap-2.5 mb-3">
          {/* Radius */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] shrink-0" style={{ color: "#4a6070" }}>Radius</span>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <Slider
                min={0.05} max={3} step={0.05}
                value={[brushRadius]}
                onValueChange={([v]) => setBrushRadius(v)}
                className="w-24"
              />
              <span className="font-mono text-[10px] w-10 text-right" style={{ color: "#7fa8c0" }}>
                {brushRadius.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Strength */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] shrink-0" style={{ color: "#4a6070" }}>Strength</span>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <Slider
                min={0.01} max={1} step={0.01}
                value={[brushStrength]}
                onValueChange={([v]) => setBrushStrength(v)}
                className="w-24"
              />
              <span className="font-mono text-[10px] w-10 text-right" style={{ color: "#7fa8c0" }}>
                {(brushStrength * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Falloff selector */}
        <div className="mb-3">
          <p className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: "#2a3a48" }}>Falloff Curve</p>
          <div className="grid grid-cols-4 gap-1">
            {FALLOFF_OPTIONS.map(({ id, label }) => {
              const active = brushFalloff === id;
              return (
                <button
                  key={id}
                  onClick={() => setBrushFalloff(id)}
                  className="flex flex-col items-center gap-1 py-1.5 rounded transition-all"
                  style={{
                    background: active ? "rgba(0,229,255,0.08)" : "transparent",
                    border: `1px solid ${active ? "rgba(0,229,255,0.3)" : "#1a1d24"}`,
                  }}
                >
                  <FalloffPreview curve={id} />
                  <span
                    className="text-[8px] uppercase tracking-wider"
                    style={{ color: active ? "#00e5ff" : "#3a5060" }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={DIVIDER} />

        {/* ── Symmetry ─────────────────────────────────────────────────── */}
        <p className={SECTION_HDR} style={{ color: "#2a4050" }}>Symmetry</p>
        <div className="flex flex-col gap-2 mb-3">
          <Toggle
            label="Mirror Symmetry"
            value={symmetryEnabled}
            onChange={setSymmetryEnabled}
          />
          {symmetryEnabled && (
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: "#4a6070" }}>Mirror Axis</span>
              <div className="flex gap-1">
                {(["x", "y", "z"] as const).map((ax) => (
                  <button
                    key={ax}
                    onClick={() => setSymmetryAxis(ax)}
                    className="w-7 h-6 rounded text-[10px] font-mono font-bold uppercase transition-all"
                    style={{
                      background: symmetryAxis === ax ? "rgba(0,229,255,0.15)" : "#13161d",
                      border: `1px solid ${symmetryAxis === ax ? "rgba(0,229,255,0.4)" : "#1e2530"}`,
                      color: symmetryAxis === ax ? "#00e5ff" : "#4a6070",
                    }}
                  >
                    {ax}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={DIVIDER} />

        {/* ── Tips ─────────────────────────────────────────────────────── */}
        <div className="rounded p-2" style={{ background: "#0a0c10", border: "1px solid #1a1d24" }}>
          <p className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: "#2a3a48" }}>Shortcuts</p>
          {[
            ["LMB drag", "Apply brush stroke"],
            ["Ctrl+Z", "Undo stroke"],
            ["Ctrl+Y", "Redo stroke"],
            ["Scroll", "Adjust radius (hold Shift)"],
          ].map(([key, desc]) => (
            <div key={key} className="flex justify-between py-0.5">
              <span className="font-mono text-[9px]" style={{ color: "#3a6070" }}>{key}</span>
              <span className="text-[9px]" style={{ color: "#2a3a48" }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
