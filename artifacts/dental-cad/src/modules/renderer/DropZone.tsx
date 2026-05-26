import { useState, useCallback } from "react";
import { useViewerStore } from "@/store/viewerStore";

interface DropZoneProps {
  onFileLoad: (file: File) => void;
}

export default function DropZone({ onFileLoad }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const geometry = useViewerStore((s) => s.geometry);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileLoad(file);
  }, [onFileLoad]);

  if (geometry) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ pointerEvents: "auto" }}
    >
      <div
        className="flex flex-col items-center gap-4 p-12 rounded-lg transition-all duration-200"
        style={{
          border: `2px dashed ${isDragging ? "#00e5ff" : "rgba(0,229,255,0.2)"}`,
          background: isDragging ? "rgba(0,229,255,0.05)" : "rgba(14,17,23,0.6)",
          transform: isDragging ? "scale(1.02)" : "scale(1)",
        }}
      >
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <path d="M32 8 L20 24 H28 V40 H36 V24 H44 Z" fill="rgba(0,229,255,0.4)" />
          <rect x="12" y="48" width="40" height="4" rx="2" fill="rgba(0,229,255,0.2)" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-semibold tracking-widest uppercase" style={{ color: "#00e5ff" }}>
            Drop Scan File
          </p>
          <p className="text-xs mt-1" style={{ color: "#4a6070" }}>
            STL &bull; OBJ &bull; PLY
          </p>
          <p className="text-xs mt-3" style={{ color: "#2a3a48" }}>
            Helios 500 &bull; iTero &bull; 3Shape &bull; Carestream
          </p>
        </div>
        <label
          className="px-4 py-2 text-xs font-semibold tracking-wider rounded cursor-pointer transition-all duration-150"
          style={{
            background: "rgba(0,229,255,0.12)",
            border: "1px solid rgba(0,229,255,0.4)",
            color: "#00e5ff",
          }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.background = "rgba(0,229,255,0.2)")}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.background = "rgba(0,229,255,0.12)")}
        >
          Browse Files
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
