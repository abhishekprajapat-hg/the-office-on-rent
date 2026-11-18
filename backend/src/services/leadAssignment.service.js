const Lead = require("../models/Lead");
const User = require("../models/User");
const LeadActivity = require("../models/leadActivity.model");
const {
  USER_ROLES,
  EXECUTIVE_ROLES,
  LEAD_OWNER_ROLES,
  INSIDE_EXECUTIVE_ROLES,
  MANAGEMENT_ROLES,
  isManagementRole,
} = require("../constants/role.constants");
const {
  getAncestorByRoles,
  getDescendantExecutiveIds,
} = require("./hierarchy.service");
const { notifyLeadAssigned } = require("./whatsappDashboard.service");

const PIPELINE_STATUSES = [
  "NEW",
  "CONTACTED",
  "FOLLOW_UP_1",
  "FOLLOW_UP_2",
  "FOLLOW_UP_3",
  "QUALIFIED_LEAD",
  "INTERESTED",
  "SITE_VISIT_SCHEDULED",
  "SITE_VISIT",
  "SITE_VISIT_OVERDUE",
  "MISSING_IN_ACTION",
  "NPC_1",
  "NPC_2",
  "NPC_3",
  "OWNER",
  "BROKER",
];
const AUTO_ASSIGNMENT_REASON = "New lead automatically assigned to Inside Executive";

const DEFAULT_MAX_ACTIVE_LEADS = 120;
const ACTIVE_LOAD_WEIGHT = 100;
const DAILY_LOAD_WEIGHT = 10;
const ROLE_TYPE_VALUES = Object.freeze(["COMMERCIAL", "RESIDENTIAL", "BOTH", "COWORKING"]);

const configuredMaxActiveLeads = Number.parseInt(
  process.env.AUTO_ASSIGN_MAX_ACTIVE_LEADS || "",
  10,
);

const MAX_ACTIVE_LEADS_PER_EXECUTIVE =
  Number.isInteger(configuredMaxActiveLeads) && configuredMaxActiveLeads > 0
    ? configuredMaxActiveLeads
    : DEFAULT_MAX_ACTIVE_LEADS;

const toId = (value) => String(value || "");
const toTimestamp = (value) => (value ? new Date(value).getTime() : 0);
const normalizeRoleType = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return ROLE_TYPE_VALUES.includes(normalized) ? normalized : "COMMERCIAL";
};
const getLeadRoleType = (lead) => normalizeRoleType(lead?.requirements?.inventoryType);
const getUserRoleType = (user) => normalizeRoleType(user?.roleType);

const buildCountMap = (rows) =>
  new Map(rows.map((row) => [toId(row._id), Number(row.count || 0)]));

const getStartOfDay = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
};

const compareExecutiveCandidates = (left, right) => {
  if (left.metric.score !== right.metric.score) {
    return left.metric.score - right.metric.score;
  }

  if (left.metric.activeLeads !== right.metric.activeLeads) {
    return left.metric.activeLeads - right.metric.activeLeads;
  }

  const leftAssignedAt = toTimestamp(left.executive.lastAssignedAt);
  const rightAssignedAt = toTimestamp(right.executive.lastAssignedAt);
  if (leftAssignedAt !== rightAssignedAt) {
    return leftAssignedAt - rightAssignedAt;
  }

  const leftCreatedAt = toTimestamp(left.executive.createdAt);
  const rightCreatedAt = toTimestamp(right.executive.createdAt);
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return toId(left.executive._id).localeCompare(toId(right.executive._id));
};

const compareLeaders = (left, right) => {
  if (left.candidate.metric.score !== right.candidate.metric.score) {
    return left.candidate.metric.score - right.candidate.metric.score;
  }

  if (left.candidate.metric.activeLeads !== right.candidate.metric.activeLeads) {
    return left.candidate.metric.activeLeads - right.candidate.metric.activeLeads;
  }

  const leftAssignedAt = toTimestamp(left.manager.lastAssignedAt);
  const rightAssignedAt = toTimestamp(right.manager.lastAssignedAt);
  if (leftAssignedAt !== rightAssignedAt) {
    return leftAssignedAt - rightAssignedAt;
  }

  const leftCreatedAt = toTimestamp(left.manager.createdAt);
  const rightCreatedAt = toTimestamp(right.manager.createdAt);
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return toId(left.manager._id).localeCompare(toId(right.manager._id));
};

