import React from "react";
import { Link, useLocation } from "wouter";
import { useAppStore } from "../../store/use-app-store";
import { Settings, MessageSquare, History, ShieldAlert, Cpu } from "lucide-react";
import { cn } from "../../lib/utils";
import { Badge } from "@/components/ui/badge";

export function Sidebar() {
  const [location] = useLocation();
  const { chairsideMode } = useAppStore();

  const links = [
    { href: "/", label: "Terminal", icon: MessageSquare },
    { href: "/history", label: "History", icon: History },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className={cn(
      "flex flex-col border-r border-border/50 bg-card z-10 transition-all duration-300",
      chairsideMode ? "w-20" : "w-64"
    )}>
      <div className="flex h-14 items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
          <Cpu className="h-6 w-6 text-primary shrink-0" />
          {!chairsideMode && <span className="font-mono font-bold tracking-tight text-lg text-primary">OrthoCAD AI</span>}
        </div>
      </div>
      
      <div className="p-4 flex-1">
        <nav className="flex flex-col gap-2">
          {links.map((link) => {
            const isActive = location === link.href;
            const Icon = link.icon;
            
            return (
              <Link 
                key={link.href} 
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent/10 hover:text-accent",
                  isActive ? "bg-accent/15 text-accent" : "text-muted-foreground",
                  chairsideMode ? "justify-center" : ""
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!chairsideMode && <span>{link.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 mt-auto border-t border-border/50">
        {!chairsideMode ? (
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-mono font-medium text-orange-500">ADMIN MODE</span>
             </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
          </div>
        )}
      </div>
    </aside>
  );
}
