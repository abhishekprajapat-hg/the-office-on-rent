import { useEffect, useState } from "react";
import { AlertCircle, CalendarCheck, FileSignature, Receipt } from "lucide-react";
import { getMyBookings, getMyContracts, getMyInvoices } from "../services/dataService";
import { useAuth } from "../context/useAuth";
import { Card, Skeleton } from "../components/ui";
import { formatCurrency } from "../utils/format";

const Dashboard = () => {
  const { client, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [outstanding, setOutstanding] = useState(0);
  const [activeBookings, setActiveBookings] = useState(0);
  const [activeContracts, setActiveContracts] = useState(0);
  const [rentReminders, setRentReminders] = useState([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getMyInvoices({ limit: 100 }),
      getMyBookings({ limit: 100, status: "ACTIVE" }),
      getMyContracts({ limit: 100, status: "ACTIVE" }),
    ])
      .then(([invoicesData, bookingsData, contractsData]) => {
        if (!alive) return;
        const balance = invoicesData.invoices.reduce((sum, inv) => sum + Math.max(0, inv.totalAmount - inv.amountPaid), 0);
        const now = new Date();
        const fiveDaysFromNow = new Date(now);
        fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
        const dueSoon = invoicesData.invoices.filter((invoice) => {
          const dueDate = new Date(invoice.dueDate);
          const balanceDue = Math.max(0, invoice.totalAmount - invoice.amountPaid);
          return balanceDue > 0 && dueDate >= now && dueDate <= fiveDaysFromNow;
        });
        setOutstanding(balance);
        setRentReminders(dueSoon);
        setActiveBookings(bookingsData.bookings.length);
        setActiveContracts(contractsData.contracts.length);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Welcome, {user?.name}</h1>
        <p className="text-sm text-slate-500">{client?.companyName}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {loading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <Card>
              <div className="flex items-center gap-2 text-slate-400">
                <Receipt aria-hidden="true" size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">Outstanding</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(outstanding)}</p>
            </Card>
            <Card>
              <div className="flex items-center gap-2 text-slate-400">
                <CalendarCheck aria-hidden="true" size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">Active Bookings</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{activeBookings}</p>
            </Card>
            <Card>
              <div className="flex items-center gap-2 text-slate-400">
                <FileSignature aria-hidden="true" size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">Active Contracts</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{activeContracts}</p>
            </Card>
          </>
        )}
      </div>

      {!loading && rentReminders.length ? (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <AlertCircle aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-bold text-amber-900">Rent reminder</p>
              <p className="mt-1 text-sm text-amber-800">
                {rentReminders.length} unpaid invoice{rentReminders.length === 1 ? "" : "s"} due in the next 5 days.
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export default Dashboard;
