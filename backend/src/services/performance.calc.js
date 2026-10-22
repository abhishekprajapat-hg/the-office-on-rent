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

/*
 * Requirements 16 Oct 2026, section 03: four parts with agreed weights.
 *   target       40%  progress against the person's own targets
 *   tasks        20%  tasks due: on time full, late half, overdue nothing
 *   attendance   20%  attendance % of working days (leave, week offs, holidays excluded)
 *   punctuality  20%  on-time arrivals among days attended; late arrivals and
 *                     half days count against it, short breaks do not
 * A part with nothing to measure is left out and the others carry its weight.
 * Each target counts at most 100% (TARGET_CAP_PERCENT) until management
 * confirms the formula.
 */
const PERFORMANCE_WEIGHTS = Object.freeze({ target: 40, tasks: 20, attendance: 20, punctuality: 20 });
const TARGET_CAP_PERCENT = 100;

// Closing this share of the month's leads scores full marks on conversion.
const CONVERSION_BENCHMARK_PERCENT = 20;

// Grade bands (management, 21 Oct 2026). The overall score keeps two
// decimals, so 94.99 is Great and 95 is Excellent.
const GRADES = Object.freeze([
  { min: 95, key: "EXCELLENT", label: "Excellent" },
  { min: 90, key: "GREAT", label: "Great" },
  { min: 85, key: "GOOD", label: "Good" },
  { min: 80, key: "AVERAGE", label: "Average" },
  { min: 75, key: "BELOW_AVERAGE", label: "Below average" },
  { min: 0, key: "NEEDS_IMPROVEMENT", label: "Needs improvement" },
]);

const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const round = (value) => Math.round(clamp(value));
const round2 = (value) => Math.round(clamp(value) * 100) / 100;
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
  const punctuality = checkedInDays ? clamp(summary.punctualityPercent) : null;
  const score = attendancePercent;

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

/* -------------------------------------------------------- punctuality -- */

/**
 * On-time arrivals out of the days the person came in. A late arrival and a
 * half day each count against it; an approved exception doesn't (it is not in
 * the summary's late or half-day counts). Null when they came in on no day.
 */
const scorePunctuality = (summary) => {
  const onTime = Number(summary?.onTimeDays || 0);
  const late = Number(summary?.lateDays || 0);
  const halfDays = Number(summary?.halfDays || 0);
  const early = Number(summary?.earlyCheckoutDays || 0);
  // A half day is usually also a late arrival; never count the same day twice.
  const halfNotLate = Math.max(0, halfDays - Math.min(halfDays, Number(summary?.lateHalfDays ?? 0)));
  const counted = onTime + late + halfNotLate;
  if (!counted) return null;
  const misses = late + halfNotLate + early * 0.5;
  return {
    score: round(((counted - Math.min(counted, misses)) / counted) * 100),
    metrics: { daysCounted: counted, onTimeDays: onTime, lateDays: late, halfDays, earlyCheckouts: early },
  };
};

/* ------------------------------------------------------------- target -- */

/**
 * Progress against the person's own targets for the month (3.1). Each target
 * is capped at TARGET_CAP_PERCENT; the part is their average. Null when no
 * target was set - then the other parts carry the weight.
 * @param target   TargetAssignment row or null
 * @param actuals  { leads, siteVisits, revenue, deals, production }
 */
const scoreTarget = ({ target = null, actuals = {} }) => {
  const rows = [
    ["leads", "Leads", Number(target?.leadsTarget || 0), Number(actuals.leads || 0)],
    ["siteVisits", "Site visits", Number(target?.siteVisitTarget || 0), Number(actuals.siteVisits || 0)],
    ["revenue", "Revenue", Number(target?.revenueTarget || 0), Number(actuals.revenue || 0)],
    ["deals", "Deals closed", Number(target?.dealsTarget || 0), Number(actuals.deals || 0)],
    ["production", "Production output", Number(target?.productionTarget || 0), Number(actuals.production || 0)],
  ].filter(([, , goal]) => goal > 0);
  if (!rows.length) return null;
  const items = rows.map(([key, label, goal, achieved]) => ({
    key,
    label,
    goal,
    achieved,
    remaining: Math.max(0, goal - achieved),
    percent: Math.round(percentOf(achieved, goal)),
    countedPercent: Math.min(TARGET_CAP_PERCENT, percentOf(achieved, goal)),
  }));
  return {
    score: round(items.reduce((sum, item) => sum + item.countedPercent, 0) / items.length),
    metrics: { targets: items.map(({ countedPercent, ...rest }) => rest), capPercent: TARGET_CAP_PERCENT },
  };
};

/* ------------------------------------------------------------ overall -- */

const calculatePerformance = ({ target = null, tasks = null, attendance = null, punctuality = null, sales = null }) => {
  const parts = { target, tasks, attendance, punctuality };
  const applicable = Object.entries(parts).filter(([, part]) => part);
  const weightTotal = applicable.reduce((sum, [key]) => sum + PERFORMANCE_WEIGHTS[key], 0);
  const score = weightTotal
    ? round2(applicable.reduce((sum, [key, part]) => sum + part.score * PERFORMANCE_WEIGHTS[key], 0) / weightTotal)
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
    // Sales activity is shown for context; it is not a scored part any more.
    activity: sales ? sales.metrics : null,
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
  scorePunctuality,
  scoreTarget,
  TARGET_CAP_PERCENT,
  calculatePerformance,
};
