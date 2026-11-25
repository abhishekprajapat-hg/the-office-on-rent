import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, BellRing, ClipboardList, Landmark, Plus, Trash2, Wallet } from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import { getEnterpriseDashboard, listChecklists, listEnterpriseReminders, listOffices, runEnterpriseReminders, saveChecklist } from "../../services/enterpriseService";
import { ReminderList } from "./enterpriseWidgets";
import { FNT, MUT, field } from "../inventory/components/contactGlassTokens";
import { Btn, Check, ErrorLine, Input, Modal, Panel, Select, Stat, Table, Tag } from "../database/dbUi";
import { OfficeDialog } from "./enterpriseForms";
import { SEVERITY_TONE, STATUS_TONE, useEnterpriseMeta } from "./enterpriseHelpers";
import { useLoader } from "../database/dbHelpers";
import { fmtDate, money, titleCase } from "../database/dbHelpers";

/*
 * Enterprise Leasing dashboard (2.10): portfolio, money due both ways,
 * collections, deposits, fit-out, alerts and the Excel report. Owner-side
 * and tenant-side figures are always shown separately, never netted.
 */

const EnterpriseDashboard = () => {
  const navigate = useNavigate();
  const meta = useEnterpriseMeta();
  const { data, error, setError, reload } = useLoader(() => Promise.all([getEnterpriseDashboard(), listOffices(), listEnterpriseReminders()]), []);
  const dash = data?.[0] || null;
  const offices = data?.[1]?.offices || [];
  const reminders = data?.[2]?.reminders || [];
  const checkNow = async () => {
    try { await runEnterpriseReminders(); reload(); } catch (e) { setError(toErrorMessage(e, "Could not check reminders")); }
  };
  const [dialog, setDialog] = useState("");

  return (
    <div className="custom-scrollbar h-full min-h-0 w-full overflow-y-auto overscroll-contain p-3 sm:p-4 lg:p-5" style={{ color: "var(--g-ink)" }}>
      <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold">Enterprise Offices</h1>
          <p className="text-[13px]" style={MUT}>Manage offices the company leases from owners and rents to tenants, across every location.</p>
        </div>
        {meta?.isAdmin ? <Btn onClick={() => setDialog("checklists")}><ClipboardList size={15} /> Document checklists</Btn> : null}
        <Btn tone="primary" onClick={() => setDialog("office")}><Plus size={15} /> Add office</Btn>
      </div>
      <ErrorLine message={error} />
      {dash ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Offices" value={dash.portfolio.offices} note={`${dash.portfolio.occupied} occupied · ${dash.portfolio.vacant} vacant`} />
            <Stat label="Occupancy" value={`${dash.portfolio.occupancyPercent}%`} tone="ok" />
            <Stat label="Pay landlords this month" value={money(dash.thisMonth.payable)} tone="warn" note={`Overdue ${money(dash.overdue.payable)}`} />
            <Stat label="Collect this month" value={money(dash.thisMonth.receivable)} tone="info" note={`Overdue ${money(dash.overdue.receivable)}`} />
            <Stat label="Next 30 days" value={`${dash.upcoming30.items} items`} tone="vio" note={`Pay ${money(dash.upcoming30.payable)} · collect ${money(dash.upcoming30.receivable)}`} />
            <Stat label="Contribution / month" value={money(dash.monthlyContribution)} tone={dash.monthlyContribution >= 0 ? "ok" : "bad"} note="Estimate: tenant rent − owner rent" />
            <Stat label="Deposits with landlords" value={money(dash.deposits.heldByLandlords)} />
            <Stat label="Deposits owed to tenants" value={money(dash.deposits.owedToTenants)} />
            <Stat label="Fit-out" value={money(dash.fitOut.actual)} tone={dash.fitOut.actual > dash.fitOut.budget ? "bad" : "a"} note={`Budget ${money(dash.fitOut.budget)}`} />
          </div>

          <Panel title={`Reminders · ${reminders.length} open`} icon={BellRing} action={<Btn onClick={checkNow}>Check now</Btn>}>
            <ReminderList reminders={reminders} onChanged={reload} onError={setError} />
            <p className="mt-2 text-[12px]" style={FNT}>Checked every hour from each agreement's own dates. Sent to Admin, Managers and the office's assigned employee, and to their phones when notifications are on. Mark one done once it's handled.</p>
          </Panel>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title={`Alerts · ${dash.alerts.length}`} icon={AlertTriangle}>
              {dash.alerts.length ? (
                <ul className="flex max-h-[360px] flex-col overflow-y-auto">
                  {dash.alerts.map((a, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-[13px]" style={{ borderTop: "1px solid var(--g-div)" }}>
                      <Tag tone={SEVERITY_TONE[a.severity]}>{a.severity}</Tag>
                      <Link to={`/enterprise/offices/${a.officeId}`} className="font-semibold" style={{ color: "var(--g-b)" }}>{a.officeName}</Link>
                      <span>{a.message}</span>
                      <span style={MUT}>{a.date ? fmtDate(a.date) : ""}{a.amount ? ` · ${money(a.amount)}` : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : <div className="py-4 text-[13px]" style={FNT}>Nothing needs attention</div>}
            </Panel>
            <Panel title={`Collections · ${dash.collections.length} overdue`} icon={Wallet}>
              <Table rows={dash.collections} empty="No tenant item overdue" columns={[
                { key: "o", label: "Office / tenant", render: (c) => <Link to={`/enterprise/offices/${c.officeId}`} className="font-semibold" style={{ color: "var(--g-b)" }}>{c.officeName}<div className="text-[11.5px] font-normal" style={FNT}>{c.tenantName}</div></Link> },
                { key: "i", label: "Item", render: (c) => c.label },
                { key: "b", label: "Balance", right: true, render: (c) => money(c.balance) },
                { key: "d", label: "Late", right: true, render: (c) => `${c.daysOverdue} d` },
                { key: "p", label: "Promised / next", render: (c) => <span style={MUT}>{c.promisedDate ? fmtDate(c.promisedDate) : "–"} / {c.nextFollowUpAt ? fmtDate(c.nextFollowUpAt) : "–"}</span> },
              ]} />
            </Panel>
          </div>
        </>
      ) : null}

      <Panel title={`Office register · ${offices.length}`} icon={Landmark} action={<Btn onClick={() => navigate("/enterprise/offices")}>Open offices</Btn>}>
        <p className="text-[13px]" style={MUT}>View each office address, rental status, current tenant, and both sides of its rent on the Offices page.</p>
      </Panel>

      {dialog === "office" ? <OfficeDialog onClose={() => setDialog("")} onSaved={(o) => navigate(`/enterprise/offices/${o._id}`)} /> : null}
      {dialog === "checklists" ? <ChecklistAdmin onClose={() => setDialog("")} /> : null}
      </div>
    </div>
  );
};

/* Admin: the company's document checklist per tenant entity type (2.4), no code change needed. */
const ChecklistAdmin = ({ onClose }) => {
  const [lists, setLists] = useState([]);
  const [type, setType] = useState("COMPANY");
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [sourceVersion, setSourceVersion] = useState("");
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const choose = (t, ls) => {
    const c = ls.find((l) => l.entityType === t);
    setType(t); setItems(c ? c.items.map((i) => ({ ...i })) : []); setNote(c?.sourceNote || ""); setSourceVersion(c?.sourceVersion || ""); setSourceConfirmed(c?.sourceConfirmed === true); setSaved("");
  };
  useEffect(() => {
    listChecklists().then((d) => { setLists(d.checklists || []); choose("COMPANY", d.checklists || []); }).catch((e) => setError(toErrorMessage(e)));
  }, []);
  const save = async () => {
    try {
      const out = await saveChecklist(type, { items, sourceNote: note, sourceVersion, sourceConfirmed });
      setLists((ls) => ls.map((l) => (l.entityType === type ? { ...l, items: out.checklist.items, custom: true } : l))); setSaved("Saved"); setError("");
    } catch (e) { setError(toErrorMessage(e, "Could not save")); }
  };
  const upd = (i, k, v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const current = lists.find((l) => l.entityType === type);
  return (
    <Modal width={820} title="Document checklists" onClose={onClose} footer={<><span className="mr-auto text-[12.5px]" style={MUT}>{saved}</span><Btn onClick={onClose}>Close</Btn><Btn tone="primary" onClick={save}>Save {titleCase(type)} list</Btn></>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {lists.map((l) => (
            <button key={l.entityType} type="button" aria-pressed={type === l.entityType} onClick={() => choose(l.entityType, lists)} className="h-8 rounded-full px-3 text-[12.5px]" style={type === l.entityType ? { background: "var(--g-bs)", color: "var(--g-b)", border: "1.5px solid var(--g-b)" } : { border: "1.5px solid var(--g-line)" }}>
              {titleCase(l.entityType)} · {l.items.length}
            </button>
          ))}
        </div>
        {current?.sourceNeedsConfirmation ? <p className="rounded-xl px-3 py-2 text-[12.5px]" style={{ color: "var(--g-warn)", background: "var(--g-warn-bg, #fff7ed)" }}>Confirm this list against the latest entity-wise checklist before relying on it for tenant onboarding.</p> : null}
        <p className="text-[12.5px]" style={FNT}>{current?.custom ? `Company list${current.updatedByName ? `, last changed by ${current.updatedByName}` : ""}.` : "Starting list from existing company onboarding records."} Signatory items are asked once per signing authority.</p>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[2fr_1fr_1.5fr_auto_auto]" style={{ ...field, borderRadius: 12, padding: 8 }}>
            <Input placeholder="Document" value={it.label} onChange={(e) => upd(i, "label", e.target.value)} />
            <Select value={it.scope} onChange={(e) => upd(i, "scope", e.target.value)} options={[{ value: "ENTITY", label: "The entity" }, { value: "SIGNATORY", label: "Each signatory" }, { value: "AGREEMENT", label: "The agreement" }]} />
            <Input placeholder="Hint" value={it.hint || ""} onChange={(e) => upd(i, "hint", e.target.value)} />
            <Check label="Required" checked={it.required !== false} onChange={(v) => upd(i, "required", v)} />
            <Btn aria-label="Remove" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={14} /></Btn>
          </div>
        ))}
        <Btn onClick={() => setItems((xs) => [...xs, { label: "", scope: "ENTITY", required: true, hint: "" }])}><Plus size={14} /> Add document</Btn>
        <Input label="Where this list comes from" value={note} onChange={(e) => setNote(e.target.value)} />
        <Input label="Checklist version / effective date" value={sourceVersion} onChange={(e) => setSourceVersion(e.target.value)} placeholder="e.g. Entity checklist v3, 18 Nov 2026" />
        <Check label="I confirmed these items against the approved company checklist" checked={sourceConfirmed} onChange={setSourceConfirmed} />
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
};

export default EnterpriseDashboard;
