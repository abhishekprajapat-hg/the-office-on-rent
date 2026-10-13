/* Which follow-up reminders to schedule on the device. Pure; unit tested. */

type LeadLike = { _id: string; name: string; phone?: string; nextFollowUp?: string | null; status?: string };

export type PlannedReminder = { key: string; leadId: string; at: Date; title: string; body: string };

const CLOSED = ["CLOSED", "LOST", "INVALID", "OWNER", "BROKER"];

/*
 * A reminder `leadMinutes` before each follow-up still ahead. A follow-up
 * already inside that window gets one in a minute rather than none; anything
 * past is skipped (it shows as overdue in the app instead). Capped, because
 * phones limit how many local notifications an app may schedule.
 */
export const planReminders = (leads: LeadLike[], now = new Date(), leadMinutes = 10, cap = 60): PlannedReminder[] =>
  leads
    .filter((lead) => lead.nextFollowUp && !CLOSED.includes(String(lead.status || "")))
    .map((lead) => {
      const due = new Date(lead.nextFollowUp!);
      return { lead, due };
    })
    .filter(({ due }) => !Number.isNaN(due.getTime()) && due.getTime() > now.getTime())
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, cap)
    .map(({ lead, due }) => {
      const early = new Date(due.getTime() - leadMinutes * 60000);
      const at = early.getTime() > now.getTime() ? early : new Date(now.getTime() + 60000);
      const time = `${due.getHours() % 12 || 12}:${String(due.getMinutes()).padStart(2, "0")} ${due.getHours() < 12 ? "AM" : "PM"}`;
      return {
        // Same key for the same lead and time, so rescheduling never doubles up.
        key: `followup:${lead._id}:${due.getTime()}`,
        leadId: lead._id,
        at,
        title: `Follow up with ${lead.name}`,
        body: [`Due at ${time}`, lead.phone].filter(Boolean).join(" · "),
      };
    });
