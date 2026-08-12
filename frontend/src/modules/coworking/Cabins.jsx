import { useCallback, useEffect, useState } from "react";
import { DoorOpen, Plus } from "lucide-react";
import { Badge, Button, ErrorState, Input, Modal, Pagination, SearchInput, Select } from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, FilterBar, PageToolbar, StatusBadge } from "../../components/crm";
import { createCabin, getCabinById, getCabins } from "../../services/coworkingCabinService";
import { getProperties } from "../../services/coworkingPropertyService";
import { getFloors } from "../../services/coworkingFloorService";
import { usePermissions } from "../../context/usePermissions";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { formatCurrency } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";
import CabinDetailDrawer from "./components/CabinDetailDrawer";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "AVAILABLE", label: "Available" },
  { value: "PARTIALLY_OCCUPIED", label: "Partially Occupied" },
  { value: "FULLY_OCCUPIED", label: "Fully Occupied" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "MAINTENANCE", label: "Maintenance" },
];

const CAPACITY_OPTIONS = [
  { value: "all", label: "Any capacity" },
  { value: "4", label: "4 seats" },
  { value: "6", label: "6 seats" },
  { value: "8", label: "8 seats" },
  { value: "10", label: "10 seats" },
  { value: "12", label: "12 seats" },
];

const CABIN_TYPE_OPTIONS = ["PRIVATE", "SHARED", "MANAGER_CABIN", "MEETING_POD", "OTHER"];
const CAPACITY_PRESETS = [4, 6, 8, 10, 12, "CUSTOM"];

const DEFAULT_FORM = {
  propertyId: "",
  floorId: "",
  name: "",
  cabinType: "PRIVATE",
  capacityPreset: 4,
  customCapacity: "",
  monthlyRent: "",
  securityDeposit: "",
  description: "",
};

const Cabins = () => {
  const { can } = usePermissions();
  const canCreate = can("cabins.create");

  const [cabins, setCabins] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("all");
  const [capacity, setCapacity] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [properties, setProperties] = useState([]);
  const [floors, setFloors] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedCabin, setSelectedCabin] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCabins({
        page,
        limit: 12,
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
        capacity: capacity === "all" ? undefined : capacity,
      });
      setCabins(data.cabins);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load cabins"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status, capacity]);

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
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      await createCabin({
        propertyId: formData.propertyId,
        floorId: formData.floorId,
        name: formData.name,
        cabinType: formData.cabinType,
        capacityPreset: formData.capacityPreset,
        customCapacity: formData.capacityPreset === "CUSTOM" ? Number(formData.customCapacity) : undefined,
        monthlyRent: Number(formData.monthlyRent) || 0,
        securityDeposit: Number(formData.securityDeposit) || 0,
        description: formData.description,
      });
      setToast({ type: "success", message: "Cabin created with seats generated automatically" });
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to create cabin") });
    } finally {
      setSaving(false);
    }
  };

  const openCabinDetail = async (cabin) => {
    try {
      const fullCabin = await getCabinById(cabin._id);
      setSelectedCabin(fullCabin);
    } catch (fetchError) {
      setToast({ type: "error", message: toErrorMessage(fetchError, "Failed to load cabin details") });
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load cabins" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Cabins"
          description="Cabins of 4, 6, 8, 10, 12 or custom seat capacity across floors."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal} disabled={properties.length === 0}>
                New Cabin
              </Button>
            ) : null
          }
          filters={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search cabins..." className="max-w-xs" />
              <FilterBar
                filters={[
                  { name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS },
                  { name: "capacity", label: "Capacity", value: capacity, onChange: setCapacity, options: CAPACITY_OPTIONS },
                ]}
              />
            </>
          }
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}
        {properties.length === 0 && !loading ? (
          <Badge variant="amber">Create a property and floor first before adding cabins.</Badge>
        ) : null}

        <DataTableShell loading={loading} empty={!loading && cabins.length === 0} emptyTitle="No cabins yet">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Cabin</th>
                <th className="px-4 py-2.5">Property / Floor</th>
                <th className="px-4 py-2.5">Capacity</th>
                <th className="px-4 py-2.5">Rent</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {cabins.map((cabin) => (
                <tr
                  key={cabin._id}
                  onClick={() => openCabinDetail(cabin)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <DoorOpen aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{cabin.cabinCode}</p>
                        {cabin.name ? <p className="text-xs text-slate-400">{cabin.name}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {cabin.propertyId?.name || "-"} · Floor {cabin.floorId?.floorNumber ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{cabin.capacity} seats</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {cabin.monthlyRent ? formatCurrency(cabin.monthlyRent) : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={cabin.status} />
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
        title="New Cabin"
        description="Seats are generated automatically based on the chosen capacity."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !formData.propertyId ||
                !formData.floorId ||
                (formData.capacityPreset === "CUSTOM" && !formData.customCapacity)
              }
            >
              {saving ? "Creating..." : "Create Cabin"}
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
            <span className="text-xs font-semibold text-slate-500">Name</span>
            <Input value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Cabin type</span>
            <Select value={formData.cabinType} onChange={(e) => setFormData((f) => ({ ...f, cabinType: e.target.value }))}>
              {CABIN_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Capacity *</span>
            <Select
              value={String(formData.capacityPreset)}
              onChange={(e) => {
                const value = e.target.value === "CUSTOM" ? "CUSTOM" : Number(e.target.value);
                setFormData((f) => ({ ...f, capacityPreset: value }));
              }}
            >
              {CAPACITY_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset === "CUSTOM" ? "Custom" : `${preset} seats`}
                </option>
              ))}
            </Select>
          </label>
          {formData.capacityPreset === "CUSTOM" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">Custom capacity *</span>
              <Input
                type="number"
                min={1}
                value={formData.customCapacity}
                onChange={(e) => setFormData((f) => ({ ...f, customCapacity: e.target.value }))}
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Monthly rent</span>
            <Input
              type="number"
              min={0}
              value={formData.monthlyRent}
              onChange={(e) => setFormData((f) => ({ ...f, monthlyRent: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Security deposit</span>
            <Input
              type="number"
              min={0}
              value={formData.securityDeposit}
              onChange={(e) => setFormData((f) => ({ ...f, securityDeposit: e.target.value }))}
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

      <CabinDetailDrawer
        cabin={selectedCabin}
        onClose={() => setSelectedCabin(null)}
        onChanged={(updatedCabin) => {
          setSelectedCabin(updatedCabin);
          load();
        }}
      />
    </div>
  );
};

export default Cabins;
