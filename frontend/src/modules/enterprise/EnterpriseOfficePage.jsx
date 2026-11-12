import React, { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, BellRing, Building2, FileText, Hammer, History, Landmark, PiggyBank, Plus, ReceiptText, Upload, Users, Wallet,
} from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import { usePermissions } from "../../context/usePermissions";
import { uploadFile } from "../../services/uploadService";
import {
  getOffice, recoverFromTenant, reviewEnterpriseDocument, updateLedgerEntry, updateOffice, uploadEnterpriseDocument,
} from "../../services/enterpriseService";
import { FNT, MUT, field } from "../inventory/components/contactGlassTokens";
import { Btn, ErrorLine, Input, Modal, Panel, Select, Stat, Table, Tag, TextArea } from "../database/dbUi";
import {
  AgreementDialog, ChargeDialog, LedgerDialog, ObligationActionDialog, PaymentDialog, StaffSelect, TenantDialog, TenantPicker,
} from "./enterpriseForms";
import { Attachments, FilePickButton, ReminderList } from "./enterpriseWidgets";
import { SEVERITY_TONE, STATUS_TONE, useEnterpriseMeta } from "./enterpriseHelpers";
import { fmtDate, isoDate, money, options, titleCase, useLoader } from "../database/dbHelpers";

/* One Enterprise office (2.2-2.9): both agreements, money both ways, deposits, fit-out, documents. */
const TABS = [
  ["overview", "Overview", Building2], ["owner", "Owner lease", Landmark], ["tenant", "Tenant", Users], ["payable", "Pay landlord", Wallet],
  ["receivable", "Collect from tenant", ReceiptText], ["deposits", "Deposits", PiggyBank], ["fitout", "Fit-out", Hammer], ["documents", "Documents", FileText],
];
const OB_TONE = { PAID: "ok", PARTIALLY_PAID: "info", OVERDUE: "bad", DUE: "warn", UPCOMING: "mute", DISPUTED: "vio", WAIVED_ADJUSTED: "mute" };
const DOC_TONE = { PENDING: "mute", UPLOADED: "info", UNDER_REVIEW: "warn", VERIFIED: "ok", REJECTED: "bad", NOT_APPLICABLE: "mute" };

