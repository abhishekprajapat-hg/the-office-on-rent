import { useCallback, useEffect, useState } from "react";
import { Plus, Receipt, Trash2 } from "lucide-react";
import { Button, ErrorState, Input, Modal, Pagination, Select } from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, FilterBar, PageToolbar, StatusBadge } from "../../components/crm";
import { createInvoice, getInvoices } from "../../services/coworkingBillingService";
import { getClients } from "../../services/coworkingClientService";
import { getContracts } from "../../services/coworkingContractService";
import { usePermissions } from "../../context/usePermissions";
import { formatCurrency, formatDate } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";
import { DEFAULT_GST_RATE, DISCOUNT_TYPES, INVOICE_STATUSES } from "../../constants/coworkingBilling";
import InvoiceDetailDrawer from "./components/InvoiceDetailDrawer";

const STATUS_OPTIONS = [{ value: "all", label: "All statuses" }, ...INVOICE_STATUSES.map((s) => ({ value: s, label: s }))];

const EMPTY_LINE_ITEM = { description: "", quantity: "1", unitPrice: "" };
const EMPTY_CHARGE = { label: "", amount: "" };

const DEFAULT_FORM = {
  clientId: "",
  contractId: "",
  dueDate: "",
  discountType: "NONE",
  discountValue: "0",
  gstRate: String(DEFAULT_GST_RATE),
  notes: "",
  lineItems: [{ ...EMPTY_LINE_ITEM }],
  additionalCharges: [],
};

