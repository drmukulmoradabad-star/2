import React, { useState, useEffect, useRef } from 'react';
import { useGetOpenaiConversation, useCreateOpenaiConversation } from '@workspace/api-client-react';
import { useAppStore } from '../store/use-app-store';
import { useChatStream } from '../hooks/use-chat-stream';
import { ChatMessage } from '../components/chat/ChatMessage';
import { ChatInput } from '../components/chat/ChatInput';
import { QuickPrompts } from '../components/chat/QuickPrompts';
import { ContextPanel } from '../components/chat/ContextPanel';
import { BrainCircuit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const { activeConversationId, setActiveConversationId } = useAppStore();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const createConvMutation = useCreateOpenaiConversation();

  const { data: conversation, isLoading: isLoadingConv } = useGetOpenaiConversation(
    activeConversationId as number,
    { query: { enabled: !!activeConversationId, queryKey: ['openai', 'conversations', activeConversationId] } }
  );

  const { isStreaming, streamedContent, sendMessage, stopStreaming } = useChatStream(activeConversationId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages, streamedContent]);

  const handleSend = async (text: string) => {
    setInputValue('');
    try {
      let convId = activeConversationId;
      if (!convId) {
        // Create new conversation
        const title = text.slice(0, 30) + (text.length > 30 ? '...' : '');
        const newConv = await createConvMutation.mutateAsync({ data: { title } });
        convId = newConv.id;
        setActiveConversationId(newConv.id);
      }
      
      await sendMessage(text, convId!);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to initialize conversation.', variant: 'destructive' });
    }
  };

  const messages = conversation?.messages || [];

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex-1 flex flex-col h-full bg-background relative">
        {/* Header */}
        <div className="h-14 border-b border-border/50 flex items-center px-6 bg-card shrink-0 z-10">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-primary" />
            {conversation ? conversation.title : 'New Consultation'}
          </h2>
          {conversation && (
            <span className="ml-auto text-xs text-muted-foreground font-mono bg-secondary px-2 py-1 rounded">
              ID: {conversation.id}
            </span>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <BrainCircuit className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">OrthoCAD Assistant</h1>
              <p className="text-muted-foreground max-w-md mb-8">
                Clinical-grade AI ready to assist with treatment planning, cephalometrics, and CAD workflows.
              </p>
              <QuickPrompts onSelect={(p) => handleSend(p)} />
            </div>
          )}

          <div className="max-w-4xl mx-auto pb-4">
            {messages.map((msg: any) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            
            {isStreaming && streamedContent && (
              <ChatMessage 
                message={{ role: 'assistant', content: streamedContent }} 
                isStreaming={true} 
              />
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-border/50 bg-background shrink-0">
          <ChatInput 
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            isStreaming={isStreaming}
            onStopStreaming={stopStreaming}
            disabled={createConvMutation.isPending || isLoadingConv}
          />
        </div>
      </div>

      <ContextPanel />
    </div>
  );
}