const EnterpriseOfficePage = () => {
  const { officeId } = useParams();
  const meta = useEnterpriseMeta();
  const { canDownloadClientDocuments, role } = usePermissions();
  const canManage = ["ADMIN", "MANAGER"].includes(String(role || "").toUpperCase());
  const [tab, setTab] = useState("overview");
  const { data: d, error, setError, reload: load } = useLoader(() => getOffice(officeId), [officeId]);
  const [dialog, setDialog] = useState(null);
  if (!d) return <div className="p-5"><ErrorLine message={error} /></div>;
  const { office, ownerAgreement, tenantAgreement, tenant, obligations, deposits, fitOut, checklist, alerts, metrics, financial, landlord, building, transactions, ledger, tenantHistory, escalations, assignedUser, otherContacts = [], reminders = [] } = d;
  const canDownload = Boolean(canDownloadClientDocuments) || String(role || "").toUpperCase() === "ADMIN";
  const close = () => setDialog(null);
  const done = () => { setDialog(null); load(); };

  return (
    <div className="mx-auto flex w-full max-w-[1250px] flex-col gap-4 p-3 sm:p-5" style={{ color: "var(--g-ink)" }}>
      <Link to="/enterprise" className="inline-flex items-center gap-1.5 text-[13px]" style={MUT}><ArrowLeft size={15} /> Enterprise Leasing</Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold">{office.name}</h1>
          <div className="flex flex-wrap items-center gap-1.5 text-[13px]" style={MUT}>
            <span>{office.officeCode}</span>
            <Tag tone={STATUS_TONE[office.operationalStatus] || "mute"}>{titleCase(office.operationalStatus)}</Tag>
            <Tag tone="mute">Fit-out: {titleCase(office.fitOutStatus)}</Tag>
            {building ? <Link to={`/database/buildings/${building._id}`} style={{ color: "var(--g-b)" }}>{building.name}</Link> : null}
            {office.floor ? <span>· floor {office.floor}</span> : null}{office.unit ? <span>· {office.unit}</span> : null}
            {office.area ? <span>· {office.area} {office.areaBasis}</span> : null}
            <span>· {assignedUser ? `Handled by ${assignedUser.name}` : "No one assigned"}</span>
          </div>
        </div>
        <Btn onClick={() => setDialog({ kind: "office" })}>Edit office</Btn>
      </div>
      <ErrorLine message={error} />

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(([k, l, TabIcon]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium"
            style={tab === k ? { background: "var(--g-bs)", color: "var(--g-b)", border: "1.5px solid var(--g-b)" } : { ...field, borderWidth: 1.5 }}>
            {React.createElement(TabIcon, { size: 14 })} {l}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Owner rent / month" value={money(metrics.ownerRentMonthly)} tone="warn" />
            <Stat label="Tenant rent / month" value={money(metrics.tenantRentMonthly)} tone="info" />
            <Stat label="Contribution / month" value={money(metrics.operatingContributionMonthly)} tone={metrics.operatingContributionMonthly >= 0 ? "ok" : "bad"} note="Estimate" />
            <Stat label="Payback" value={metrics.paybackMonths ? `${metrics.paybackMonths} months` : "–"} note="Estimate on actual fit-out" />
            <Stat label="Owe landlord" value={money(financial.payableOutstanding)} tone="warn" note={`Overdue ${money(financial.payableOverdue)}`} />
            <Stat label="Tenant owes" value={money(financial.receivableOutstanding)} tone="info" note={`Overdue ${money(financial.receivableOverdue)}`} />
          </div>
          <p className="text-[12px]" style={FNT}>{metrics.basis}</p>
          <Panel title={`Reminders · ${reminders.length} open`} icon={BellRing}>
            <ReminderList reminders={reminders} showOffice={false} onChanged={load} onError={setError} empty="No open reminders for this office" />
            <p className="mt-2 text-[12px]" style={FNT}>Sent to Admin, Managers and the assigned employee (and to their phones when notifications are on). Overdue money is reminded every week.</p>
          </Panel>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title={`Alerts · ${alerts.length}`} icon={AlertTriangle}>
              {alerts.length ? alerts.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 py-1.5 text-[13px]" style={{ borderTop: i ? "1px solid var(--g-div)" : undefined }}>
                  <Tag tone={SEVERITY_TONE[a.severity]}>{a.severity}</Tag><span>{a.message}</span><span style={MUT}>{a.date ? fmtDate(a.date) : ""}{a.amount ? ` · ${money(a.amount)}` : ""}</span>
                </div>
              )) : <div className="text-[13px]" style={FNT}>Nothing needs attention</div>}
            </Panel>
            <Panel title="History" icon={History}>
              <ul className="max-h-[300px] overflow-y-auto">
                {[...(office.history || [])].reverse().map((h, i) => <li key={i} className="py-1 text-[12.5px]" style={{ borderTop: i ? "1px solid var(--g-div)" : undefined }}><span style={MUT}>{fmtDate(h.at)} · {h.byName}</span> {h.change}</li>)}
              </ul>
            </Panel>
          </div>
        </>
      ) : null}

      {tab === "owner" ? (
        <AgreementPanel side="OWNER" agreement={ownerAgreement} party={landlord ? <Link to={`/inventory/owners/${landlord._id}`} style={{ color: "var(--g-b)" }}>{landlord.name}</Link> : <span style={{ color: "var(--g-warn)" }}>Landlord not set</span>}
          escalations={escalations.OWNER} onEdit={() => setDialog({ kind: "agreement", side: "OWNER", agreement: ownerAgreement ? { ...ownerAgreement, landlord, otherContacts } : null })} />
      ) : null}

      {tab === "tenant" ? (
        <>
          {tenant ? (
            <Panel title={`${tenant.legalName}${tenant.tradeName ? ` (${tenant.tradeName})` : ""}`} icon={Users} action={<span className="flex gap-1.5"><Btn onClick={() => setDialog({ kind: "tenant", tenant })}>Edit tenant</Btn><Btn onClick={() => setDialog({ kind: "pickTenant" })}>New tenant agreement</Btn></span>}>
              <div className="text-[13px]" style={MUT}>{[tenant.tenantCode, titleCase(tenant.entityType), tenant.pan && `PAN ${tenant.pan}`, tenant.gstin && `GSTIN ${tenant.gstin}`].filter(Boolean).join(" · ")}</div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(tenant.contacts || []).map((c) => (
                  <div key={c._id} className="rounded-xl p-2.5 text-[13px]" style={field}>
                    <Tag tone={c.role === "SIGNATORY" ? "vio" : "a"}>{c.role === "SIGNATORY" ? "Signing authority" : titleCase(c.role)}</Tag> <b>{c.name}</b>
                    <div style={MUT}>{[c.designation, c.phone, c.email].filter(Boolean).join(" · ")}</div>
                  </div>
                ))}
              </div>
            </Panel>
          ) : (
            <Panel title="No tenant yet" icon={Users}>
              <p className="mb-3 text-[13px]" style={MUT}>The owner lease runs on its own. Add the tenant and their agreement when the office is let.</p>
              <Btn tone="primary" onClick={() => setDialog({ kind: "pickTenant" })}><Plus size={14} /> Add tenant agreement</Btn>
            </Panel>
          )}
          {tenantAgreement ? (
            <AgreementPanel side="TENANT" agreement={tenantAgreement} party={tenant?.legalName} escalations={escalations.TENANT} onEdit={() => setDialog({ kind: "agreement", side: "TENANT", agreement: tenantAgreement, tenantId: tenantAgreement.tenantId })} />
          ) : null}
          {tenantHistory.length > 1 ? (
            <Panel title="Earlier tenant agreements" icon={History}>
              {tenantHistory.filter((a) => String(a._id) !== String(tenantAgreement?._id)).map((a) => <div key={a._id} className="py-1 text-[13px]">{a.agreementCode} · {a.tenant?.legalName} · {fmtDate(a.commencementDate)} – {fmtDate(a.endDate)} · {titleCase(a.status)}</div>)}
            </Panel>
          ) : null}
        </>
      ) : null}

      {tab === "payable" || tab === "receivable" ? (
        <MoneyTab direction={tab === "payable" ? "PAYABLE" : "RECEIVABLE"} obligations={obligations} transactions={transactions} canManage={canManage} canDownload={canDownload}
          agreementId={(tab === "payable" ? ownerAgreement : tenantAgreement)?._id} setDialog={setDialog} reload={load} setError={setError} />
      ) : null}

      {tab === "deposits" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {["OWNER", "TENANT"].map((side) => {
            const x = deposits[side];
            return (
              <Panel key={side} title={side === "OWNER" ? "Deposit with landlord" : "Deposit from tenant"} icon={PiggyBank} action={<Btn onClick={() => setDialog({ kind: "ledger", ledgerKind: "DEPOSIT", side })}><Plus size={14} /> Entry</Btn>}>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <Stat label="Required" value={money(x.required)} />
                  <Stat label={side === "OWNER" ? "Paid" : "Collected"} value={money(x.paidOrCollected)} tone={x.shortfall ? "warn" : "ok"} note={x.shortfall ? `Short by ${money(x.shortfall)}` : undefined} />
                  <Stat label="Refunded / deducted" value={`${money(x.refunded)} / ${money(x.deducted + x.adjusted)}`} />
                  <Stat label={side === "OWNER" ? "Still with landlord" : "Still owed to tenant"} value={money(x.outstanding)} tone="info" note={x.expectedSettlementDate ? `Settle by ${fmtDate(x.expectedSettlementDate)}` : undefined} />
                </div>
                <Table rows={[...x.entries].reverse()} empty="No entries" columns={[
                  { key: "d", label: "Date", render: (e) => fmtDate(e.date) },
                  { key: "t", label: "Entry", render: (e) => titleCase(e.entryType) },
                  { key: "a", label: "Amount", right: true, render: (e) => money(e.amount) },
                  { key: "r", label: "Ref / reason", render: (e) => <span style={MUT}>{[e.reference, e.reason].filter(Boolean).join(" · ")}</span> },
                  { key: "f", label: "Proof", render: (e) => <Attachments files={e.attachments} canDownload={canDownload} target="ledger" id={e._id} onChanged={load} onError={setError} /> },
                ]} />
              </Panel>
            );
          })}
        </div>
      ) : null}

      {tab === "fitout" ? (
        <Panel title="Fit-out" icon={Hammer} action={<Btn tone="primary" onClick={() => setDialog({ kind: "ledger", ledgerKind: "EXPENSE" })}><Plus size={14} /> Expense</Btn>}>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Budget" value={money(fitOut.budget)} />
            <Stat label="Actual" value={money(fitOut.actual)} tone={fitOut.overBudget ? "bad" : "a"} note={fitOut.variance != null ? (fitOut.overBudget ? `Over by ${money(-fitOut.variance)}` : `Under by ${money(fitOut.variance)}`) : "No budget set"} />
            <Stat label="Paid to vendors" value={money(fitOut.vendorPaid)} tone="ok" />
            <Stat label="Owed to vendors" value={money(fitOut.vendorOutstanding)} tone="warn" />
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">{Object.entries(fitOut.byCategory || {}).map(([k, v]) => <Tag key={k} tone="a">{titleCase(k)} {money(v)}</Tag>)}</div>
          <Table rows={ledger.filter((l) => l.kind === "EXPENSE")} empty="No expense yet" columns={[
            { key: "d", label: "Date", render: (e) => fmtDate(e.date) },
            { key: "c", label: "Category", render: (e) => titleCase(e.category) },
            { key: "v", label: "Vendor", render: (e) => e.vendor || "–" },
            { key: "a", label: "Bill", right: true, render: (e) => money(e.amount) },
            { key: "p", label: "Paid", right: true, render: (e) => money(e.amountPaid) },
            { key: "s", label: "Status", render: (e) => <Tag tone={e.paymentStatus === "PAID" ? "ok" : e.paymentStatus === "PARTIALLY_PAID" ? "info" : "warn"}>{titleCase(e.paymentStatus)}</Tag> },
            { key: "f", label: "Invoice / receipt", render: (e) => <Attachments files={e.attachments} canDownload={canDownload} target="ledger" id={e._id} onChanged={load} onError={setError} /> },
            { key: "x", label: "", render: (e) => (e.paymentStatus !== "PAID" ? <Btn onClick={async () => { const v = window.prompt("Total paid to the vendor so far (₹)", e.amountPaid); if (v === null) return; try { await updateLedgerEntry(e._id, { amountPaid: Number(v) }); load(); } catch (err) { setError(toErrorMessage(err)); } }}>Update paid</Btn> : null) },
          ]} />
        </Panel>
      ) : null}

      {tab === "documents" ? (
        <div className="flex flex-col gap-4">
          <OfficeDocuments officeId={office._id} ownerAgreement={ownerAgreement} tenantAgreement={tenantAgreement} documents={d.documents} canManage={canManage} canDownload={canDownload} reload={load} setError={setError} />
          <DocumentsTab tenant={tenant} officeId={office._id} agreementId={tenantAgreement?._id} checklist={checklist} documents={d.documents} canManage={canManage} canDownload={canDownload} reload={load} setError={setError} />
        </div>
      ) : null}

      {dialog?.kind === "office" ? <OfficeEdit office={office} meta={meta} onClose={close} onSaved={done} /> : null}
      {dialog?.kind === "agreement" ? <AgreementDialog side={dialog.side} officeId={office._id} agreement={dialog.agreement} tenantId={dialog.tenantId} onClose={close} onSaved={done} /> : null}
      {dialog?.kind === "pickTenant" ? <TenantPicker onClose={close} onPick={(t) => setDialog({ kind: "agreement", side: "TENANT", agreement: null, tenantId: t._id })} /> : null}
      {dialog?.kind === "tenant" ? <TenantDialog tenant={dialog.tenant} onClose={close} onSaved={done} /> : null}
      {dialog?.kind === "payment" ? <PaymentDialog officeId={office._id} direction={dialog.direction} obligations={obligations} transaction={dialog.transaction} onClose={close} onSaved={done} /> : null}
      {dialog?.kind === "action" ? <ObligationActionDialog obligation={dialog.obligation} action={dialog.action} onClose={close} onSaved={done} /> : null}
      {dialog?.kind === "charge" ? <ChargeDialog officeId={office._id} direction={dialog.direction} agreementId={dialog.agreementId} onClose={close} onSaved={done} /> : null}
      {dialog?.kind === "ledger" ? <LedgerDialog officeId={office._id} kind={dialog.ledgerKind} side={dialog.side} onClose={close} onSaved={done} /> : null}
    </div>
  );
};

