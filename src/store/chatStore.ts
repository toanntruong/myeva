import { create } from 'zustand';
import type { Message } from '../types';

interface ChatStore {
  messages: Message[];
  appendMessage: (message: Message) => void;
  clearHistory: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearHistory: () => set({ messages: [] }),
}));
