import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* Phone-only settings from the Settings screen (design 43). */
export type Prefs = { push: boolean; reminders: boolean; chatSounds: boolean; biometricLock: boolean };

const KEY = "app_prefs";
const DEFAULTS: Prefs = { push: true, reminders: true, chatSounds: true, biometricLock: false };
let current: Prefs = DEFAULTS;
let loaded = false;
const listeners = new Set<(next: Prefs) => void>();

export const prefs = {
  get: () => current,
  async load() {
    if (loaded) return current;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) current = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
    } catch {
      // defaults
    }
    loaded = true;
    listeners.forEach((listener) => listener(current));
    return current;
  },
  set(patch: Partial<Prefs>) {
    current = { ...current, ...patch };
    AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
    listeners.forEach((listener) => listener(current));
  },
};

export const usePrefs = () => {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    prefs.load().then(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
};
