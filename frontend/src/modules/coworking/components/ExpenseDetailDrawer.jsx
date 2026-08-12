import { useState } from "react";
import { Ban, CheckCircle2, FileText, IndianRupee, Trash2 } from "lucide-react";
import { Badge, Button, IconButton, Select } from "../../../components/ui";
import { DetailDrawer, StatusBadge } from "../../../components/crm";
import { addExpenseReceipt, approveExpense, markExpensePaid, rejectExpense, removeExpenseReceipt } from "../../../services/coworkingExpenseService";
import { uploadFile } from "../../../services/uploadService";
import { usePermissions } from "../../../context/usePermissions";
import { formatCurrency, formatDate } from "../../../utils/format";
import { toErrorMessage } from "../../../utils/errorMessage";

const RECEIPT_CATEGORIES = ["RECEIPT", "INVOICE", "OTHER"];

const ExpenseDetailDrawer = ({ expense, onClose, onChanged }) => {
  const { can } = usePermissions();
  const canApprove = can("expenses.approve");
  const canUpdate = can("expenses.update");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [receiptCategory, setReceiptCategory] = useState("RECEIPT");
  const [uploading, setUploading] = useState(false);

  if (!expense) return null;

  const run = async (actionFn) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await actionFn());
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file, "coworking-expenses");
      const updated = await addExpenseReceipt(expense._id, {
        name: uploaded.fileName || file.name,
        fileUrl: uploaded.url,
        fileType: uploaded.mimeType || file.type,
        category: receiptCategory,
      });
      onChanged(updated);
    } catch (uploadError) {
      setError(toErrorMessage(uploadError, "Failed to upload receipt"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <DetailDrawer open={Boolean(expense)} onClose={onClose} title={expense.expenseCode} description={expense.description}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={expense.status} />
          <Badge variant="slate">{expense.category}</Badge>
          {expense.propertyId ? <Badge variant="blue">{expense.propertyId.name}</Badge> : null}
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-1 text-lg font-bold text-slate-900 dark:text-slate-100">
            <IndianRupee aria-hidden="true" size={16} /> {formatCurrency(expense.amount).replace("₹", "")}
          </p>
          <p><span className="font-semibold text-slate-500">Date:</span> {formatDate(expense.expenseDate)}</p>
          <p><span className="font-semibold text-slate-500">Vendor:</span> {expense.vendor || "-"}</p>
          <p><span className="font-semibold text-slate-500">Payment method:</span> {expense.paymentMethod}</p>
          {expense.approvedBy ? <p><span className="font-semibold text-slate-500">Approved by:</span> {expense.approvedBy.name}</p> : null}
          {expense.rejectedReason ? <p className="text-rose-600 dark:text-rose-300">Rejected: {expense.rejectedReason}</p> : null}
          {expense.notes ? <p className="text-slate-500">{expense.notes}</p> : null}
        </div>

        {canApprove && expense.status === "PENDING" ? (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Button size="sm" leftIcon={CheckCircle2} disabled={busy} onClick={() => run(() => approveExpense(expense._id))}>
              Approve
            </Button>
            <Button size="sm" variant="danger" leftIcon={Ban} disabled={busy} onClick={() => run(() => rejectExpense(expense._id, "Rejected from expense detail"))}>
              Reject
            </Button>
          </div>
        ) : null}
        {canApprove && expense.status === "APPROVED" ? (
          <Button size="sm" variant="success" leftIcon={CheckCircle2} disabled={busy} onClick={() => run(() => markExpensePaid(expense._id))}>
            Mark Paid
          </Button>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Receipts</p>
          <div className="space-y-2">
            {expense.receipts?.length ? (
              expense.receipts.map((receipt) => (
                <div key={receipt._id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                  <a href={receipt.fileUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm text-blue-700 hover:underline dark:text-blue-300">
                    <FileText aria-hidden="true" size={14} className="shrink-0" />
                    <span className="truncate">{receipt.name}</span>
                    <Badge variant="slate">{receipt.category}</Badge>
                  </a>
                  {canUpdate ? (
                    <IconButton icon={Trash2} label="Remove receipt" size="sm" onClick={() => run(() => removeExpenseReceipt(expense._id, receipt._id))} />
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400">No receipts uploaded</p>
            )}

            {canUpdate ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                <Select value={receiptCategory} onChange={(e) => setReceiptCategory(e.target.value)} className="w-32">
                  {RECEIPT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
                <input
                  type="file"
                  disabled={uploading}
                  onChange={handleUpload}
                  className="flex-1 text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-blue-700 dark:text-slate-400 dark:file:bg-blue-500/10 dark:file:text-blue-200"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </DetailDrawer>
  );
};

export default ExpenseDetailDrawer;
