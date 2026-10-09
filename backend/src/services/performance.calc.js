/*
 * One person's performance for one month, as a score out of 100.
 *
 * Three parts, each scored 0-100 from what the CRM already records:
 *
 *   Attendance  70% attendance percentage (days present, half days count half,
 *               of the working days so far) + 30% punctuality (check-ins
 *               before the late cut-off).
 *   Tasks       tasks due this month (up to today): done on time counts
 *               fully, done late counts half, still open past the due date
 *               counts nothing.
 *   Sales       the average of whichever apply: progress against the month's
 *               targets, the share of the month's leads closed (against a
 *               benchmark, since nobody closes every lead), and follow-ups kept
 *               up to date on open leads.
 *
 * The overall score is a weighted average of the parts that apply to the
 * person. A part with nothing to measure - no leads for a production
 * executive, no tasks due - is left out and the others carry its weight, so
 * nobody is marked down for work that is not theirs.
 *
 * Pure: the controller gathers the records, this does the arithmetic.
 */

const PERFORMANCE_WEIGHTS = Object.freeze({ attendance: 30, tasks: 30, sales: 40 });

// Closing this share of the month's leads scores full marks on conversion.
const CONVERSION_BENCHMARK_PERCENT = 20;

const GRADES = Object.freeze([
  { min: 85, key: "EXCELLENT", label: "Excellent" },
  { min: 70, key: "GOOD", label: "Good" },
  { min: 50, key: "AVERAGE", label: "Average" },
  { min: 0, key: "NEEDS_IMPROVEMENT", label: "Needs improvement" },
]);

const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const round = (value) => Math.round(clamp(value));
const percentOf = (part, whole) => (whole > 0 ? (Number(part || 0) / whole) * 100 : 0);

const gradeFor = (score) => (score === null || score === undefined
  ? null
  : GRADES.find((grade) => score >= grade.min) || GRADES[GRADES.length - 1]);

/* --------------------------------------------------------- attendance -- */

/** From buildAttendanceSummary's summary. Null when no working day has passed yet. */
const scoreAttendance = (summary) => {
  const workingDays = Number(summary?.workingDays || 0);
  if (!workingDays) return null;

  const attendancePercent = clamp(summary.attendancePercent);
  const checkedInDays = Number(summary.onTimeDays || 0) + Number(summary.lateDays || 0);
  // Punctuality only means something on days somebody turned up.
  const punctuality = checkedInDays ? clamp(summary.punctualityPercent) : null;
  const score = punctuality === null
    ? attendancePercent
    : attendancePercent * 0.7 + punctuality * 0.3;

  return {
    score: round(score),
    metrics: {
      workingDays,
      presentDays: Number(summary.presentDays || 0),
      halfDays: Number(summary.halfDays || 0),
      absentDays: Number(summary.absentDays || 0),
      leaveDays: Number(summary.leaveDays || 0),
      weekOffDays: Number(summary.weekOffDays || 0),
      lateDays: Number(summary.lateDays || 0),
      attendancePercent: round(attendancePercent),
      punctualityPercent: punctuality === null ? null : round(punctuality),
      workedHours: Number(summary.totalWorkedHours || 0),
    },
  };
};

/* -------------------------------------------------------------- tasks -- */

/**
 * @param tasks  [{ dueKey: "YYYY-MM-DD" | "", completedKey: "YYYY-MM-DD" | "", completed: bool }]
 * Only tasks due between `from` and the earlier of `to` and today count.
 * A task due today that is still open is not late yet, so it is left out.
 */
const scoreTasks = ({ tasks = [], from, to, todayKey }) => {
  const until = todayKey && todayKey < to ? todayKey : to;
  let onTime = 0;
  let late = 0;
  let overdue = 0;
  let completedThisMonth = 0;

  tasks.forEach((task) => {
    if (task.completed && task.completedKey && task.completedKey >= from && task.completedKey <= to) {
      completedThisMonth += 1;
    }
    const due = task.dueKey;
    if (!due || due < from || due > until) return;
    if (task.completed) {
      if (task.completedKey && task.completedKey > due) late += 1;
      else onTime += 1;
    } else if (due < (todayKey || until)) {
      overdue += 1;
    }
  });

  const counted = onTime + late + overdue;
  if (!counted) return null;
  return {
    score: round(((onTime + late * 0.5) / counted) * 100),
    metrics: {
      dueTasks: counted,
      completedOnTime: onTime,
      completedLate: late,
      overdue,
      completedThisMonth,
      onTimePercent: round(percentOf(onTime, counted)),
    },
  };
};

