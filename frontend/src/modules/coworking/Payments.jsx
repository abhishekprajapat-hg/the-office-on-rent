import { useCallback, useEffect, useState } from "react";
import { CreditCard, Plus, RotateCcw } from "lucide-react";
import { Badge, Button, ErrorState, IconButton, Input, Modal, Pagination, Select } from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, PageToolbar } from "../../components/crm";
import { getPayments, recordPayment, refundPayment } from "../../services/coworkingPaymentService";
import { getInvoices } from "../../services/coworkingBillingService";
import { usePermissions } from "../../context/usePermissions";
import { formatCurrency, formatDateTime } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";
import { PAYMENT_METHODS } from "../../constants/coworkingBilling";

const DEFAULT_FORM = { invoiceId: "", amount: "", method: "CASH", transactionReference: "", paymentDate: "", notes: "" };

const Payments = () => {
  const { can } = usePermissions();
  const canCreate = can("payments.create");
  const canRefund = can("payments.refund");

  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [outstandingInvoices, setOutstandingInvoices] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refunding, setRefunding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPayments({ page, limit: 20 });
      setPayments(data.payments);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load payments"));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreateModal = async () => {
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
    try {
      const [pending, partial, overdue] = await Promise.all([
        getInvoices({ limit: 100, status: "PENDING" }),
        getInvoices({ limit: 100, status: "PARTIALLY_PAID" }),
        getInvoices({ limit: 100, status: "OVERDUE" }),
      ]);
      setOutstandingInvoices([...pending.invoices, ...partial.invoices, ...overdue.invoices]);
    } catch {
      setOutstandingInvoices([]);
    }
  };

  const selectedInvoice = outstandingInvoices.find((inv) => inv._id === formData.invoiceId);
  const balanceDue = selectedInvoice ? selectedInvoice.totalAmount - selectedInvoice.amountPaid : null;

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      await recordPayment({
        ...formData,
        amount: Number(formData.amount),
        paymentDate: formData.paymentDate || undefined,
      });
      setToast({ type: "success", message: "Payment recorded" });
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to record payment") });
    } finally {
      setSaving(false);
    }
  };

  const handleRefund = async () => {
    setRefunding(true);
    try {
      await refundPayment(refundTarget._id, { amount: Number(refundAmount), reason: "Refund issued from Payments" });
      setToast({ type: "success", message: "Refund issued" });
      setRefundTarget(null);
      setRefundAmount("");
      await load();
    } catch (refundError) {
      setToast({ type: "error", message: toErrorMessage(refundError, "Failed to issue refund") });
    } finally {
      setRefunding(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load payments" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Payments"
          description="Payments received against invoices, including partial payments and refunds."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal}>
                Record Payment
              </Button>
            ) : null
          }
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && payments.length === 0} emptyTitle="No payments recorded yet">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Payment</th>
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5">Amount</th>
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment._id} className="border-b border-slate-50 last:border-0 dark:border-slate-900">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <CreditCard aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{payment.paymentCode}</span>
                      {payment.type === "REFUND" ? <Badge variant="rose">Refund</Badge> : null}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{payment.invoiceId?.invoiceNumber || "-"}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{payment.clientId?.companyName || "-"}</td>
                  <td className={`px-4 py-2.5 font-semibold ${payment.type === "REFUND" ? "text-rose-600 dark:text-rose-300" : "text-slate-800 dark:text-slate-100"}`}>
                    {payment.type === "REFUND" ? "-" : ""}{formatCurrency(payment.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{payment.method}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatDateTime(payment.paymentDate)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canRefund && payment.type === "PAYMENT" ? (
                      <IconButton
                        icon={RotateCcw}
                        label="Refund"
                        size="sm"
                        onClick={() => {
                          setRefundTarget(payment);
                          setRefundAmount(String(payment.amount));
                        }}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>

        {pagination ? (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages || 1}
            totalItems={pagination.totalCount}
            pageSize={pagination.limit}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record Payment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.invoiceId || !formData.amount || !formData.method}>
              {saving ? "Recording..." : "Record Payment"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Invoice *</span>
            <Select value={formData.invoiceId} onChange={(e) => setFormData((f) => ({ ...f, invoiceId: e.target.value }))}>
              <option value="">Select an outstanding invoice</option>
              {outstandingInvoices.map((invoice) => (
                <option key={invoice._id} value={invoice._id}>
                  {invoice.invoiceNumber} · Balance {formatCurrency(invoice.totalAmount - invoice.amountPaid)}
                </option>
              ))}
            </Select>
            {balanceDue !== null ? (
              <span className="text-xs text-slate-400">Outstanding balance: {formatCurrency(balanceDue)}</span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Amount *</span>
            <Input type="number" min={0.01} max={balanceDue || undefined} value={formData.amount} onChange={(e) => setFormData((f) => ({ ...f, amount: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Method *</span>
            <Select value={formData.method} onChange={(e) => setFormData((f) => ({ ...f, method: e.target.value }))}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </Select>
          </label>
          {formData.method !== "CASH" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">Transaction reference *</span>
              <Input value={formData.transactionReference} onChange={(e) => setFormData((f) => ({ ...f, transactionReference: e.target.value }))} />
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Payment date</span>
            <Input type="date" value={formData.paymentDate} onChange={(e) => setFormData((f) => ({ ...f, paymentDate: e.target.value }))} />
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(refundTarget)}
        onClose={() => setRefundTarget(null)}
        title={`Refund ${refundTarget?.paymentCode || ""}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefundTarget(null)} disabled={refunding}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleRefund} disabled={refunding || !refundAmount}>
              {refunding ? "Processing..." : "Issue Refund"}
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">Refund amount (max {formatCurrency(refundTarget?.amount || 0)})</span>
          <Input type="number" min={0.01} max={refundTarget?.amount} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
        </label>
      </Modal>
    </div>
  );
};

export default Payments;
