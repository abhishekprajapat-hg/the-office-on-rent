/*
 * Quick follow-up times. Picking a date and time on a phone takes several
 * taps; nearly every callback is one of these, so they come first and the
 * full picker is the fallback.
 */

const at = (base: Date, days: number, hour: number, minute = 0) => {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
};

export type QuickPick = { key: string; label: string; date: Date };

export const followUpQuickPicks = (now = new Date()): QuickPick[] => {
  const picks: QuickPick[] = [];
  const inTwoHours = new Date(now);
  inTwoHours.setMinutes(0, 0, 0);
  inTwoHours.setHours(now.getHours() + 2);
  // "In 2 hours" only while it still lands within working hours today.
  if (inTwoHours.getDate() === now.getDate() && inTwoHours.getHours() <= 20) {
    picks.push({ key: "2h", label: "In 2 hours", date: inTwoHours });
  }
  if (now.getHours() < 17) picks.push({ key: "eve", label: "This evening", date: at(now, 0, 18) });
  picks.push({ key: "tom", label: "Tomorrow 11 AM", date: at(now, 1, 11) });
  picks.push({ key: "3d", label: "In 3 days", date: at(now, 3, 11) });
  // Next Monday, or a week out if today is Monday.
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  picks.push({ key: "mon", label: "Next Monday", date: at(now, daysToMonday, 11) });
  return picks;
};

/*
 * Sent as a full ISO instant from the device's own clock. The server once
 * stored a bare "12:00" as 5:30 PM because it read wall time as UTC; an
 * explicit instant leaves nothing to reinterpret.
 */
export const toFollowUpPayload = (date: Date | null) => (date ? date.toISOString() : null);
