import { useViewerStore, ToolType } from "@/store/viewerStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TOOLS: { id: ToolType; label: string; shortcut: string; icon: React.ReactNode }[] = [
  {
    id: "orbit",
    label: "Orbit / Pan",
    shortcut: "Q",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M4 8 Q8 4 12 8 Q8 12 4 8Z" fill="currentColor" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: "select",
    label: "Select",
    shortcut: "W",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M3 2 L3 13 L6 10 L8 14 L10 13 L8 9 L12 9 Z" stroke="currentColor" strokeWidth="0.5" />
      </svg>
    ),
  },
  {
    id: "measure_distance",
    label: "Measure Distance",
    shortcut: "E",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
        <line x1="2" y1="5" x2="2" y2="11" stroke="currentColor" strokeWidth="1.5" />
        <line x1="14" y1="5" x2="14" y2="11" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: "measure_angle",
    label: "Measure Angle",
    shortcut: "R",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M3 13 L3 3 L13 13" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M3 9 Q7 7 10 10" stroke="currentColor" strokeWidth="1" fill="none" strokeDasharray="2 1" />
      </svg>
    ),
  },
  {
    id: "annotate",
    label: "Annotate",
    shortcut: "A",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <line x1="8" y1="9" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: "segment",
    label: "Segmentation",
    shortcut: "S",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="2" y="2" width="5" height="5" rx="1" opacity="0.7" />
        <rect x="9" y="2" width="5" height="5" rx="1" opacity="0.4" fill="#00c8ff" />
        <rect x="2" y="9" width="5" height="5" rx="1" opacity="0.4" fill="#4dffb8" />
        <rect x="9" y="9" width="5" height="5" rx="1" opacity="0.7" fill="#ffcc00" />
      </svg>
    ),
  },
  {
    id: "align",
    label: "Tooth Movement",
    shortcut: "M",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="5" y="5" width="6" height="6" rx="1" />
        <path d="M8 2 L8 4M8 12 L8 14M2 8 L4 8M12 8 L14 8" strokeLinecap="round" />
        <path d="M8 2 L7 3.5M8 2 L9 3.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "section",
    label: "Section Plane",
    shortcut: "X",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M2 4 L14 4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 8 L14 8" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2" />
        <path d="M2 12 L14 12" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

interface ToolBarProps {
  onToolChange?: (tool: ToolType) => void;
}

export default function ToolBar({ onToolChange }: ToolBarProps) {
  const activeTool = useViewerStore((s) => s.activeTool);
  const setActiveTool = useViewerStore((s) => s.setActiveTool);

  const handleToolClick = (tool: ToolType) => {
    setActiveTool(tool);
    onToolChange?.(tool);
  };

  return (
    <div
      className="flex flex-col gap-1 py-3 px-1.5"
      style={{
        background: "#0e1117",
        borderRight: "1px solid #1e2530",
        width: 48,
        minHeight: 0,
      }}
    >
      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <Tooltip key={tool.id} delayDuration={400}>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleToolClick(tool.id)}
                className="relative w-9 h-9 flex items-center justify-center rounded transition-all duration-150"
                style={{
                  background: isActive ? "rgba(0,229,255,0.15)" : "transparent",
                  border: `1px solid ${isActive ? "rgba(0,229,255,0.5)" : "transparent"}`,
                  color: isActive ? "#00e5ff" : "#4a6070",
                  boxShadow: isActive ? "0 0 8px rgba(0,229,255,0.2)" : "none",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.color = "#7fa8c0";
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.color = "#4a6070";
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }
                }}
              >
                {tool.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs" style={{ background: "#1a1d24", border: "1px solid #2a3540", color: "#c8d8e8" }}>
              <span className="font-medium">{tool.label}</span>
              <span className="ml-2 text-[10px]" style={{ color: "#4a6070" }}>[{tool.shortcut}]</span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
