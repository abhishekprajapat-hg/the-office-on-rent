import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, Clock, Gauge, Megaphone, RefreshCcw, Users } from "lucide-react";
import api from "../../services/api";
import { usePermissions } from "../../context/usePermissions";

const SALES = ["ADMIN", "MANAGER", "EXECUTIVE", "INSIDE_EXECUTIVE", "FIELD_EXECUTIVE"];
const MGMT = ["ADMIN", "MANAGER"];

// Glass alert card (CRM Web Glass design). Tones tint the glass rather than
// filling it, and the plain "info" tone stays clear glass with ink text.
const TONES = {
  ok: ["var(--g-ok)", "var(--g-oks)"],
  warn: ["var(--g-warn)", "var(--g-warns)"],
  bad: ["var(--g-bad)", "var(--g-bads)"],
  info: ["var(--g-b)", "var(--g-bs)"],
};

const Chip = ({ to, icon, tone, label, value }) => {
  const Glyph = icon;
  const [fg, soft] = TONES[tone] || TONES.info;
  const plain = tone === "info";
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-[20px] border px-4 py-3.5 transition-transform duration-300 hover:-translate-y-0.5"
      style={{
        background: plain ? "var(--g-glass)" : `color-mix(in srgb, ${fg} 9%, var(--g-glass))`,
        borderColor: "var(--g-line)",
        boxShadow: "var(--g-shadow)",
      }}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: soft, color: fg }}>
        <Glyph size={18} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-[12.5px] font-semibold" style={{ color: "var(--g-mut)" }}>{label}</span>
        <strong className="truncate text-[14px] font-extrabold" style={{ color: plain ? "var(--g-ink)" : fg }}>{value}</strong>
      </span>
      <ChevronRight size={16} aria-hidden="true" style={{ color: "var(--g-fnt)" }} />
    </Link>
  );
};

/*
 * The homepage's short operational status line (requirements 16 Oct 2026,
 * section 11): daily report, untouched leads, inventory needing
 * re-verification, the month's score and - for managers - team reports and
 * Meta failures. Each item loads on its own and is simply left out when the
 * person can't see that area. Nothing about salary or increments appears here.
 */
const HomeStatusStrip = () => {
  const { role: contextRole, canPage } = usePermissions();
  const role = String(contextRole || localStorage.getItem("role") || "").toUpperCase();
  const [s, setS] = useState({});

  useEffect(() => {
    let alive = true;
    const put = (key, value) => alive && setS((prev) => ({ ...prev, [key]: value }));
    const safe = (p) => p.catch(() => null);
    safe(api.get("/daily-reports/me/today")).then((r) => r && put("report", r.data));
    if (SALES.includes(role) && canPage?.(["leads", "my_leads"])) {
      safe(api.get("/leads", { params: { touchState: "UNTOUCHED", limit: 1, page: 1, fields: "_id" } }))
        .then((r) => r && put("untouched", r.data?.pagination?.totalCount ?? r.data?.leads?.length ?? 0));
    }
    if (SALES.includes(role) && canPage?.("inventory")) {
      safe(api.get("/inventory", { params: { stale: "true", limit: 1, page: 1, fields: "_id" } }))
        .then((r) => r && put("stale", r.data?.pagination?.totalCount ?? 0));
    }
    if (role !== "ADMIN") {
      safe(api.get("/performance/me")).then((r) => r && put("score", r.data?.performance || null));
    }
    if (MGMT.includes(role)) {
      safe(api.get("/daily-reports/status")).then((r) => r && put("team", r.data?.counts || {}));
      safe(api.get("/leads/meta-failures")).then((r) => r && put("meta", r.data?.openCount ?? 0));
    }
    return () => { alive = false; };
  }, [role, canPage]);

  const chips = [];
  if (s.report?.required) {
    chips.push(s.report.submitted
      ? <Chip key="r" to="/daily-reports" icon={CheckCircle2} tone="ok" label="Daily report" value="Submitted" />
      : <Chip key="r" to="/daily-reports" icon={ClipboardCheck} tone="warn" label="Daily report" value="Not submitted yet" />);
  }
  if (typeof s.untouched === "number") {
    chips.push(<Chip key="u" to="/leads?touchState=UNTOUCHED&view=ALL" icon={Clock} tone={s.untouched ? "bad" : "ok"} label="Untouched leads" value={s.untouched ? `${s.untouched} waiting for a first call` : "None - all touched"} />);
  }
  if (typeof s.stale === "number") {
    chips.push(<Chip key="i" to="/inventory" icon={RefreshCcw} tone={s.stale ? "warn" : "ok"} label="Inventory to re-verify" value={s.stale ? `${s.stale} not confirmed recently` : "All recently confirmed"} />);
  }
  if (s.score && s.score.score !== null && s.score.score !== undefined) {
    const target = s.score.parts?.target;
    chips.push(<Chip key="k" to="/performance" icon={Gauge} tone="info" label="This month's score" value={`${s.score.score}/100${target ? ` · target ${target.score}%` : ""}`} />);
  }
  if (s.team) {
    const missing = (s.team.MISSING || 0);
    chips.push(<Chip key="t" to="/daily-reports" icon={Users} tone={missing ? "warn" : "info"} label="Team reports today" value={`${s.team.SUBMITTED || 0} in · ${missing} missing · ${s.team.PENDING || 0} still working`} />);
  }
  if (typeof s.meta === "number" && s.meta > 0) {
    chips.push(<Chip key="m" to="/admin/meta-ads" icon={Megaphone} tone="bad" label="Meta leads failed" value={`${s.meta} need reconciling`} />);
  }
  if (!chips.length) return null;
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]" aria-label="Today at a glance">
      {chips}
      {chips.length === 1 && s.report?.required && !s.report.submitted ? (
        <span className="flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: "var(--g-warn)" }}><AlertTriangle size={12} /> Submit it before checking out.</span>
      ) : null}
    </div>
  );
};

export default HomeStatusStrip;
