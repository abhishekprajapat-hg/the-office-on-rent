import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, Gauge, Info, Loader2, RefreshCw, Search, TrendingDown, Users } from "lucide-react";
import { usePermissions } from "../../context/usePermissions";
import { getMyPerformance, getTeamPerformance, getUserPerformance } from "../../services/performanceService";
import { toErrorMessage } from "../../utils/errorMessage";
import ToastNotice from "../../components/ui/ToastNotice";
import AvatarFace from "../../components/ui/AvatarFace";
import Modal from "../../components/ui/Modal";
import { TabButton, Tabs } from "../../components/ui/Tabs";
import { cardClass, fieldClass, secondaryButtonClass, SectionHeader, StatCard } from "../salary/salaryUi";
import { avatarTone, currentMonthKey, formatMonthLabel, getInitials } from "../salary/salaryFormat";
import PerformanceBreakdown, { GradeChip, ScoreBar } from "./PerformanceBreakdown";
import { gradeStyle } from "./performanceFormat";

const readStoredRole = () => {
  try {
    return String(JSON.parse(localStorage.getItem("user") || "{}")?.role || "").toUpperCase();
  } catch {
    return "";
  }
};

const MonthPicker = ({ value, onChange, onRefresh, refreshing }) => (
  <div className="ml-auto flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
    <input
      type="month"
      value={value}
      onChange={(event) => event.target.value && onChange(event.target.value)}
      className="h-8 rounded-md border-0 bg-white px-3 text-[13px] font-semibold text-slate-700 shadow-sm outline-none"
      aria-label="Month"
    />
    <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex h-8 items-center justify-center rounded-md px-2 text-slate-500 transition hover:text-blue-700 disabled:opacity-60" title="Refresh" aria-label="Refresh">
      {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
    </button>
  </div>
);

/* How the score is worked out, in plain words, from what the API says. */
const HowItWorks = ({ methodology }) => {
  const weights = methodology?.weights || { attendance: 30, tasks: 30, sales: 40 };
  return (
    <details className={`${cardClass} group px-5 py-3.5`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-slate-700">
        <Info size={15} className="text-blue-600" /> How the score is calculated
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[12.5px] text-slate-600">
        <li><strong>Attendance ({weights.attendance}%)</strong> - attendance percentage for 70% and on-time check-ins for 30%. Leave and week offs are not held against anybody.</li>
        <li><strong>Tasks ({weights.tasks}%)</strong> - tasks due this month: done on time counts fully, done late counts half, still open past the due date counts nothing.</li>
        <li><strong>Sales ({weights.sales}%)</strong> - the average of progress against the month&apos;s targets, leads closed (closing {methodology?.conversionBenchmarkPercent ?? 20}% of the month&apos;s leads scores full marks) and follow-ups kept up to date.</li>
        <li>A part with nothing to measure - no leads, no task due - is left out and the others carry its weight, so nobody loses marks for work that is not theirs.</li>
        <li>85 and over is Excellent, 70 Good, 50 Average, below that Needs improvement.</li>
      </ul>
    </details>
  );
};

/* ---------------------------------------------------------- my score -- */

const MyPerformance = ({ month, setMonth, onError }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getMyPerformance({ month }));
    } catch (loadError) {
      onError(toErrorMessage(loadError, "Failed to load your performance"));
    } finally {
      setLoading(false);
    }
  }, [month, onError]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <section className={cardClass}>
        <SectionHeader icon={Gauge} tone="violet" title="My performance" subtitle={formatMonthLabel(month)}>
          <MonthPicker value={month} onChange={setMonth} onRefresh={load} refreshing={loading} />
        </SectionHeader>
        <div className="p-5">
          {loading && !data ? (
            <div className="flex items-center gap-2 py-8 text-[13px] text-slate-500">
              <Loader2 size={15} className="animate-spin" /> Loading your performance…
            </div>
          ) : data ? <PerformanceBreakdown performance={data.performance} /> : null}
        </div>
      </section>
      <HowItWorks methodology={data?.methodology} />
    </div>
  );
};

