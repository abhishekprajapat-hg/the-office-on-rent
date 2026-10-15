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
import { feed, fromBroadcast, fromChatEvent, fromRequestEvent, fromTaskEvent } from "./feed";

/*
 * Keeps device reminders in step with the server and opens the right screen
 * when one is tapped. Renders nothing.
 */
export const NotificationBridge = () => {
  const { user, access } = useAuth();
  const active = canOpenPage(user, access, "leads") || canOpenPage(user, access, "my_leads");
  const myId = String(user?.id || user?._id || "");
  const signedIn = Boolean(myId);
  const manager = isManagement(user?.role);

  // The bell's feed: load this user's saved items, then collect live events.
  useEffect(() => {
    if (myId) feed.load(myId);
    else feed.clearMemory();
  }, [myId]);
  useSocketEvent<Record<string, unknown>>("chat:message:new", (p) => { const item = fromChatEvent(p, myId); if (item) feed.add(item); }, signedIn && canOpenPage(user, access, "chat"));
  useSocketEvent<Record<string, unknown>>("task:created", (p) => { const item = fromTaskEvent(p, "task:created", myId); if (item) feed.add(item); }, signedIn && canOpenPage(user, access, "tasks"));
  useSocketEvent<Record<string, unknown>>("task:updated", (p) => { const item = fromTaskEvent(p, "task:updated", myId); if (item) feed.add(item); }, signedIn && canOpenPage(user, access, "tasks"));
  useSocketEvent<Record<string, unknown>>("task:deleted", (p) => { const item = fromTaskEvent(p, "task:deleted", myId); if (item) feed.add(item); }, signedIn && canOpenPage(user, access, "tasks"));
  useSocketEvent<Record<string, unknown>>("admin:request:new", (p) => { const item = fromRequestEvent(p); if (item) feed.add(item); }, signedIn && manager && canOpenPage(user, access, "admin_console"));
  useSocketEvent<Record<string, unknown>>("chat:broadcast:new", (p) => { const item = fromBroadcast(p); if (item) feed.add(item); }, signedIn && canOpenPage(user, access, "chat"));

  // Server pushes that arrive while the app is open also land in the feed.
  useEffect(() => {
    if (!signedIn || Platform.OS === "web") return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = (content.data || {}) as Record<string, unknown>;
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