const Billing = () => {
  const { can } = usePermissions();
  const canCreate = can("billing.create");

  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

  const [clients, setClients] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInvoices({ page, limit: 15, status: status === "all" ? undefined : status });
      setInvoices(data.invoices);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load invoices"));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getClients({ limit: 200 }).then((data) => setClients(data.clients)).catch(() => setClients([]));
    getContracts({ limit: 200, status: "ACTIVE" }).then((data) => setContracts(data.contracts)).catch(() => setContracts([]));
  }, []);

  const openCreateModal = () => {
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  };

  const updateLineItem = (index, field, value) => {
    setFormData((f) => {
      const lineItems = [...f.lineItems];
      lineItems[index] = { ...lineItems[index], [field]: value };
      return { ...f, lineItems };
    });
  };
  const updateCharge = (index, field, value) => {
    setFormData((f) => {
      const additionalCharges = [...f.additionalCharges];
      additionalCharges[index] = { ...additionalCharges[index], [field]: value };
      return { ...f, additionalCharges };
    });
  };

  const previewTotal = () => {
    const subtotal = formData.lineItems.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
    const charges = formData.additionalCharges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const discount = formData.discountType === "PERCENTAGE" ? subtotal * ((Number(formData.discountValue) || 0) / 100) : Math.min(Number(formData.discountValue) || 0, subtotal);
    const taxable = Math.max(0, subtotal - discount + charges);
    const gst = taxable * ((Number(formData.gstRate) || 0) / 100);
    return taxable + gst;
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      await createInvoice({
        ...formData,
        contractId: formData.contractId || undefined,
        discountValue: Number(formData.discountValue) || 0,
        gstRate: Number(formData.gstRate),
        lineItems: formData.lineItems.map((item) => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })),
        additionalCharges: formData.additionalCharges.map((c) => ({ ...c, amount: Number(c.amount) })),
      });
      setToast({ type: "success", message: "Invoice created" });
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to create invoice") });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load invoices" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  const canSubmit =
    formData.clientId && formData.dueDate && formData.lineItems.every((item) => item.description.trim() && Number(item.quantity) > 0 && Number(item.unitPrice) >= 0);

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Billing"
          description="Invoices generated for client contracts and bookings. Totals are always calculated server-side."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal}>
                New Invoice
              </Button>
            ) : null
          }
          filters={
            <FilterBar filters={[{ name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS }]} />
          }
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && invoices.length === 0} emptyTitle="No invoices yet">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5">Total</th>
                <th className="px-4 py-2.5">Paid</th>
                <th className="px-4 py-2.5">Due</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice._id}
                  onClick={() => setSelectedInvoiceId(invoice._id)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Receipt aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{invoice.invoiceNumber}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{invoice.clientId?.companyName || "-"}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatCurrency(invoice.totalAmount)}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatCurrency(invoice.amountPaid)}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatDate(invoice.dueDate)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={invoice.status} />
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
        title="New Invoice"
        description="Totals are recalculated on the server — this preview is indicative only."
        size="xl"
        footer={
          <>
            <div className="mr-auto text-sm font-bold text-slate-700 dark:text-slate-200">
              Est. total: {formatCurrency(previewTotal())}
            </div>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSubmit}>
              {saving ? "Creating..." : "Create Invoice"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Client *</span>
            <Select value={formData.clientId} onChange={(e) => setFormData((f) => ({ ...f, clientId: e.target.value }))}>
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client._id} value={client._id}>
                  {client.companyName}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Contract (optional)</span>
            <Select value={formData.contractId} onChange={(e) => setFormData((f) => ({ ...f, contractId: e.target.value }))}>
              <option value="">No linked contract</option>
              {contracts.map((contract) => (
                <option key={contract._id} value={contract._id}>
                  {contract.contractCode}
                </option>
              ))}
            </Select>
          </label>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Line items</p>
            <div className="space-y-2">
              {formData.lineItems.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <Input placeholder="Description" value={item.description} onChange={(e) => updateLineItem(index, "description", e.target.value)} className="flex-1" />
                  <Input type="number" min={0} placeholder="Qty" value={item.quantity} onChange={(e) => updateLineItem(index, "quantity", e.target.value)} className="w-20" />
                  <Input type="number" min={0} placeholder="Unit price" value={item.unitPrice} onChange={(e) => updateLineItem(index, "unitPrice", e.target.value)} className="w-32" />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setFormData((f) => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== index) }))}
                    disabled={formData.lineItems.length === 1}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setFormData((f) => ({ ...f, lineItems: [...f.lineItems, { ...EMPTY_LINE_ITEM }] }))}>
                Add line item
              </Button>
            </div>
          </div>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Additional charges</p>
            <div className="space-y-2">
              {formData.additionalCharges.map((charge, index) => (
                <div key={index} className="flex gap-2">
                  <Input placeholder="Label (e.g. Maintenance)" value={charge.label} onChange={(e) => updateCharge(index, "label", e.target.value)} className="flex-1" />
                  <Input type="number" min={0} placeholder="Amount" value={charge.amount} onChange={(e) => updateCharge(index, "amount", e.target.value)} className="w-32" />
                  <Button variant="secondary" size="sm" onClick={() => setFormData((f) => ({ ...f, additionalCharges: f.additionalCharges.filter((_, i) => i !== index) }))}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setFormData((f) => ({ ...f, additionalCharges: [...f.additionalCharges, { ...EMPTY_CHARGE }] }))}>
                Add charge
              </Button>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Discount type</span>
            <Select value={formData.discountType} onChange={(e) => setFormData((f) => ({ ...f, discountType: e.target.value }))}>
              {DISCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Discount value</span>
            <Input type="number" min={0} value={formData.discountValue} onChange={(e) => setFormData((f) => ({ ...f, discountValue: e.target.value }))} disabled={formData.discountType === "NONE"} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">GST rate (%)</span>
            <Input type="number" min={0} max={40} value={formData.gstRate} onChange={(e) => setFormData((f) => ({ ...f, gstRate: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Due date *</span>
            <Input type="date" value={formData.dueDate} onChange={(e) => setFormData((f) => ({ ...f, dueDate: e.target.value }))} />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Notes</span>
            <textarea
              className="min-h-[60px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={formData.notes}
              onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <InvoiceDetailDrawer
        invoiceId={selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
        onChanged={load}
      />
    </div>
  );
};

export default Billing;
