import { useEffect } from "react";
import { AppState, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "../auth/AuthProvider";
import { canUseLeads } from "../lib/roles";
import { syncFollowUpReminders } from "./followUpReminders";
import { registerForPush } from "./pushRegistration";
import { pushRoute } from "../lib/pushRoute";

/*
 * Keeps device reminders in step with the server and opens the right screen
 * when one is tapped. Renders nothing.
 */
export const NotificationBridge = () => {
  const { user } = useAuth();
  const active = Boolean(user && canUseLeads(user.role));

  useEffect(() => {
    if (!active || Platform.OS === "web") return;
    const sync = () => syncFollowUpReminders().catch(() => {});
    sync();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => sub.remove();
  }, [active]);

  // Register this phone for server push once someone is signed in.
  useEffect(() => {
    if (user && Platform.OS !== "web") registerForPush().catch(() => {});
  }, [user?.id]);

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
