import React, { useState } from 'react';
import { Copy, User, Cpu, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { OpenaiMessage } from '@workspace/api-client-react';
import { useAppStore } from '../../store/use-app-store';

interface ChatMessageProps {
  message: OpenaiMessage | { role: string; content: string; id?: number };
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const { chairsideMode } = useAppStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      "group relative flex w-full gap-4 px-4 py-6 border-b border-border/30",
      isUser ? "bg-background" : "bg-card/50",
      chairsideMode ? "text-lg" : "text-sm"
    )}>
      <div className={cn(
        "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border shadow-sm",
        isUser ? "bg-secondary border-border" : "bg-primary border-primary-foreground/20 text-primary-foreground"
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Cpu className="h-4 w-4" />}
      </div>
      <div className="flex-1 space-y-2 overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground/80">
            {isUser ? 'Doctor' : 'OrthoCAD AI'}
          </span>
        </div>
        <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-secondary prose-pre:border prose-pre:border-border">
          <div className="whitespace-pre-wrap break-words leading-relaxed text-foreground">
            {message.content}
            {isStreaming && (
              <span className="ml-1 inline-block w-2 h-4 bg-primary animate-pulse align-middle" />
            )}
          </div>
        </div>
      </div>
      {!isUser && !isStreaming && (
        <button
          onClick={handleCopy}
          className="absolute right-4 top-6 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-muted-foreground hover:text-primary rounded-md hover:bg-secondary"
          title="Copy response"
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
