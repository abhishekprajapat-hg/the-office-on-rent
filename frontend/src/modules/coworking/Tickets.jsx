import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Pencil, Plus, RotateCcw, Trash2, XCircle } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  ErrorState,
  IconButton,
  Input,
  Modal,
  Pagination,
  SearchInput,
  Select,
} from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, FilterBar, PageToolbar, StatusBadge } from "../../components/crm";
import { getClients } from "../../services/coworkingClientService";
import { getProperties } from "../../services/coworkingPropertyService";
import {
  closeTicket,
  createTicket,
  deleteTicket,
  getTickets,
  reopenTicket,
  resolveTicket,
  updateTicket,
} from "../../services/coworkingTicketService";
import { usePermissions } from "../../context/usePermissions";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { formatDate } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const TICKET_CATEGORIES = ["MAINTENANCE", "HOUSEKEEPING", "IT", "BILLING", "ACCESS", "OTHER"];

const DEFAULT_FORM = {
  propertyId: "",
  clientId: "",
  title: "",
  description: "",
  category: "MAINTENANCE",
  priority: "MEDIUM",
  status: "OPEN",
  reportedByName: "",
  assignedToName: "",
  dueDate: "",
  resolutionNotes: "",
};

const toDateInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const toForm = (ticket) => ({
  propertyId: ticket?.propertyId?._id || ticket?.propertyId || "",
  clientId: ticket?.clientId?._id || ticket?.clientId || "",
  title: ticket?.title || "",
  description: ticket?.description || "",
  category: ticket?.category || "MAINTENANCE",
  priority: ticket?.priority || "MEDIUM",
  status: ticket?.status || "OPEN",
  reportedByName: ticket?.reportedByName || "",
  assignedToName: ticket?.assignedToName || "",
  dueDate: toDateInput(ticket?.dueDate),
  resolutionNotes: ticket?.resolutionNotes || "",
});

const toPayload = (formData) => ({
  propertyId: formData.propertyId,
  clientId: formData.clientId || null,
  title: formData.title.trim(),
  description: formData.description,
  category: formData.category,
  priority: formData.priority,
  status: formData.status,
  reportedByName: formData.reportedByName,
  assignedToName: formData.assignedToName,
  dueDate: formData.dueDate || null,
  resolutionNotes: formData.resolutionNotes,
});

const priorityClass = (priority) => {
  if (priority === "URGENT") return "text-rose-600 dark:text-rose-300";
  if (priority === "HIGH") return "text-amber-600 dark:text-amber-300";
  return "text-slate-600 dark:text-slate-300";
};

