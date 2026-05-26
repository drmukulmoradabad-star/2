import { useLocation } from "wouter";
import { useState } from "react";

const SECTIONS = [
  {
    title: "Rendering",
    settings: [
      { key: "antialias", label: "Anti-aliasing", type: "toggle", default: true },
      { key: "shadows", label: "Dynamic Shadows", type: "toggle", default: true },
      { key: "dpr", label: "Device Pixel Ratio", type: "select", options: ["1x", "1.5x", "2x"], default: "2x" },
      { key: "fov", label: "Field of View", type: "range", min: 30, max: 90, default: 45 },
    ],
  },
  {
    title: "Mesh Display",
    settings: [
      { key: "defaultColor", label: "Default Mesh Color", type: "color", default: "#e8dcc8" },
      { key: "roughness", label: "Surface Roughness", type: "range", min: 0, max: 1, step: 0.05, default: 0.3 },
      { key: "wireframeOpacity", label: "Wireframe Opacity", type: "range", min: 0.01, max: 0.5, step: 0.01, default: 0.08 },
    ],
  },
  {
    title: "Lighting",
    settings: [
      { key: "ambientIntensity", label: "Ambient Light", type: "range", min: 0, max: 1, step: 0.05, default: 0.3 },
      { key: "keyIntensity", label: "Key Light Intensity", type: "range", min: 0, max: 2, step: 0.1, default: 1.2 },
      { key: "fillIntensity", label: "Fill Light Intensity", type: "range", min: 0, max: 1, step: 0.05, default: 0.4 },
      { key: "dentalLamp", label: "Dental Lamp Mode", type: "toggle", default: true },
    ],
  },
  {
    title: "Performance",
    settings: [
      { key: "lod", label: "Level of Detail", type: "toggle", default: false },
      { key: "frustumCulling", label: "Frustum Culling", type: "toggle", default: true },
      { key: "maxFileSize", label: "Max Upload Size (MB)", type: "range", min: 50, max: 500, step: 50, default: 500 },
    ],
  },
  {
    title: "Application",
    settings: [
      { key: "autosave", label: "Auto-save Measurements", type: "toggle", default: true },
      { key: "defaultUnit", label: "Default Unit", type: "select", options: ["mm", "cm", "inch"], default: "mm" },
      { key: "scannerModel", label: "Default Scanner Model", type: "text", default: "Helios 500" },
    ],
  },
];

export default function Settings() {
  const [, navigate] = useLocation();
  const [values, setValues] = useState<Record<string, any>>({});

  const getValue = (key: string, def: any) => (key in values ? values[key] : def);
  const setValue = (key: string, val: any) => setValues((prev) => ({ ...prev, [key]: val }));

  return (
    <div className="flex flex-col h-screen" style={{ background: "#0a0c10", color: "#c8d8e8" }}>
      <div
        className="flex items-center justify-between px-6 shrink-0"
        style={{ height: 52, background: "#0e1117", borderBottom: "1px solid #1e2530" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-[11px] flex items-center gap-1.5 transition-colors"
            style={{ color: "#4a6070" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#00e5ff")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#4a6070")}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8 2 L3 6 L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Viewer
          </button>
          <span style={{ color: "#1e2530" }}>/</span>
          <h1 className="text-sm font-semibold tracking-wide" style={{ color: "#c8d8e8" }}>Settings</h1>
        </div>
        <button
          onClick={() => navigate("/")}
          className="text-[11px] px-3 py-1.5 rounded transition-all"
          style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.3)", color: "#00e5ff" }}
        >
          Save & Close
        </button>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          {SECTIONS.map((section) => (
            <div key={section.title} className="rounded" style={{ background: "#0e1117", border: "1px solid #1e2530" }}>
              <div className="px-5 py-3" style={{ borderBottom: "1px solid #1a1d24" }}>
                <h2 className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "#4a6070" }}>
                  {section.title}
                </h2>
              </div>
              <div className="px-5 py-2 flex flex-col gap-0">
                {section.settings.map((setting) => (
                  <div
                    key={setting.key}
                    className="flex items-center justify-between py-3"
                    style={{ borderBottom: "1px solid #13161d" }}
                  >
                    <label className="text-[12px]" style={{ color: "#8098a8" }}>{setting.label}</label>
                    <div>
                      {setting.type === "toggle" && (
                        <button
                          onClick={() => setValue(setting.key, !getValue(setting.key, setting.default))}
                          className="relative w-10 h-5 rounded-full transition-all duration-200"
                          style={{
                            background: getValue(setting.key, setting.default) ? "rgba(0,229,255,0.3)" : "#1a1d24",
                            border: `1px solid ${getValue(setting.key, setting.default) ? "rgba(0,229,255,0.5)" : "#2a3540"}`,
                          }}
                        >
                          <span
                            className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
                            style={{
                              left: getValue(setting.key, setting.default) ? "calc(100% - 18px)" : 2,
                              background: getValue(setting.key, setting.default) ? "#00e5ff" : "#3a5060",
                            }}
                          />
                        </button>
                      )}
                      {setting.type === "range" && (
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={(setting as any).min}
                            max={(setting as any).max}
                            step={(setting as any).step || 1}
                            value={getValue(setting.key, setting.default)}
                            onChange={(e) => setValue(setting.key, Number(e.target.value))}
                            className="w-32"
                            style={{ accentColor: "#00e5ff" }}
                          />
                          <span className="text-[11px] font-mono w-8 text-right" style={{ color: "#7fa8c0" }}>
                            {getValue(setting.key, setting.default)}
                          </span>
                        </div>
                      )}
                      {setting.type === "select" && (
                        <select
                          value={getValue(setting.key, setting.default)}
                          onChange={(e) => setValue(setting.key, e.target.value)}
                          className="text-[11px] px-2 py-1 rounded outline-none"
                          style={{ background: "#13161d", border: "1px solid #2a3540", color: "#7fa8c0" }}
                        >
                          {(setting as any).options.map((opt: string) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}
                      {setting.type === "text" && (
                        <input
                          type="text"
                          value={getValue(setting.key, setting.default)}
                          onChange={(e) => setValue(setting.key, e.target.value)}
                          className="text-[11px] px-2 py-1 rounded outline-none w-32"
                          style={{ background: "#13161d", border: "1px solid #2a3540", color: "#7fa8c0" }}
                        />
                      )}
                      {setting.type === "color" && (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={getValue(setting.key, setting.default)}
                            onChange={(e) => setValue(setting.key, e.target.value)}
                            className="w-8 h-6 rounded cursor-pointer"
                            style={{ border: "1px solid #2a3540", background: "transparent" }}
                          />
                          <span className="text-[11px] font-mono" style={{ color: "#7fa8c0" }}>
                            {getValue(setting.key, setting.default)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
