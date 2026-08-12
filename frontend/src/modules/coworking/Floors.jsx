import { useCallback, useEffect, useState } from "react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  IconButton,
  Input,
  Modal,
  Pagination,
  Select,
} from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, FilterBar, PageToolbar } from "../../components/crm";
import { createFloor, deleteFloor, getFloors, updateFloor } from "../../services/coworkingFloorService";
import { getProperties } from "../../services/coworkingPropertyService";
import { usePermissions } from "../../context/usePermissions";
import { toErrorMessage } from "../../utils/errorMessage";

const DEFAULT_FORM = { propertyId: "", floorNumber: "", name: "", status: "ACTIVE" };

const Floors = () => {
  const { can } = usePermissions();
  // No dedicated floors.* permission exists yet (see permission.constants.js)
  // — coworking role membership alone gates this page, matching the API.
  const canManageUsers = can("properties.view");

  const [floors, setFloors] = useState([]);
  const [properties, setProperties] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      const data = await getFloors({
        page,
        limit: 15,
        propertyId: propertyFilter === "all" ? undefined : propertyFilter,
      });
      setFloors(data.floors);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load floors"));
    } finally {
      setLoading(false);
    }
  }, [page, propertyFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getProperties({ limit: 200 })
      .then((data) => setProperties(data.properties))
      .catch(() => setProperties([]));
  }, []);

  const propertyOptions = [
    { value: "all", label: "All properties" },
    ...properties.map((property) => ({ value: property._id, label: property.name })),
  ];

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ ...DEFAULT_FORM, propertyId: propertyFilter !== "all" ? propertyFilter : "" });
    setModalOpen(true);
  };

  const openEditModal = (floor) => {
    setEditingId(floor._id);
    setFormData({
      propertyId: floor.propertyId?._id || floor.propertyId,
      floorNumber: String(floor.floorNumber),
      name: floor.name || "",
      status: floor.status || "ACTIVE",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const payload = { ...formData, floorNumber: Number(formData.floorNumber) };
      if (editingId) {
        await updateFloor(editingId, payload);
        setToast({ type: "success", message: "Floor updated" });
      } else {
        await createFloor(payload);
        setToast({ type: "success", message: "Floor created" });
      }
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to save floor") });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFloor(deleteTarget._id);
      setToast({ type: "success", message: "Floor deleted" });
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      setToast({ type: "error", message: toErrorMessage(deleteError, "Failed to delete floor") });
    } finally {
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load floors" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Floors"
          description="Floor-level layout, capacity, and occupancy within each property."
          actions={
            canManageUsers ? (
              <Button leftIcon={Plus} onClick={openCreateModal} disabled={properties.length === 0}>
                New Floor
              </Button>
            ) : null
          }
          filters={
            <FilterBar
              filters={[{ name: "property", label: "Property", value: propertyFilter, onChange: setPropertyFilter, options: propertyOptions }]}
            />
          }
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}
        {properties.length === 0 && !loading ? (
          <Badge variant="amber">Create a property first before adding floors.</Badge>
        ) : null}

        <DataTableShell loading={loading} empty={!loading && floors.length === 0} emptyTitle="No floors yet">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Floor</th>
                <th className="px-4 py-2.5">Property</th>
                <th className="px-4 py-2.5">Cabins</th>
                <th className="px-4 py-2.5">Seats (occupied / total)</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {floors.map((floor) => (
                <tr key={floor._id} className="border-b border-slate-50 last:border-0 dark:border-slate-900">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Layers aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {floor.name || `Floor ${floor.floorNumber}`}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{floor.propertyId?.name || "-"}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{floor.statistics?.cabinCount ?? 0}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {floor.statistics?.occupiedSeatCount ?? 0} / {floor.statistics?.seatCount ?? 0}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <IconButton icon={Pencil} label="Edit" size="sm" onClick={() => openEditModal(floor)} />
                      <IconButton
                        icon={Trash2}
                        label="Delete"
                        size="sm"
                        className="hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => setDeleteTarget(floor)}
                      />
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
        title={editingId ? "Edit Floor" : "New Floor"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.propertyId || formData.floorNumber === ""}>
              {saving ? "Saving..." : "Save Floor"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3">
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
            <span className="text-xs font-semibold text-slate-500">Floor number *</span>
            <Input
              type="number"
              value={formData.floorNumber}
              onChange={(e) => setFormData((f) => ({ ...f, floorNumber: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Name</span>
            <Input value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ground Floor" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Status</span>
            <Select value={formData.status} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name || `Floor ${deleteTarget?.floorNumber}`}?`}
        description="This can't be undone. Floors with cabins cannot be deleted."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Floors;
