import { Link } from "react-router-dom";
import {
  Armchair,
  Bell,
  Boxes,
  Building2,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  DoorOpen,
  FileSignature,
  Layers,
  Presentation,
  Receipt,
  Settings as SettingsIcon,
  ShieldCheck,
  Ticket,
  UserCheck,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardTitle } from "../../components/ui";
import { MetricCard, PageToolbar } from "../../components/crm";

const METRICS = [
  { title: "Properties", value: "--", icon: Building2, helper: "Total onboarded properties" },
  { title: "Cabins", value: "--", icon: DoorOpen, helper: "Across all floors" },
  { title: "Seats", value: "--", icon: Armchair, helper: "Total seat inventory" },
  { title: "Active Clients", value: "--", icon: Users, helper: "Currently under contract" },
];

const QUICK_LINKS = [
  { label: "Properties", path: "/coworking/properties", icon: Building2 },
  { label: "Floors", path: "/coworking/floors", icon: Layers },
  { label: "Cabins", path: "/coworking/cabins", icon: DoorOpen },
  { label: "Seats", path: "/coworking/seats", icon: Armchair },
  { label: "Clients", path: "/coworking/clients", icon: Users },
  { label: "Bookings", path: "/coworking/bookings", icon: CalendarCheck },
  { label: "Contracts", path: "/coworking/contracts", icon: FileSignature },
  { label: "Billing", path: "/coworking/billing", icon: Receipt },
  { label: "Payments", path: "/coworking/payments", icon: CreditCard },
  { label: "Expenses", path: "/coworking/expenses", icon: Wallet },
  { label: "Meeting Rooms", path: "/coworking/meeting-rooms", icon: Presentation },
  { label: "Visitors", path: "/coworking/visitors", icon: UserCheck },
  { label: "Tickets", path: "/coworking/tickets", icon: Ticket },
  { label: "Assets", path: "/coworking/assets", icon: Boxes },
  { label: "Notifications", path: "/coworking/notifications", icon: Bell },
  { label: "Users", path: "/coworking/users", icon: UserCog },
  { label: "Roles", path: "/coworking/roles", icon: ShieldCheck },
  { label: "Settings", path: "/coworking/settings", icon: SettingsIcon },
  { label: "Audit Logs", path: "/coworking/audit-logs", icon: ClipboardList },
];

const CoworkingDashboard = () => (
  <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageToolbar
        eyebrow="Coworking"
        title="Coworking Command Center"
        description="Portfolio-wide visibility across properties, occupancy, clients and billing."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((metric) => (
          <MetricCard key={metric.title} {...metric} />
        ))}
      </div>

      <Card>
        <CardContent>
          <CardTitle className="mb-3">Modules</CardTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {QUICK_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500/40"
                >
                  <Icon aria-hidden="true" size={16} className="shrink-0 text-slate-400" />
                  <span className="truncate">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);

export default CoworkingDashboard;
