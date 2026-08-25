import { useCallback, useEffect, useMemo, useState } from "react";
import { LifeBuoy, Plus, Send } from "lucide-react";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "../components/ui";
import { createMyTicket, getMyTicketOptions, getMyTickets } from "../services/dataService";
import { formatDate } from "../utils/format";

const CATEGORY_OPTIONS = [
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "HOUSEKEEPING", label: "Housekeeping" },
  { value: "IT", label: "IT" },
  { value: "BILLING", label: "Billing" },
  { value: "ACCESS", label: "Access" },
  { value: "OTHER", label: "Other" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const DEFAULT_FORM = {
  propertyId: "",
  title: "",
  description: "",
  category: "MAINTENANCE",
  priority: "MEDIUM",
};

const Tickets = () => {
  const [tickets, setTickets] = useState([]);
  const [properties, setProperties] = useState([]);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ticketData, optionData] = await Promise.all([
        getMyTickets({ limit: 50 }),
        getMyTicketOptions(),
      ]);
      setTickets(ticketData.tickets);
      setProperties(optionData.properties);
      setFormData((prev) => ({
        ...prev,
        propertyId: prev.propertyId || optionData.properties[0]?._id || "",
      }));
    } catch (fetchError) {
      setError(fetchError?.response?.data?.message || fetchError?.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const canSubmit = useMemo(
    () => formData.propertyId && formData.title.trim() && formData.description.trim(),
    [formData],
  );

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await createMyTicket({
        propertyId: formData.propertyId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        priority: formData.priority,
      });
      setFormData((prev) => ({
        ...DEFAULT_FORM,
        propertyId: prev.propertyId,
      }));
      setSuccess("Ticket raised successfully");
      await load();
    } catch (submitError) {
      setError(submitError?.response?.data?.message || submitError?.message || "Failed to raise ticket");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Support Tickets</h1>
          <p className="text-sm text-slate-500">Raise workspace, billing, access, IT or housekeeping requests.</p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading || saving}>
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {success}
        </div>
      ) : null}

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-xl bg-brand-50 p-2 text-brand-700">
            <Plus aria-hidden="true" size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Raise A Ticket</h2>
            <p className="text-xs text-slate-500">Our operations team will track it from the coworking ticket desk.</p>
          </div>
        </div>

        <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Workspace</span>
            <select
              value={formData.propertyId}
              onChange={(event) => updateField("propertyId", event.target.value)}
              disabled={loading || saving || properties.length === 0}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500"
            >
              {properties.length === 0 ? <option value="">No workspace linked</option> : null}
              {properties.map((property) => (
                <option key={property._id} value={property._id}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Category</span>
            <select
              value={formData.category}
              onChange={(event) => updateField("category", event.target.value)}
              disabled={saving}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Priority</span>
            <select
              value={formData.priority}
              onChange={(event) => updateField("priority", event.target.value)}
              disabled={saving}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Subject</span>
            <input
              value={formData.title}
              onChange={(event) => updateField("title", event.target.value)}
              disabled={saving}
              placeholder="Example: AC not cooling in cabin"
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Details</span>
            <textarea
              value={formData.description}
              onChange={(event) => updateField("description", event.target.value)}
              disabled={saving}
              placeholder="Add location, time, and anything the operations team should know."
              className="min-h-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!canSubmit || saving}>
              <Send aria-hidden="true" size={16} />
              {saving ? "Submitting..." : "Submit Ticket"}
            </Button>
          </div>
        </form>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Your Tickets</h2>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState title="No tickets yet" description="Tickets raised from this portal will appear here." />
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <Card key={ticket._id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <LifeBuoy aria-hidden="true" size={16} className="mt-1 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{ticket.title}</p>
                    <p className="text-xs text-slate-400">
                      {ticket.ticketCode} | {ticket.propertyId?.name || "Workspace"} | {formatDate(ticket.createdAt)}
                    </p>
                    {ticket.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{ticket.description}</p> : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    {ticket.priority}
                  </span>
                  <StatusBadge status={ticket.status} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Tickets;
