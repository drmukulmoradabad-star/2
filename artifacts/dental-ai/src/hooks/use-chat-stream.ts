import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetOpenaiConversationQueryKey, getListOpenaiConversationsQueryKey } from '@workspace/api-client-react';
import { OpenaiMessage } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

export function useChatStream(conversationId: number | null) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(async (content: string, convId: number) => {
    if (!content.trim() || !convId) return;

    setIsStreaming(true);
    setStreamedContent('');
    
    // Add user message optimistically
    const queryKey = getGetOpenaiConversationQueryKey(convId);
    
    // Update local cache to show the user's message immediately
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old) return old;
      const optimisticMsg = {
        id: Date.now(),
        conversationId: convId,
        role: 'user',
        content,
        createdAt: new Date().toISOString()
      };
      return { ...old, messages: [...old.messages, optimisticMsg] };
    });

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/openai/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.content) {
                assistantContent += data.content;
                setStreamedContent(assistantContent);
              }
            } catch (e) {
              console.error('Error parsing SSE data', e);
            }
          }
        }
      }

      // Stream complete, invalidate queries to get the actual persisted messages
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Stream aborted');
      } else {
        toast({
          title: 'Error',
          description: 'Failed to stream response from AI.',
          variant: 'destructive',
        });
        console.error(error);
      }
    } finally {
      setIsStreaming(false);
      setStreamedContent('');
      abortControllerRef.current = null;
    }
  }, [queryClient, toast]);

  return {
    isStreaming,
    streamedContent,
    sendMessage,
    stopStreaming
  };
}
