import React, { useState } from 'react';
import { useListOpenaiConversations, useDeleteOpenaiConversation, getListOpenaiConversationsQueryKey } from '@workspace/api-client-react';
import { useAppStore } from '../store/use-app-store';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { MessageSquare, Trash2, Search, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';

export default function History() {
  const { data: conversations, isLoading } = useListOpenaiConversations();
  const deleteMutation = useDeleteOpenaiConversation();
  const { setActiveConversationId, activeConversationId } = useAppStore();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const filtered = conversations?.filter(c => c.title.toLowerCase().includes(search.toLowerCase())) || [];

  const handleSelect = (id: number) => {
    setActiveConversationId(id);
    setLocation('/');
  };

  const handleNew = () => {
    setActiveConversationId(null);
    setLocation('/');
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm('Delete this conversation?')) {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-background p-6 lg:p-10 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Consultation History</h1>
          <p className="text-muted-foreground mt-1">Review previous CAD and treatment planning sessions.</p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium text-sm shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Consultation
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations by title..."
          className="pl-9 bg-card border-border/50 max-w-md"
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 bg-card border border-border/50 rounded-lg shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading history...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <MessageSquare className="h-8 w-8 mb-3 opacity-20" />
            <p>No conversations found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((conv) => (
              <div 
                key={conv.id}
                onClick={() => handleSelect(conv.id)}
                className="flex items-center justify-between p-4 hover:bg-secondary/50 cursor-pointer transition-colors group"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-secondary rounded-md text-primary mt-0.5">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {conv.title || 'Untitled Consultation'}
                    </h3>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                      <span>{format(new Date(conv.createdAt), 'MMM d, yyyy • h:mm a')}</span>
                      <span className="font-mono bg-secondary/80 px-1.5 py-0.5 rounded">ID: {conv.id}</span>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                  title="Delete conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
