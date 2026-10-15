import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePrefs } from "../lib/prefs";
import { buildPalette, isAccentId } from "./accents";
import { dark, light, type Palette } from "./tokens";

export type ThemePreference = "system" | "light" | "dark";

type ThemeValue = {
  scheme: "light" | "dark";
  colors: Palette;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  ready: boolean;
  /* Settings → Display: skip slide and fade animations. */
  reduceMotion: boolean;
};

const STORAGE_KEY = "theme_preference";

const ThemeContext = createContext<ThemeValue | null>(null);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);
  const { accent, highContrast, reduceMotion } = usePrefs();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") setPreferenceState(stored);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
    return {
      scheme,
      colors: buildPalette(scheme === "dark" ? dark : light, scheme, isAccentId(accent) ? accent : "classic", highContrast),
      preference,
      ready,
      reduceMotion,
      setPreference: (next) => {
        setPreferenceState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
    };
  }, [preference, system, ready, accent, highContrast, reduceMotion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
};