const AgreementPanel = ({ side, agreement, party, escalations = [], onEdit }) => {
  if (!agreement) {
    return (
      <Panel title={side === "OWNER" ? "Owner master lease" : "Tenant agreement"} icon={Landmark}>
        <p className="mb-3 text-[13px]" style={MUT}>Not entered yet.</p>
        <Btn tone="primary" onClick={onEdit}><Plus size={14} /> Add {side === "OWNER" ? "master lease" : "agreement"}</Btn>
      </Panel>
    );
  }
  const a = agreement;
  const row = (l, v) => <div className="flex justify-between gap-3 py-1 text-[13px]" style={{ borderTop: "1px solid var(--g-div)" }}><span style={MUT}>{l}</span><span className="text-right font-medium">{v ?? "–"}</span></div>;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title={`${side === "OWNER" ? "Owner master lease" : "Tenant agreement"} · ${a.agreementCode}`} icon={Landmark} action={<Btn onClick={onEdit}>Edit / amend</Btn>}>
        {row(side === "OWNER" ? "Landlord" : "Tenant", party)}
        {row("Status", <Tag tone={a.status === "ACTIVE" ? "ok" : a.status === "NOTICE" ? "warn" : "mute"}>{titleCase(a.status)}</Tag>)}
        {row("Type", a.agreementType || "–")}
        {row("Signed", fmtDate(a.signingDate))}
        {row("Possession", fmtDate(a.possessionDate))}
        {row("Commencement", fmtDate(a.commencementDate))}
        {row("Rent starts", fmtDate(a.rentCommencementDate))}
        {row("Ends", fmtDate(a.endDate))}
        {row("Lock-in", a.lockInEndDate ? `until ${fmtDate(a.lockInEndDate)}` : a.lockInMonths ? `${a.lockInMonths} months` : "–")}
        {row("Notice period", a.noticePeriodMonths ? `${a.noticePeriodMonths} months` : "–")}
        {row("Rent", `${money(a.baseRent)} / month${a.rentDueDay ? `, due on the ${a.rentDueDay}` : ""}`)}
        {row("Maintenance", `${titleCase(a.maintenance?.method)}${a.maintenance?.amount ? ` ${money(a.maintenance.amount)}` : ""}${a.maintenance?.passThroughAllowed ? " · pass-through allowed" : ""}`)}
        {row("GST / TDS", `${a.gstPercent != null ? `${a.gstPercent}%` : "none"} / ${a.tdsPercent != null ? `${a.tdsPercent}%` : "none"}`)}
        {row("Deposit", money(a.depositRequired))}
        {a.noticeReceivedDate ? row("Notice received", `${fmtDate(a.noticeReceivedDate)} · ends ${fmtDate(a.noticeExpiryDate)}`) : null}
        {a.vacatingDate ? row("Vacating", fmtDate(a.vacatingDate)) : null}
      </Panel>
      <div className="flex flex-col gap-4">
        <Panel title="Rent and escalations" icon={History}>
          <div className="py-1 text-[13px]">From {fmtDate(a.rentCommencementDate || a.commencementDate)}: <b>{money(a.baseRent)}</b></div>
          {escalations.map((e, i) => <div key={i} className="py-1 text-[13px]" style={{ borderTop: "1px solid var(--g-div)" }}>From {fmtDate(e.effectiveDate)}: <b>{money(e.rentAfter)}</b> <span style={MUT}>({e.method === "PERCENT" ? `+${e.value}%` : e.method === "AMOUNT" ? `+${money(e.value)}` : "new rent"})</span></div>)}
        </Panel>
        <Panel title="Amendments" icon={History}>
          {(a.amendments || []).length ? [...a.amendments].reverse().map((m, i) => <div key={i} className="py-1 text-[12.5px]" style={{ borderTop: i ? "1px solid var(--g-div)" : undefined }}><span style={MUT}>{fmtDate(m.at)} · {m.byName}</span> {m.note || "Changed"}: {(m.changes || []).join(", ")}</div>) : <div className="text-[13px]" style={FNT}>No amendment</div>}
        </Panel>
      </div>
    </div>
  );
};

