import React, { useEffect, useRef } from "react";
import { AppState, View } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { usePrefs } from "../lib/prefs";

/*
 * Settings → Display → "Sign out when idle" (web: session timeout). Any touch
 * counts as activity; time in the background counts as idle, so coming back
 * after the limit lands on the sign-in screen.
 */
export const IdleSignOut = ({ children }: { children: React.ReactNode }) => {
  const { user, signOut } = useAuth();
  const { idleSignOutMinutes } = usePrefs();
  const lastActive = useRef(Date.now());
  const limitMs = idleSignOutMinutes * 60 * 1000;
  const on = Boolean(user) && limitMs > 0;

  useEffect(() => {
    if (!on) return undefined;
    lastActive.current = Date.now();
    const check = () => {
      if (Date.now() - lastActive.current >= limitMs) signOut();
    };
    const timer = setInterval(check, 30 * 1000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [on, limitMs, signOut]);

  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={() => {
        lastActive.current = Date.now();
      }}
    >
      {children}
    </View>
  );
};
