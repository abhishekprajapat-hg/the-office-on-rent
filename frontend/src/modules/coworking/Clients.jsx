import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import {
  Badge,
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
import { createClient, deleteClient, getClientById, getClients, updateClient } from "../../services/coworkingClientService";
import { usePermissions } from "../../context/usePermissions";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { toErrorMessage } from "../../utils/errorMessage";
import { CLIENT_STATUSES, CLIENT_TYPES, KYC_STATUSES } from "../../constants/coworkingClient";
import ClientDetailDrawer from "./components/ClientDetailDrawer";

const STATUS_OPTIONS = [{ value: "all", label: "All statuses" }, ...CLIENT_STATUSES.map((s) => ({ value: s, label: s }))];

const DEFAULT_FORM = {
  companyName: "",
  contactPerson: "",
  phone: "",
  alternatePhone: "",
  email: "",
  address: { line1: "", city: "", state: "", pincode: "" },
  gstNumber: "",
  panNumber: "",
  kycStatus: "PENDING",
  clientType: "SME",
  industry: "",
  notes: "",
  status: "LEAD",
};

const Clients = () => {
  const { can } = usePermissions();
  const canCreate = can("clients.create");
  const canUpdate = can("clients.update");
  const canDelete = can("clients.delete");

  const [clients, setClients] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [openingClientId, setOpeningClientId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClients({
        page,
        limit: 12,
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
      });
      setClients(data.clients);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load clients"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  };

  const openEditModal = (client) => {
    setEditingId(client._id);
    setFormData({
      ...DEFAULT_FORM,
      ...client,
      address: { ...DEFAULT_FORM.address, ...(client.address || {}) },
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      if (editingId) {
        await updateClient(editingId, formData);
        setToast({ type: "success", message: "Client updated" });
      } else {
        await createClient(formData);
        setToast({ type: "success", message: "Client created" });
      }
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to save client") });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteClient(deleteTarget._id);
      setToast({ type: "success", message: "Client deleted" });
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      setToast({ type: "error", message: toErrorMessage(deleteError, "Failed to delete client") });
    } finally {
      setDeleting(false);
    }
  };

  const openClientDetail = async (client) => {
    setOpeningClientId(client._id);
    setToast(null);
    try {
      const fullClient = await getClientById(client._id);
      setSelectedClient(fullClient || client);
    } catch (detailError) {
      setToast({ type: "error", message: toErrorMessage(detailError, "Failed to open client") });
      setSelectedClient(client);
    } finally {
      setOpeningClientId("");
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load clients" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Clients"
          description="Tenants and companies renting coworking space."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal}>
                New Client
              </Button>
            ) : null
          }
          filters={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search clients..." className="max-w-xs" />
              <FilterBar
                filters={[{ name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS }]}
              />
            </>
          }
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && clients.length === 0} emptyTitle="No clients yet">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5">Contact</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">KYC</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr
                  key={client._id}
                  onClick={() => openClientDetail(client)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Users aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{client.companyName}</p>
                        <p className="text-xs text-slate-400">
                          {openingClientId === client._id ? "Opening..." : client.clientCode}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {client.contactPerson || "-"}
                    {client.phone ? <span className="block text-xs text-slate-400">{client.phone}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{client.clientType}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={client.kycStatus === "VERIFIED" ? "emerald" : "amber"}>{client.kycStatus}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={client.status} />
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      {canUpdate ? (
                        <IconButton icon={Pencil} label="Edit" size="sm" onClick={() => openEditModal(client)} />
                      ) : null}
                      {canDelete ? (
                        <IconButton
                          icon={Trash2}
                          label="Delete"
                          size="sm"
                          className="hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => setDeleteTarget(client)}
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
        title={editingId ? "Edit Client" : "New Client"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.companyName.trim()}>
              {saving ? "Saving..." : "Save Client"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Company name *</span>
            <Input value={formData.companyName} onChange={(e) => setFormData((f) => ({ ...f, companyName: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Contact person</span>
            <Input value={formData.contactPerson} onChange={(e) => setFormData((f) => ({ ...f, contactPerson: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Client type</span>
            <Select value={formData.clientType} onChange={(e) => setFormData((f) => ({ ...f, clientType: e.target.value }))}>
              {CLIENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Phone</span>
            <Input value={formData.phone} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Alternate phone</span>
            <Input value={formData.alternatePhone} onChange={(e) => setFormData((f) => ({ ...f, alternatePhone: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Email</span>
            <Input type="email" value={formData.email} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">GST number</span>
            <Input value={formData.gstNumber} onChange={(e) => setFormData((f) => ({ ...f, gstNumber: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">PAN number</span>
            <Input value={formData.panNumber} onChange={(e) => setFormData((f) => ({ ...f, panNumber: e.target.value }))} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">KYC status</span>
            <Select value={formData.kycStatus} onChange={(e) => setFormData((f) => ({ ...f, kycStatus: e.target.value }))}>
              {KYC_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Status</span>
            <Select value={formData.status} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))}>
              {CLIENT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Industry</span>
            <Input value={formData.industry} onChange={(e) => setFormData((f) => ({ ...f, industry: e.target.value }))} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Address line 1</span>
            <Input
              value={formData.address.line1}
              onChange={(e) => setFormData((f) => ({ ...f, address: { ...f.address, line1: e.target.value } }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">City</span>
            <Input
              value={formData.address.city}
              onChange={(e) => setFormData((f) => ({ ...f, address: { ...f.address, city: e.target.value } }))}
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
        title={`Delete ${deleteTarget?.companyName || "client"}?`}
        description="This can't be undone. Clients with assigned seats cannot be deleted."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ClientDetailDrawer
        client={selectedClient}
        onClose={() => setSelectedClient(null)}
        onChanged={(updated) => {
          setSelectedClient(updated);
          load();
        }}
      />
    </div>
  );
};

export default Clients;
