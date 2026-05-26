import React, { useRef, useEffect } from 'react';
import { Send, Mic, MicOff, StopCircle } from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store/use-app-store';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStopStreaming?: () => void;
  value: string;
  onChange: (val: string) => void;
}

export function ChatInput({ onSend, disabled, isStreaming, onStopStreaming, value, onChange }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { chairsideMode } = useAppStore();
  const { isListening, transcript, toggleListening, isSupported } = useSpeechRecognition();

  useEffect(() => {
    if (transcript) {
      onChange(value ? `${value} ${transcript}` : transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      if (value.trim() && !disabled && !isStreaming) {
        onSend(value);
      }
    }
  };

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    autoResize();
  }, [value]);

  return (
    <div className="relative w-full max-w-4xl mx-auto flex flex-col gap-2 p-4 bg-background">
      <div className={cn(
        "relative flex items-end gap-2 rounded-lg border border-border bg-card p-2 shadow-sm focus-within:ring-1 focus-within:ring-primary transition-all",
        isListening && "ring-1 ring-red-500 border-red-500"
      )}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask OrthoCAD AI a question... (Ctrl + Enter to send)"
          className={cn(
            "w-full resize-none bg-transparent px-3 py-2 focus:outline-none scrollbar-thin text-foreground placeholder:text-muted-foreground",
            chairsideMode ? "min-h-[80px] text-lg" : "min-h-[60px] text-sm"
          )}
          disabled={disabled}
        />
        
        <div className="flex shrink-0 items-center gap-2 pb-2 pr-2">
          {isSupported && (
            <button
              onClick={toggleListening}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                isListening ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              )}
              title={isListening ? "Stop listening" : "Start voice input"}
            >
              {isListening ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
            </button>
          )}

          {isStreaming ? (
            <button
              onClick={onStopStreaming}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-colors"
              title="Stop generating"
            >
              <StopCircle className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                if (value.trim() && !disabled) onSend(value);
              }}
              disabled={!value.trim() || disabled}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
              title="Send message (Ctrl+Enter)"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex justify-between px-2 text-xs text-muted-foreground font-mono">
        <span>{isListening ? 'Listening...' : 'Ready'}</span>
        <span>{value.length} chars</span>
      </div>
    </div>
  );
}