/* ------------------------------------------------- one person, opened -- */

const PersonDialog = ({ user, month, onClose }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  // Stable: Modal re-runs its focus handling whenever onClose changes.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const close = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    let cancelled = false;
    getUserPerformance(user._id, { month })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((loadError) => { if (!cancelled) setError(toErrorMessage(loadError, "Failed to load performance")); });
    return () => { cancelled = true; };
  }, [month, user._id]);

  return (
    <Modal open size="xl" title={user.name || "Employee"} description={`Performance for ${formatMonthLabel(month)}`} onClose={close}>
      {error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{error}</p>
      ) : data ? (
        <PerformanceBreakdown performance={data.performance} />
      ) : (
        <div className="flex items-center gap-2 py-10 text-[13px] text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Loading performance…
        </div>
      )}
    </Modal>
  );
};

/* ------------------------------------------------------------- team -- */

const PartCell = ({ part }) => (
  <td className="border-b border-slate-100 px-3 py-2.5">
    {part ? (
      <span className="block w-20">
        <span className={`block text-right font-mono text-[13px] font-semibold tabular-nums ${gradeStyle(part.grade).ink}`}>{part.score}</span>
        <ScoreBar score={part.score} grade={part.grade} />
      </span>
    ) : (
      <span className="block w-20 text-right text-slate-300" title="Not counted this month">–</span>
    )}
  </td>
);

const SORTS = {
  score: (left, right) => (right.performance.score ?? -1) - (left.performance.score ?? -1),
  name: (left, right) => String(left.user.name).localeCompare(String(right.user.name)),
};

