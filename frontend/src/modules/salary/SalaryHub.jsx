import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Loader2, RefreshCw, Search, TrendingDown, UserX, Users, Wallet } from "lucide-react";
import { usePermissions } from "../../context/usePermissions";
import { getMySalary, getTeamSalaries } from "../../services/salaryService";
import { toErrorMessage } from "../../utils/errorMessage";
import ToastNotice from "../../components/ui/ToastNotice";
import AvatarFace from "../../components/ui/AvatarFace";
import { TabButton, Tabs } from "../../components/ui/Tabs";
import SalaryBreakdown from "./SalaryBreakdown";
import EmployeeSalaryDialog from "./EmployeeSalaryDialog";
import DeductionRulesPanel from "./DeductionRulesPanel";
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass, SectionHeader, StatCard } from "./salaryUi";
import {
  avatarTone,
  countLine,
  currentMonthKey,
  describeCoverage,
  formatMonthLabel,
  formatRupees,
  getInitials,
} from "./salaryFormat";

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
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      className="inline-flex h-8 items-center justify-center rounded-md px-2 text-slate-500 transition hover:text-blue-700 disabled:opacity-60"
      title="Refresh"
      aria-label="Refresh"
    >
      {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
    </button>
  </div>
);

/* ----------------------------------------------------------- my salary -- */

