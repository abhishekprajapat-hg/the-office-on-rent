import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { listFollowUpsBetween } from "../api/leads";
import { planReminders } from "../lib/reminderPlan";

const KIND = "followup";

/* How a reminder looks while the app is open: a banner, like when it's closed. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/*
 * Rebuilds the device's follow-up reminders for the next week from the server.
 * Runs on sign-in, on app foreground and after a lead is updated. Local
 * notifications only - no push service is involved, so they fire offline too.
 */
export const syncFollowUpReminders = async () => {
  if (Platform.OS === "web") return;
  const permission = await Notifications.getPermissionsAsync();
  const granted = permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("followups", {
      name: "Follow-up reminders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);
  const leads = await listFollowUpsBetween(now, weekAhead);
  const plan = planReminders(leads, now);

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter((item) => item.content.data?.kind === KIND);
  const wanted = new Set(plan.map((item) => item.key));
  // Drop reminders for follow-ups that moved, closed or were completed.
  await Promise.all(ours.filter((item) => !wanted.has(item.identifier)).map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  const existing = new Set(ours.map((item) => item.identifier));
  for (const reminder of plan) {
    if (existing.has(reminder.key)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.key,
      content: { title: reminder.title, body: reminder.body, data: { kind: KIND, leadId: reminder.leadId, url: `theofficeonrent://leads/${reminder.leadId}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at, channelId: "followups" },
    });
  }
};

/* On sign-out: nobody should get the previous user's reminders. */
export const clearFollowUpReminders = async () => {
  if (Platform.OS === "web") return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((item) => item.content.data?.kind === KIND).map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
};
