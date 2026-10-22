/*
 * Leave balance arithmetic, shared by "my balance" and an admin's view of
 * somebody else's.
 *
 * One leave accrues per month from the joining month. Approved paid leave
 * requests use it up day for day. Half days also use it (management, 21 Oct
 * 2026): every two half days take one day off the balance. A single, unpaired
 * half day doesn't, until the second one arrives.
 */
const HALF_DAYS_PER_LEAVE = 2;

const halfDayLeaveUsed = (halfDays) => Math.floor(Math.max(0, Number(halfDays) || 0) / HALF_DAYS_PER_LEAVE);

const computeLeaveBalance = ({ accrued = 0, approvedDays = 0, pendingDays = 0, halfDays = 0 }) => {
  const leaveRequestDays = Number(approvedDays) || 0;
  const fromHalfDays = halfDayLeaveUsed(halfDays);
  const used = leaveRequestDays + fromHalfDays;
  const available = Math.max(0, (Number(accrued) || 0) - used);
  return {
    accrued,
    used,
    leaveRequestDays,
    halfDays: Math.max(0, Number(halfDays) || 0),
    halfDayLeaveUsed: fromHalfDays,
    pending: Number(pendingDays) || 0,
    available,
    carryForward: available,
  };
};

module.exports = { HALF_DAYS_PER_LEAVE, halfDayLeaveUsed, computeLeaveBalance };
