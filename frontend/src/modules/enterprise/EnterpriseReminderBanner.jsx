import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing } from "lucide-react";
import { usePermissions } from "../../context/usePermissions";
import { listEnterpriseReminders } from "../../services/enterpriseService";

/*
 * On the Alerts page: open Enterprise Leasing reminders (lease expiry,
 * notice, escalation, money due / overdue), so they sit with the other alerts.
 */
const EnterpriseReminderBanner = () => {
  const { canPage } = usePermissions();
  const allowed = canPage("enterprise");
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!allowed) return undefined;
    let live = true;
    listEnterpriseReminders().then((d) => { if (live) setRows(d.reminders || []); }).catch(() => {});
    return () => { live = false; };
  }, [allowed]);
  if (!allowed || !rows.length) return null;
  const high = rows.filter((r) => r.severity === "high").length;
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-slate-800 dark:border-amber-500/25 dark:bg-amber-500/5 dark:text-slate-100">
      <div className="flex flex-wrap items-center gap-2">
        <BellRing size={18} className="text-amber-600" />
        <h2 className="flex-1 text-base font-bold">Enterprise Leasing · {rows.length} open reminder{rows.length === 1 ? "" : "s"}{high ? ` (${high} urgent)` : ""}</h2>
        <Link to="/enterprise" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">Open</Link>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.slice(0, 4).map((r) => (
          <li key={r._id}>
            <Link to={`/enterprise/offices/${r.officeId}`} className="font-semibold hover:underline">{r.officeName}</Link>: {r.message}
            {r.dueDate ? <span className="text-slate-500"> · {new Date(r.dueDate).toLocaleDateString("en-IN")}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default EnterpriseReminderBanner;
