import { useCallback, useEffect, useState } from "react";
import { Armchair, BarChart3, Building2, CalendarCheck, CreditCard, Receipt, Ticket, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardTitle, ErrorState, Input, Skeleton } from "../../components/ui";
import { DataTableShell, MetricCard, PageToolbar, StatusBadge } from "../../components/crm";
import { getCoworkingReportSummary } from "../../services/coworkingReportService";
import { formatCurrency, formatDate, formatDateTime } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";

const todayInput = () => new Date().toISOString().slice(0, 10);
const monthStartInput = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const BreakdownList = ({ title, rows }) => (
  <Card>
    <CardContent>
      <CardTitle className="mb-3">{title}</CardTitle>
      <div className="space-y-2">
        {(rows || []).length ? (
          rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
              <StatusBadge status={row.key} />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{row.count}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No data yet</p>
        )}
      </div>
    </CardContent>
  </Card>
);

const Reports = () => {
  const [startDate, setStartDate] = useState(monthStartInput);
  const [endDate, setEndDate] = useState(todayInput);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getCoworkingReportSummary({ startDate, endDate }));
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load coworking reports"));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load reports" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  const metrics = report?.metrics || {};
  const breakdowns = report?.breakdowns || {};
  const recent = report?.recent || {};

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Reports"
          description="Occupancy, revenue and operational reports for coworking spaces."
          filters={
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500">Start</span>
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500">End</span>
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </div>
          }
        />

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-32" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard title="Properties" value={metrics.propertyCount || 0} helper="Active portfolio" icon={Building2} />
              <MetricCard title="Occupancy" value={`${metrics.occupancyRate || 0}%`} helper={`${metrics.occupiedSeats || 0}/${metrics.totalSeats || 0} seats occupied`} icon={Armchair} />
              <MetricCard title="Clients" value={metrics.clientCount || 0} helper={`${metrics.activeContractCount || 0} active contracts`} icon={Users} />
              <MetricCard title="Bookings" value={metrics.bookingCount || 0} helper="Created in selected range" icon={CalendarCheck} />
              <MetricCard title="Invoices" value={formatCurrency(metrics.invoiceTotal || 0)} helper={`${metrics.invoiceCount || 0} invoices`} icon={Receipt} />
              <MetricCard title="Payments" value={formatCurrency(metrics.paymentTotal || 0)} helper="Completed payment ledger" icon={CreditCard} />
              <MetricCard title="Expenses" value={formatCurrency(metrics.expenseTotal || 0)} helper={`${formatCurrency(metrics.paidExpenseTotal || 0)} paid`} icon={Wallet} />
              <MetricCard title="Open Tickets" value={metrics.openTicketCount || 0} helper={`${metrics.assetCount || 0} assets tracked`} icon={Ticket} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <BreakdownList title="Cabins By Status" rows={breakdowns.cabinsByStatus} />
              <BreakdownList title="Tickets By Status" rows={breakdowns.ticketsByStatus} />
              <BreakdownList title="Assets By Status" rows={breakdowns.assetsByStatus} />
              <BreakdownList title="Bookings By Status" rows={breakdowns.bookingsByStatus} />
              <BreakdownList title="Invoices By Status" rows={breakdowns.invoiceByStatus} />
              <Card>
                <CardContent>
                  <CardTitle className="mb-3">Cash Snapshot</CardTitle>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Payments</span><span className="font-semibold">{formatCurrency(metrics.paymentTotal || 0)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Paid expenses</span><span className="font-semibold">{formatCurrency(metrics.paidExpenseTotal || 0)}</span></div>
                    <div className="flex justify-between border-t border-slate-100 pt-3 dark:border-slate-800"><span className="text-slate-500">Net cash</span><span className="font-bold">{formatCurrency(metrics.netCash || 0)}</span></div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <DataTableShell title="Recent Tickets" empty={!recent.tickets?.length} emptyTitle="No recent tickets">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <tbody>
                  {(recent.tickets || []).map((ticket) => (
                    <tr key={ticket._id} className="border-b border-slate-50 last:border-0 dark:border-slate-900">
                      <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">{ticket.ticketCode}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{ticket.title}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={ticket.status} /></td>
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(ticket.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <DataTableShell title="Recent Visitors" empty={!recent.visitors?.length} emptyTitle="No recent visitors">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <tbody>
                    {(recent.visitors || []).map((visitor) => (
                      <tr key={visitor._id} className="border-b border-slate-50 last:border-0 dark:border-slate-900">
                        <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">{visitor.visitorName}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={visitor.status} /></td>
                        <td className="px-4 py-2.5 text-slate-500">{formatDateTime(visitor.checkInAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
              <DataTableShell title="Recent Payments" empty={!recent.payments?.length} emptyTitle="No recent payments">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <tbody>
                    {(recent.payments || []).map((payment) => (
                      <tr key={payment._id} className="border-b border-slate-50 last:border-0 dark:border-slate-900">
                        <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">{payment.paymentCode}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatCurrency(payment.amount)}</td>
                        <td className="px-4 py-2.5 text-slate-500">{formatDate(payment.paymentDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Reports;
