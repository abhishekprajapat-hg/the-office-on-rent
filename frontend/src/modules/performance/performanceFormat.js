/*
 * Colours and wording for performance scores. Apart from the components so it
 * can be tested and imported without a screen's worth of component.
 */

export const GRADE_STYLES = {
  EXCELLENT: { chip: "border-emerald-200 bg-emerald-50 text-emerald-700", bar: "bg-emerald-500", ink: "text-emerald-700" },
  GOOD: { chip: "border-blue-200 bg-blue-50 text-blue-700", bar: "bg-blue-500", ink: "text-blue-700" },
  AVERAGE: { chip: "border-amber-200 bg-amber-50 text-amber-700", bar: "bg-amber-500", ink: "text-amber-700" },
  NEEDS_IMPROVEMENT: { chip: "border-rose-200 bg-rose-50 text-rose-700", bar: "bg-rose-500", ink: "text-rose-700" },
};

const NO_SCORE = { chip: "border-slate-200 bg-slate-50 text-slate-500", bar: "bg-slate-300", ink: "text-slate-400" };

export const gradeStyle = (grade) => GRADE_STYLES[grade?.key] || NO_SCORE;

export const PART_LABELS = {
  attendance: "Attendance",
  tasks: "Tasks",
  sales: "Sales",
};

/** "₹1,50,000" */
export const formatRupees = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(Number(value) || 0);

/** The lines under each part of the breakdown: [label, value] pairs worth showing. */
export const describePart = (key, part) => {
  const m = part?.metrics || {};
  if (key === "attendance") {
    return [
      ["Attendance", `${m.attendancePercent}% of ${m.workingDays} working days`],
      ["Punctuality", m.punctualityPercent === null || m.punctualityPercent === undefined ? "No check-ins" : `${m.punctualityPercent}% on time`],
      ["Present / half day / absent", `${m.presentDays} / ${m.halfDays} / ${m.absentDays}`],
      ["Late check-ins", String(m.lateDays)],
      ["Leave / week off", `${m.leaveDays} / ${m.weekOffDays}`],
      ["Hours worked", `${m.workedHours} h`],
    ];
  }
  if (key === "tasks") {
    return [
      ["Due this month", String(m.dueTasks)],
      ["Done on time", `${m.completedOnTime} (${m.onTimePercent}%)`],
      ["Done late", String(m.completedLate)],
      ["Overdue, still open", String(m.overdue)],
      ["Completed this month", String(m.completedThisMonth)],
    ];
  }
  if (key === "sales") {
    const rows = [
      ["Leads this month", String(m.leads)],
      ["Closed", `${m.closed}${m.conversionPercent === null || m.conversionPercent === undefined ? "" : ` (${m.conversionPercent}%)`}`],
      ["Site visits", String(m.siteVisits)],
    ];
    if (m.target) {
      const goals = Object.entries(m.target).map(([name, row]) => {
        const label = { leads: "leads", siteVisits: "visits", revenue: "revenue" }[name];
        const fmt = name === "revenue" ? formatRupees : String;
        return `${fmt(row.achieved)} / ${fmt(row.goal)} ${label}`;
      });
      rows.push(["Target", `${m.targetPercent}% · ${goals.join(", ")}`]);
    } else {
      rows.push(["Target", "None set this month"]);
    }
    if (m.openLeads) rows.push(["Follow-ups up to date", `${m.followUpPercent}% of ${m.openLeads} open leads`]);
    return rows;
  }
  return [];
};