const TeamPerformance = ({ month, setMonth, onError }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("score");
  const [opened, setOpened] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getTeamPerformance({ month }));
    } catch (loadError) {
      onError(toErrorMessage(loadError, "Failed to load the team's performance"));
    } finally {
      setLoading(false);
    }
  }, [month, onError]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.rows || [])
      .filter((row) => !needle || `${row.user.name} ${row.user.email}`.toLowerCase().includes(needle))
      .sort(SORTS[sort]);
  }, [data?.rows, search, sort]);

  const totals = data?.totals || {};
  const closeDialog = useCallback(() => setOpened(null), []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Gauge} tone="violet" label="Team average" value={totals.averageScore ?? "–"} hint={`${totals.scored || 0} of ${totals.people || 0} people scored`} />
        <StatCard icon={Award} tone="green" label="Excellent" value={String(totals.excellent || 0)} hint="Scored 85 or more" />
        <StatCard icon={TrendingDown} tone="rose" label="Needs improvement" value={String(totals.needsImprovement || 0)} hint="Scored below 50" />
        <StatCard icon={Users} tone="blue" label="People" value={String(totals.people || 0)} hint={formatMonthLabel(month)} />
      </div>

      <section className={cardClass}>
        <SectionHeader icon={Users} tone="blue" title="Team performance" subtitle="Each person's score from attendance, tasks and sales">
          <label className="relative">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people" aria-label="Search people" className={`${fieldClass} w-44 pl-8 font-normal`} />
          </label>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className={fieldClass} aria-label="Sort by">
            <option value="score">Highest score first</option>
            <option value="name">By name</option>
          </select>
          <MonthPicker value={month} onChange={setMonth} onRefresh={load} refreshing={loading} />
        </SectionHeader>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-[14px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11.5px] font-bold uppercase tracking-[0.07em] text-slate-500">
                <th className="border-b border-slate-200 px-3 py-2.5">#</th>
                <th className="border-b border-slate-200 px-3 py-2.5">Employee</th>
                <th className="border-b border-slate-200 px-3 py-2.5">Score</th>
                <th className="border-b border-slate-200 px-3 py-2.5">Attendance</th>
                <th className="border-b border-slate-200 px-3 py-2.5">Tasks</th>
                <th className="border-b border-slate-200 px-3 py-2.5">Sales</th>
                <th className="border-b border-slate-200 px-3 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-[13px] text-slate-500"><Loader2 size={15} className="mr-2 inline animate-spin" /> Loading performance…</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-[13px] text-slate-500">{search ? "Nobody matches that search." : "There is nobody on your team yet."}</td></tr>
              ) : rows.map((row, index) => {
                const { performance, user } = row;
                return (
                  <tr key={user._id} className="transition hover:bg-slate-50/70">
                    <td className="border-b border-slate-100 px-3 py-2.5 font-mono text-[12.5px] text-slate-400">{sort === "score" && performance.score !== null ? index + 1 : ""}</td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      {/* The name opens the person's profile, as on attendance and salary. */}
                      <button type="button" onClick={() => navigate(`/admin/users/${user._id}`)} className="group flex items-center gap-3 text-left" title={`Open ${user.name || "this person"}'s profile`}>
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12.5px] font-bold text-white ${avatarTone(user.name)}`}>
                          <AvatarFace user={user} initials={getInitials(user.name)} />
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[180px] truncate font-semibold text-slate-900 group-hover:text-blue-700 group-hover:underline">{user.name || "-"}</span>
                          <span className="block max-w-[180px] truncate text-[12px] capitalize text-slate-500">{String(user.role || "").replaceAll("_", " ").toLowerCase()}</span>
                        </span>
                      </button>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span className={`w-8 text-right font-mono text-[16px] font-bold tabular-nums ${gradeStyle(performance.grade).ink}`}>{performance.score ?? "–"}</span>
                        <GradeChip grade={performance.grade} />
                      </span>
                    </td>
                    <PartCell part={performance.parts.attendance} />
                    <PartCell part={performance.parts.tasks} />
                    <PartCell part={performance.parts.sales} />
                    <td className="border-b border-slate-100 px-3 py-2.5 text-right">
                      <button type="button" onClick={() => setOpened(user)} className={`${secondaryButtonClass} h-8 py-0`}>Details</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <HowItWorks methodology={data?.methodology} />

      {opened ? <PersonDialog user={opened} month={month} onClose={closeDialog} /> : null}
    </div>
  );
};

/* ------------------------------------------------------------- page -- */

/*
 * Performance: everybody sees their own score; admins and managers also see
 * their team's. An admin keeps no attendance or targets, so has no score.
 */
export default function PerformanceHub() {
  const { role: contextRole } = usePermissions();
  const role = String(contextRole || readStoredRole()).toUpperCase();

  const tabs = useMemo(() => {
    if (role === "ADMIN") return [{ id: "team", label: "Team performance" }];
    if (role === "MANAGER") return [{ id: "team", label: "Team performance" }, { id: "mine", label: "My performance" }];
    return [{ id: "mine", label: "My performance" }];
  }, [role]);

  const [selectedTab, setSelectedTab] = useState("");
  const tab = tabs.some((entry) => entry.id === selectedTab) ? selectedTab : tabs[0].id;
  const [month, setMonth] = useState(currentMonthKey());
  const [error, setError] = useState("");
  const showError = useCallback((message) => setError(message), []);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    // ui-page-shell is what scrolls inside the workspace.
    <div className="ui-page-shell custom-scrollbar space-y-4 bg-slate-50/70 text-slate-900">
      <ToastNotice message={error} type="error" />
      {tabs.length > 1 ? (
        <Tabs>
          {tabs.map((entry) => (
            <TabButton key={entry.id} active={tab === entry.id} onClick={() => setSelectedTab(entry.id)}>{entry.label}</TabButton>
          ))}
        </Tabs>
      ) : null}
      {tab === "team" ? <TeamPerformance month={month} setMonth={setMonth} onError={showError} /> : null}
      {tab === "mine" ? <MyPerformance month={month} setMonth={setMonth} onError={showError} /> : null}
    </div>
  );
}
