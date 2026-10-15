import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { AppState } from "react-native";
import { FAST_MS, SLOW_MS, isServerDownStatus, type ConnectionState } from "../lib/connection";
import { session } from "./session";

const DEFAULT_API_BASE_URL = "https://crm.theofficeonrent.com/api";

/*
 * EXPO_PUBLIC_API_BASE_URL wins when set. A dev build can opt into a local
 * backend with EXPO_PUBLIC_USE_LOCAL_API; production always talks to the
 * live server.
 */
const resolveBaseUrl = () => {
  const explicit = String(process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return DEFAULT_API_BASE_URL;
};

export const API_BASE_URL = resolveBaseUrl();

/*
 * Uploaded files (profile photos, attachments) come back as server-relative
 * paths like /api/uploads/files/... A browser resolves those against the page;
 * an app has no page, so they are made absolute against the API's origin.
 */
/* Where the web app lives, for links meant for a browser (share pages, legal pages). */
export const webOrigin = () =>
  String(process.env.EXPO_PUBLIC_WEB_APP_URL || API_BASE_URL.replace(/\/api\/?$/, "")).replace(/\/+$/, "");

export const mediaUrl = (path?: string | null) => {
  const value = String(path || "").trim();
  if (!value) return undefined;
  if (/^(https?:|data:|file:)/i.test(value)) return value;
  const origin = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${origin}${value.startsWith("/") ? "" : "/"}${value}`;
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  // A request that hangs on a weak mobile signal must fail eventually, or the
  // screen spins forever.
  timeout: 30000,
});

/*
 * Reachability, learned from real traffic: a request that dies without a
 * response marks the app offline, the next one that gets any answer marks it
 * back online; a 502/503/504 means the server is down; a request still
 * waiting after a few seconds means a slow line. Drives the connection strip.
 * While offline or down, a light /health probe notices recovery even when
 * nobody is pulling to refresh.
 */
let connection: ConnectionState = { online: true, slow: false, serverDown: false };
const connectionListeners = new Set<(value: ConnectionState) => void>();
let probeTimer: ReturnType<typeof setInterval> | null = null;

const probe = () => {
  axios
    .get(`${API_BASE_URL}/health`, { timeout: 6000 })
    .then(() => setConnection({ online: true, serverDown: false }))
    .catch((error: AxiosError) => {
      if (error.response) setConnection({ online: true, serverDown: isServerDownStatus(error.response.status) });
    });
};

const setConnection = (patch: Partial<ConnectionState>) => {
  const next = { ...connection, ...patch };
  if (next.online === connection.online && next.slow === connection.slow && next.serverDown === connection.serverDown) return;
  connection = next;
  connectionListeners.forEach((listener) => listener(next));
  const troubled = !next.online || next.serverDown;
  if (troubled && !probeTimer) probeTimer = setInterval(probe, 10000);
  if (!troubled && probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
};
const setOnline = (online: boolean) => setConnection(online ? { online } : { online, slow: false });

export const subscribeConnection = (listener: (value: ConnectionState) => void) => {
  connectionListeners.add(listener);
  listener(connection);
  return () => {
    connectionListeners.delete(listener);
  };
};
export const subscribeOnline = (listener: (value: boolean) => void) => subscribeConnection((value) => listener(value.online));
/* Checks straight away (the "Try again" on the strip, or the app coming back to the front). */
export const recheckConnection = () => {
  if (!connection.online || connection.serverDown) probe();
};
AppState.addEventListener("change", (state) => {
  if (state === "active") recheckConnection();
});

type Timed = { _startedAt?: number; _slowTimer?: ReturnType<typeof setTimeout> };
const finished = (config: Timed | undefined) => {
  if (!config) return;
  if (config._slowTimer) clearTimeout(config._slowTimer);
  if (config._startedAt && Date.now() - config._startedAt < FAST_MS) setConnection({ slow: false });
};

let onUnauthorized: null | (() => void) = null;
export const setUnauthorizedHandler = (handler: null | (() => void)) => {
  onUnauthorized = handler;
};

api.interceptors.request.use(async (config) => {
  const timed = config as typeof config & Timed;
  timed._startedAt = Date.now();
  if (timed._slowTimer) clearTimeout(timed._slowTimer);
  timed._slowTimer = setTimeout(() => setConnection({ slow: true }), SLOW_MS);
  const token = await session.getToken();
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

const refreshAccessToken = async () => {
  const refreshToken = await session.getRefreshToken();
  if (!refreshToken) return null;
  const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken }, { timeout: 20000 });
  const token = String(res.data?.accessToken || res.data?.token || "").trim();
  const user = res.data?.user || (await session.getUser());
  if (!token || !user) return null;
  await session.set(token, user, res.data?.refreshToken || refreshToken);
  return token;
};

type RetryConfig = InternalAxiosRequestConfig & { _authRetry?: boolean; _netRetry?: boolean };

api.interceptors.response.use(
  (response) => {
    finished(response.config as Timed);
    setConnection({ online: true, serverDown: false });
    return response;
  },
  async (error: AxiosError) => {
    const config = (error.config || {}) as RetryConfig & Timed;
    finished(config);
    if (error.response) setConnection({ online: true, serverDown: isServerDownStatus(error.response.status) });
    else if (error.code === "ECONNABORTED") setConnection({ slow: true });
    else if (config._netRetry) setOnline(false);

    // One quiet retry for reads that died on the network (tunnel, lift, signal
    // handover). Writes are never retried: they may already have landed.
    if (!error.response && config.method === "get" && !config._netRetry) {
      config._netRetry = true;
      await new Promise((resolve) => setTimeout(resolve, 800));
      return api(config);
    }

    if (error.response?.status === 401 && !config._authRetry) {
      config._authRetry = true;
      try {
        refreshing = refreshing || refreshAccessToken();
        const token = await refreshing;
        refreshing = null;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          return api(config);
        }
      } catch {
        refreshing = null;
      }
      await session.clear();
      onUnauthorized?.();
    }

    return Promise.reject(error);
  },
);

/* Turns any thrown value into one sentence a person can act on. */
export const errorMessage = (error: unknown, fallback = "Something went wrong. Please try again.") => {
  const err = error as AxiosError<{ message?: string; error?: string }>;
  if (err?.isAxiosError) {
    if (!err.response) {
      return err.code === "ECONNABORTED"
        ? "The server took too long to respond. Check your connection and try again."
        : "Can't reach the server. Check your internet connection.";
    }
    const serverMessage = err.response.data?.message || err.response.data?.error;
    if (serverMessage) return String(serverMessage);
    if (err.response.status === 403) return "You don't have access to this.";
    if (err.response.status === 404) return "This record no longer exists.";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export const isForbidden = (error: unknown) => (error as AxiosError)?.response?.status === 403;
