import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Boxes, CheckCircle2, Pencil, Plus, Trash2, Wrench, XCircle } from "lucide-react";
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
import {
  createAsset,
  deleteAsset,
  getAssets,
  markAssetActive,
  markAssetLost,
  markAssetMaintenance,
  retireAsset,
  updateAsset,
} from "../../services/coworkingAssetService";
import { getProperties } from "../../services/coworkingPropertyService";
import { usePermissions } from "../../context/usePermissions";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { formatCurrency, formatDate } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "RETIRED", label: "Retired" },
  { value: "LOST", label: "Lost" },
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  { value: "FURNITURE", label: "Furniture" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "IT", label: "IT" },
  { value: "APPLIANCE", label: "Appliance" },
  { value: "ACCESS_CONTROL", label: "Access Control" },
  { value: "SUPPLIES", label: "Supplies" },
  { value: "OTHER", label: "Other" },
];

const ASSET_STATUSES = ["ACTIVE", "MAINTENANCE", "RETIRED", "LOST"];
const ASSET_CATEGORIES = ["FURNITURE", "EQUIPMENT", "IT", "APPLIANCE", "ACCESS_CONTROL", "SUPPLIES", "OTHER"];

const DEFAULT_FORM = {
  propertyId: "",
  name: "",
  category: "FURNITURE",
  status: "ACTIVE",
  quantity: "1",
  locationLabel: "",
  assignedToName: "",
  vendor: "",
  purchaseDate: "",
  purchaseValue: "",
  warrantyExpiry: "",
  lastServiceDate: "",
  nextServiceDate: "",
  serialNumber: "",
  notes: "",
};

const toDateInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const toForm = (asset) => ({
  propertyId: asset?.propertyId?._id || asset?.propertyId || "",
  name: asset?.name || "",
  category: asset?.category || "FURNITURE",
  status: asset?.status || "ACTIVE",
  quantity: asset?.quantity ? String(asset.quantity) : "1",
  locationLabel: asset?.locationLabel || "",
  assignedToName: asset?.assignedToName || "",
  vendor: asset?.vendor || "",
  purchaseDate: toDateInput(asset?.purchaseDate),
  purchaseValue: asset?.purchaseValue ? String(asset.purchaseValue) : "",
  warrantyExpiry: toDateInput(asset?.warrantyExpiry),
  lastServiceDate: toDateInput(asset?.lastServiceDate),
  nextServiceDate: toDateInput(asset?.nextServiceDate),
  serialNumber: asset?.serialNumber || "",
  notes: asset?.notes || "",
});

const toPayload = (formData) => ({
  propertyId: formData.propertyId,
  name: formData.name.trim(),
  category: formData.category,
  status: formData.status,
  quantity: Number(formData.quantity),
  locationLabel: formData.locationLabel,
  assignedToName: formData.assignedToName,
  vendor: formData.vendor,
  purchaseDate: formData.purchaseDate || null,
  purchaseValue: Number(formData.purchaseValue) || 0,
  warrantyExpiry: formData.warrantyExpiry || null,
  lastServiceDate: formData.lastServiceDate || null,
  nextServiceDate: formData.nextServiceDate || null,
  serialNumber: formData.serialNumber,
  notes: formData.notes,
});

