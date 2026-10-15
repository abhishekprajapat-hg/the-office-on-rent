import { useSyncExternalStore } from "react";
import type { TabName } from "./roleHome";

/* Counts shown on the floating tab bar (e.g. Leads 6), published by the role home when it loads. */
let badges: Partial<Record<TabName, number>> = {};
const listeners = new Set<() => void>();

export const setTabBadges = (next: Partial<Record<TabName, number>>) => {
  const merged = { ...badges, ...next };
  if (JSON.stringify(merged) === JSON.stringify(badges)) return;
  badges = merged;
  listeners.forEach((listener) => listener());
};

export const clearTabBadges = () => {
  badges = {};
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useTabBadges = () => useSyncExternalStore(subscribe, () => badges, () => badges);
