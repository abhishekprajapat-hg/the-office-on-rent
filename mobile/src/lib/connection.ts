/*
 * What the app knows about its connection, learned from real traffic (a
 * request that dies with no answer, one that takes ages, a 502/503 from the
 * server), and the strip that says so. Pure; unit tested.
 */
export type ConnectionState = { online: boolean; slow: boolean; serverDown: boolean };

export type ConnectionNotice = { kind: "offline" | "server" | "slow"; title: string; message: string };

/* Worst first: no internet hides everything else; a slow line only shows when requests do get through. */
export const connectionNotice = (state: ConnectionState): ConnectionNotice | null => {
  if (!state.online) return { kind: "offline", title: "You're offline", message: "Showing what's already loaded. Changes need a connection." };
  if (state.serverDown) return { kind: "server", title: "Can't reach the CRM", message: "The server isn't answering right now. We'll keep trying." };
  if (state.slow) return { kind: "slow", title: "Slow connection", message: "Things may take a little longer to load." };
  return null;
};

/* Gateway errors mean the server (or what sits in front of it) is down, not that the request was wrong. */
export const isServerDownStatus = (status?: number) => status === 502 || status === 503 || status === 504;

/* A request still waiting after this long marks the line slow; one back faster than FAST_MS clears it. */
export const SLOW_MS = 7000;
export const FAST_MS = 3000;
