import React from 'react';
import { useAppStore } from '../store/use-app-store';
import { Settings2, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function Settings() {
  const { chairsideMode, toggleChairsideMode } = useAppStore();

  return (
    <div className="flex flex-col h-full bg-background p-6 lg:p-10 max-w-4xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground tracking-tight flex items-center gap-3">
          <Settings2 className="h-8 w-8 text-primary" />
          System Settings
        </h1>
        <p className="text-muted-foreground mt-1">Configure OrthoCAD AI preferences and environment.</p>
      </div>

      <div className="space-y-6">
        {/* Chairside Mode */}
        <div className="p-6 border border-border/50 bg-card rounded-lg flex items-start gap-4 shadow-sm">
          <div className="p-2 bg-primary/10 rounded-md">
            <MonitorSmartphone className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="chairside" className="text-lg font-medium text-foreground cursor-pointer">
                  Chairside Mode
                </Label>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                  Enables a larger, full-screen interface with increased text size and hidden complex sidebars. Ideal for viewing at a distance during patient consultations.
                </p>
              </div>
              <Switch 
                id="chairside" 
                checked={chairsideMode}
                onCheckedChange={toggleChairsideMode}
              />
            </div>
          </div>
        </div>

        {/* Access Control (Mock) */}
        <div className="p-6 border border-border/50 bg-card rounded-lg flex items-start gap-4 shadow-sm opacity-80">
          <div className="p-2 bg-orange-500/10 rounded-md">
            <ShieldCheck className="h-6 w-6 text-orange-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-lg font-medium text-foreground">
                  Admin Access Level
                </Label>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                  Current user has full administrative privileges. Able to clear history, view all patient meshes, and access experimental CAD features.
                </p>
              </div>
              <div className="bg-orange-500/10 text-orange-500 px-3 py-1 rounded text-xs font-mono font-bold">
                VERIFIED
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
