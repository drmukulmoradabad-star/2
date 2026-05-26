import React from 'react';

const PROMPTS = [
  "Explain tooth movement",
  "Aligner staging help",
  "Cephalometric analysis",
  "STL workflow",
  "Treatment planning"
];

interface QuickPromptsProps {
  onSelect: (prompt: string) => void;
}

export function QuickPrompts({ onSelect }: QuickPromptsProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center max-w-4xl mx-auto px-4 py-2">
      {PROMPTS.map((prompt) => (
        <button
          key={prompt}
          onClick={() => onSelect(prompt)}
          className="px-3 py-1.5 rounded-full text-xs font-medium border border-border/50 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors whitespace-nowrap"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
