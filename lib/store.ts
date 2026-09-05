"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage, Conversation } from "./types";

const uid = () => crypto.randomUUID();
const blankConversation = (): Conversation => {
  const now = Date.now();
  return { id: uid(), title: "New chat", createdAt: now, updatedAt: now, messages: [] };
};

type Theme = "dark" | "light";
type Engine = "auto" | "nexus" | "ollama" | "deerflow";

type Store = {
  conversations: Conversation[];
  activeId: string;
  theme: Theme;
  model: string;
  engine: Engine;
  systemPrompt: string;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  setTheme: (theme: Theme) => void;
  setModel: (model: string) => void;
  setEngine: (engine: Engine) => void;
  setSystemPrompt: (value: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  newChat: () => string;
  selectChat: (id: string) => void;
  deleteChat: (id: string) => void;
  clearActive: () => void;
  appendMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
};

const initial = blankConversation();

export const useChatStore = create<Store>()(
  persist(
    (set, get) => ({
      conversations: [initial],
      activeId: initial.id,
      theme: "dark",
      model: "",
      engine: "auto",
      systemPrompt: "You are Nexus, a capable local AI assistant. Be accurate, practical, and concise. Use tools when they materially improve the answer.",
      sidebarOpen: true,
      settingsOpen: false,
      setTheme: (theme) => set({ theme }),
      setModel: (model) => set({ model }),
      setEngine: (engine) => set({ engine }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      newChat: () => {
        const chat = blankConversation();
        set((s) => ({ conversations: [chat, ...s.conversations], activeId: chat.id }));
        return chat.id;
      },
      selectChat: (activeId) => set({ activeId }),
      deleteChat: (id) => {
        const remaining = get().conversations.filter((c) => c.id !== id);
        if (remaining.length) {
          set({ conversations: remaining, activeId: get().activeId === id ? remaining[0].id : get().activeId });
        } else {
          const chat = blankConversation();
          set({ conversations: [chat], activeId: chat.id });
        }
      },
      clearActive: () => set((s) => ({
        conversations: s.conversations.map((c) => c.id === s.activeId ? { ...c, title: "New chat", messages: [], updatedAt: Date.now() } : c),
      })),
      appendMessage: (message) => set((s) => ({
        conversations: s.conversations.map((c) => {
          if (c.id !== s.activeId) return c;
          const title = c.messages.length === 0 && message.role === "user"
            ? message.content.trim().slice(0, 42) || "New chat"
            : c.title;
          return { ...c, title, messages: [...c.messages, message], updatedAt: Date.now() };
        }),
      })),
      updateMessage: (id, patch) => set((s) => ({
        conversations: s.conversations.map((c) => c.id === s.activeId
          ? { ...c, messages: c.messages.map((m) => m.id === id ? { ...m, ...patch } : m), updatedAt: Date.now() }
          : c),
      })),
    }),
    {
      name: "nexus-gemini-store-v1",
      partialize: (s) => ({
        conversations: s.conversations,
        activeId: s.activeId,
        theme: s.theme,
        model: s.model,
        engine: s.engine,
        systemPrompt: s.systemPrompt,
      }),
    }
  )
);
