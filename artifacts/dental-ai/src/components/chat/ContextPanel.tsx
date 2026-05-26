import React from 'react';
import { Layers, Cuboid, Activity, BoxSelect, ScanLine, BrainCircuit } from 'lucide-react';

const DOMAINS = [
  { name: 'Orthodontics', icon: Activity, desc: 'Biomechanics & Movement' },
  { name: 'Prosthodontics', icon: Layers, desc: 'Restorative Planning' },
  { name: 'Cephalometrics', icon: ScanLine, desc: 'Analysis & Tracing' },
  { name: 'Clear Aligners', icon: BrainCircuit, desc: 'Staging & Protocols' },
  { name: 'STL Workflows', icon: BoxSelect, desc: 'Mesh Preparation' },
  { name: '3D Printing', icon: Cuboid, desc: 'Resin & Support Generation' },
];

export function ContextPanel() {
  return (
    <div className="w-64 border-l border-border/50 bg-card hidden lg:flex flex-col">
      <div className="p-4 border-b border-border/50">
        <h3 className="font-mono text-xs font-semibold text-primary uppercase tracking-wider">AI Knowledge Domains</h3>
      </div>
      <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin">
        {DOMAINS.map((domain) => {
          const Icon = domain.icon;
          return (
            <div key={domain.name} className="flex gap-3 items-start group">
              <div className="p-2 rounded bg-secondary text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground">{domain.name}</h4>
                <p className="text-xs text-muted-foreground">{domain.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-auto p-4 border-t border-border/50 bg-secondary/20">
        <p className="text-xs text-muted-foreground leading-relaxed">
          The assistant references current clinical guidelines and your patient's 3D mesh data for contextual accuracy.
        </p>
      </div>
    </div>
  );
}
