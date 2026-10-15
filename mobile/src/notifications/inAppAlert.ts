import { useSyncExternalStore } from "react";

/*
 * The banner that slides down when something arrives while the app is open
 * (a chat message, a new task). The phone's own notification covers the app
 * when it is closed; this covers it when it is open, push set up or not.
 *
 * `key` names the thing ("chat:<roomId>") so a socket event and the push for
 * the same message raise one alert, not two.
 */
export type InAppAlert = {
  id: string;
  key: string;
  kind: "chat" | "task" | "request" | "broadcast" | "push";
  title: string;
  body: string;
  /* App deep-link path, e.g. "chats/<roomId>". */
  link?: string;
};

/* A socket event and the push for the same message land within a few seconds of each other. */
const SAME_MESSAGE_MS = 8000;

let current: InAppAlert | null = null;
const shownIds = new Set<string>();
const bannered = new Map<string, number>();
const pushed = new Map<string, number>();
const within = (map: Map<string, number>, key: string) => Date.now() - (map.get(key) || 0) < SAME_MESSAGE_MS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const inAppAlerts = {
  show: (alert: InAppAlert) => {
    if (shownIds.has(alert.id)) return;
    shownIds.add(alert.id);
    bannered.set(alert.key, Date.now());
    current = alert;
    emit();
  },
  dismiss: (id?: string) => {
    if (!current || (id && current.id !== id)) return;
    current = null;
    emit();
  },
  /* A banner for this key just showed, so the matching push needn't. */
  banneredRecently: (key: string) => within(bannered, key),
  /* The phone just showed a push for this key, so the matching socket event needn't. */
  pushedRecently: (key: string) => within(pushed, key),
  markPushed: (key: string) => {
    pushed.set(key, Date.now());
  },
  reset: () => {
    current = null;
    shownIds.clear();
    bannered.clear();
    pushed.clear();
    emit();
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useInAppAlert = () => useSyncExternalStore(subscribe, () => current, () => current);