const Assets = () => {
  const { can } = usePermissions();
  const canCreate = can("assets.create");
  const canUpdate = can("assets.update");
  const canDelete = can("assets.delete");
  const canRetire = can("assets.retire");

  const [assets, setAssets] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [properties, setProperties] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAssets({
        page,
        limit: 15,
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
        category: category === "all" ? undefined : category,
      });
      setAssets(data.assets);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load assets"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status, category]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getProperties({ limit: 200 })
      .then((data) => setProperties(data.properties))
      .catch(() => setProperties([]));
  }, []);

  const openCreateModal = () => {
    setEditingAsset(null);
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  };

  const openEditModal = (asset) => {
    setEditingAsset(asset);
    setFormData(toForm(asset));
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const payload = toPayload(formData);
      if (editingAsset) {
        await updateAsset(editingAsset._id, payload);
        setToast({ type: "success", message: "Asset updated" });
      } else {
        await createAsset(payload);
        setToast({ type: "success", message: "Asset created" });
      }
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to save asset") });
    } finally {
      setSaving(false);
    }
  };

  const runAssetAction = async (asset, action, successMessage) => {
    setBusyId(asset._id);
    setToast(null);
    try {
      await action(asset._id);
      setToast({ type: "success", message: successMessage });
      await load();
    } catch (actionError) {
      setToast({ type: "error", message: toErrorMessage(actionError, "Asset action failed") });
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget._id);
    setToast(null);
    try {
      await deleteAsset(deleteTarget._id);
      setToast({ type: "success", message: "Asset deleted" });
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      setToast({ type: "error", message: toErrorMessage(deleteError, "Failed to delete asset") });
    } finally {
      setBusyId("");
    }
  };

  const canSubmit = formData.propertyId && formData.name.trim() && Number(formData.quantity) > 0;

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load assets" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Assets & Inventory"
          description="Furniture, equipment and consumable inventory across properties."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal} disabled={properties.length === 0}>
                New Asset
              </Button>
            ) : null
          }
          filters={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search assets..." className="max-w-xs" />
              <FilterBar
                filters={[
                  { name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS },
                  { name: "category", label: "Category", value: category, onChange: setCategory, options: CATEGORY_OPTIONS },
                ]}
              />
            </>
          }
        />

        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && assets.length === 0} emptyTitle="No assets yet">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Asset</th>
                <th className="px-4 py-2.5">Property / Location</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Qty</th>
                <th className="px-4 py-2.5">Value</th>
                <th className="px-4 py-2.5">Service</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr
                  key={asset._id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Boxes aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{asset.name}</p>
                        <p className="text-xs text-slate-400">
                          {asset.assetCode}
                          {asset.serialNumber ? ` · ${asset.serialNumber}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {asset.propertyId?.name || "-"}
                    {asset.locationLabel ? <span className="block text-xs text-slate-400">{asset.locationLabel}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{asset.category.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{asset.quantity}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {asset.purchaseValue ? formatCurrency(asset.purchaseValue) : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {formatDate(asset.nextServiceDate)}
                    {asset.warrantyExpiry ? <span className="block text-xs text-slate-400">Warranty {formatDate(asset.warrantyExpiry)}</span> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={asset.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {canUpdate && asset.status !== "MAINTENANCE" ? (
                        <IconButton
                          icon={Wrench}
                          label="Mark maintenance"
                          size="sm"
                          disabled={busyId === asset._id}
                          onClick={() => runAssetAction(asset, markAssetMaintenance, "Asset marked for maintenance")}
                        />
                      ) : null}
                      {canUpdate && asset.status !== "ACTIVE" ? (
                        <IconButton
                          icon={CheckCircle2}
                          label="Mark active"
                          size="sm"
                          disabled={busyId === asset._id}
                          onClick={() => runAssetAction(asset, markAssetActive, "Asset marked active")}
                        />
                      ) : null}
                      {canRetire && !["RETIRED", "LOST"].includes(asset.status) ? (
                        <IconButton
                          icon={XCircle}
                          label="Retire"
                          size="sm"
                          disabled={busyId === asset._id}
                          onClick={() => runAssetAction(asset, retireAsset, "Asset retired")}
                        />
                      ) : null}
                      {canRetire && asset.status !== "LOST" ? (
                        <IconButton
                          icon={AlertTriangle}
                          label="Mark lost"
                          size="sm"
                          disabled={busyId === asset._id}
                          onClick={() => runAssetAction(asset, markAssetLost, "Asset marked lost")}
                        />
                      ) : null}
                      {canUpdate ? (
                        <IconButton
                          icon={Pencil}
                          label="Edit"
                          size="sm"
                          disabled={busyId === asset._id}
                          onClick={() => openEditModal(asset)}
                        />
                      ) : null}
                      {canDelete ? (
                        <IconButton
                          icon={Trash2}
                          label="Delete"
                          size="sm"
                          disabled={busyId === asset._id}
                          className="hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => setDeleteTarget(asset)}
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
        title={editingAsset ? "Edit Asset" : "New Asset"}
        description="Track asset location, value, warranty and maintenance dates."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSubmit}>
              {saving ? "Saving..." : editingAsset ? "Save Changes" : "Create Asset"}
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
            <span className="text-xs font-semibold text-slate-500">Status</span>
            <Select value={formData.status} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))}>
              {ASSET_STATUSES.map((assetStatus) => (
                <option key={assetStatus} value={assetStatus}>
                  {assetStatus.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Asset name *</span>
            <Input value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Category</span>
            <Select value={formData.category} onChange={(e) => setFormData((f) => ({ ...f, category: e.target.value }))}>
              {ASSET_CATEGORIES.map((assetCategory) => (
                <option key={assetCategory} value={assetCategory}>
                  {assetCategory.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Quantity *</span>
            <Input type="number" min={1} value={formData.quantity} onChange={(e) => setFormData((f) => ({ ...f, quantity: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Location</span>
            <Input value={formData.locationLabel} onChange={(e) => setFormData((f) => ({ ...f, locationLabel: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Assigned to</span>
            <Input value={formData.assignedToName} onChange={(e) => setFormData((f) => ({ ...f, assignedToName: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Vendor</span>
            <Input value={formData.vendor} onChange={(e) => setFormData((f) => ({ ...f, vendor: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Serial number</span>
            <Input value={formData.serialNumber} onChange={(e) => setFormData((f) => ({ ...f, serialNumber: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Purchase date</span>
            <Input type="date" value={formData.purchaseDate} onChange={(e) => setFormData((f) => ({ ...f, purchaseDate: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Purchase value</span>
            <Input
              type="number"
              min={0}
              value={formData.purchaseValue}
              onChange={(e) => setFormData((f) => ({ ...f, purchaseValue: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Warranty expiry</span>
            <Input type="date" value={formData.warrantyExpiry} onChange={(e) => setFormData((f) => ({ ...f, warrantyExpiry: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Last service</span>
            <Input type="date" value={formData.lastServiceDate} onChange={(e) => setFormData((f) => ({ ...f, lastServiceDate: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Next service</span>
            <Input type="date" value={formData.nextServiceDate} onChange={(e) => setFormData((f) => ({ ...f, nextServiceDate: e.target.value }))} />
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
        title={`Delete ${deleteTarget?.assetCode || "asset"}?`}
        description="This removes the asset record from the register."
        confirmLabel="Delete"
        loading={busyId === deleteTarget?._id}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Assets;
