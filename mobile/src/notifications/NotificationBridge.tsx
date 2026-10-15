import { useEffect } from "react";
import { AppState, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "../auth/AuthProvider";
import { canOpenPage } from "../api/access";
import { syncFollowUpReminders } from "./followUpReminders";
import { registerForPush, unregisterPush } from "./pushRegistration";
import { pushRoute } from "../lib/pushRoute";
import { useSocketEvent } from "../realtime/socket";
import { isManagement } from "../lib/roles";
import { usePrefs } from "../lib/prefs";
import { clearFollowUpReminders } from "./followUpReminders";
import { feed, fromBroadcast, fromChatEvent, fromRequestEvent, fromTaskEvent, type FeedItem } from "./feed";
import { chatInbox } from "./chatInbox";
import { inAppAlerts } from "./inAppAlert";

/* A live event becomes a bell item and, while the app is open, a banner. */
const announce = (item: FeedItem | null, kind: "chat" | "task" | "request" | "broadcast", key = item?.id || "") => {
  if (!item) return;
  feed.add(item);
  // The phone already showed the push for this.
  if (inAppAlerts.pushedRecently(key)) return;
  inAppAlerts.show({ id: item.id, key, kind, title: item.title, body: item.body, link: item.link });
};

/*
 * Keeps device reminders in step with the server, turns live events into the
 * bell feed and in-app banners, and opens the right screen when a
 * notification is tapped. Renders nothing.
 */
export const NotificationBridge = () => {
  const { user, access } = useAuth();
  const active = canOpenPage(user, access, "leads") || canOpenPage(user, access, "my_leads");
  const myId = String(user?.id || user?._id || "");
  const signedIn = Boolean(myId);
  const manager = isManagement(user?.role);

  // The bell's feed: load this user's saved items, then collect live events.
  const chatAllowed = signedIn && canOpenPage(user, access, "chat");
  useEffect(() => {
    if (myId) feed.load(myId);
    else feed.clearMemory();
    chatInbox.reset();
    inAppAlerts.reset();
  }, [myId]);

  // The chat icon's count: fetched on sign-in and whenever the app comes back.
  useEffect(() => {
    if (!chatAllowed) return undefined;
    chatInbox.refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") chatInbox.refresh();
    });
    return () => sub.remove();
  }, [chatAllowed, myId]);

  useSocketEvent<Record<string, unknown>>(
    "chat:message:new",
    (p) => {
      const item = fromChatEvent(p, myId);
      if (!item) return;
      const room = item.link?.replace(/^chats\//, "") || "";
      // Reading that conversation already: no count, no banner.
      if (room && room === chatInbox.activeRoom()) return feed.add({ ...item, read: true });
      chatInbox.bump(room, item.id);
      announce(item, "chat", `chat:${room}`);
    },
    chatAllowed,
  );
  useSocketEvent<Record<string, unknown>>("task:created", (p) => announce(fromTaskEvent(p, "task:created", myId), "task"), signedIn && canOpenPage(user, access, "tasks"));
  useSocketEvent<Record<string, unknown>>("task:updated", (p) => { const item = fromTaskEvent(p, "task:updated", myId); if (item) feed.add(item); }, signedIn && canOpenPage(user, access, "tasks"));
  useSocketEvent<Record<string, unknown>>("task:deleted", (p) => { const item = fromTaskEvent(p, "task:deleted", myId); if (item) feed.add(item); }, signedIn && canOpenPage(user, access, "tasks"));
  useSocketEvent<Record<string, unknown>>("admin:request:new", (p) => announce(fromRequestEvent(p), "request"), signedIn && manager && canOpenPage(user, access, "admin_console"));
  useSocketEvent<Record<string, unknown>>("chat:broadcast:new", (p) => announce(fromBroadcast(p), "broadcast"), chatAllowed);

  // Server pushes that arrive while the app is open also land in the feed.
  useEffect(() => {
    if (!signedIn || Platform.OS === "web") return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = (content.data || {}) as Record<string, unknown>;
      const tag = String(data.tag || "");
      // A chat push the socket already delivered is in the feed once already.
      if (tag.startsWith("chat:") && inAppAlerts.banneredRecently(tag)) return;
      if (tag) inAppAlerts.markPushed(tag);
      feed.add({
        id: `push:${notification.request.identifier}`,
        kind: "push",
        title: content.title || "Office On Rent",
        body: content.body || "",
        at: new Date(notification.date || Date.now()).toISOString(),
        link: pushRoute(data),
      });
    });
    return () => sub.remove();
  }, [signedIn]);

  const settings = usePrefs();

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (active && !settings.reminders) {
      clearFollowUpReminders().catch(() => {});
      return;
    }
    if (!active) return;
    const sync = () => syncFollowUpReminders().catch(() => {});
    sync();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => sub.remove();
  }, [active, settings.reminders]);

  // Register this phone for server push once someone is signed in.
  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    if (settings.push) registerForPush().catch(() => {});
    else unregisterPush().catch(() => {});
  }, [user?.id, settings.push]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data || {};
      // Local reminders carry an app deep link; server pushes carry a web path + tag.
      const url = typeof data.url === "string" && data.url.startsWith("theofficeonrent://") ? data.url : `theofficeonrent://${pushRoute(data)}`;
      Linking.openURL(url).catch(() => {});
    };
    // A reminder tapped while the app was closed.
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  return null;
};