const MoneyTab = ({ direction, obligations, transactions, canManage, canDownload, agreementId, setDialog, reload, setError }) => {
  const [show, setShow] = useState("open");
  // Open = unsettled and due within the next 45 days (or already late).
  const [horizon] = useState(() => Date.now() + 45 * 86400000);
  const isPay = direction === "PAYABLE";
  const rows = obligations.filter((o) => o.direction === direction).filter((o) => (show === "all" ? true : show === "open" ? o.balance > 0 && new Date(o.dueDate).getTime() <= horizon : o.balance <= 0));
  const txs = transactions.filter((t) => t.direction === direction);
  const recover = async (o) => {
    try { await recoverFromTenant(o._id); reload(); } catch (e) { setError(toErrorMessage(e)); }
  };
  return (
    <div className="flex flex-col gap-4">
      <Panel title={isPay ? "What we owe the landlord" : "What the tenant owes us"} icon={isPay ? Wallet : ReceiptText} action={(
        <span className="flex flex-wrap gap-1.5">
          <Select value={show} onChange={(e) => setShow(e.target.value)} options={[{ value: "open", label: "Open (due soon / late)" }, { value: "settled", label: "Settled" }, { value: "all", label: "Everything" }]} />
          <Btn onClick={() => setDialog({ kind: "charge", direction, agreementId })}><Plus size={14} /> Charge</Btn>
          <Btn tone="primary" onClick={() => setDialog({ kind: "payment", direction })}>{isPay ? "Record payment" : "Record receipt"}</Btn>
        </span>
      )}>
        <Table rows={rows} empty="Nothing here" columns={[
          { key: "i", label: "Item", render: (o) => <span><b>{o.label || titleCase(o.chargeType)}</b>{o.billReference ? <div className="text-[11.5px]" style={FNT}>Bill {o.billReference}</div> : null}</span> },
          { key: "d", label: "Due", render: (o) => fmtDate(o.dueDate) },
          { key: "a", label: "Amount", right: true, render: (o) => <span>{money(o.totalDue)}{o.taxAmount ? <div className="text-[11px]" style={FNT}>incl. GST {money(o.taxAmount)}</div> : null}</span> },
          { key: "s", label: "Settled", right: true, render: (o) => <span>{money(o.paidCash)}{o.paidTds ? <div className="text-[11px]" style={FNT}>+ TDS {money(o.paidTds)}</div> : null}{o.tdsDifference ? <div className="text-[11px]" style={{ color: "var(--g-warn)" }}>TDS diff {money(o.tdsDifference)}</div> : null}</span> },
          { key: "b", label: "Balance", right: true, render: (o) => <b>{money(o.balance)}</b> },
          { key: "st", label: "Status", render: (o) => <span className="inline-flex flex-wrap gap-1"><Tag tone={OB_TONE[o.status]}>{titleCase(o.status)}{o.daysOverdue ? ` · ${o.daysOverdue}d` : ""}</Tag>{o.latestPromise ? <Tag tone="vio">Promised {fmtDate(o.latestPromise.promisedDate)}</Tag> : null}</span> },
          { key: "x", label: "", render: (o) => (
            <span className="inline-flex flex-wrap justify-end gap-1">
              {o.balance > 0 && !isPay ? <Btn onClick={() => setDialog({ kind: "action", action: "promise", obligation: o })}>Promise</Btn> : null}
              {o.balance > 0 ? <Btn onClick={() => setDialog({ kind: "action", action: "followup", obligation: o })}>Follow-up</Btn> : null}
              <Btn onClick={() => setDialog({ kind: "action", action: "dispute", obligation: o })}>{o.disputed ? "Undispute" : "Dispute"}</Btn>
              {canManage && o.balance > 0 ? <Btn onClick={() => setDialog({ kind: "action", action: "adjust", obligation: o })}>Adjust</Btn> : null}
              {isPay && !o.generated ? <Btn onClick={() => recover(o)} title="Bill this to the tenant if their agreement allows it">Recover from tenant</Btn> : null}
            </span>
          ) },
        ]} />
      </Panel>
      <Panel title={isPay ? "Payments made" : "Money received"} icon={History}>
        <Table rows={txs} empty="No payment yet" columns={[
          { key: "d", label: "Date", render: (t) => fmtDate(t.date) },
          { key: "a", label: "Cash", right: true, render: (t) => money(t.amount) },
          { key: "t", label: "TDS", right: true, render: (t) => money(t.tdsAmount) },
          { key: "m", label: "Mode / ref", render: (t) => <span style={MUT}>{[titleCase(t.mode), t.reference, t.bankReference].filter(Boolean).join(" · ")}</span> },
          { key: "n", label: "Items", render: (t) => `${t.allocations.length}` },
          { key: "f", label: "Receipt / proof", render: (t) => <Attachments files={t.attachments} canDownload={canDownload} target="transaction" id={t._id} onChanged={reload} onError={setError} /> },
          { key: "u", label: "Unallocated", right: true, render: (t) => (t.unallocatedCash || t.unallocatedTds ? <span className="inline-flex items-center gap-1.5">{money(t.unallocatedCash)}<Btn onClick={() => setDialog({ kind: "payment", direction, transaction: t })}>Allocate</Btn></span> : "–") },
        ]} />
      </Panel>
    </div>
  );
};

