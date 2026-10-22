import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Building2, CalendarDays, CheckCheck, CheckCircle2, IndianRupee, ListTodo, Loader, MapPin, Navigation, Phone, PieChart, UserPlus, Users, Zap, Heart, Briefcase } from "lucide-react";
import api from "../../services/api";
import { getLeadSummary } from "../../services/leadService";
import { toErrorMessage } from "../../utils/errorMessage";
import ToastNotice from "../../components/ui/ToastNotice";
import HomeStatusStrip from "../../components/dashboard/HomeStatusStrip";

/*
 * Admin / manager home in the CRM Web Glass design: alert cards, greeting,
 * five KPI cards, leads trend (6M / 12M), inventory donut, today's follow-ups
 * and the pipeline snapshot - then the activity, revenue, visits and quick
 * actions panels the home already had, in the same glass cards.
 */

// Tone -> [foreground, soft background], from the glass tokens.
const TN = {
  blue: ["var(--g-b)", "var(--g-bs)"],
  ok: ["var(--g-ok)", "var(--g-oks)"],
  warn: ["var(--g-warn)", "var(--g-warns)"],
  bad: ["var(--g-bad)", "var(--g-bads)"],
  vio: ["var(--g-vio)", "var(--g-vios)"],
};
const STAGES = [
  ["NEW", "New", ListTodo, "blue"], ["CONTACTED", "Contacted", Phone, "blue"],
  ["INTERESTED", "Interested", Heart, "ok"], ["SITE_VISIT", "Visit", Navigation, "warn"],
  ["REQUESTED", "Requested", Activity, "bad"], ["CLOSED", "Closed", CheckCircle2, "ok"],
];
const money = (v) => Number(v) >= 100000 ? `₹${(Number(v) / 100000).toFixed(1)} L` : `₹${Number(v || 0).toLocaleString("en-IN")}`;
const dateOf = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
const initials = (name = "") => name.split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "NA";
const LIST_FIELDS = "_id,name,phone,status,projectInterested,nextFollowUp,updatedAt";
const leadRows = (res) => (Array.isArray(res?.data?.leads) ? res.data.leads : []);
const totalOf = (res) => Number(res?.data?.pagination?.totalCount ?? res?.data?.count ?? 0);
// One count per inventory status, read from the list's total rather than by
// loading every property (the list is paginated, so counting rows undercounts).
const countInventory = (status) => api.get("/inventory", { params: { limit: 1, fields: "_id", ...(status ? { status } : {}) } }).then(totalOf);

const glass = { background: "var(--g-glass)", border: "1px solid var(--g-line)", boxShadow: "var(--g-shadow)" };
const MUT = { color: "var(--g-mut)" };

const Card = ({ title, action, children, className = "", bodyClassName = "" }) => (
  <section className={`flex min-w-0 flex-col gap-3 rounded-[22px] px-[18px] py-4 ${className}`} style={glass}>
    <header className="flex items-center gap-2.5">
      <h2 className="flex-1 text-[15px] font-extrabold">{title}</h2>
      {action}
    </header>
    <div className={`min-w-0 flex-1 ${bodyClassName}`}>{children}</div>
  </section>
);

const ViewAll = ({ onClick, children = "View all" }) => (
  <button type="button" onClick={onClick} className="text-[12.5px] font-bold" style={{ color: "var(--g-b)" }}>{children}</button>
);

// Sliding two-way switch (6M / 12M).
const RangeSwitch = ({ value, options, onChange }) => (
  <div className="relative flex rounded-[11px] p-[3px]" style={{ background: "var(--g-track)" }} role="group" aria-label="Trend range">
    <span
      aria-hidden="true"
      className="absolute bottom-[3px] left-[3px] top-[3px] rounded-[9px]"
      style={{
        width: `calc((100% - 6px) / ${options.length})`,
        background: "var(--g-glassHi)", border: "1px solid var(--g-line)", boxShadow: "0 2px 8px rgba(0,0,0,.08)",
        transform: `translateX(${options.indexOf(value) * 100}%)`,
        transition: "transform .45s cubic-bezier(.34,1.36,.5,1)",
      }}
    />
    {options.map((o) => (
      <button
        key={o}
        type="button"
        aria-pressed={o === value}
        onClick={() => onChange(o)}
        className="relative grid h-7 w-14 place-items-center text-[12px] font-bold"
        style={{ color: o === value ? "var(--g-ink)" : "var(--g-mut)", transition: "color .25s" }}
      >
        {o}
      </button>
    ))}
  </div>
);

