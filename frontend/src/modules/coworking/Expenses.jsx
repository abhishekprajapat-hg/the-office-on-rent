import { useCallback, useEffect, useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { Button, ErrorState, Input, Modal, Pagination, Select } from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, FilterBar, PageToolbar, StatusBadge } from "../../components/crm";
import { createExpense, getExpenses } from "../../services/coworkingExpenseService";
import { getProperties } from "../../services/coworkingPropertyService";
import { usePermissions } from "../../context/usePermissions";
import { formatCurrency, formatDate } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, EXPENSE_STATUSES } from "../../constants/coworkingExpense";
import ExpenseDetailDrawer from "./components/ExpenseDetailDrawer";

const STATUS_OPTIONS = [{ value: "all", label: "All statuses" }, ...EXPENSE_STATUSES.map((s) => ({ value: s, label: s }))];

const DEFAULT_FORM = {
  propertyId: "",
  category: "OTHER",
  description: "",
  amount: "",
  expenseDate: "",
  paymentMethod: "CASH",
  vendor: "",
  notes: "",
};

const Expenses = () => {
  const { can } = usePermissions();
  const canCreate = can("expenses.create");

  const [expenses, setExpenses] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedExpense, setSelectedExpense] = useState(null);

  const [properties, setProperties] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getExpenses({ page, limit: 20, status: status === "all" ? undefined : status });
      setExpenses(data.expenses);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load expenses"));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getProperties({ limit: 200 }).then((data) => setProperties(data.properties)).catch(() => setProperties([]));
  }, []);

  const openCreateModal = () => {
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      await createExpense({ ...formData, propertyId: formData.propertyId || undefined, amount: Number(formData.amount) });
      setToast({ type: "success", message: "Expense recorded as PENDING" });
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to create expense") });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load expenses" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  const canSubmit = formData.category && formData.description.trim() && Number(formData.amount) > 0 && formData.expenseDate && formData.paymentMethod;

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Expenses"
          description="Operational expenses across properties and facilities, with an approve → pay workflow."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal}>
                New Expense
              </Button>
            ) : null
          }
          filters={
            <FilterBar filters={[{ name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS }]} />
          }
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && expenses.length === 0} emptyTitle="No expenses yet">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Expense</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Property</th>
                <th className="px-4 py-2.5">Amount</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr
                  key={expense._id}
                  onClick={() => setSelectedExpense(expense)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Wallet aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{expense.expenseCode}</p>
                        <p className="max-w-[220px] truncate text-xs text-slate-400">{expense.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{expense.category}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{expense.propertyId?.name || "-"}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(expense.amount)}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatDate(expense.expenseDate)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={expense.status} />
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
        title="New Expense"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSubmit}>
              {saving ? "Saving..." : "Record Expense"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Description *</span>
            <Input value={formData.description} onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Category *</span>
            <Select value={formData.category} onChange={(e) => setFormData((f) => ({ ...f, category: e.target.value }))}>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Property (optional)</span>
            <Select value={formData.propertyId} onChange={(e) => setFormData((f) => ({ ...f, propertyId: e.target.value }))}>
              <option value="">Company-wide</option>
              {properties.map((property) => (
                <option key={property._id} value={property._id}>
                  {property.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Amount *</span>
            <Input type="number" min={0.01} value={formData.amount} onChange={(e) => setFormData((f) => ({ ...f, amount: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Expense date *</span>
            <Input type="date" value={formData.expenseDate} onChange={(e) => setFormData((f) => ({ ...f, expenseDate: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Payment method *</span>
            <Select value={formData.paymentMethod} onChange={(e) => setFormData((f) => ({ ...f, paymentMethod: e.target.value }))}>
              {EXPENSE_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Vendor</span>
            <Input value={formData.vendor} onChange={(e) => setFormData((f) => ({ ...f, vendor: e.target.value }))} />
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

      <ExpenseDetailDrawer
        expense={selectedExpense}
        onClose={() => setSelectedExpense(null)}
        onChanged={(updated) => {
          setSelectedExpense(updated);
          load();
        }}
      />
    </div>
  );
};

export default Expenses;
