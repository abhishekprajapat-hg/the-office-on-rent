import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* Phone-only settings from the Settings screen (design 43), and the display ones the web keeps in System settings. */
export type Prefs = {
  push: boolean;
  reminders: boolean;
  chatSounds: boolean;
  biometricLock: boolean;
  /* An AccentId (theme/accents); kept as a string so an old value never breaks loading. */
  accent: string;
  highContrast: boolean;
  reduceMotion: boolean;
  /* Sign out after this many minutes without a touch; 0 is never (web: session timeout). */
  idleSignOutMinutes: number;
};

const KEY = "app_prefs";
const DEFAULTS: Prefs = { push: true, reminders: true, chatSounds: true, biometricLock: false, accent: "classic", highContrast: false, reduceMotion: false, idleSignOutMinutes: 0 };

/* The web's session timeout choices, plus never (the default on a phone, which has its own lock). */
export const IDLE_SIGN_OUT_CHOICES = [0, 15, 30, 60, 120, 240];
export const idleLabel = (minutes: number) => (!minutes ? "Never" : minutes < 60 ? `${minutes} minutes` : minutes === 60 ? "1 hour" : `${minutes / 60} hours`);
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