/* -------------------------------------------------------------- sales -- */

/**
 * @param leads      the month's leads for the person: { total, closed, siteVisits }
 * @param target     the month's target, or null: { leadsTarget, siteVisitTarget, revenueTarget }
 * @param openLeads  their open leads now: { total, overdueFollowUps }
 * @param revenuePerClosed  what a closed deal counts as against a revenue target
 */
const scoreSales = ({ leads = {}, target = null, openLeads = {}, revenuePerClosed = 50000 }) => {
  const total = Number(leads.total || 0);
  const closed = Number(leads.closed || 0);
  const siteVisits = Number(leads.siteVisits || 0);
  const open = Number(openLeads.total || 0);
  const overdue = Number(openLeads.overdueFollowUps || 0);
  const revenue = closed * revenuePerClosed;

  const parts = [];

  const targetRows = [
    ["leads", Number(target?.leadsTarget || 0), total],
    ["siteVisits", Number(target?.siteVisitTarget || 0), siteVisits],
    ["revenue", Number(target?.revenueTarget || 0), revenue],
  ].filter(([, goal]) => goal > 0);
  const targetPercent = targetRows.length
    ? targetRows.reduce((sum, [, goal, achieved]) => sum + clamp(percentOf(achieved, goal)), 0) / targetRows.length
    : null;
  if (targetPercent !== null) parts.push(targetPercent);

  const conversionPercent = total ? percentOf(closed, total) : null;
  if (conversionPercent !== null) parts.push(clamp((conversionPercent / CONVERSION_BENCHMARK_PERCENT) * 100));

  const followUpPercent = open ? 100 - percentOf(overdue, open) : null;
  if (followUpPercent !== null) parts.push(clamp(followUpPercent));

  if (!parts.length) return null;
  return {
    score: round(parts.reduce((sum, part) => sum + part, 0) / parts.length),
    metrics: {
      leads: total,
      closed,
      siteVisits,
      revenue,
      conversionPercent: conversionPercent === null ? null : Math.round(conversionPercent * 10) / 10,
      targetPercent: targetPercent === null ? null : round(targetPercent),
      target: targetRows.length
        ? Object.fromEntries(targetRows.map(([key, goal, achieved]) => [key, { goal, achieved }]))
        : null,
      openLeads: open,
      overdueFollowUps: overdue,
      followUpPercent: followUpPercent === null ? null : round(followUpPercent),
    },
  };
};

/* ------------------------------------------------------------ overall -- */

const calculatePerformance = ({ attendance, tasks, sales }) => {
  const parts = { attendance, tasks, sales };
  const applicable = Object.entries(parts).filter(([, part]) => part);
  const weightTotal = applicable.reduce((sum, [key]) => sum + PERFORMANCE_WEIGHTS[key], 0);
  const score = weightTotal
    ? round(applicable.reduce((sum, [key, part]) => sum + part.score * PERFORMANCE_WEIGHTS[key], 0) / weightTotal)
    : null;

  return {
    score,
    grade: gradeFor(score),
    parts: Object.fromEntries(Object.entries(parts).map(([key, part]) => [key, part
      ? {
        ...part,
        grade: gradeFor(part.score),
        weight: PERFORMANCE_WEIGHTS[key],
        // What share of the overall score this part actually carried.
        effectiveWeight: Math.round((PERFORMANCE_WEIGHTS[key] / weightTotal) * 100),
      }
      : null])),
  };
};

module.exports = {
  PERFORMANCE_WEIGHTS,
  CONVERSION_BENCHMARK_PERCENT,
  GRADES,
  gradeFor,
  scoreAttendance,
  scoreTasks,
  scoreSales,
  calculatePerformance,
};
