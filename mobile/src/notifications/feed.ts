import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/*
 * The in-app notification feed. The server keeps no notification list (the
 * web app also builds its bell from live socket events), so the phone keeps
 * its own: every realtime event and push that reaches it is stored here, per
 * user, newest first, capped at 80.
 */
export type FeedKind = "chat" | "task" | "request" | "push" | "broadcast" | "lead";

export type FeedItem = {
  id: string;
  kind: FeedKind;
  title: string;
  body: string;
  at: string;
  read?: boolean;
  /* App deep link path, e.g. "chats/123" or "tasks/abc". */
  link?: string;
};

const MAX = 80;
let userKey = "";
let items: FeedItem[] = [];
const listeners = new Set<(next: FeedItem[]) => void>();
const emit = () => listeners.forEach((listener) => listener(items));
const storageKey = () => `notification_feed:${userKey}`;
const persist = () => {
  if (userKey) AsyncStorage.setItem(storageKey(), JSON.stringify(items)).catch(() => {});
};

export const feed = {
  async load(userId: string) {
    userKey = userId;
    try {
      const raw = await AsyncStorage.getItem(storageKey());
      items = raw ? (JSON.parse(raw) as FeedItem[]) : [];
    } catch {
      items = [];
    }
    emit();
  },
  add(item: FeedItem) {
    if (!userKey || items.some((existing) => existing.id === item.id)) return;
    items = [item, ...items].slice(0, MAX);
    persist();
    emit();
  },
  markAllRead() {
    items = items.map((item) => ({ ...item, read: true }));
    persist();
    emit();
  },
  markRead(id: string) {
    items = items.map((item) => (item.id === id ? { ...item, read: true } : item));
    persist();
    emit();
  },
  clearMemory() {
    userKey = "";
    items = [];
    emit();
  },
  get: () => items,
};

export const useFeed = () => {
  const [state, setState] = useState(items);
  useEffect(() => {
    listeners.add(setState);
    setState(items);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
};

/* ---- turning server events into feed items (mirrors the web app's bell) ---- */

type AnyRecord = Record<string, any>;
const str = (value: unknown) => String(value ?? "").trim();

export const fromChatEvent = (payload: AnyRecord, myId: string): FeedItem | null => {
  const message = payload?.message || payload;
  const id = str(message?._id);
  const room = str(payload?.conversationId || payload?.roomId || message?.room);
  if (!id || !room || str(message?.sender?._id) === myId) return null;
  const preview = str(message?.text) || (message?.sharedProperty ? "Shared a property" : message?.mediaAttachments?.length ? "Sent an attachment" : "New message");
  return { id: `chat:${id}`, kind: "chat", title: str(message?.sender?.name) || "New message", body: preview, at: str(message?.createdAt) || new Date().toISOString(), link: `chats/${room}` };
};

export const fromTaskEvent = (payload: AnyRecord, event: "task:created" | "task:updated" | "task:deleted", myId: string): FeedItem | null => {
  if (str(payload?.actorId) === myId) return null;
  const task = payload?.task || {};
  const taskId = str(task?._id || payload?.taskId);
  const at = str(task?.updatedAt || task?.createdAt) || new Date().toISOString();
  const title = str(task?.title);
  return {
    id: str(payload?.eventId) || `${event}:${taskId}:${new Date(at).getTime()}`,
    kind: "task",
    title: event === "task:created" ? "New task" : event === "task:deleted" ? "Task removed" : "Task update",
    body: str(payload?.message) || title || "A task changed",
    at,
    link: taskId && event !== "task:deleted" ? `tasks/${taskId}` : undefined,
  };
};

export const fromRequestEvent = (payload: AnyRecord): FeedItem | null => {
  const id = str(payload?.eventId || payload?.requestId || payload?._id);
  if (!id) return null;
  const who = str(payload?.requestedBy?.name);
  const lead = str(payload?.lead?.name || payload?.leadName);
  const body =
    str(payload?.message || payload?.preview) ||
    [who ? `${who} sent a request` : "New request", lead ? `for ${lead}` : ""].filter(Boolean).join(" ");
  return { id: `request:${id}`, kind: "request", title: "Needs your approval", body, at: str(payload?.createdAt) || new Date().toISOString(), link: "approvals" };
};

export const fromBroadcast = (payload: AnyRecord): FeedItem | null => {
  const id = str(payload?.message?._id || payload?._id || payload?.eventId);
  if (!id) return null;
  return { id: `broadcast:${id}`, kind: "broadcast", title: "Admin broadcast", body: str(payload?.message?.text || payload?.text) || "New announcement", at: str(payload?.createdAt) || new Date().toISOString() };
};
