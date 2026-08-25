import { useCallback, useEffect, useState } from "react";
import { LogOut, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
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
  checkoutVisitor,
  createVisitor,
  deleteVisitor,
  getVisitors,
  updateVisitor,
} from "../../services/coworkingVisitorService";
import { usePermissions } from "../../context/usePermissions";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { formatDateTime } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "CHECKED_IN", label: "Checked In" },
  { value: "CHECKED_OUT", label: "Checked Out" },
];

const DEFAULT_FORM = {
  propertyId: "",
  clientId: "",
  visitorName: "",
  phone: "",
  email: "",
  hostName: "",
  purpose: "",
  idProofType: "",
  idProofLast4: "",
  notes: "",
};

const toForm = (visitor) => ({
  propertyId: visitor?.propertyId?._id || visitor?.propertyId || "",
  clientId: visitor?.clientId?._id || visitor?.clientId || "",
  visitorName: visitor?.visitorName || "",
  phone: visitor?.phone || "",
  email: visitor?.email || "",
  hostName: visitor?.hostName || "",
  purpose: visitor?.purpose || "",
  idProofType: visitor?.idProofType || "",
  idProofLast4: visitor?.idProofLast4 || "",
  notes: visitor?.notes || "",
});

const toPayload = (formData) => ({
  propertyId: formData.propertyId,
  clientId: formData.clientId || null,
  visitorName: formData.visitorName.trim(),
  phone: formData.phone,
  email: formData.email,
  hostName: formData.hostName,
  purpose: formData.purpose,
  idProofType: formData.idProofType,
  idProofLast4: formData.idProofLast4,
  notes: formData.notes,
});

const Visitors = () => {
  const { can } = usePermissions();
  const canCreate = can("visitors.create");
  const canUpdate = can("visitors.update");
  const canDelete = can("visitors.delete");
  const canCheckout = can("visitors.checkout");

  const [visitors, setVisitors] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [properties, setProperties] = useState([]);
  const [clients, setClients] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVisitor, setEditingVisitor] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVisitors({
        page,
        limit: 15,
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
      });
      setVisitors(data.visitors);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load visitors"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([
      getProperties({ limit: 200 }),
      getClients({ limit: 200 }),
    ])
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
    setEditingVisitor(null);
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  };

  const openEditModal = (visitor) => {
    setEditingVisitor(visitor);
    setFormData(toForm(visitor));
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const payload = toPayload(formData);
      if (editingVisitor) {
        await updateVisitor(editingVisitor._id, payload);
        setToast({ type: "success", message: "Visitor updated" });
      } else {
        await createVisitor(payload);
        setToast({ type: "success", message: "Visitor checked in" });
      }
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to save visitor") });
    } finally {
      setSaving(false);
    }
  };

  const handleCheckout = async (visitor) => {
    setBusyId(visitor._id);
    setToast(null);
    try {
      await checkoutVisitor(visitor._id);
      setToast({ type: "success", message: "Visitor checked out" });
      await load();
    } catch (checkoutError) {
      setToast({ type: "error", message: toErrorMessage(checkoutError, "Failed to check out visitor") });
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget._id);
    setToast(null);
    try {
      await deleteVisitor(deleteTarget._id);
      setToast({ type: "success", message: "Visitor deleted" });
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      setToast({ type: "error", message: toErrorMessage(deleteError, "Failed to delete visitor") });
    } finally {
      setBusyId("");
    }
  };

  const canSubmit = formData.propertyId && formData.visitorName.trim();

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load visitors" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Visitors"
          description="Visitor check-in and check-out log across properties."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal} disabled={properties.length === 0}>
                Check In Visitor
              </Button>
            ) : null
          }
          filters={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search visitors..." className="max-w-xs" />
              <FilterBar
                filters={[
                  { name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS },
                ]}
              />
            </>
          }
        />

        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && visitors.length === 0} emptyTitle="No visitors yet">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Visitor</th>
                <th className="px-4 py-2.5">Property / Client</th>
                <th className="px-4 py-2.5">Host</th>
                <th className="px-4 py-2.5">Check In</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visitors.map((visitor) => (
                <tr
                  key={visitor._id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <UserCheck aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{visitor.visitorName}</p>
                        <p className="text-xs text-slate-400">
                          {visitor.visitorCode}
                          {visitor.phone ? ` · ${visitor.phone}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {visitor.propertyId?.name || "-"}
                    {visitor.clientId?.companyName ? (
                      <span className="block text-xs text-slate-400">{visitor.clientId.companyName}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {visitor.hostName || "-"}
                    {visitor.purpose ? <span className="block text-xs text-slate-400">{visitor.purpose}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {formatDateTime(visitor.checkInAt)}
                    {visitor.checkOutAt ? <span className="block text-xs text-slate-400">Out {formatDateTime(visitor.checkOutAt)}</span> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={visitor.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {canCheckout && visitor.status === "CHECKED_IN" ? (
                        <IconButton
                          icon={LogOut}
                          label="Check out"
                          size="sm"
                          disabled={busyId === visitor._id}
                          onClick={() => handleCheckout(visitor)}
                        />
                      ) : null}
                      {canUpdate ? (
                        <IconButton
                          icon={Pencil}
                          label="Edit"
                          size="sm"
                          disabled={busyId === visitor._id}
                          onClick={() => openEditModal(visitor)}
                        />
                      ) : null}
                      {canDelete ? (
                        <IconButton
                          icon={Trash2}
                          label="Delete"
                          size="sm"
                          disabled={busyId === visitor._id}
                          className="hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => setDeleteTarget(visitor)}
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
        title={editingVisitor ? "Edit Visitor" : "Check In Visitor"}
        description="Capture visitor identity, property, host and purpose."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSubmit}>
              {saving ? "Saving..." : editingVisitor ? "Save Changes" : "Check In"}
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
              <option value="">Walk-in / no client</option>
              {clients.map((client) => (
                <option key={client._id} value={client._id}>
                  {client.companyName}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Visitor name *</span>
            <Input value={formData.visitorName} onChange={(e) => setFormData((f) => ({ ...f, visitorName: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Phone</span>
            <Input value={formData.phone} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Email</span>
            <Input type="email" value={formData.email} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Host</span>
            <Input value={formData.hostName} onChange={(e) => setFormData((f) => ({ ...f, hostName: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Purpose</span>
            <Input value={formData.purpose} onChange={(e) => setFormData((f) => ({ ...f, purpose: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">ID proof type</span>
            <Input value={formData.idProofType} onChange={(e) => setFormData((f) => ({ ...f, idProofType: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">ID last 4 digits</span>
            <Input
              inputMode="numeric"
              maxLength={4}
              value={formData.idProofLast4}
              onChange={(e) => setFormData((f) => ({ ...f, idProofLast4: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Notes</span>
            <textarea
              className="min-h-[72px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={formData.notes}
              onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.visitorName || "visitor"}?`}
        description="This removes the visitor log entry."
        confirmLabel="Delete"
        loading={busyId === deleteTarget?._id}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Visitors;
