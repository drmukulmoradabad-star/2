import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  chairsideMode: boolean;
  toggleChairsideMode: () => void;
  activeConversationId: number | null;
  setActiveConversationId: (id: number | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      chairsideMode: false,
      toggleChairsideMode: () => set((state) => ({ chairsideMode: !state.chairsideMode })),
      activeConversationId: null,
      setActiveConversationId: (id) => set({ activeConversationId: id }),
    }),
    {
      name: 'dental-ai-storage',
    }
  )
);