// New vs closed leads per month, from the lead summary (real records only).
const CHART_H = 190, AXIS_H = 22;
const TrendChart = ({ rows = [] }) => {
  if (!rows.length) return <p className="grid h-[190px] place-items-center text-xs" style={MUT}>No lead data yet</p>;
  const max = Math.max(...rows.map((r) => Math.max(r.newLeads, r.closed)), 1) * 1.12;
  const step = rows.length > 1 ? 100 / (rows.length - 1) : 0;
  const pts = (key) => rows.map((r, i) => [rows.length > 1 ? i * step : 50, 100 - (r[key] / max) * 100]);
  const line = (p) => p.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y.toFixed(2)}`).join(" ");
  const np = pts("newLeads"), cp = pts("closed");
  const plotH = CHART_H - AXIS_H;
  const labelEvery = rows.length > 6 ? 2 : 1;
  const dot = (x, y, color, key, title) => (
    <i
      key={key}
      title={title}
      className="absolute box-border h-[9px] w-[9px] rounded-full"
      style={{ left: `${x}%`, top: `${(y / 100) * plotH}px`, margin: "-4.5px 0 0 -4.5px", background: "var(--g-glassHi)", border: `2.5px solid ${color}`, transition: "top .6s cubic-bezier(.3,1,.4,1), left .6s cubic-bezier(.3,1,.4,1)" }}
    />
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3.5 text-[12px] font-semibold" style={MUT}>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "var(--g-b)" }} />New leads</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "var(--g-ok)" }} />Closed</span>
      </div>
      <div className="relative" style={{ height: CHART_H }} role="img" aria-label="New and closed leads per month">
        <div className="absolute inset-x-0 top-0 flex flex-col justify-between" style={{ bottom: AXIS_H }}>
          {[0, 1, 2, 3].map((k) => <i key={k} className="block h-px" style={{ background: "var(--g-grid)" }} />)}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-0 top-0 w-full overflow-visible" style={{ height: plotH }}>
          <defs>
            <linearGradient id="glArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--g-b)", stopOpacity: 0.32 }} />
              <stop offset="1" style={{ stopColor: "var(--g-b)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d={`${line(np)} L100 100 L0 100 Z`} fill="url(#glArea)" />
          <path d={line(np)} fill="none" stroke="var(--g-b)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <path d={line(cp)} fill="none" stroke="var(--g-ok)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {np.map(([x, y], i) => dot(x, y, "var(--g-b)", `n${i}`, `${rows[i].label}: ${rows[i].newLeads} new`))}
        {cp.map(([x, y], i) => dot(x, y, "var(--g-ok)", `c${i}`, `${rows[i].label}: ${rows[i].closed} closed`))}
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-[11px] font-semibold" style={{ color: "var(--g-fnt)" }}>
          {rows.filter((_, i) => i % labelEvery === labelEvery - 1 || labelEvery === 1).map((r) => <span key={r.month}>{r.label}</span>)}
        </div>
      </div>
    </div>
  );
};

// Brokerage received on closed deals per month this year.
const RevenueBars = ({ rows = [] }) => {
  const max = Math.max(...rows.map((r) => r.revenue), 0);
  return <div className="relative flex h-[220px] items-end gap-3 px-2 pb-1 pt-3">{rows.map((r) => <div key={r.month} className="flex h-full flex-1 flex-col justify-end gap-1" title={`${r.label}: ${money(r.revenue)}`}>
    <small className="text-center text-[9px] font-semibold" style={MUT}>{r.revenue ? money(r.revenue) : ""}</small>
    <div className="rounded-t-md" style={{ background: "linear-gradient(to top, var(--g-ok), color-mix(in srgb, var(--g-ok) 45%, transparent))", height: `${max ? Math.max((r.revenue / max) * 100, r.revenue ? 3 : 0) : 0}%` }} />
    <span className="text-center text-[11px] font-semibold" style={{ color: "var(--g-fnt)" }}>{r.label}</span>
  </div>)}{!max ? <p className="absolute inset-x-0 top-1/2 text-center text-xs" style={MUT}>No brokerage recorded this year</p> : null}</div>;
};

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [summary, setSummary] = useState(null), [lists, setLists] = useState({ follow: [], upcoming: [], recent: [] });
  const [inventoryCounts, setInventoryCounts] = useState({ total: 0, available: 0, blocked: 0, sold: 0 }), [users, setUsers] = useState([]);
  const [untouched, setUntouched] = useState(null);
  const [range, setRange] = useState("6M");
  const user = useMemo(() => { try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; } }, []);
  useEffect(() => {
    let live = true;
    const now = new Date(), start = new Date(now), end = new Date(now);
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
    const list = (params) => api.get("/leads", { params: { fields: LIST_FIELDS, ...params } }).then(leadRows);
    Promise.all([
      getLeadSummary(),
      list({ followUpFrom: start.toISOString(), followUpTo: end.toISOString(), sortBy: "nextFollowUp", limit: 4 }),
      list({ followUpFrom: now.toISOString(), sortBy: "nextFollowUp", limit: 3 }),
      list({ sortBy: "-updatedAt", limit: 4 }),
      Promise.all([countInventory(), countInventory("Available"), countInventory("Blocked"), countInventory("Sold")]),
      api.get("/users", { params: { pagination: "false", fields: "_id,name,role,isActive" } }),
    ]).then(([leadSummary, follow, upcoming, recent, [total, available, blocked, sold], usersRes]) => {
      if (!live) return;
      setSummary(leadSummary);
      setLists({ follow, upcoming, recent });
      setInventoryCounts({ total, available, blocked, sold });
      setUsers(usersRes.data?.users || []);
    }).catch((e) => live && setError(toErrorMessage(e, "Failed to load dashboard"))).finally(() => live && setLoading(false));
    // For the empty follow-ups card ("N untouched leads are waiting...").
    api.get("/leads", { params: { touchState: "UNTOUCHED", limit: 1, page: 1, fields: "_id" } })
      .then((r) => live && setUntouched(Number(r.data?.pagination?.totalCount ?? r.data?.leads?.length ?? 0)))
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const d = useMemo(() => {
    const { total, available, blocked, sold } = inventoryCounts;
    const byStatus = summary?.byStatus || {}, monthly = Array.isArray(summary?.monthly) ? summary.monthly : [];
    const thisMonth = monthly[monthly.length - 1] || null, thisYear = thisMonth?.year;
    const withWhen = (rows) => rows.map((x) => ({ ...x, when: dateOf(x.nextFollowUp) })).filter((x) => x.when);
    const stages = STAGES.map(([key, label, icon, tone]) => ({ key, label, icon, tone, value: Number(byStatus[key] || 0) }));
    return {
      total, available, blocked, occupied: sold, occupancy: total ? Math.round(sold / total * 100) : 0,
      leadTotal: Number(summary?.total || 0), closedCount: Number(summary?.closed || 0), openCount: Number(summary?.open || 0),
      revenue: Number(thisMonth?.revenue || 0),
      trend6: monthly.slice(-6), trend12: monthly.slice(-12), yearRevenue: monthly.filter((m) => m.year === thisYear),
      follow: withWhen(lists.follow), followCount: Number(summary?.followUpsToday || 0), upcoming: withWhen(lists.upcoming), recent: lists.recent, stages,
    };
  }, [inventoryCounts, lists, summary]);

  if (loading) return <div className="grid h-full place-items-center"><span className="flex items-center gap-2 text-sm" style={MUT}><Loader className="animate-spin" size={18} />Loading dashboard...</span></div>;

  const hour = new Date().getHours(), greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const pct = (v) => (d.leadTotal ? Math.round((v / d.leadTotal) * 100) : 0);
  const share = (v) => (d.total ? Math.round((v / d.total) * 100) : 0);

  // Donut: r=46 circle, round caps, a small gap between segments.
  const C = 2 * Math.PI * 46;
  const segments = [["Available", d.available, "var(--g-ok)"], ["Occupied / sold", d.occupied, "var(--g-b)"], ["Blocked", d.blocked, "var(--g-warn)"]];
  let donutOffset = 0;
  const donut = segments.map(([label, value, color]) => {
    const len = d.total ? (value / d.total) * C : 0;
    const seg = { label, color, dash: `${Math.max(len - (len > 6 ? 4 : 0), 0)} ${C}`, offset: -donutOffset };
    donutOffset += len;
    return seg;
  });

  const kpis = [
    ["Total properties", d.total, "Active in portfolio", Building2, "vio", "/inventory"],
    ["Total clients", d.closedCount, "Closed deals", Users, "blue", "/coworking/clients"],
    ["Current occupancy", `${d.occupancy}%`, `${d.occupied} / ${d.total || 0} units occupied`, PieChart, "vio", "/inventory"],
    ["Open leads", d.openCount, `${d.stages.find((x) => x.key === "INTERESTED")?.value || 0} interested`, Activity, "bad", "/leads"],
    ["Monthly revenue", money(d.revenue), "Brokerage received this month", IndianRupee, "ok", "/finance"],
  ];

  return (
    <div className="ui-page-shell custom-scrollbar h-full overflow-y-auto" style={{ color: "var(--g-ink)" }}>
      <ToastNotice message={error} type="error" />
      <div className="flex flex-col gap-3.5 pb-4">
        <HomeStatusStrip />

        <header className="flex flex-col gap-[3px] px-1 pt-1">
          <h1 className="text-[26px] font-extrabold tracking-[-.02em]">{greeting}, {user?.name || "Admin"}</h1>
          <p className="text-[13.5px]" style={MUT}>Here&apos;s what&apos;s happening with your workspace today.</p>
        </header>

        <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          {kpis.map(([label, value, help, Icon, tone, to]) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate(to)}
              className="flex flex-col gap-2.5 rounded-[22px] p-4 text-left transition-transform duration-300 [transition-timing-function:cubic-bezier(.3,1.3,.5,1)] hover:-translate-y-[3px]"
              style={glass}
            >
              <span className="flex items-center gap-2.5">
                <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px]" style={{ background: TN[tone][1], color: TN[tone][0] }}>{React.createElement(Icon, { size: 19 })}</span>
                <span className="text-[13px] font-semibold" style={MUT}>{label}</span>
              </span>
              <strong className="text-[28px] font-extrabold leading-[30px] tracking-[-.03em]">{value}</strong>
              <span className="truncate text-[12.5px]" style={MUT}>{help}</span>
            </button>
          ))}
        </section>

        <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr))]">
          <Card title="Leads trend" action={<RangeSwitch value={range} options={["6M", "12M"]} onChange={setRange} />}>
            <TrendChart rows={range === "6M" ? d.trend6 : d.trend12} />
          </Card>

          <Card title="Inventory status" action={<ViewAll onClick={() => navigate("/inventory")} />}>
            <div className="flex h-full flex-wrap items-center gap-5">
              <div className="relative h-[140px] w-[140px] flex-none">
                <svg width="140" height="140" viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="60" cy="60" r="46" fill="none" stroke="var(--g-track)" strokeWidth="14" />
                  {donut.map((s) => <circle key={s.label} cx="60" cy="60" r="46" fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={s.dash} strokeDashoffset={s.offset} strokeLinecap="round" />)}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[26px] font-extrabold tracking-[-.02em]">{d.total}</span>
                  <span className="text-[11px] font-semibold" style={MUT}>Total units</span>
                </div>
              </div>
              <ul className="flex min-w-[150px] flex-1 flex-col gap-3">
                {segments.map(([label, value, color]) => (
                  <li key={label} className="flex items-center gap-[9px]">
                    <i className="h-[9px] w-[9px] rounded-full" style={{ background: color }} />
                    <span className="flex-1 text-[13px] font-semibold" style={MUT}>{label}</span>
                    <span className="text-[13.5px] font-extrabold">{value} ({share(value)}%)</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card title={d.followCount ? `Today's follow-ups (${d.followCount})` : "Today's follow-ups"} action={<ViewAll onClick={() => navigate("/leads")} />}>
            {d.follow.length ? (
              <div className="flex flex-col gap-2">
                {d.follow.map((lead, i) => (
                  <button key={lead._id} type="button" onClick={() => navigate(`/leads/${lead._id}`)} className="flex w-full items-center gap-3 rounded-[15px] p-2.5 text-left" style={{ background: "var(--g-glass2)", border: "1px solid var(--g-line)" }}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-extrabold" style={{ background: i % 2 ? TN.vio[1] : TN.blue[1], color: i % 2 ? TN.vio[0] : TN.blue[0] }}>{initials(lead.name)}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-bold">{lead.name || "Lead"}</b>
                      <small className="block truncate text-[11.5px] capitalize" style={MUT}>{String(lead.status || "").replace(/_/g, " ").toLowerCase()}</small>
                    </span>
                    <time className="text-[11.5px] font-bold" style={MUT}>{lead.when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</time>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-2.5 text-center">
                <span className="grid h-[52px] w-[52px] place-items-center rounded-[18px]" style={{ background: TN.ok[1], color: TN.ok[0] }}><CheckCheck size={24} /></span>
                <span className="text-[14px] font-extrabold">No follow-ups today</span>
                {untouched ? (
                  <>
                    <span className="max-w-[220px] text-[12.5px]" style={MUT}>{untouched} untouched lead{untouched === 1 ? " is" : "s are"} waiting for a first call.</span>
                    <button type="button" onClick={() => navigate("/leads?touchState=UNTOUCHED&view=ALL")} className="mt-0.5 rounded-[11px] px-3.5 py-2 text-[12.5px] font-bold text-white" style={{ background: "var(--g-bfill)", boxShadow: "0 6px 16px var(--g-bglow)" }}>Start calling</button>
                  </>
                ) : (
                  <span className="max-w-[220px] text-[12.5px]" style={MUT}>You&apos;re all caught up.</span>
                )}
              </div>
            )}
          </Card>
        </section>

        <Card title="Pipeline snapshot" action={<span className="text-[12.5px]" style={MUT}>{d.leadTotal} leads</span>}>
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            {d.stages.map((s) => {
              const [fg] = TN[s.tone];
              const p = pct(s.value);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => navigate("/leads")}
                  className="flex flex-col gap-2.5 rounded-[18px] p-3.5 text-left transition-transform duration-300 hover:-translate-y-[3px]"
                  style={{ background: `color-mix(in srgb, ${fg} 8%, var(--g-glass2))`, border: "1px solid var(--g-line)" }}
                >
                  <span className="flex items-center gap-2" style={{ color: fg }}>
                    <s.icon size={16} />
                    <span className="text-[13px] font-bold" style={{ color: "var(--g-ink)" }}>{s.label}</span>
                  </span>
                  <span className="flex items-baseline justify-between">
                    <strong className="text-[22px] font-extrabold">{s.value}</strong>
                    <small className="text-[12px] font-bold" style={MUT}>{p}%</small>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-[3px]" style={{ background: "var(--g-track)" }}>
                    <i className="block h-full rounded-[3px]" style={{ width: `${p}%`, background: fg }} />
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr))]">
          <Card title="Recent activity" action={<ViewAll onClick={() => navigate("/leads")} />}>
            <div className="flex flex-col">
              {d.recent.length ? d.recent.map((lead, i) => (
                <button key={lead._id} type="button" onClick={() => navigate(`/leads/${lead._id}`)} className="flex w-full items-start gap-3 py-2.5 text-left" style={i ? { borderTop: "1px solid var(--g-div)" } : undefined}>
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--g-b)" }} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] font-bold capitalize">{i ? String(lead.status || "").replace(/_/g, " ").toLowerCase() : "Lead updated"}</b>
                    <small className="block truncate text-[11.5px]" style={MUT}>{lead.name || lead.phone}</small>
                  </span>
                  <time className="text-[11.5px] font-semibold" style={MUT}>{dateOf(lead.updatedAt)?.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</time>
                </button>
              )) : <p className="py-10 text-center text-xs" style={MUT}>No recent activity</p>}
            </div>
          </Card>

          <Card title="Revenue overview" action={<span className="text-[12px]" style={MUT}>This year · brokerage received</span>}>
            <RevenueBars rows={d.yearRevenue} />
          </Card>

          <div className="flex min-w-0 flex-col gap-3">
            <Card title="Upcoming visits" action={<ViewAll onClick={() => navigate("/calendar")}>View calendar</ViewAll>}>
              <div className="flex flex-col gap-2">
                {d.upcoming.length ? d.upcoming.map((lead) => (
                  <button key={lead._id} type="button" onClick={() => navigate("/calendar")} className="flex w-full items-center gap-3 rounded-[15px] p-2.5 text-left" style={{ background: "var(--g-glass2)", border: "1px solid var(--g-line)" }}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: TN.blue[1], color: TN.blue[0] }}><MapPin size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13px] font-bold">{lead.projectInterested || lead.name}</b>
                      <small className="block truncate text-[11.5px]" style={MUT}>{lead.name}</small>
                    </span>
                    <time className="text-right text-[11px] font-semibold" style={MUT}>{lead.when.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}<br />{lead.when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</time>
                  </button>
                )) : <p className="py-6 text-center text-xs" style={MUT}>No upcoming visits</p>}
              </div>
            </Card>
            <Card title="Quick actions">
              <div className="grid grid-cols-2 gap-2">
                {[["Add property", Building2, "/inventory", "blue"], ["Add client", UserPlus, "/coworking/clients", "ok"], ["Schedule visit", CalendarDays, "/calendar", "warn"], ["Create task", Zap, "/tasks", "vio"]].map(([label, Icon, to, tone]) => (
                  <button key={label} type="button" onClick={() => navigate(to)} className="flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-[16px] text-[12px] font-bold transition-transform duration-300 hover:-translate-y-0.5" style={{ background: TN[tone][1], color: TN[tone][0], border: "1px solid var(--g-line)" }}>
                    {React.createElement(Icon, { size: 20 })}{label}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </section>

        <p className="flex items-center justify-end gap-1 text-[11.5px] font-semibold" style={MUT}>
          <Briefcase size={12} />{users.filter((x) => x?.isActive !== false).length} active team members
        </p>
      </div>
    </div>
  );
};
export default ManagerDashboard;
