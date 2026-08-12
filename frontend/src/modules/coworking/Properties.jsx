import { useCallback, useEffect, useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  createProperty,
  deleteProperty,
  getProperties,
  updateProperty,
} from "../../services/coworkingPropertyService";
import { getCoworkingUsers } from "../../services/permissionService";
import { usePermissions } from "../../context/usePermissions";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { toErrorMessage } from "../../utils/errorMessage";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

const DEFAULT_FORM = {
  name: "",
  status: "ACTIVE",
  managerId: "",
  address: { line1: "", city: "", state: "", pincode: "" },
  contact: { name: "", phone: "", email: "" },
  description: "",
};

const Properties = () => {
  const { can } = usePermissions();
  const canCreate = can("properties.create");
  const canUpdate = can("properties.update");
  const canDelete = can("properties.delete");

  const [properties, setProperties] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProperties({
        page,
        limit: 10,
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
      });
      setProperties(data.properties);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load properties"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canCreate && !canUpdate) return;
    getCoworkingUsers()
      .then((data) => setUsers(data.users))
      .catch(() => setUsers([]));
  }, [canCreate, canUpdate]);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  };

  const openEditModal = (property) => {
    setEditingId(property._id);
    setFormData({
      name: property.name || "",
      status: property.status || "ACTIVE",
      managerId: property.managerId?._id || "",
      address: { ...DEFAULT_FORM.address, ...(property.address || {}) },
      contact: { ...DEFAULT_FORM.contact, ...(property.contact || {}) },
      description: property.description || "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const payload = {
        ...formData,
        managerId: formData.managerId || null,
      };
      if (editingId) {
        await updateProperty(editingId, payload);
        setToast({ type: "success", message: "Property updated" });
      } else {
        await createProperty(payload);
        setToast({ type: "success", message: "Property created" });
      }
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to save property") });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProperty(deleteTarget._id);
      setToast({ type: "success", message: "Property deleted" });
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      setToast({ type: "error", message: toErrorMessage(deleteError, "Failed to delete property") });
    } finally {
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load properties" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Properties"
          description="Coworking properties owned or leased by the organization."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal}>
                New Property
              </Button>
            ) : null
          }
          filters={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search properties..." className="max-w-xs" />
              <FilterBar
                filters={[{ name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS }]}
              />
            </>
          }
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && properties.length === 0} emptyTitle="No properties yet">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Property</th>
                <th className="px-4 py-2.5">Manager</th>
                <th className="px-4 py-2.5">City</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => (
                <tr key={property._id} className="border-b border-slate-50 last:border-0 dark:border-slate-900">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Building2 aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{property.name}</p>
                        <p className="text-xs text-slate-400">{property.propertyCode}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {property.managerId?.name || "Unassigned"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{property.address?.city || "-"}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={property.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {canUpdate ? (
                        <IconButton icon={Pencil} label="Edit" size="sm" onClick={() => openEditModal(property)} />
                      ) : null}
                      {canDelete ? (
                        <IconButton
                          icon={Trash2}
                          label="Delete"
                          size="sm"
                          className="hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => setDeleteTarget(property)}
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
        title={editingId ? "Edit Property" : "New Property"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.name.trim()}>
              {saving ? "Saving..." : "Save Property"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Name *</span>
            <Input value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Status</span>
            <Select value={formData.status} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Manager</span>
            <Select value={formData.managerId} onChange={(e) => setFormData((f) => ({ ...f, managerId: e.target.value }))}>
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
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
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">State</span>
            <Input
              value={formData.address.state}
              onChange={(e) => setFormData((f) => ({ ...f, address: { ...f.address, state: e.target.value } }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Pincode</span>
            <Input
              value={formData.address.pincode}
              onChange={(e) => setFormData((f) => ({ ...f, address: { ...f.address, pincode: e.target.value } }))}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Contact name</span>
            <Input
              value={formData.contact.name}
              onChange={(e) => setFormData((f) => ({ ...f, contact: { ...f.contact, name: e.target.value } }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Contact phone</span>
            <Input
              value={formData.contact.phone}
              onChange={(e) => setFormData((f) => ({ ...f, contact: { ...f.contact, phone: e.target.value } }))}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Contact email</span>
            <Input
              type="email"
              value={formData.contact.email}
              onChange={(e) => setFormData((f) => ({ ...f, contact: { ...f.contact, email: e.target.value } }))}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Description</span>
            <textarea
              className="min-h-[72px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={formData.description}
              onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name || "property"}?`}
        description="This can't be undone. Properties with floors cannot be deleted."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Properties;