const buildAssignmentAction = ({ mode, executive, manager }) => {
  if (mode === "SELF") {
    return `Self assigned by ${executive.name}`;
  }

  if (mode === "LEADER_TEAM") {
    return `Auto assigned to ${executive.name} from reporting team`;
  }

  if (mode === "LEADER_HIERARCHY") {
    return `Auto assigned to ${executive.name} under ${manager.name}`;
  }

  return `Auto assigned to ${executive.name} (global fallback)`;
};

const getExecutiveMetrics = async (executives) => {
  if (!executives.length) return new Map();

  const executiveIds = executives.map((executive) => executive._id);
  const startOfDay = getStartOfDay();

  const [activeRows, todayRows] = await Promise.all([
    Lead.aggregate([
      {
        $match: {
          assignedTo: { $in: executiveIds },
          status: { $in: PIPELINE_STATUSES },
        },
      },
      {
        $group: {
          _id: "$assignedTo",
          count: { $sum: 1 },
        },
      },
    ]),
    Lead.aggregate([
      {
        $match: {
          assignedTo: { $in: executiveIds },
          createdAt: { $gte: startOfDay },
        },
      },
      {
        $group: {
          _id: "$assignedTo",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const activeMap = buildCountMap(activeRows);
  const todayMap = buildCountMap(todayRows);

  const metrics = new Map();

  executives.forEach((executive) => {
    const executiveId = toId(executive._id);
    const activeLeads = activeMap.get(executiveId) || 0;
    const assignedToday = todayMap.get(executiveId) || 0;

    metrics.set(executiveId, {
      activeLeads,
      assignedToday,
      score: activeLeads * ACTIVE_LOAD_WEIGHT + assignedToday * DAILY_LOAD_WEIGHT,
      atCapacity: activeLeads >= MAX_ACTIVE_LEADS_PER_EXECUTIVE,
    });
  });

  return metrics;
};

const rankExecutiveCandidates = (executives, metricMap) =>
  executives
    .map((executive) => {
      const metric =
        metricMap.get(toId(executive._id)) || {
          activeLeads: 0,
          assignedToday: 0,
          score: 0,
          atCapacity: false,
        };

      return { executive, metric };
    })
    .filter(({ metric }) => !metric.atCapacity)
    .sort(compareExecutiveCandidates);

const selectLeaderCandidate = (leaders, candidates) => {
  if (!leaders.length || !candidates.length) return null;

  const candidatesByLeader = new Map();

  candidates.forEach((candidate) => {
    const leaderId = toId(candidate.executive.parentId);
    if (!leaderId) return;

    const existing = candidatesByLeader.get(leaderId) || [];
    existing.push(candidate);
    candidatesByLeader.set(leaderId, existing);
  });

  const leaderCandidates = leaders
    .map((leader) => ({
      manager: leader,
      candidate: (candidatesByLeader.get(toId(leader._id)) || [])[0] || null,
    }))
    .filter((row) => row.candidate);

  if (!leaderCandidates.length) return null;

  leaderCandidates.sort(compareLeaders);
  return leaderCandidates[0];
};

const persistAssignment = async ({
  lead,
  executive,
  manager,
  mode,
  performedBy,
}) => {
  const now = new Date();
  const topManager = await getAncestorByRoles({
    user: executive,
    targetRoles: [USER_ROLES.MANAGER],
    companyId: executive?.companyId || null,
    select: "_id role parentId companyId isActive",
  });
  const inferredManagerId = topManager?._id || manager?._id || executive?.parentId || null;
  const isFieldExecutive = executive?.role === USER_ROLES.FIELD_EXECUTIVE;
  const isInsideExecutive = INSIDE_EXECUTIVE_ROLES.includes(executive?.role);
  const isExecutive = executive?.role === USER_ROLES.EXECUTIVE || isInsideExecutive;
  const previousAssignee = lead.assignedTo || null;

  lead.assignedTo = executive._id;
  lead.assignedManager = inferredManagerId;
  lead.assignedExecutive = isExecutive ? executive._id : null;
  lead.assignedFieldExecutive = isFieldExecutive ? executive._id : null;
  lead.assignmentHistory = [
    ...(Array.isArray(lead.assignmentHistory) ? lead.assignmentHistory : []),
    {
      action: "AUTO_ASSIGNED",
      fromUser: previousAssignee,
      toUser: executive._id,
      reason: AUTO_ASSIGNMENT_REASON,
      statusAtTransfer: String(lead.status || ""),
      createdAt: now,
      createdBy: performedBy || null,
    },
  ];
  await lead.save();

  const updates = [
    User.updateOne(
      { _id: executive._id },
      { $set: { lastAssignedAt: now } },
    ),
  ];

  if (manager) {
    updates.push(
      User.updateOne(
        { _id: manager._id },
        { $set: { lastAssignedAt: now }, $inc: { lastAssignedIndex: 1 } },
      ),
    );
  }

  await Promise.all(updates);

  await LeadActivity.create({
    lead: lead._id,
    action: buildAssignmentAction({ mode, executive, manager }),
    performedBy: performedBy || null,
  });
};

const createNoAssignmentActivity = async (leadId, performedBy, reason) => {
  await LeadActivity.create({
    lead: leadId,
    action: `Auto assignment pending: ${reason}`,
    performedBy: performedBy || null,
  });
};

const autoAssignLead = async ({ lead, requester = null, performedBy = null }) => {
  if (!lead || !lead._id) {
    throw new Error("A saved lead document is required for auto assignment");
  }

  const actorId = performedBy || requester?._id || null;
  const resolvedCompanyId = requester?.companyId || lead?.companyId || null;

  const leadRoleType = getLeadRoleType(lead);

  if (
    requester
    && LEAD_OWNER_ROLES.includes(requester.role)
    && requester.isActive
    && [leadRoleType, "BOTH"].includes(getUserRoleType(requester))
  ) {
    await persistAssignment({
      lead,
      executive: requester,
      manager: null,
      mode: "SELF",
      performedBy: actorId,
    });

    return {
      assigned: true,
      mode: "SELF",
      executive: requester,
      manager: null,
    };
  }

  const executiveQuery = {
    role: { $in: LEAD_OWNER_ROLES },
    roleType: { $in: [leadRoleType, "BOTH"] },
    isActive: true,
  };
  if (resolvedCompanyId) {
    executiveQuery.companyId = resolvedCompanyId;
  }

  const activeExecutives = await User.find(executiveQuery)
    .select("_id name role roleType parentId companyId isActive createdAt lastAssignedAt profileImageUrl")
    .sort({ createdAt: 1 })
    .lean();

  if (!activeExecutives.length) {
    await createNoAssignmentActivity(lead._id, actorId, "no active executive available");
    return {
      assigned: false,
      reason: "NO_ACTIVE_EXECUTIVE",
      mode: null,
      executive: null,
      manager: null,
    };
  }

  const metricMap = await getExecutiveMetrics(activeExecutives);
  const rankedCandidates = rankExecutiveCandidates(activeExecutives, metricMap);

  if (!rankedCandidates.length) {
    await createNoAssignmentActivity(lead._id, actorId, "all executives are at capacity");
    return {
      assigned: false,
      reason: "EXECUTIVE_CAPACITY_REACHED",
      mode: null,
      executive: null,
      manager: null,
    };
  }

  let selected = null;
  let selectedManager = null;
  let mode = "GLOBAL_FALLBACK";

  if (requester?.isActive && isManagementRole(requester?.role)) {
    const teamExecutiveIds = await getDescendantExecutiveIds({
      rootUserId: requester._id,
      companyId: requester.companyId || null,
    });
    const teamExecutiveIdSet = new Set(teamExecutiveIds.map(toId));
    const teamCandidate =
      rankedCandidates.find(({ executive }) =>
        teamExecutiveIdSet.has(toId(executive._id)),
      ) || null;

    if (teamCandidate) {
      selected = teamCandidate;
      selectedManager = requester;
      mode = "LEADER_TEAM";
    }
  }

  const leaderIds = [
    ...new Set(
      rankedCandidates
        .map(({ executive }) => toId(executive.parentId))
        .filter(Boolean),
    ),
  ];
  const leaders = leaderIds.length
    ? await User.find({
      _id: { $in: leaderIds },
      role: { $in: MANAGEMENT_ROLES },
      isActive: true,
      ...(resolvedCompanyId ? { companyId: resolvedCompanyId } : {}),
      roleType: { $in: [leadRoleType, "BOTH"] },
    })
      .select("_id name role roleType createdAt lastAssignedAt profileImageUrl")
      .sort({ createdAt: 1 })
      .lean()
    : [];

  const managerMap = new Map(leaders.map((leader) => [toId(leader._id), leader]));

  if (!selected) {
    const hierarchySelection = selectLeaderCandidate(leaders, rankedCandidates);
    if (hierarchySelection) {
      selected = hierarchySelection.candidate;
      selectedManager = hierarchySelection.manager;
      mode = "LEADER_HIERARCHY";
    }
  }

  if (!selected) {
    selected = rankedCandidates[0];
    selectedManager =
      managerMap.get(toId(selected.executive.parentId)) || selectedManager;
    mode = "GLOBAL_FALLBACK";
  }

  await persistAssignment({
    lead,
    executive: selected.executive,
    manager: selectedManager,
    mode,
    performedBy: actorId,
  });

  return {
    assigned: true,
    mode,
    executive: selected.executive,
    manager: selectedManager,
    metrics: selected.metric,
  };
};

// A rebalance moves only leads nobody has worked yet (or whose customer is not answering: NPC 1-3,
// which replaced "Not picking calls"). Leads in conversation or follow-up, with a visit booked or done,
// stay with the person handling them.
const REBALANCE_MOVABLE_STATUSES = Object.freeze([
  "NEW",
  "NPC_1",
  "NPC_2",
  "NPC_3",
  "MISSING_IN_ACTION",
]);
const REBALANCE_REASON = "Team rebalance";

const canTakeLeadType = (executive, leadRoleType) =>
  [leadRoleType, "BOTH"].includes(getUserRoleType(executive));

const compareByLoad = (loadOf) => (left, right) => {
  const leftLoad = loadOf(left);
  const rightLoad = loadOf(right);
  if (leftLoad !== rightLoad) return leftLoad - rightLoad;
  const leftAssignedAt = toTimestamp(left.lastAssignedAt);
  const rightAssignedAt = toTimestamp(right.lastAssignedAt);
  if (leftAssignedAt !== rightAssignedAt) return leftAssignedAt - rightAssignedAt;
  const leftCreatedAt = toTimestamp(left.createdAt);
  const rightCreatedAt = toTimestamp(right.createdAt);
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;
  return toId(left._id).localeCompare(toId(right._id));
};

/**
 * Evens out open (pipeline) leads across the lead owners, with as few changes of hands as possible:
 * 1. Every lead stays with its owner while the owner is active and handles its type.
 * 2. Unassigned leads, leads of people who were deactivated, and leads whose owner no longer handles
 *    their type go to the least loaded executive of the right type (COMMERCIAL / RESIDENTIAL / BOTH),
 *    never above the open-leads cap.
 * 3. Then, while someone has 2+ more open leads than a colleague who can take them, their newest
 *    untouched lead (REBALANCE_MOVABLE_STATUSES) moves across.
 * Each move is written to the lead's assignment history and activity, and a lead linked to a WhatsApp
 * chat has the chat follow it in the WhatsApp dashboard.
 */
const redistributePipelineLeads = async ({
  executiveIds = null,
  companyId = null,
  includeUnassigned = false,
  performedBy = null,
} = {}) => {
  const query = {
    role: { $in: LEAD_OWNER_ROLES },
    isActive: true,
  };
  if (companyId) query.companyId = companyId;
  if (Array.isArray(executiveIds) && executiveIds.length) query._id = { $in: executiveIds };

  const executives = await User.find(query)
    .select("_id name email role roleType parentId createdAt lastAssignedAt")
    .sort({ createdAt: 1 })
    .lean();

  const empty = { updated: 0, moved: 0, totalLeads: 0, executiveCount: executives.length, unassignable: 0 };
  if (!executives.length) return empty;

  const executiveById = new Map(executives.map((executive) => [toId(executive._id), executive]));
  const executiveObjectIds = executives.map((executive) => executive._id);

  const ownerClauses = [{ assignedTo: { $in: executiveObjectIds } }];
  if (includeUnassigned) {
    const formerOwners = await User.find({ ...(companyId ? { companyId } : {}), isActive: false })
      .select("_id")
      .lean();
    ownerClauses.push({ assignedTo: null }, { assignedTo: { $exists: false } });
    if (formerOwners.length) ownerClauses.push({ assignedTo: { $in: formerOwners.map((user) => user._id) } });
  }

  const pipelineLeads = await Lead.find({
    status: { $in: PIPELINE_STATUSES },
    ...(companyId ? { companyId } : {}),
    $or: ownerClauses,
  })
    .select("_id status phone whatsapp requirements assignedTo assignedManager assignedExecutive assignedFieldExecutive createdAt")
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  if (!pipelineLeads.length) return empty;

  const load = new Map(executives.map((executive) => [toId(executive._id), 0]));
  const loadOf = (executive) => load.get(toId(executive._id)) || 0;
  const byLoad = compareByLoad(loadOf);
  const movable = new Map();
  const pool = [];

  pipelineLeads.forEach((lead) => {
    const leadRoleType = getLeadRoleType(lead);
    const owner = executiveById.get(toId(lead.assignedTo));
    if (owner && canTakeLeadType(owner, leadRoleType)) {
      load.set(toId(owner._id), loadOf(owner) + 1);
      if (REBALANCE_MOVABLE_STATUSES.includes(lead.status)) {
        const buckets = movable.get(toId(owner._id)) || {};
        (buckets[leadRoleType] ||= []).push(lead);
        movable.set(toId(owner._id), buckets);
      }
    } else {
      pool.push(lead);
    }
  });

  const plan = new Map();
  let unassignable = 0;

  // 2. Leads without a (suitable, active) owner.
  pool.forEach((lead) => {
    const leadRoleType = getLeadRoleType(lead);
    const receiver = executives
      .filter((executive) => canTakeLeadType(executive, leadRoleType) && loadOf(executive) < MAX_ACTIVE_LEADS_PER_EXECUTIVE)
      .sort(byLoad)[0];
    if (!receiver) {
      unassignable += 1;
      return;
    }
    plan.set(toId(lead._id), { lead, to: receiver });
    load.set(toId(receiver._id), loadOf(receiver) + 1);
  });

  // 3. Even out, newest untouched leads first.
  const typesFor = (executive) =>
    getUserRoleType(executive) === "BOTH" ? ["COMMERCIAL", "RESIDENTIAL", "COWORKING"] : [getUserRoleType(executive)];
  for (let guard = pipelineLeads.length; guard > 0; guard -= 1) {
    const ascending = [...executives].sort(byLoad);
    const descending = [...ascending].reverse();
    let movedOne = false;
    for (const donor of descending) {
      const buckets = movable.get(toId(donor._id));
      if (!buckets || !Object.values(buckets).some((list) => list.length)) continue;
      for (const receiver of ascending) {
        if (loadOf(donor) - loadOf(receiver) <= 1) break;
        if (loadOf(receiver) >= MAX_ACTIVE_LEADS_PER_EXECUTIVE) continue;
        const type = typesFor(receiver).find((leadRoleType) => buckets[leadRoleType]?.length);
        if (!type) continue;
        const lead = buckets[type].pop();
        plan.set(toId(lead._id), { lead, to: receiver });
        load.set(toId(donor._id), loadOf(donor) - 1);
        load.set(toId(receiver._id), loadOf(receiver) + 1);
        movedOne = true;
        break;
      }
      if (movedOne) break;
    }
    if (!movedOne) break;
  }

  // Managers: the nearest MANAGER above the executive (or the direct parent).
  const parentUserIds = [...new Set(executives.map((executive) => toId(executive.parentId)).filter(Boolean))];
  const parentUsers = parentUserIds.length
    ? await User.find({ _id: { $in: parentUserIds }, isActive: true, ...(companyId ? { companyId } : {}) })
      .select("_id role parentId")
      .lean()
    : [];
  const parentById = new Map(parentUsers.map((user) => [toId(user._id), user]));
  const managerIdByExecutiveId = new Map();
  const resolveManagerId = (executive) => {
    const executiveId = toId(executive?._id);
    if (!executiveId) return null;
    if (managerIdByExecutiveId.has(executiveId)) return managerIdByExecutiveId.get(executiveId);
    const visited = new Set();
    let cursor = executive;
    let managerId = null;
    while (cursor?.parentId) {
      const parentId = toId(cursor.parentId);
      if (!parentId || visited.has(parentId)) break;
      visited.add(parentId);
      const parent = parentById.get(parentId) || executiveById.get(parentId) || null;
      if (!parent) break;
      if (parent.role === USER_ROLES.MANAGER) {
        managerId = parent._id;
        break;
      }
      cursor = parent;
    }
    if (!managerId) managerId = executive.parentId || null;
    managerIdByExecutiveId.set(executiveId, managerId);
    return managerId;
  };

  const ownerFields = (executive) => {
    const isExecutive = executive.role === USER_ROLES.EXECUTIVE || INSIDE_EXECUTIVE_ROLES.includes(executive.role);
    const isFieldExecutive = executive.role === USER_ROLES.FIELD_EXECUTIVE;
    return {
      assignedTo: executive._id,
      assignedManager: resolveManagerId(executive),
      assignedExecutive: isExecutive ? executive._id : null,
      assignedFieldExecutive: isFieldExecutive ? executive._id : null,
    };
  };

  const now = new Date();
  const leadUpdates = [];
  const activities = [];
  const touchedExecutiveIds = new Set();

  pipelineLeads.forEach((lead) => {
    const move = plan.get(toId(lead._id));
    if (move) {
      leadUpdates.push({
        updateOne: {
          filter: { _id: lead._id },
          update: {
            $set: ownerFields(move.to),
            $push: {
              assignmentHistory: {
                action: lead.assignedTo ? "REBALANCED" : "AUTO_ASSIGNED",
                fromUser: lead.assignedTo || null,
                toUser: move.to._id,
                reason: REBALANCE_REASON,
                statusAtTransfer: String(lead.status || ""),
                createdAt: now,
                createdBy: performedBy || null,
              },
            },
          },
        },
      });
      activities.push({
        lead: lead._id,
        action: lead.assignedTo ? `Moved to ${move.to.name} (team rebalance)` : `Assigned to ${move.to.name} (team rebalance)`,
        performedBy: performedBy || null,
      });
      touchedExecutiveIds.add(toId(move.to._id));
      return;
    }

    // Kept: only the manager / executive fields are brought in line (the team may have been re-parented).
    const owner = executiveById.get(toId(lead.assignedTo));
    if (!owner) return;
    const fields = ownerFields(owner);
    const stale =
      toId(lead.assignedManager) !== toId(fields.assignedManager)
      || toId(lead.assignedExecutive) !== toId(fields.assignedExecutive)
      || toId(lead.assignedFieldExecutive) !== toId(fields.assignedFieldExecutive);
    if (stale) leadUpdates.push({ updateOne: { filter: { _id: lead._id }, update: { $set: fields } } });
  });

  if (leadUpdates.length) await Lead.bulkWrite(leadUpdates);
  if (activities.length) await LeadActivity.insertMany(activities);
  if (touchedExecutiveIds.size) {
    await User.updateMany({ _id: { $in: [...touchedExecutiveIds] } }, { $set: { lastAssignedAt: now } });
  }

  // WhatsApp chats follow their leads; in the background, one at a time.
  const linkedMoves = [...plan.values()].filter(({ lead }) => lead.whatsapp?.linkedAt);
  if (linkedMoves.length) {
    (async () => {
      for (const { lead, to } of linkedMoves) {
        // eslint-disable-next-line no-await-in-loop
        await notifyLeadAssigned({ lead, assignee: { name: to.name, email: to.email } });
      }
    })().catch(() => undefined);
  }

  return {
    updated: leadUpdates.length,
    moved: plan.size,
    totalLeads: pipelineLeads.length,
    executiveCount: executives.length,
    unassignable,
  };
};

module.exports = {
  EXECUTIVE_ROLES,
  PIPELINE_STATUSES,
  MAX_ACTIVE_LEADS_PER_EXECUTIVE,
  REBALANCE_MOVABLE_STATUSES,
  autoAssignLead,
  redistributePipelineLeads,
};
