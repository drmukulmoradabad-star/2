import React from "react";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "../../store/use-app-store";
import { cn } from "../../lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { chairsideMode } = useAppStore();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      <Sidebar />
      <main className={cn(
        "flex-1 relative flex flex-col h-full overflow-hidden transition-all duration-300",
        chairsideMode ? "text-lg" : "text-base"
      )}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
        <div className="relative z-10 flex-1 h-full w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