const DocumentsTab = ({ tenant, officeId, agreementId, checklist, documents, canManage, canDownload, reload, setError }) => {
  const fileRef = useRef(null);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState("");
  if (!tenant || !checklist) return <Panel title="Tenant documents" icon={FileText}><p className="text-[13px]" style={MUT}>Add the tenant first; their checklist follows their entity type.</p></Panel>;
  const keyOf = (r) => `${r.key}:${r.signatoryId || ""}`;
  const pick = (r) => { setTarget(r); fileRef.current?.click(); };
  const onFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || !target) return;
    setBusy(keyOf(target));
    try {
      const up = await uploadFile(file, "enterprise-documents");
      await uploadEnterpriseDocument({ tenantId: tenant._id, officeId, agreementId: target.scope === "AGREEMENT" ? agreementId : null, signatoryId: target.signatoryId, scope: target.scope, checklistKey: target.key, label: target.label, url: up.url, name: file.name });
      reload();
    } catch (err) { setError(toErrorMessage(err, "Upload failed")); }
    finally { setBusy(""); }
  };
  const review = async (r, status) => {
    const notes = status === "REJECTED" || status === "NOT_APPLICABLE" ? window.prompt(status === "REJECTED" ? "Why is it rejected?" : "Why is it not applicable?", "") : "";
    if (notes === null) return;
    try {
      await reviewEnterpriseDocument(r.document?._id, { status, notes, row: { tenantId: tenant._id, officeId, scope: r.scope, checklistKey: r.key, signatoryId: r.signatoryId, agreementId: r.scope === "AGREEMENT" ? agreementId : null, label: r.label } });
      reload();
    } catch (err) { setError(toErrorMessage(err)); }
  };
  return (
    <Panel title={`Checklist · ${titleCase(tenant.entityType)} · ${checklist.verified}/${checklist.required} verified`} icon={FileText}>
      <input ref={fileRef} type="file" className="hidden" onChange={onFile} accept="image/*,application/pdf" />
      <p className="mb-2 text-[12.5px]" style={FNT}>Files are kept in a protected folder: only the Admin or a user allowed to download client documents can open them, and each download is logged. An upload is not proof; a manager marks it verified.</p>
      {checklist.rows.length ? checklist.rows.map((r) => {
        const doc = r.document;
        const status = doc?.status || "PENDING";
        const latest = doc?.versions?.[doc.versions.length - 1];
        return (
          <div key={keyOf(r)} className="flex flex-wrap items-center gap-2 py-2 text-[13px]" style={{ borderTop: "1px solid var(--g-div)" }}>
            <div className="min-w-[200px] flex-1">
              <b>{r.label}</b>{r.required ? null : <span style={FNT}> (optional)</span>}
              <div className="text-[12px]" style={MUT}>{r.scope === "SIGNATORY" ? `Signing authority: ${r.signatoryName}` : r.scope === "AGREEMENT" ? "Agreement" : "Entity"}{r.hint ? ` · ${r.hint}` : ""}{doc?.notes ? ` · ${doc.notes}` : ""}</div>
            </div>
            <Tag tone={DOC_TONE[status]}>{titleCase(status)}</Tag>
            {latest ? (canDownload ? <a href={latest.url} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold" style={{ color: "var(--g-b)" }}>Open v{doc.versions.length}</a> : <span className="text-[12px]" style={FNT}>v{doc.versions.length} · restricted</span>) : null}
            {r.needsSignatory ? <span className="text-[12px]" style={{ color: "var(--g-warn)" }}>Add a signing authority to the tenant first</span> : (
              <span className="inline-flex flex-wrap gap-1">
                <Btn disabled={busy === keyOf(r)} onClick={() => pick(r)}><Upload size={13} /> {latest ? "New version" : "Upload"}</Btn>
                {canManage && latest && status !== "VERIFIED" ? <Btn onClick={() => review(r, "VERIFIED")}>Verify</Btn> : null}
                {canManage && latest && status === "UPLOADED" ? <Btn onClick={() => review(r, "UNDER_REVIEW")}>Reviewing</Btn> : null}
                {canManage && latest && status !== "REJECTED" ? <Btn onClick={() => review(r, "REJECTED")}>Reject</Btn> : null}
                {canManage && status !== "NOT_APPLICABLE" && !latest ? <Btn onClick={() => review(r, "NOT_APPLICABLE")}>N/A</Btn> : null}
              </span>
            )}
          </div>
        );
      }) : <p className="text-[13px]" style={FNT}>No checklist for this entity type yet. The Admin can set one under Document checklists.</p>}
      {(documents || []).filter((x) => !x.checklistKey).length ? <div className="mt-3 text-[12.5px]" style={MUT}>{documents.filter((x) => !x.checklistKey).length} other document(s) on file</div> : null}
    </Panel>
  );
};

/*
 * Office and agreement papers (2.2 "Documents and audit"): lease deed,
 * amendments, bills, receipts, approvals, handover notes. Replacing a file
 * adds a version; Admin / Manager can verify or reject.
 */
const docType = (c) => (c === "NOC" ? "NOC" : titleCase(c));
const DOC_STATUS_TONE = { UPLOADED: "info", UNDER_REVIEW: "warn", VERIFIED: "ok", REJECTED: "bad", PENDING: "mute", NOT_APPLICABLE: "mute" };
const OfficeDocuments = ({ officeId, ownerAgreement, tenantAgreement, documents = [], canManage, canDownload, reload, setError }) => {
  const meta = useEnterpriseMeta();
  const [form, setForm] = useState({ label: "", category: "LEASE_DEED", link: ownerAgreement ? "OWNER" : "OFFICE" });
  const rows = documents.filter((x) => !x.tenantId);
  const agreementLabel = (x) => (x.agreementId && String(x.agreementId) === String(ownerAgreement?._id) ? "Owner lease" : x.agreementId && String(x.agreementId) === String(tenantAgreement?._id) ? "Tenant agreement" : x.agreementId ? "Earlier agreement" : "Office");
  const upload = async (file) => {
    if (!form.label.trim()) { setError("Name the document first (e.g. Lease deed, Electricity bill Oct)"); return; }
    const agreementId = form.link === "OWNER" ? ownerAgreement?._id : form.link === "TENANT" ? tenantAgreement?._id : null;
    await uploadEnterpriseDocument({ officeId, agreementId, scope: agreementId ? "AGREEMENT" : "OFFICE", label: form.label, category: form.category, url: file.url, name: file.name });
    setForm((f) => ({ ...f, label: "" }));
    reload();
  };
  const review = async (x, status) => {
    const notes = status === "REJECTED" ? window.prompt("Why is it rejected?", "") : "";
    if (notes === null) return;
    try { await reviewEnterpriseDocument(x._id, { status, notes }); reload(); } catch (e) { setError(toErrorMessage(e)); }
  };
  return (
    <Panel title={`Office and lease documents · ${rows.length}`} icon={FileText}>
      <div className="mb-3 grid grid-cols-1 items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <Input label="Document" placeholder="e.g. Registered lease deed, CAM bill Oct" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
        <Select label="Type" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} options={options(meta?.documentCategories || ["LEASE_DEED", "BILL", "RECEIPT", "APPROVAL", "OTHER"], docType)} />
        <Select label="Belongs to" value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} options={[{ value: "OFFICE", label: "Office" }, ...(ownerAgreement ? [{ value: "OWNER", label: "Owner lease" }] : []), ...(tenantAgreement ? [{ value: "TENANT", label: "Tenant agreement" }] : [])]} />
        <FilePickButton label="Upload" onError={setError} onUploaded={upload} disabled={!form.label.trim()} />
      </div>
      {rows.length ? rows.map((x) => {
        const latest = x.versions?.[x.versions.length - 1];
        return (
          <div key={x._id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]" style={{ borderTop: "1px solid var(--g-div)" }}>
            <div className="min-w-[200px] flex-1">
              <b>{x.label}</b>
              <div className="text-[12px]" style={MUT}>{[x.category ? docType(x.category) : "", agreementLabel(x), latest ? `v${x.versions.length} · ${fmtDate(latest.uploadedAt)} · ${latest.uploadedByName || ""}` : "", x.notes].filter(Boolean).join(" · ")}</div>
            </div>
            <Tag tone={DOC_STATUS_TONE[x.status] || "mute"}>{titleCase(x.status)}</Tag>
            {latest ? (canDownload ? <a href={latest.url} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold" style={{ color: "var(--g-b)" }}>Open</a> : <span className="text-[12px]" style={FNT}>restricted</span>) : null}
            <FilePickButton label="New version" onError={setError} onUploaded={async (file) => { await uploadEnterpriseDocument({ documentId: x._id, officeId, scope: x.scope, url: file.url, name: file.name }); reload(); }} />
            {canManage && x.status !== "VERIFIED" ? <Btn onClick={() => review(x, "VERIFIED")}>Verify</Btn> : null}
            {canManage && x.status !== "REJECTED" ? <Btn onClick={() => review(x, "REJECTED")}>Reject</Btn> : null}
          </div>
        );
      }) : <div className="text-[13px]" style={FNT}>No office or lease document yet</div>}
    </Panel>
  );
};

const OfficeEdit = ({ office, meta, onClose, onSaved }) => {
  const [form, setForm] = useState({ name: office.name, operationalStatus: office.operationalStatus, fitOutStatus: office.fitOutStatus, floor: office.floor, unit: office.unit, area: office.area ?? "", areaBasis: office.areaBasis, fitOutBudget: office.fitOutBudget ?? "", fitOutStartDate: isoDate(office.fitOutStartDate), fitOutExpectedEndDate: isoDate(office.fitOutExpectedEndDate), fitOutActualEndDate: isoDate(office.fitOutActualEndDate), ownerConsentRef: office.ownerConsentRef, address: office.address, notes: office.notes, assignedTo: office.assignedTo ? String(office.assignedTo._id || office.assignedTo) : "" });
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    try { await updateOffice(office._id, { ...form, area: form.area === "" ? null : Number(form.area), fitOutBudget: form.fitOutBudget === "" ? null : Number(form.fitOutBudget) }); onSaved(); } catch (e) { setError(toErrorMessage(e, "Could not save")); }
  };
  return (
    <Modal width={760} title="Edit office" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Name" className="sm:col-span-2" value={form.name} onChange={set("name")} />
        <Select label="Status" value={form.operationalStatus} onChange={set("operationalStatus")} options={options(meta?.operationalStatuses || [])} />
        <Input label="Address" className="sm:col-span-3" value={form.address} onChange={set("address")} />
        <Input label="Floor" value={form.floor} onChange={set("floor")} />
        <Input label="Unit" value={form.unit} onChange={set("unit")} />
        <Input label="Area" type="number" value={form.area} onChange={set("area")} />
        <Input label="Area basis" value={form.areaBasis} onChange={set("areaBasis")} />
        <Select label="Fit-out status" value={form.fitOutStatus} onChange={set("fitOutStatus")} options={options(meta?.fitOutStatuses || [])} />
        <Input label="Fit-out budget (₹)" type="number" value={form.fitOutBudget} onChange={set("fitOutBudget")} />
        <Input label="Fit-out start" type="date" value={form.fitOutStartDate} onChange={set("fitOutStartDate")} />
        <Input label="Expected completion" type="date" value={form.fitOutExpectedEndDate} onChange={set("fitOutExpectedEndDate")} />
        <Input label="Actual completion" type="date" value={form.fitOutActualEndDate} onChange={set("fitOutActualEndDate")} />
        <Input label="Owner consent / approval ref." className="sm:col-span-2" value={form.ownerConsentRef} onChange={set("ownerConsentRef")} />
        <StaffSelect value={form.assignedTo} onChange={(v) => setForm((f) => ({ ...f, assignedTo: v }))} />
        <TextArea label="Notes" className="sm:col-span-3" value={form.notes} onChange={set("notes")} />
      </div>
      <div className="mt-3"><ErrorLine message={error} /></div>
    </Modal>
  );
};

export default EnterpriseOfficePage;
