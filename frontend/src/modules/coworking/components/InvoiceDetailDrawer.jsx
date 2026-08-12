import { useCallback, useEffect, useState } from "react";
import { Ban, Receipt } from "lucide-react";
import { Badge, Button } from "../../../components/ui";
import { DetailDrawer, StatusBadge } from "../../../components/crm";
import { cancelInvoice, getInvoiceById } from "../../../services/coworkingBillingService";
import { usePermissions } from "../../../context/usePermissions";
import { formatCurrency, formatDate, formatDateTime } from "../../../utils/format";
import { toErrorMessage } from "../../../utils/errorMessage";

const InvoiceDetailDrawer = ({ invoiceId, onClose, onChanged }) => {
  const { can } = usePermissions();
  const canUpdate = can("billing.update");

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError(null);
    try {
      setInvoice(await getInvoiceById(invoiceId));
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load invoice"));
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelInvoice(invoice._id);
      await load();
      onChanged?.();
    } catch (cancelError) {
      setError(toErrorMessage(cancelError, "Failed to cancel invoice"));
    } finally {
      setBusy(false);
    }
  };

  if (!invoiceId) return null;

  return (
    <DetailDrawer open={Boolean(invoiceId)} onClose={onClose} title={invoice?.invoiceNumber || "Invoice"} description={invoice?.clientId?.companyName}>
      {loading || !invoice ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={invoice.status} />
            {invoice.contractId ? <Badge variant="slate">{invoice.contractId.contractCode}</Badge> : null}
            <Badge variant="blue">Due {formatDate(invoice.dueDate)}</Badge>
          </div>

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </p>
          ) : null}

          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Line items</p>
            <div className="space-y-1 text-sm">
              {invoice.lineItems.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-300">{item.description} × {item.quantity}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(item.amount)}</span>
                </div>
              ))}
              {invoice.additionalCharges.map((charge, idx) => (
                <div key={`c-${idx}`} className="flex justify-between text-slate-500">
                  <span>{charge.label}</span>
                  <span>{formatCurrency(charge.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1 border-t border-slate-100 pt-2 text-sm dark:border-slate-800">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
            {invoice.discountAmount > 0 ? (
              <div className="flex justify-between text-slate-500"><span>Discount</span><span>-{formatCurrency(invoice.discountAmount)}</span></div>
            ) : null}
            <div className="flex justify-between text-slate-500"><span>GST ({invoice.gstRate}%)</span><span>{formatCurrency(invoice.gstAmount)}</span></div>
            <div className="flex justify-between text-base font-bold text-slate-900 dark:text-slate-100"><span>Total</span><span>{formatCurrency(invoice.totalAmount)}</span></div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-300"><span>Paid</span><span>{formatCurrency(invoice.amountPaid)}</span></div>
            <div className="flex justify-between font-semibold text-rose-600 dark:text-rose-300"><span>Balance due</span><span>{formatCurrency(invoice.totalAmount - invoice.amountPaid)}</span></div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Payments</p>
            {invoice.payments?.length ? (
              <div className="space-y-1.5">
                {invoice.payments.map((payment) => (
                  <div key={payment._id} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <Receipt aria-hidden="true" size={12} className="text-slate-400" />
                      <span className={payment.type === "REFUND" ? "text-rose-600 dark:text-rose-300" : "text-slate-700 dark:text-slate-200"}>
                        {payment.type === "REFUND" ? "-" : ""}{formatCurrency(payment.amount)} · {payment.method}
                      </span>
                    </div>
                    <span className="text-slate-400">{formatDateTime(payment.paymentDate)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No payments recorded yet</p>
            )}
          </div>

          {canUpdate && invoice.amountPaid === 0 && invoice.status !== "CANCELLED" ? (
            <Button size="sm" variant="danger" leftIcon={Ban} disabled={busy} onClick={handleCancel}>
              Cancel Invoice
            </Button>
          ) : null}
        </div>
      )}
    </DetailDrawer>
  );
};

export default InvoiceDetailDrawer;
