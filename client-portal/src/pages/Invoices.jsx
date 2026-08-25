import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Receipt } from "lucide-react";
import { getMyInvoices } from "../services/dataService";
import { Card, EmptyState, Skeleton, StatusBadge } from "../components/ui";
import { formatCurrency, formatDate } from "../utils/format";

const Invoices = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const isDueSoon = (invoice) => {
    const dueDate = new Date(invoice.dueDate);
    if (Number.isNaN(dueDate.getTime())) return false;
    const now = new Date();
    const fiveDaysFromNow = new Date(now);
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
    const balanceDue = Math.max(0, invoice.totalAmount - invoice.amountPaid);
    return balanceDue > 0 && dueDate >= now && dueDate <= fiveDaysFromNow;
  };

  useEffect(() => {
    getMyInvoices({ limit: 50 })
      .then((data) => setInvoices(data.invoices))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Invoices</h1>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState title="No invoices yet" description="Invoices raised against your account will appear here." />
      ) : (
        <div className="space-y-2">
          {invoices.map((invoice) => (
            <Card
              key={invoice._id}
              className="flex cursor-pointer items-center justify-between gap-3 hover:-translate-y-0.5 hover:border-brand-300 transition"
              onClick={() => navigate(`/invoices/${invoice._id}`)}
            >
              <div className="flex items-center gap-3">
                <Receipt aria-hidden="true" size={16} className="text-slate-400" />
                <div>
                  <p className="text-sm font-bold text-slate-900">{invoice.invoiceNumber}</p>
                  <p className="text-xs text-slate-400">Due {formatDate(invoice.dueDate)}</p>
                  {isDueSoon(invoice) ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                      <AlertCircle aria-hidden="true" size={12} />
                      Rent due within 5 days
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-800">{formatCurrency(invoice.totalAmount)}</span>
                <StatusBadge status={invoice.status} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Invoices;
