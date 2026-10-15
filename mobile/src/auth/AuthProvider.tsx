import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import * as authApi from "../api/auth";
import { getMyAccess, type AccessProfile } from "../api/access";
import { setUnauthorizedHandler } from "../api/client";
import { session } from "../api/session";
import { resetSocket } from "../realtime/socket";
import { clearFollowUpReminders } from "../notifications/followUpReminders";
import { unregisterPush } from "../notifications/pushRegistration";
import type { User } from "../api/types";

type AuthValue = {
  booting: boolean;
  user: User | null;
  access: AccessProfile | null;
  accessLoading: boolean;
  refreshAccess: () => Promise<void>;
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /* Set when the server ended the session (refresh failed); the login screen says so. */
  sessionExpired: boolean;
};

const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<AccessProfile | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const accessRequest = useRef(0);

  const refreshAccess = useCallback(async () => {
    const request = ++accessRequest.current;
    setAccessLoading(true);
    setAccess(null);
    try {
      const next = await getMyAccess();
      if (request === accessRequest.current) setAccess(next);
    } catch {
      if (request === accessRequest.current) setAccess(null);
    } finally {
      if (request === accessRequest.current) setAccessLoading(false);
    }
  }, []);

  useEffect(() => {
    // The API client calls this once a refresh has failed and the session is
    // already cleared; all that is left is to show the login screen.
    setUnauthorizedHandler(() => { accessRequest.current++; setAccess(null); setAccessLoading(false); setUser(null); setSessionExpired(true); });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // A session started without "Keep me signed in" ends when the app is closed.
      if (await session.isEphemeral()) await session.clear();
      const [token, stored] = await Promise.all([session.getToken(), session.getUser()]);
      if (!token || !stored) {
        if (alive) setBooting(false);
        return;
      }
      // Show the stored user straight away so a slow network does not hold
      // the splash; the server copy replaces it when it arrives.
      if (alive) {
        setUser(stored);
        setBooting(false);
      }
      await refreshAccess();
      try {
        const fresh = await authApi.getMe();
        if (fresh && alive) {
          // Merged, not replaced: /auth/me omits fields login returns (profileImageUrl among them).
          const merged = { ...stored, ...fresh };
          setUser(merged);
          await session.setUser(merged);
        }
      } catch {
        // Offline, or a 401 the client has already turned into a sign-out.
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshAccess]);

  useEffect(() => {
    if (!user) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshAccess();
    });
    return () => subscription.remove();
  }, [user?.id, refreshAccess]);

  const signIn = useCallback(async (email: string, password: string, remember = true) => {
    const payload = await authApi.login(email, password);
    const token = String(payload.accessToken || payload.token || "").trim();
    if (!token || !payload.user) throw new Error("The server did not return a session. Please try again.");
    await session.set(token, payload.user, payload.refreshToken || null, remember);
    setSessionExpired(false);
    await refreshAccess();
    setUser(payload.user);
  }, [refreshAccess]);

  const signOut = useCallback(async () => {
    accessRequest.current++;
    // Stop this phone receiving the outgoing user's notifications first, while still signed in.
    await Promise.race([unregisterPush().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 3000))]);
    const refreshToken = await session.getRefreshToken().catch(() => null);
    // Bounded: a phone with no signal must still be able to sign out. The
    // token expires by itself if this call never lands.
    await Promise.race([
      authApi.logout(refreshToken).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    await session.clear();
    // The next person to sign in on this phone must not inherit this socket.
    resetSocket();
    await clearFollowUpReminders().catch(() => {});
    setAccess(null);
    setAccessLoading(false);
    setUser(null);
  }, []);

  /* Re-reads the stored user after a profile edit, so the greeting and avatar follow it. */
  const refreshUser = useCallback(async () => {
    const stored = await session.getUser();
    if (stored) setUser(stored);
  }, []);

  const value = useMemo(
    () => ({ booting, user, access, accessLoading, refreshAccess, signIn, signOut, refreshUser, sessionExpired }),
    [booting, user, access, accessLoading, refreshAccess, signIn, signOut, refreshUser, sessionExpired],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
};

/* The signed-in user, for screens that only ever render behind the auth gate. */
export const useUser = () => {
  const { user } = useAuth();
  if (!user) throw new Error("useUser called while signed out");
  return user;
};