const MySalary = ({ month, setMonth, onError }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getMySalary({ month }));
    } catch (loadError) {
      onError(toErrorMessage(loadError, "Failed to load your salary"));
    } finally {
      setLoading(false);
    }
  }, [month, onError]);

  useEffect(() => { load(); }, [load]);

  const revisions = Array.isArray(data?.revisions) ? data.revisions : [];

  return (
    <section className={cardClass}>
      <SectionHeader
        icon={Wallet}
        tone="green"
        title="My salary"
        subtitle={data?.salary ? `${formatMonthLabel(month)} · ${describeCoverage(data.salary)}` : formatMonthLabel(month)}
      >
        <MonthPicker value={month} onChange={setMonth} onRefresh={load} refreshing={loading} />
      </SectionHeader>
      <div className="p-5">
        {loading && !data ? (
          <div className="flex items-center gap-2 py-8 text-[13px] text-slate-500">
            <Loader2 size={15} className="animate-spin" /> Loading your salary…
          </div>
        ) : data?.salary ? (
          <div className="space-y-5">
            <SalaryBreakdown salary={data.salary} />
            {revisions.length ? (
              <div>
                <h3 className="text-[13.5px] font-semibold text-slate-900">Salary history</h3>
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 text-[13px]">
                  {revisions.map((revision, index) => (
                    <li key={`${revision.effectiveFrom}-${index}`} className="flex items-baseline gap-3 px-3 py-2">
                      <span className="font-mono font-semibold tabular-nums text-slate-900">{formatRupees(revision.monthlySalary)}</span>
                      <span className="text-slate-600">from {formatMonthLabel(revision.effectiveFrom)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : data ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
            <p className="text-[14px] font-semibold text-slate-800">No salary set for {formatMonthLabel(month)}</p>
            <p className="mt-1 text-[13px] text-slate-500">Your manager or an admin sets it. Once they do, your deductions show here.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
};

/* -------------------------------------------------------- team salaries -- */

const TeamSalaries = ({ month, setMonth, onError, onSuccess }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getTeamSalaries({ month }));
    } catch (loadError) {
      onError(toErrorMessage(loadError, "Failed to load team salaries"));
    } finally {
      setLoading(false);
    }
  }, [month, onError]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const all = Array.isArray(data?.rows) ? data.rows : [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((row) => `${row.user?.name || ""} ${row.user?.email || ""}`.toLowerCase().includes(needle));
  }, [data?.rows, search]);

  const totals = data?.totals || {};
  const closeDialog = useCallback(() => setDialog(null), []);
  const handleSaved = useCallback((message) => {
    onSuccess(message);
    load();
  }, [load, onSuccess]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Banknote} tone="blue" label="Monthly payroll" value={formatRupees(totals.monthlyPayroll)} hint={`${totals.withSalary || 0} with a salary set`} />
        <StatCard icon={TrendingDown} tone="rose" label="Deducted so far" value={formatRupees(totals.totalDeduction)} hint="Absence, half days, leave and lates" />
        <StatCard icon={Wallet} tone="green" label="Payable after deductions" value={formatRupees(totals.netPayable)} hint={formatMonthLabel(month)} />
        <StatCard
          icon={UserX}
          tone="amber"
          label="Salary not set"
          value={String(Math.max(0, (totals.employees || 0) - (totals.withSalary || 0)))}
          hint={`of ${totals.employees || 0} people`}
        />
      </div>

      <section className={cardClass}>
        <SectionHeader icon={Users} tone="blue" title="Team salaries" subtitle="Each person's salary after this month's attendance deductions so far">
          <label className="relative">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search people"
              aria-label="Search people"
              className={`${fieldClass} w-44 pl-8 font-normal`}
            />
          </label>
          <MonthPicker value={month} onChange={setMonth} onRefresh={load} refreshing={loading} />
        </SectionHeader>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-[14px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11.5px] font-bold uppercase tracking-[0.07em] text-slate-500">
                <th className="border-b border-slate-200 px-3 py-2.5">Employee</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right">Monthly salary</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right">Absent</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right">Half day</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right">Leave</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right">Late</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right">Deducted</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right">After deductions</th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-[13px] text-slate-500">
                    <Loader2 size={15} className="mr-2 inline animate-spin" /> Loading salaries…
                  </td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-[13px] text-slate-500">
                    {search ? "Nobody matches that search." : "There is nobody on your team yet."}
                  </td>
                </tr>
              ) : rows.map((row) => {
                const salary = row.salary;
                const absent = countLine(salary, "absent");
                const unapproved = countLine(salary, "unapprovedLeave");
                const paidLeave = countLine(salary, "paidLeave");
                const unpaidLeave = countLine(salary, "unpaidLeave");
                const dash = <span className="text-slate-300">–</span>;
                return (
                  <tr key={row.user._id} className="transition hover:bg-slate-50/70">
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <button type="button" onClick={() => setDialog({ user: row.user, focusForm: false })} className="flex items-center gap-3 text-left">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12.5px] font-bold text-white ${avatarTone(row.user.name)}`}>
                          <AvatarFace user={row.user} initials={getInitials(row.user.name)} />
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[180px] truncate font-semibold text-slate-900 hover:text-blue-700">{row.user.name || "-"}</span>
                          <span className="block max-w-[180px] truncate text-[12px] capitalize text-slate-500">
                            {String(row.user.role || "").replaceAll("_", " ").toLowerCase()}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-right font-mono tabular-nums text-slate-800">
                      {salary ? formatRupees(salary.monthlySalary) : <span className="font-sans text-[12.5px] font-semibold text-amber-700">Not set</span>}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                      {salary ? (
                        <span title={unapproved ? `${absent} absent, ${unapproved} unapproved leave` : undefined}>
                          {absent + unapproved}
                          {unapproved ? <span className="block font-sans text-[11px] text-orange-700">{unapproved} unapproved</span> : null}
                        </span>
                      ) : dash}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                      {salary ? countLine(salary, "halfDay") : dash}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                      {salary ? (
                        <span>
                          {paidLeave + unpaidLeave}
                          {unpaidLeave ? <span className="block font-sans text-[11px] text-violet-700">{unpaidLeave} unpaid</span> : null}
                        </span>
                      ) : dash}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                      {salary ? countLine(salary, "late") : dash}
                    </td>
                    <td className={`border-b border-slate-100 px-3 py-2.5 text-right font-mono font-semibold tabular-nums ${salary?.totalDeduction > 0 ? "text-rose-700" : "text-slate-500"}`}>
                      {salary ? (salary.totalDeduction > 0 ? `− ${formatRupees(salary.totalDeduction)}` : formatRupees(0)) : dash}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-right font-mono font-bold tabular-nums text-emerald-700">
                      {salary ? formatRupees(salary.netSalary) : dash}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-right">
                      {salary ? (
                        <button type="button" onClick={() => setDialog({ user: row.user, focusForm: false })} className={`${secondaryButtonClass} h-8 py-0`}>
                          Details
                        </button>
                      ) : (
                        <button type="button" onClick={() => setDialog({ user: row.user, focusForm: true })} className={`${primaryButtonClass} h-8 py-0`}>
                          Set salary
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {dialog ? (
        <EmployeeSalaryDialog
          user={dialog.user}
          monthKey={month}
          focusForm={dialog.focusForm}
          onClose={closeDialog}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------------ page -- */

/*
 * Salary: everybody sees their own; admins and managers also see their team's,
 * set salaries, and set the deduction rules. An admin keeps no attendance and
 * has no salary of their own, so they get no "My salary" tab.
 */
export default function SalaryHub() {
  const { role: contextRole } = usePermissions();
  const role = String(contextRole || readStoredRole()).toUpperCase();
  const canManage = role === "ADMIN" || role === "MANAGER";

  const tabs = useMemo(() => {
    if (role === "ADMIN") return [{ id: "team", label: "Team salaries" }, { id: "rules", label: "Deduction rules" }];
    if (role === "MANAGER") return [{ id: "team", label: "Team salaries" }, { id: "mine", label: "My salary" }, { id: "rules", label: "Deduction rules" }];
    return [{ id: "mine", label: "My salary" }];
  }, [role]);

  const [selectedTab, setSelectedTab] = useState("");
  const tab = tabs.some((entry) => entry.id === selectedTab) ? selectedTab : tabs[0].id;
  const [month, setMonth] = useState(currentMonthKey());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const showError = useCallback((message) => setError(message), []);
  const showSuccess = useCallback((message) => setSuccess(message), []);

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 2500);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <div className="space-y-4">
      <ToastNotice message={error} type="error" />
      <ToastNotice message={success} type="success" />

      {canManage ? (
        <Tabs>
          {tabs.map((entry) => (
            <TabButton key={entry.id} active={tab === entry.id} onClick={() => setSelectedTab(entry.id)}>
              {entry.label}
            </TabButton>
          ))}
        </Tabs>
      ) : null}

      {tab === "team" ? <TeamSalaries month={month} setMonth={setMonth} onError={showError} onSuccess={showSuccess} /> : null}
      {tab === "mine" ? <MySalary month={month} setMonth={setMonth} onError={showError} /> : null}
      {tab === "rules" ? <DeductionRulesPanel onSaved={showSuccess} /> : null}
    </div>
  );
}
