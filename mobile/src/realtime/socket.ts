import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "../api/client";
import { session } from "../api/session";

/*
 * One socket for the whole app. The server joins it to the user's own room
 * (user:<id>) from the token, so every screen just listens for the events it
 * cares about. A phone drops connections constantly (lifts, handovers,
 * backgrounding), so it reconnects forever and is nudged when the app comes
 * back to the foreground.
 */
const SOCKET_URL = String(process.env.EXPO_PUBLIC_SOCKET_URL || API_BASE_URL.replace(/\/api\/?$/, "")).replace(/\/+$/, "");
const SOCKET_PATH = String(process.env.EXPO_PUBLIC_SOCKET_PATH || "/socket.io");

let socket: Socket | null = null;
let users = 0;
let appStateSub: { remove: () => void } | null = null;

const connect = () => {
  socket = io(SOCKET_URL, {
    path: SOCKET_PATH,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 6000,
    timeout: 10000,
    // Read fresh on every (re)connect, so a refreshed access token is used.
    auth: (callback) => {
      session.getToken().then((token) => callback({ token: token || "" }));
    },
  });
  appStateSub = AppState.addEventListener("change", (state) => {
    if (state === "active" && socket && !socket.connected) socket.connect();
  });
  return socket;
};

export const acquireSocket = () => {
  users += 1;
  return socket || connect();
};

export const releaseSocket = () => {
  users = Math.max(0, users - 1);
  if (users > 0 || !socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  appStateSub?.remove();
  appStateSub = null;
};

/* Closes the socket outright - on sign-out, so the next user starts clean. */
export const resetSocket = () => {
  users = 0;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  appStateSub?.remove();
  appStateSub = null;
};

/*
 * Joins a chat room channel (receipts, typing) while mounted, and again after
 * every reconnect - a fresh connection starts in no rooms.
 */
export const useRoomChannel = (roomId: string) => {
  useEffect(() => {
    const live = acquireSocket();
    const join = () => live.emit("chat:room:join", { roomId });
    if (live.connected) join();
    live.on("connect", join);
    return () => {
      live.off("connect", join);
      releaseSocket();
    };
  }, [roomId]);
};

/* Subscribes a component to one server event for as long as it is mounted. */
export const useSocketEvent = <T,>(event: string, handler: (payload: T) => void, enabled = true) => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const live = acquireSocket();
    const listener = (payload: T) => handlerRef.current(payload);
    live.on(event, listener);
    return () => {
      live.off(event, listener);
      releaseSocket();
    };
  }, [event, enabled]);
};
