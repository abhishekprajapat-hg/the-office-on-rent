import React, { useEffect, useMemo, useState } from "react";
import { motion as Motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Building2,
  Clock3,
  Handshake,
  Loader,
  MapPin,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import api from "../../services/api";
import LeadPerformancePanel from "../../components/dashboard/LeadPerformancePanel";
import { toErrorMessage } from "../../utils/errorMessage";

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

const ManagerDashboard = ({ theme = "light" }) => {
  const isDark = theme === "dark";
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    revenue: 0,
    leads: 0,
    assets: 0,
    negotiation: 0,
    closed: 0,
    visits: 0,
  });
  const [leadRows, setLeadRows] = useState([]);
  const [userRows, setUserRows] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);

  const currentUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);
  const currentUserId = String(currentUser?.id || currentUser?._id || "");
  const currentUserRole = String(currentUser?.role || "");

  useEffect(() => {
    const fetchRealData = async () => {
      try {
        setError("");

        const [leadsRes, inventoryRes, usersRes] = await Promise.all([
          api.get("/leads"),
          api.get("/inventory"),
          api.get("/users", {
            params: {
              pagination: "false",
              fields: "_id,name,role,parentId,isActive",
            },
          }),
        ]);

        const leadsData = leadsRes?.data?.leads || [];
        const inventoryAssets = inventoryRes?.data?.assets || [];
        const usersData = usersRes?.data?.users || [];
        setLeadRows(Array.isArray(leadsData) ? leadsData : []);
        setUserRows(Array.isArray(usersData) ? usersData : []);
        setInventoryRows(Array.isArray(inventoryAssets) ? inventoryAssets : []);

        const closedLeadCount = leadsData.filter((lead) => lead.status === "CLOSED").length;
        const siteVisitCount = leadsData.filter((lead) => lead.status === "SITE_VISIT").length;
        const negotiationCount = leadsData.filter((lead) =>
          ["CONTACTED", "INTERESTED", "SITE_VISIT"].includes(lead.status),
        ).length;

        const totalRevenue = closedLeadCount * 75000;

        setStats({
          revenue: totalRevenue,
          leads: leadsData.length,
          assets: Array.isArray(inventoryAssets) ? inventoryAssets.length : 0,
          negotiation: negotiationCount,
          closed: closedLeadCount,
          visits: siteVisitCount,
        });
      } catch (err) {
        const message = toErrorMessage(err);
        console.error("Dashboard fetch error:", message);
        setError(message);
        setLeadRows([]);
        setUserRows([]);
        setInventoryRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRealData();
  }, []);

  const derived = useMemo(() => {
    const conversionPercent = stats.leads ? Math.round((stats.closed / stats.leads) * 100) : 0;
    const activePipeline = Math.max(stats.leads - stats.closed, 0);
    const avgTicket = stats.closed ? Math.round(stats.revenue / stats.closed) : 0;
    const visitShare = stats.leads ? Math.round((stats.visits / stats.leads) * 100) : 0;
    const negotiationShare = stats.leads ? Math.round((stats.negotiation / stats.leads) * 100) : 0;

    return {
      conversionPercent,
      activePipeline,
      avgTicket,
      visitShare,
      negotiationShare,
    };
  }, [stats]);

  const subordinatePerformance = useMemo(() => {
    if (!currentUserId || !Array.isArray(userRows) || !userRows.length) {
      return { title: "", countLabel: "Reports", rows: [] };
    }

    const activeUsers = userRows.filter((user) => user && user.isActive !== false);
    const childrenByParent = new Map();
    const isExecutiveRole = (role) =>
      role === "EXECUTIVE" || role === "FIELD_EXECUTIVE";

    activeUsers.forEach((user) => {
      const parentId = toEntityId(user.parentId);
      if (!parentId) return;
      const bucket = childrenByParent.get(parentId) || [];
      bucket.push(user);
      childrenByParent.set(parentId, bucket);
    });

    const leadAssigneeId = (lead) => toEntityId(lead?.assignedTo);

    if (currentUserRole === "MANAGER") {
      const directExecutives = activeUsers.filter((user) => {
        if (!isExecutiveRole(String(user.role || ""))) return false;
        return toEntityId(user.parentId) === currentUserId;
      });

      const rows = directExecutives.map((executive) => {
        const executiveId = toEntityId(executive._id);

        const scopedLeads = leadRows.filter((lead) => {
          const assigneeId = leadAssigneeId(lead);
          return assigneeId && assigneeId === executiveId;
        });

        return {
          id: executiveId,
          name: executive?.name || "Executive",
          leads: scopedLeads,
          subtitle: String(executive?.role || "") === "FIELD_EXECUTIVE"
            ? "Field Executive"
            : "Executive",
        };
      });

      return {
        title: "Team Performance",
        countLabel: "Direct reports",
        rows,
      };
    }

    return { title: "", countLabel: "Reports", rows: [] };
  }, [currentUserId, currentUserRole, leadRows, userRows]);

  const kpiCards = useMemo(
    () => [
      {
        label: "Estimated Revenue",
        value: `Rs ${(stats.revenue / 100000).toFixed(2)}L`,
        helper: `${stats.closed} closed x Rs 75k`,
        icon: Activity,
        to: "/finance",
        tone: isDark ? "text-cyan-200" : "text-cyan-700",
        accent: isDark
          ? "border-cyan-400/30 from-cyan-500/20 to-slate-900/0"
          : "border-cyan-200 from-cyan-100 to-white",
      },
      {
        label: "Total Leads",
        value: stats.leads,
        helper: `${derived.activePipeline} still in pipeline`,
        icon: Users,
        to: "/leads",
        tone: isDark ? "text-violet-200" : "text-violet-700",
        accent: isDark
          ? "border-violet-400/30 from-violet-500/20 to-slate-900/0"
          : "border-violet-200 from-violet-100 to-white",
      },
      {
        label: "Inventory Assets",
        value: stats.assets,
        helper: `${derived.conversionPercent}% close efficiency`,
        icon: Building2,
        to: "/inventory",
        tone: isDark ? "text-emerald-200" : "text-emerald-700",
        accent: isDark
          ? "border-emerald-400/30 from-emerald-500/20 to-slate-900/0"
          : "border-emerald-200 from-emerald-100 to-white",
      },
    ],
    [derived.activePipeline, derived.conversionPercent, isDark, stats],
  );

  const pipelineCards = useMemo(
    () => [
      {
        label: "Negotiation",
        value: stats.negotiation,
        progress: derived.negotiationShare,
        icon: Handshake,
        to: "/leads",
        bar: "from-cyan-500 to-blue-500",
      },
      {
        label: "Site Visits",
        value: stats.visits,
        progress: derived.visitShare,
        icon: MapPin,
        to: "/calendar",
        bar: "from-violet-500 to-pink-500",
      },
      {
        label: "Closed Deals",
        value: stats.closed,
        progress: derived.conversionPercent,
        icon: Zap,
        to: "/leads",
        bar: "from-emerald-500 to-teal-500",
      },
      {
        label: "Conversion",
        value: `${derived.conversionPercent}%`,
        progress: derived.conversionPercent,
        icon: Target,
        to: "/targets",
        bar: "from-amber-500 to-orange-500",
      },
    ],
    [derived.conversionPercent, derived.negotiationShare, derived.visitShare, stats],
  );

  const deckChips = useMemo(
    () => [
      {
        label: "Active Pipeline",
        value: derived.activePipeline,
        to: "/leads",
      },
      {
        label: "Visit Intensity",
        value: `${derived.visitShare}%`,
        to: "/calendar",
      },
      {
        label: "Avg Closed Ticket",
        value: derived.avgTicket ? `Rs ${(derived.avgTicket / 1000).toFixed(1)}k` : "Rs 0",
        to: "/finance",
      },
    ],
    [derived.activePipeline, derived.avgTicket, derived.visitShare],
  );

  const funnelSignals = useMemo(
    () => [
      {
        label: "Negotiation Load",
        value: `${stats.negotiation}/${stats.leads || 0}`,
        progress: derived.negotiationShare,
        to: "/leads",
        bar: "from-cyan-500 to-blue-500",
      },
      {
        label: "Visit Momentum",
        value: `${stats.visits}/${stats.leads || 0}`,
        progress: derived.visitShare,
        to: "/calendar",
        bar: "from-violet-500 to-pink-500",
      },
      {
        label: "Close Momentum",
        value: `${stats.closed}/${stats.leads || 0}`,
        progress: derived.conversionPercent,
        to: "/targets",
        bar: "from-emerald-500 to-teal-500",
      },
    ],
    [derived.conversionPercent, derived.negotiationShare, derived.visitShare, stats.closed, stats.leads, stats.negotiation, stats.visits],
  );

  const commandCenterRows = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const toDate = (value) => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const todayFollowUps = leadRows
      .map((lead) => ({ ...lead, followUpAt: toDate(lead.nextFollowUp) }))
      .filter((lead) => lead.followUpAt && lead.followUpAt >= todayStart && lead.followUpAt <= todayEnd)
      .sort((left, right) => left.followUpAt - right.followUpAt)
      .slice(0, 5);

    const pendingApprovals = leadRows.filter((lead) =>
      String(lead?.status || "").toUpperCase() === "REQUESTED").length;

    const inventoryStatusRows = ["Available", "Blocked", "Sold"].map((status) => ({
      label: status,
      count: inventoryRows.filter((asset) => String(asset?.status || "") === status).length,
    }));

    const activeUsers = userRows.filter((user) => user?.isActive !== false).length;
    const recentActivity = [...leadRows]
      .sort((left, right) => {
        const leftDate = toDate(left.updatedAt || left.createdAt)?.getTime() || 0;
        const rightDate = toDate(right.updatedAt || right.createdAt)?.getTime() || 0;
        return rightDate - leftDate;
      })
      .slice(0, 5);

    return {
      todayFollowUps,
      pendingApprovals,
      inventoryStatusRows,
      activeUsers,
      recentActivity,
    };
  }, [inventoryRows, leadRows, userRows]);

  const containerMotion = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.42, ease: "easeOut", staggerChildren: 0.08 },
    },
  };

  const itemMotion = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: "easeOut" } },
  };

  if (loading) {
    return (
      <div
        className="ui-page-shell flex h-full w-full items-center justify-center px-4"
      >
        <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${
          isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
        }`}>
          <Loader className="animate-spin" />
          Loading home dashboard...
        </div>
      </div>
    );
  }

  return (
    <Motion.div
      initial="hidden"
      animate="visible"
      variants={containerMotion}
      className={`ui-page-shell relative h-full w-full overflow-y-auto custom-scrollbar ${
        isDark ? "bg-slate-950" : "bg-slate-100"
      }`}
    >
      <Motion.section
        variants={itemMotion}
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {deckChips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => navigate(chip.to)}
            className={`min-h-28 rounded-2xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 ${
              isDark
                ? "border-slate-700 bg-slate-900/85 hover:border-sky-300/40"
                : "border-slate-200 bg-white hover:border-sky-300"
            }`}
          >
            <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {chip.label}
            </p>
            <p className={`mt-3 text-2xl font-display ${isDark ? "text-slate-100" : "text-slate-900"}`}>
              {chip.value}
            </p>
          </button>
        ))}

        <div className={`min-h-28 rounded-2xl border p-4 shadow-sm ${
          isDark ? "border-slate-700 bg-slate-900/85" : "border-slate-200 bg-white"
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
              isDark
                ? "border-emerald-300/35 bg-emerald-500/10 text-emerald-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}>
              <BarChart3 size={14} />
              Live Intelligence
            </div>
            <Clock3 size={13} className={isDark ? "text-slate-400" : "text-slate-500"} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div>
              <p className={`text-[9px] uppercase tracking-[0.12em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Close</p>
              <p className={`mt-1 text-lg font-display ${isDark ? "text-emerald-100" : "text-emerald-700"}`}>
                {derived.conversionPercent}%
              </p>
            </div>
            <div>
              <p className={`text-[9px] uppercase tracking-[0.12em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Pipeline</p>
              <p className={`mt-1 text-lg font-display ${isDark ? "text-sky-100" : "text-sky-700"}`}>
                {derived.activePipeline}
              </p>
            </div>
            <div>
              <p className={`text-[9px] uppercase tracking-[0.12em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Ticket</p>
              <p className={`mt-1 text-lg font-display ${isDark ? "text-amber-100" : "text-amber-700"}`}>
                {derived.avgTicket ? `Rs ${(derived.avgTicket / 1000).toFixed(1)}k` : "Rs 0"}
              </p>
            </div>
          </div>
        </div>
      </Motion.section>

      {error && (
        <Motion.div
          variants={itemMotion}
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            isDark
              ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
              : "border-amber-300 bg-amber-50 text-amber-700"
          }`}
        >
          {error}
        </Motion.div>
      )}

      <Motion.section variants={itemMotion} className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {kpiCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => navigate(card.to)}
            className={`group relative overflow-hidden rounded-3xl border p-5 text-left transition-all hover:-translate-y-0.5 ${
              isDark
                ? "border-slate-700 bg-slate-900/85 hover:border-slate-500"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${
              card.label === "Estimated Revenue"
                ? "from-cyan-500 to-sky-500"
                : card.label === "Total Leads"
                  ? "from-slate-500 to-slate-700"
                  : "from-emerald-500 to-teal-500"
            }`} />

            <div className="relative">
              <div className="flex items-center justify-between">
                <p className={`text-[11px] uppercase tracking-[0.2em] ${isDark ? "text-slate-300" : "text-slate-500"}`}>
                  {card.label}
                </p>
                <card.icon size={16} className={card.tone} />
              </div>
              <p className={`mt-3 text-3xl font-display tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                {card.value}
              </p>
              <p className={`mt-2 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {card.helper}
              </p>
            </div>
          </button>
        ))}
      </Motion.section>

      <Motion.div variants={itemMotion}>
        <div className={`rounded-3xl border p-3 sm:p-4 ${
          isDark ? "border-slate-700 bg-slate-900/80" : "border-slate-200 bg-white"
        }`}>
          <LeadPerformancePanel
            leads={leadRows}
            theme={theme}
            accent={isDark ? "violet" : "cyan"}
            title="Role Performance Graph"
            subtitle="Live stage distribution for your accessible pipeline"
          />
        </div>
      </Motion.div>

      <Motion.section variants={itemMotion} className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <CommandPanel
          title="Today's Follow-ups"
          subtitle={`${commandCenterRows.todayFollowUps.length} scheduled`}
          isDark={isDark}
        >
          {commandCenterRows.todayFollowUps.length ? (
            <div className="space-y-2">
              {commandCenterRows.todayFollowUps.map((lead) => (
                <button
                  key={lead._id}
                  type="button"
                  onClick={() => navigate("/leads")}
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    isDark ? "border-slate-700 bg-slate-950/70" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className={isDark ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>
                    {lead.name || lead.phone || "Lead"}
                  </p>
                  <p className={isDark ? "text-xs text-slate-400" : "text-xs text-slate-500"}>
                    {lead.followUpAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} | {lead.status || "-"}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyCommandState text="No follow-ups scheduled for today." isDark={isDark} />
          )}
        </CommandPanel>

        <CommandPanel title="Pending Approvals" subtitle="Lead requests" isDark={isDark}>
          <button
            type="button"
            onClick={() => navigate("/admin/notifications")}
            className={`w-full rounded-2xl border px-4 py-5 text-left ${
              isDark ? "border-amber-500/30 bg-amber-500/10" : "border-amber-200 bg-amber-50"
            }`}
          >
            <p className={isDark ? "text-3xl font-bold text-amber-100" : "text-3xl font-bold text-amber-800"}>
              {commandCenterRows.pendingApprovals}
            </p>
            <p className={isDark ? "mt-1 text-xs text-amber-200" : "mt-1 text-xs text-amber-700"}>
              Leads waiting for decision
            </p>
          </button>
        </CommandPanel>

        <CommandPanel title="Inventory Snapshot" subtitle={`${inventoryRows.length} properties`} isDark={isDark}>
          <div className="space-y-2">
            {commandCenterRows.inventoryStatusRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <span className={isDark ? "text-sm text-slate-300" : "text-sm text-slate-600"}>{row.label}</span>
                <span className={isDark ? "font-semibold text-slate-100" : "font-semibold text-slate-900"}>{row.count}</span>
              </div>
            ))}
          </div>
        </CommandPanel>

        <CommandPanel title="Team Summary" subtitle="Active coverage" isDark={isDark}>
          <div className="grid grid-cols-2 gap-2">
            <MiniCommandMetric label="Active" value={commandCenterRows.activeUsers} isDark={isDark} />
            <MiniCommandMetric label="Total" value={userRows.length} isDark={isDark} />
            <MiniCommandMetric label="Closed" value={stats.closed} isDark={isDark} />
            <MiniCommandMetric label="Visits" value={stats.visits} isDark={isDark} />
          </div>
        </CommandPanel>
      </Motion.section>

      <Motion.section variants={itemMotion} className="mt-6">
        <CommandPanel title="Recent Activity" subtitle="Latest lead movement" isDark={isDark}>
          {commandCenterRows.recentActivity.length ? (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
              {commandCenterRows.recentActivity.map((lead) => (
                <button
                  key={lead._id}
                  type="button"
                  onClick={() => navigate("/leads")}
                  className={`rounded-xl border px-3 py-2 text-left ${
                    isDark ? "border-slate-700 bg-slate-950/70" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className={isDark ? "truncate text-sm font-semibold text-slate-100" : "truncate text-sm font-semibold text-slate-900"}>
                    {lead.name || lead.phone || "Lead"}
                  </p>
                  <p className={isDark ? "mt-1 text-xs text-slate-400" : "mt-1 text-xs text-slate-500"}>
                    {lead.status || "-"}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyCommandState text="No recent activity available." isDark={isDark} />
          )}
        </CommandPanel>
      </Motion.section>

      {subordinatePerformance.rows.length > 0 && (
        <Motion.section variants={itemMotion} className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className={`text-lg font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
              {subordinatePerformance.title}
            </h2>
            <span className={`text-xs uppercase tracking-[0.14em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {subordinatePerformance.countLabel}: {subordinatePerformance.rows.length}
            </span>
          </div>

          <div className="space-y-4">
            {subordinatePerformance.rows.map((row) => (
              <div
                key={row.id}
                className={`rounded-3xl border p-3 ${
                  isDark ? "border-slate-700 bg-slate-900/75" : "border-slate-200 bg-white"
                }`}
              >
                <LeadPerformancePanel
                  leads={row.leads}
                  theme={theme}
                  accent={isDark ? "amber" : "emerald"}
                  compact
                  defaultWindow={6}
                  title={row.name}
                  subtitle={row.subtitle}
                />
              </div>
            ))}
          </div>
        </Motion.section>
      )}

      <Motion.section variants={itemMotion} className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div
          className={`rounded-3xl border p-4 sm:p-5 ${
            isDark ? "border-slate-700 bg-slate-900/80" : "border-slate-200 bg-white"
          }`}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className={`text-lg font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
              Pipeline Snapshot
            </h2>
            <span className={`text-xs uppercase tracking-[0.16em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Status-wise distribution
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pipelineCards.map((card) => (
              <button
                key={card.label}
                type="button"
                onClick={() => navigate(card.to)}
                className={`rounded-2xl border p-4 ${
                  isDark ? "border-slate-700 bg-slate-950/70" : "border-slate-200 bg-slate-50"
                } text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-sm`}
              >
                <div className="flex items-center justify-between">
                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {card.label}
                  </p>
                  <card.icon size={14} className={isDark ? "text-cyan-300" : "text-cyan-700"} />
                </div>
                <p className={`mt-2 text-2xl font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                  {card.value}
                </p>
                <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${card.bar}`}
                    style={{ width: `${Math.min(card.progress, 100)}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div
          className={`rounded-3xl border p-4 sm:p-5 ${
            isDark ? "border-slate-700 bg-slate-900/80" : "border-slate-200 bg-white"
          }`}
        >
          <div className="mb-4">
            <p className={`text-[11px] uppercase tracking-[0.2em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Conversion Engine
            </p>
            <h3 className={`mt-1 text-2xl font-display ${isDark ? "text-slate-100" : "text-slate-900"}`}>
              {derived.conversionPercent}%
            </h3>
          </div>

          <div className="space-y-4">
            {funnelSignals.map((signal) => (
              <button
                key={signal.label}
                type="button"
                onClick={() => navigate(signal.to)}
                className="w-full rounded-xl border border-transparent p-2 text-left transition-colors hover:border-cyan-300/40"
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className={isDark ? "text-slate-300" : "text-slate-600"}>{signal.label}</span>
                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>{signal.value}</span>
                </div>
                <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${signal.bar}`}
                    style={{ width: `${Math.min(signal.progress, 100)}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      </Motion.section>
    </Motion.div>
  );
};

export default ManagerDashboard;

const CommandPanel = ({ title, subtitle, isDark, children }) => (
  <section className={`rounded-3xl border p-4 ${
    isDark ? "border-slate-700 bg-slate-900/80" : "border-slate-200 bg-white"
  }`}>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className={isDark ? "text-sm font-bold text-slate-100" : "text-sm font-bold text-slate-900"}>
          {title}
        </h2>
        <p className={isDark ? "mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-400" : "mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-500"}>
          {subtitle}
        </p>
      </div>
    </div>
    {children}
  </section>
);

const MiniCommandMetric = ({ label, value, isDark }) => (
  <div className={`rounded-xl border px-3 py-2 ${
    isDark ? "border-slate-700 bg-slate-950/70" : "border-slate-200 bg-slate-50"
  }`}>
    <p className={isDark ? "text-[10px] uppercase tracking-[0.12em] text-slate-400" : "text-[10px] uppercase tracking-[0.12em] text-slate-500"}>
      {label}
    </p>
    <p className={isDark ? "mt-1 text-lg font-bold text-slate-100" : "mt-1 text-lg font-bold text-slate-900"}>
      {value}
    </p>
  </div>
);

const EmptyCommandState = ({ text, isDark }) => (
  <div className={`rounded-xl border border-dashed px-4 py-6 text-center text-sm ${
    isDark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"
  }`}>
    {text}
  </div>
);