const Tickets = () => {
  const { can } = usePermissions();
  const canCreate = can("tickets.create");
  const canUpdate = can("tickets.update");
  const canDelete = can("tickets.delete");
  const canResolve = can("tickets.resolve");
  const canClose = can("tickets.close");

  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [properties, setProperties] = useState([]);
  const [clients, setClients] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTickets({
        page,
        limit: 15,
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
        priority: priority === "all" ? undefined : priority,
      });
      setTickets(data.tickets);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load tickets"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status, priority]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([getProperties({ limit: 200 }), getClients({ limit: 200 })])
      .then(([propertyData, clientData]) => {
        setProperties(propertyData.properties);
        setClients(clientData.clients);
      })
      .catch(() => {
        setProperties([]);
        setClients([]);
      });
  }, []);

  const openCreateModal = () => {
    setEditingTicket(null);
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  };

  const openEditModal = (ticket) => {
    setEditingTicket(ticket);
    setFormData(toForm(ticket));
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const payload = toPayload(formData);
      if (editingTicket) {
        await updateTicket(editingTicket._id, payload);
        setToast({ type: "success", message: "Ticket updated" });
      } else {
        await createTicket(payload);
        setToast({ type: "success", message: "Ticket created" });
      }
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to save ticket") });
    } finally {
      setSaving(false);
    }
  };

  const runTicketAction = async (ticket, action, successMessage) => {
    setBusyId(ticket._id);
    setToast(null);
    try {
      await action(ticket._id);
      setToast({ type: "success", message: successMessage });
      await load();
    } catch (actionError) {
      setToast({ type: "error", message: toErrorMessage(actionError, "Ticket action failed") });
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget._id);
    setToast(null);
    try {
      await deleteTicket(deleteTarget._id);
      setToast({ type: "success", message: "Ticket deleted" });
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      setToast({ type: "error", message: toErrorMessage(deleteError, "Failed to delete ticket") });
    } finally {
      setBusyId("");
    }
  };

  const canSubmit = formData.propertyId && formData.title.trim();

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load tickets" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Tickets"
          description="Maintenance and support tickets raised by clients or staff."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal} disabled={properties.length === 0}>
                New Ticket
              </Button>
            ) : null
          }
          filters={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search tickets..." className="max-w-xs" />
              <FilterBar
                filters={[
                  { name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS },
                  { name: "priority", label: "Priority", value: priority, onChange: setPriority, options: PRIORITY_OPTIONS },
                ]}
              />
            </>
          }
        />

        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && tickets.length === 0} emptyTitle="No tickets yet">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Ticket</th>
                <th className="px-4 py-2.5">Property / Client</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Priority</th>
                <th className="px-4 py-2.5">Due</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr
                  key={ticket._id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{ticket.title}</p>
                    <p className="text-xs text-slate-400">
                      {ticket.ticketCode}
                      {ticket.assignedToName ? ` · ${ticket.assignedToName}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {ticket.propertyId?.name || "-"}
                    {ticket.clientId?.companyName ? (
                      <span className="block text-xs text-slate-400">{ticket.clientId.companyName}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{ticket.category.replace(/_/g, " ")}</td>
                  <td className={`px-4 py-2.5 font-semibold ${priorityClass(ticket.priority)}`}>{ticket.priority}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatDate(ticket.dueDate)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={ticket.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {canResolve && !["RESOLVED", "CLOSED"].includes(ticket.status) ? (
                        <IconButton
                          icon={CheckCircle2}
                          label="Resolve"
                          size="sm"
                          disabled={busyId === ticket._id}
                          onClick={() => runTicketAction(ticket, resolveTicket, "Ticket resolved")}
                        />
                      ) : null}
                      {canClose && ticket.status !== "CLOSED" ? (
                        <IconButton
                          icon={XCircle}
                          label="Close"
                          size="sm"
                          disabled={busyId === ticket._id}
                          onClick={() => runTicketAction(ticket, closeTicket, "Ticket closed")}
                        />
                      ) : null}
                      {canUpdate && ["RESOLVED", "CLOSED"].includes(ticket.status) ? (
                        <IconButton
                          icon={RotateCcw}
                          label="Reopen"
                          size="sm"
                          disabled={busyId === ticket._id}
                          onClick={() => runTicketAction(ticket, reopenTicket, "Ticket reopened")}
                        />
                      ) : null}
                      {canUpdate ? (
                        <IconButton
                          icon={Pencil}
                          label="Edit"
                          size="sm"
                          disabled={busyId === ticket._id}
                          onClick={() => openEditModal(ticket)}
                        />
                      ) : null}
                      {canDelete ? (
                        <IconButton
                          icon={Trash2}
                          label="Delete"
                          size="sm"
                          disabled={busyId === ticket._id}
                          className="hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => setDeleteTarget(ticket)}
                        />
                      ) : null}
                    </div>
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
        title={editingTicket ? "Edit Ticket" : "New Ticket"}
        description="Track operational work for maintenance, IT, access and client support."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSubmit}>
              {saving ? "Saving..." : editingTicket ? "Save Changes" : "Create Ticket"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Property *</span>
            <Select value={formData.propertyId} onChange={(e) => setFormData((f) => ({ ...f, propertyId: e.target.value }))}>
              <option value="">Select a property</option>
              {properties.map((property) => (
                <option key={property._id} value={property._id}>
                  {property.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Client</span>
            <Select value={formData.clientId} onChange={(e) => setFormData((f) => ({ ...f, clientId: e.target.value }))}>
              <option value="">Internal / no client</option>
              {clients.map((client) => (
                <option key={client._id} value={client._id}>
                  {client.companyName}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Title *</span>
            <Input value={formData.title} onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Category</span>
            <Select value={formData.category} onChange={(e) => setFormData((f) => ({ ...f, category: e.target.value }))}>
              {TICKET_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Priority</span>
            <Select value={formData.priority} onChange={(e) => setFormData((f) => ({ ...f, priority: e.target.value }))}>
              {TICKET_PRIORITIES.map((ticketPriority) => (
                <option key={ticketPriority} value={ticketPriority}>
                  {ticketPriority}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Status</span>
            <Select value={formData.status} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))}>
              {TICKET_STATUSES.map((ticketStatus) => (
                <option key={ticketStatus} value={ticketStatus}>
                  {ticketStatus.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Due date</span>
            <Input type="date" value={formData.dueDate} onChange={(e) => setFormData((f) => ({ ...f, dueDate: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Reported by</span>
            <Input value={formData.reportedByName} onChange={(e) => setFormData((f) => ({ ...f, reportedByName: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Assigned to</span>
            <Input value={formData.assignedToName} onChange={(e) => setFormData((f) => ({ ...f, assignedToName: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Description</span>
            <textarea
              className="min-h-[88px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={formData.description}
              onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Resolution notes</span>
            <textarea
              className="min-h-[72px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={formData.resolutionNotes}
              onChange={(e) => setFormData((f) => ({ ...f, resolutionNotes: e.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.ticketCode || "ticket"}?`}
        description="This removes the support ticket from the operations list."
        confirmLabel="Delete"
        loading={busyId === deleteTarget?._id}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Tickets;
