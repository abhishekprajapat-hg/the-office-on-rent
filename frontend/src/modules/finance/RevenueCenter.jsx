import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getRevenueReport } from "../../services/revenueService";
import { toErrorMessage } from "../../utils/errorMessage";
import {
  brokerageReportRows,
  formatCsvDate,
  modelLabel,
  payoutReportRows,
  rangeForPreset,
  rentalReportRows,
  rowsToCsv,
  summaryReportRows,
} from "./revenueReportCsv";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "brokerage", label: "Brokerage report" },
  { key: "payouts", label: "Broker payouts" },
  { key: "rental", label: "Rental report" },
  { key: "summary", label: "Overall summary" },
];

const RANGE_PRESETS = [
  { key: "THIS_MONTH", label: "This month" },
  { key: "LAST_3_MONTHS", label: "Last 3 months" },
  { key: "THIS_FY", label: "This financial year" },
  { key: "CUSTOM", label: "Custom" },
];

const STATUS_PILL = {
  RECEIVED: "t-won",
  PAID: "t-won",
  PARTIAL: "t-warm",
  PENDING: "t-warm",
  OVERDUE: "t-warm",
};

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (value) => inr.format(Number(value) || 0);

const downloadCsv = (filename, rows) => {
  const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const Stat = ({ label, value, detail, tone = "" }) => (
  <div className={`finance-stat ${tone}`}>
    <div className="finance-k">{label}</div>
    <div className="finance-v">{value}</div>
    {detail ? <div className="finance-d">{detail}</div> : null}
  </div>
);

const Empty = ({ cols, text }) => (
  <tr><td colSpan={cols} className="finance-empty-row">{text}</td></tr>
);

const RevenueCenter = () => {
  const [tab, setTab] = useState("overview");
  const [preset, setPreset] = useState("THIS_MONTH");
  const [custom, setCustom] = useState(() => rangeForPreset("THIS_MONTH"));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const range = useMemo(() => (preset === "CUSTOM" ? custom : rangeForPreset(preset)), [custom, preset]);

  const load = useCallback(async () => {
    if (!range.from || !range.to) return;
    setLoading(true);
    setError("");
    try {
      setReport(await getRevenueReport({ from: range.from, to: range.to }));
    } catch (err) {
      if (err?.response?.status === 403) {
        setForbidden(true);
      } else {
        setError(toErrorMessage(err, "Couldn't load the revenue report"));
      }
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  if (forbidden) return null;

  const fileSuffix = `${range.from}_to_${range.to}`;
  const rental = report?.rental || {};
  const brokerage = report?.brokerage || {};

  const exportCurrent = () => {
    if (!report) return;
    if (tab === "brokerage") downloadCsv(`brokerage-report_${fileSuffix}.csv`, brokerageReportRows(report.deals));
    else if (tab === "payouts") downloadCsv(`broker-payouts_${fileSuffix}.csv`, payoutReportRows(report.payouts));
    else if (tab === "rental") downloadCsv(`rental-revenue_${fileSuffix}.csv`, rentalReportRows(report));
    else downloadCsv(`revenue-summary_${fileSuffix}.csv`, summaryReportRows(report));
  };

  return (
    <section className="finance-card revenue-center" aria-labelledby="revenue-center-title">
      <div className="finance-card-h revenue-head">
        <h4 id="revenue-center-title">Revenue</h4>
        <div className="finance-seg" role="tablist" aria-label="Revenue views">
          {TABS.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? "on" : ""} onClick={() => setTab(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="finance-card-b revenue-toolbar">
        <label className="revenue-field">
          <span>Period</span>
          <select value={preset} onChange={(event) => setPreset(event.target.value)}>
            {RANGE_PRESETS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        {preset === "CUSTOM" ? (
          <>
            <label className="revenue-field">
              <span>From</span>
              <input type="date" value={custom.from} max={custom.to || undefined} onChange={(event) => setCustom((prev) => ({ ...prev, from: event.target.value }))} />
            </label>
            <label className="revenue-field">
              <span>To</span>
              <input type="date" value={custom.to} min={custom.from || undefined} onChange={(event) => setCustom((prev) => ({ ...prev, to: event.target.value }))} />
            </label>
          </>
        ) : null}
        <span className="revenue-range">{formatCsvDate(`${range.from}T12:00:00`)} – {formatCsvDate(`${range.to}T12:00:00`)}</span>
        {tab !== "overview" ? (
          <button type="button" className="finance-btn finance-btn-sec finance-btn-sm revenue-export" onClick={exportCurrent} disabled={!report || loading}>
            Export CSV
          </button>
        ) : null}
      </div>

      {error ? <p className="revenue-error" role="alert">{error}</p> : null}
      {loading && !report ? <p className="finance-hint revenue-pad">Loading revenue…</p> : null}

      {report && tab === "overview" ? (
        <div className="revenue-pad revenue-overview">
          <div>
            <h5 className="revenue-subhead">Rental revenue <small>Self-owned · Coworking + Enterprise</small></h5>
            <div className="finance-statgrid revenue-grid">
              <Stat label="Rental income" value={money(rental.total)} detail="Collected coworking rent + enterprise client rent" />
              <Stat label="Coworking collected" value={money(rental.coworking?.collected)} detail={`Invoiced ${money(rental.coworking?.invoiced)}`} />
              <Stat label="Coworking outstanding" value={money(rental.coworking?.outstanding)} detail="Open invoices, all periods" tone={rental.coworking?.outstanding > 0 ? "is-alert" : ""} />
              <Stat label="Enterprise profit" value={money(rental.enterprise?.profit)} detail={`${rental.enterprise?.count || 0} spaces · client ${money(rental.enterprise?.clientRent)} − lease ${money(rental.enterprise?.leaseRent)}`} />
            </div>
          </div>
          <div>
            <h5 className="revenue-subhead">Brokerage revenue <small>Third-party · Rental Brokerage + Buy &amp; Sell</small></h5>
            <div className="finance-statgrid revenue-grid">
              <Stat label="Gross brokerage" value={money(brokerage.grossBrokerage)} detail={`${brokerage.count || 0} closed deals`} />
              <Stat label="Brokerage distributed" value={money(brokerage.brokerageDistributed)} detail="Paid to other parties, not revenue" />
              <Stat label="Net brokerage" value={money(brokerage.netBrokerage)} detail="Brokerage received = revenue" />
              <Stat label="Pending brokerage" value={money(brokerage.pendingBrokerage)} detail="Agreed but not yet received" tone={brokerage.pendingBrokerage > 0 ? "is-alert" : ""} />
            </div>
            <div className="finance-table-wrap revenue-split-table">
              <table className="finance-tbl">
                <thead><tr><th>Model</th><th className="finance-num">Deals</th><th className="finance-num">Gross</th><th className="finance-num">Distributed</th><th className="finance-num">Net (revenue)</th><th className="finance-num">Pending</th></tr></thead>
                <tbody>
                  {[["Rental Brokerage", brokerage.rentalBrokerage], ["Buy & Sell", brokerage.buySell]].map(([name, row]) => (
                    <tr key={name}>
                      <td><b>{name}</b></td>
                      <td className="finance-num">{row?.count || 0}</td>
                      <td className="finance-num">{money(row?.grossBrokerage)}</td>
                      <td className="finance-num">{money(row?.brokerageDistributed)}</td>
                      <td className="finance-num"><b>{money(row?.netBrokerage)}</b></td>
                      <td className="finance-num">{money(row?.pendingBrokerage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {report && tab === "brokerage" ? (
        <div className="finance-table-wrap">
          <table className="finance-tbl revenue-wide">
            <thead><tr><th>Deal ID</th><th>Property</th><th>Client</th><th>Model</th><th className="finance-num">Received</th><th className="finance-num">Distributed</th><th className="finance-num">Net (revenue)</th><th className="finance-num">Pending</th><th>Closing date</th><th>Closing executive</th></tr></thead>
            <tbody>
              {report.deals.length === 0 ? <Empty cols={10} text="No deals closed in this period." /> : null}
              {report.deals.map((d) => (
                <tr key={d.leadId}>
                  <td><span className="finance-mono">{d.dealId}</span></td>
                  <td>{d.property || "—"}</td>
                  <td><b>{d.client || "—"}</b>{d.brokerageSource ? <><br /><small>Paid by {d.brokerageSource.toLowerCase()}</small></> : null}</td>
                  <td>{modelLabel(d.model)}</td>
                  <td className="finance-num">{money(d.brokerageReceived)}</td>
                  <td className="finance-num">{money(d.brokerageDistributed)}</td>
                  <td className="finance-num"><b>{money(d.netBrokerage)}</b></td>
                  <td className="finance-num">{d.pendingBrokerage > 0 ? money(d.pendingBrokerage) : <span className={`finance-pill ${STATUS_PILL[d.brokeragePaymentStatus] || ""}`}>{d.brokeragePaymentStatus === "RECEIVED" ? "Received" : "—"}</span>}</td>
                  <td>{formatCsvDate(d.closingDate) || "—"}</td>
                  <td>{d.closingExecutive || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {report && tab === "payouts" ? (
        <div className="finance-table-wrap">
          <table className="finance-tbl">
            <thead><tr><th>Deal ID</th><th>Property</th><th>Client</th><th>Paid to</th><th>Type</th><th className="finance-num">Amount</th><th>Paid date</th></tr></thead>
            <tbody>
              {report.payouts.length === 0 ? <Empty cols={7} text="No brokerage was distributed in this period." /> : null}
              {report.payouts.map((p, index) => (
                <tr key={`${p.leadId}-${index}`}>
                  <td><span className="finance-mono">{p.dealId}</span></td>
                  <td>{p.property || "—"}</td>
                  <td>{p.client || "—"}</td>
                  <td><b>{p.recipientName || "—"}</b></td>
                  <td>{p.recipientType || "—"}</td>
                  <td className="finance-num">{money(p.amount)}</td>
                  <td>{formatCsvDate(p.paidDate) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {report && tab === "rental" ? (
        <div className="finance-table-wrap">
          <table className="finance-tbl">
            <thead><tr><th>Stream</th><th>Property</th><th>Client</th><th className="finance-num">Lease rent / mo</th><th className="finance-num">Client rent / mo</th><th className="finance-num">Profit / mo</th><th className="finance-num">Profit (period)</th><th>Rent due</th><th>Status</th></tr></thead>
            <tbody>
              <tr>
                <td><b>Coworking</b></td>
                <td>All coworking centres</td>
                <td>—</td>
                <td className="finance-num">—</td>
                <td className="finance-num">—</td>
                <td className="finance-num">—</td>
                <td className="finance-num"><b>{money(rental.coworking?.collected)}</b><br /><small>collected</small></td>
                <td>—</td>
                <td>{rental.coworking?.outstanding > 0 ? <span className="finance-pill t-warm">{money(rental.coworking.outstanding)} due</span> : <span className="finance-pill t-won">Up to date</span>}</td>
              </tr>
              {report.enterprise.length === 0 ? <Empty cols={9} text="No Enterprise spaces yet. Set a property's business model to Enterprise in Inventory." /> : null}
              {report.enterprise.map((e) => (
                <tr key={e.inventoryId}>
                  <td><b>Enterprise</b></td>
                  <td>{e.property || "—"}</td>
                  <td>{e.client || "—"}</td>
                  <td className="finance-num">{money(e.leaseRent)}</td>
                  <td className="finance-num">{money(e.clientRent)}</td>
                  <td className="finance-num"><b>{money(e.monthlyProfit)}</b></td>
                  <td className="finance-num">{money(e.periodProfit)}</td>
                  <td>{e.rentDueDay ? `Day ${e.rentDueDay}` : "—"}</td>
                  <td>{e.paymentStatus ? <span className={`finance-pill ${STATUS_PILL[e.paymentStatus] || ""}`}>{e.paymentStatus.charAt(0) + e.paymentStatus.slice(1).toLowerCase()}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {report && tab === "summary" ? (
        <div className="finance-table-wrap">
          <table className="finance-tbl revenue-summary">
            <tbody>
              {summaryReportRows(report).slice(1).map(([name, amount]) => {
                const strong = ["Rental income", "Brokerage revenue", "Total revenue", "Net revenue"].includes(name);
                return (
                  <tr key={name} className={strong ? "is-total" : ""}>
                    <td>{strong ? <b>{name}</b> : name}</td>
                    <td className="finance-num">{strong ? <b>{money(amount)}</b> : money(amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
};

export default RevenueCenter;
