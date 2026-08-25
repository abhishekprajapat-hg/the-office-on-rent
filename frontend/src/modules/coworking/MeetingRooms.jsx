import { useCallback, useEffect, useState } from "react";
import { Edit3, Plus, Presentation, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, ErrorState, Input, Modal, Pagination, SearchInput, Select } from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, FilterBar, PageToolbar, StatusBadge } from "../../components/crm";
import { getFloors } from "../../services/coworkingFloorService";
import {
  createMeetingRoom,
  deleteMeetingRoom,
  getMeetingRooms,
  updateMeetingRoom,
} from "../../services/coworkingMeetingRoomService";
import { getProperties } from "../../services/coworkingPropertyService";
import { usePermissions } from "../../context/usePermissions";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { formatCurrency } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "AVAILABLE", label: "Available" },
  { value: "BOOKED", label: "Booked" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "INACTIVE", label: "Inactive" },
];

const ROOM_STATUSES = ["AVAILABLE", "BOOKED", "MAINTENANCE", "INACTIVE"];

const DEFAULT_FORM = {
  propertyId: "",
  floorId: "",
  name: "",
  capacity: "",
  hourlyRate: "",
  status: "AVAILABLE",
  amenitiesText: "",
  description: "",
};

const toForm = (room) => ({
  propertyId: room?.propertyId?._id || room?.propertyId || "",
  floorId: room?.floorId?._id || room?.floorId || "",
  name: room?.name || "",
  capacity: room?.capacity ? String(room.capacity) : "",
  hourlyRate: room?.hourlyRate ? String(room.hourlyRate) : "",
  status: room?.status || "AVAILABLE",
  amenitiesText: Array.isArray(room?.amenities) ? room.amenities.join(", ") : "",
  description: room?.description || "",
});

const toPayload = (formData) => ({
  propertyId: formData.propertyId,
  floorId: formData.floorId,
  name: formData.name.trim(),
  capacity: Number(formData.capacity),
  hourlyRate: Number(formData.hourlyRate) || 0,
  status: formData.status,
  amenities: formData.amenitiesText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  description: formData.description,
});

const MeetingRooms = () => {
  const { can } = usePermissions();
  const canCreate = can("meeting_rooms.create");
  const canUpdate = can("meeting_rooms.update");
  const canDelete = can("meeting_rooms.delete");

  const [meetingRooms, setMeetingRooms] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [properties, setProperties] = useState([]);
  const [floors, setFloors] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMeetingRooms({
        page,
        limit: 15,
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
      });
      setMeetingRooms(data.meetingRooms);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load meeting rooms"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getProperties({ limit: 200 })
      .then((data) => setProperties(data.properties))
      .catch(() => setProperties([]));
  }, []);

  useEffect(() => {
    if (!formData.propertyId) {
      setFloors([]);
      return;
    }
    getFloors({ propertyId: formData.propertyId, limit: 200 })
      .then((data) => setFloors(data.floors))
      .catch(() => setFloors([]));
  }, [formData.propertyId]);

  const openCreateModal = () => {
    setEditingRoom(null);
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  };

  const openEditModal = (room) => {
    setEditingRoom(room);
    setFormData(toForm(room));
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const payload = toPayload(formData);
      if (editingRoom) {
        await updateMeetingRoom(editingRoom._id, payload);
        setToast({ type: "success", message: "Meeting room updated" });
      } else {
        await createMeetingRoom(payload);
        setToast({ type: "success", message: "Meeting room created" });
      }
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to save meeting room") });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setToast(null);
    try {
      await deleteMeetingRoom(deleteTarget._id);
      setToast({ type: "success", message: "Meeting room deleted" });
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      setToast({ type: "error", message: toErrorMessage(deleteError, "Failed to delete meeting room") });
    } finally {
      setDeleting(false);
    }
  };

  const canSubmit = formData.propertyId && formData.floorId && formData.name.trim() && Number(formData.capacity) > 0;

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load meeting rooms" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Meeting Rooms"
          description="Bookable meeting and conference rooms across properties."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal} disabled={properties.length === 0}>
                New Meeting Room
              </Button>
            ) : null
          }
          filters={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search meeting rooms..." className="max-w-xs" />
              <FilterBar
                filters={[
                  { name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS },
                ]}
              />
            </>
          }
        />

        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && meetingRooms.length === 0} emptyTitle="No meeting rooms yet">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Property / Floor</th>
                <th className="px-4 py-2.5">Capacity</th>
                <th className="px-4 py-2.5">Hourly rate</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {meetingRooms.map((room) => (
                <tr
                  key={room._id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Presentation aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{room.name}</p>
                        <p className="text-xs text-slate-400">{room.roomCode}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {room.propertyId?.name || "-"} · Floor {room.floorId?.floorNumber ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{room.capacity} people</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {room.hourlyRate ? formatCurrency(room.hourlyRate) : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={room.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      {canUpdate ? (
                        <Button size="sm" variant="secondary" leftIcon={Edit3} onClick={() => openEditModal(room)}>
                          Edit
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => setDeleteTarget(room)}>
                          Delete
                        </Button>
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
        title={editingRoom ? "Edit Meeting Room" : "New Meeting Room"}
        description="Set the room location, capacity, pricing and operating status."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSubmit}>
              {saving ? "Saving..." : editingRoom ? "Save Changes" : "Create Meeting Room"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Property *</span>
            <Select
              value={formData.propertyId}
              onChange={(e) => setFormData((f) => ({ ...f, propertyId: e.target.value, floorId: "" }))}
            >
              <option value="">Select a property</option>
              {properties.map((property) => (
                <option key={property._id} value={property._id}>
                  {property.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Floor *</span>
            <Select
              value={formData.floorId}
              onChange={(e) => setFormData((f) => ({ ...f, floorId: e.target.value }))}
              disabled={!formData.propertyId}
            >
              <option value="">Select a floor</option>
              {floors.map((floor) => (
                <option key={floor._id} value={floor._id}>
                  {floor.name || `Floor ${floor.floorNumber}`}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Room name *</span>
            <Input value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Status</span>
            <Select value={formData.status} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))}>
              {ROOM_STATUSES.map((roomStatus) => (
                <option key={roomStatus} value={roomStatus}>
                  {roomStatus.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Capacity *</span>
            <Input
              type="number"
              min={1}
              value={formData.capacity}
              onChange={(e) => setFormData((f) => ({ ...f, capacity: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Hourly rate</span>
            <Input
              type="number"
              min={0}
              value={formData.hourlyRate}
              onChange={(e) => setFormData((f) => ({ ...f, hourlyRate: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Amenities</span>
            <Input
              placeholder="Projector, Whiteboard, Video conference"
              value={formData.amenitiesText}
              onChange={(e) => setFormData((f) => ({ ...f, amenitiesText: e.target.value }))}
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
        title={`Delete ${deleteTarget?.name || "meeting room"}?`}
        description="This removes the meeting room from the coworking operations list."
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        tone="danger"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default MeetingRooms;
