import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
const SOCKET_PATH = import.meta.env.VITE_SOCKET_PATH || "/socket.io";

const buildSocketOptions = (token) => ({
  path: SOCKET_PATH,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 700,
  reconnectionDelayMax: 6000,
  timeout: 10000,
  auth: {
    token,
  },
});

export const createChatSocket = (token) =>
  io(SOCKET_URL, buildSocketOptions(token));

let sharedSocket = null;
let sharedToken = "";
let sharedRefCount = 0;

export const acquireChatSocket = (token) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return null;

  if (sharedSocket && sharedToken === normalizedToken) {
    sharedRefCount += 1;
    return sharedSocket;
  }

  if (sharedSocket) {
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
  }

  sharedToken = normalizedToken;
  sharedRefCount = 1;
  sharedSocket = createChatSocket(normalizedToken);
  return sharedSocket;
};

export const releaseChatSocket = (socket) => {
  if (!socket || socket !== sharedSocket) {
    socket?.disconnect?.();
    return;
  }

  sharedRefCount = Math.max(0, sharedRefCount - 1);
  if (sharedRefCount > 0) return;

  sharedSocket.removeAllListeners();
  sharedSocket.disconnect();
  sharedSocket = null;
  sharedToken = "";
};
