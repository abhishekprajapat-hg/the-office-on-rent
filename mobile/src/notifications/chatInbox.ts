import { useSyncExternalStore } from "react";
import { listConversations } from "../api/chat";

/*
 * How many chat messages are waiting, for the chat icon on Home and the More
 * tile, plus which conversation is open right now - a message in the room
 * someone is reading is neither unread nor worth an alert.
 */
let unread = 0;
let activeRoom: string | null = null;
const seen = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

const set = (count: number) => {
  const next = Math.max(0, count);
  if (next === unread) return;
  unread = next;
  emit();
};

export const chatInbox = {
  activeRoom: () => activeRoom,
  setActiveRoom: (roomId: string | null) => {
    activeRoom = roomId;
  },
  set,
  /* A message arrived over the socket. The same message can come twice (room and user channels). */
  bump: (roomId: string, messageId: string) => {
    if (!roomId || roomId === activeRoom || (messageId && seen.has(messageId))) return;
    if (messageId) seen.add(messageId);
    set(unread + 1);
  },
  refresh: async () => {
    try {
      const rooms = await listConversations();
      set(rooms.reduce((sum, room) => sum + (room.unreadCount || 0), 0));
    } catch {
      // Offline or signed out: keep the last count.
    }
  },
  reset: () => {
    activeRoom = null;
    seen.clear();
    set(0);
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useUnreadChats = () => useSyncExternalStore(subscribe, () => unread, () => unread);
