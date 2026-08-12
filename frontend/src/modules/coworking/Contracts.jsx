import { useCallback, useEffect, useState } from "react";
import { FileSignature, Plus } from "lucide-react";
import { Button, ErrorState, Input, Modal, Pagination, Select } from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, FilterBar, PageToolbar, StatusBadge } from "../../components/crm";
import { createContract, getContracts } from "../../services/coworkingContractService";
import { getClients } from "../../services/coworkingClientService";
import { getProperties } from "../../services/coworkingPropertyService";
import { getFloors } from "../../services/coworkingFloorService";
import { getCabinById, getCabins } from "../../services/coworkingCabinService";
import { usePermissions } from "../../context/usePermissions";
import { formatCurrency, formatDate } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";
import { CONTRACT_STATUSES, CONTRACT_TYPES } from "../../constants/coworkingBilling";
import ContractDetailDrawer from "./components/ContractDetailDrawer";

const STATUS_OPTIONS = [{ value: "all", label: "All statuses" }, ...CONTRACT_STATUSES.map((s) => ({ value: s, label: s }))];

const DEFAULT_FORM = {
  clientId: "",
  propertyId: "",
  floorId: "",
  cabinId: "",
  contractType: "SEAT",
  seatCode: "",
  startDate: "",
  endDate: "",
  rent: "",
  deposit: "",
  lockInPeriodMonths: "0",
  noticePeriodDays: "30",
  notes: "",
};

const Contracts = () => {
  const { can } = usePermissions();
  const canCreate = can("contracts.create");

  const [contracts, setContracts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedContract, setSelectedContract] = useState(null);

  const [clients, setClients] = useState([]);
  const [properties, setProperties] = useState([]);
  const [floors, setFloors] = useState([]);
  const [cabins, setCabins] = useState([]);
  const [cabinSeats, setCabinSeats] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getContracts({ page, limit: 15, status: status === "all" ? undefined : status });
      setContracts(data.contracts);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load contracts"));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getProperties({ limit: 200 }).then((data) => setProperties(data.properties)).catch(() => setProperties([]));
    getClients({ limit: 200 }).then((data) => setClients(data.clients)).catch(() => setClients([]));
  }, []);

  useEffect(() => {
    if (!formData.propertyId) {
      setFloors([]);
      return;
    }
    getFloors({ propertyId: formData.propertyId, limit: 200 }).then((data) => setFloors(data.floors)).catch(() => setFloors([]));
  }, [formData.propertyId]);

  useEffect(() => {
    if (!formData.propertyId) {
      setCabins([]);
      return;
    }
    getCabins({ propertyId: formData.propertyId, floorId: formData.floorId || undefined, limit: 200 })
      .then((data) => setCabins(data.cabins))
      .catch(() => setCabins([]));
  }, [formData.propertyId, formData.floorId]);

  useEffect(() => {
    if (!formData.cabinId || formData.contractType !== "SEAT") {
      setCabinSeats([]);
      return;
    }
    getCabinById(formData.cabinId).then((cabin) => setCabinSeats(cabin?.seats || [])).catch(() => setCabinSeats([]));
  }, [formData.cabinId, formData.contractType]);

  const openCreateModal = () => {
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      await createContract({
        ...formData,
        rent: Number(formData.rent) || 0,
        deposit: Number(formData.deposit) || 0,
        lockInPeriodMonths: Number(formData.lockInPeriodMonths) || 0,
        noticePeriodDays: Number(formData.noticePeriodDays) || 0,
      });
      setToast({ type: "success", message: "Contract created as DRAFT — activate it to occupy the seat/cabin" });
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to create contract") });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load contracts" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  const canSubmit =
    formData.clientId && formData.cabinId && formData.startDate && formData.endDate && formData.rent &&
    (formData.contractType === "CABIN" || formData.seatCode);

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Contracts"
          description="Client lease agreements — creation, lifecycle, renewal and termination."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal}>
                New Contract
              </Button>
            ) : null
          }
          filters={
            <FilterBar filters={[{ name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS }]} />
          }
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && contracts.length === 0} emptyTitle="No contracts yet">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Contract</th>
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5">Resource</th>
                <th className="px-4 py-2.5">Rent</th>
                <th className="px-4 py-2.5">Dates</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr
                  key={contract._id}
                  onClick={() => setSelectedContract(contract)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileSignature aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{contract.contractCode}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{contract.clientId?.companyName || "-"}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {contract.cabinId?.cabinCode}
                    {contract.seatCode ? ` · ${contract.seatCode}` : " (whole cabin)"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatCurrency(contract.rent)}/mo</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {formatDate(contract.startDate)} → {formatDate(contract.endDate)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={contract.status} />
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
        title="New Contract"
        description="Contracts start as DRAFT — activating one occupies the seat/cabin via the same rules as bookings."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSubmit}>
              {saving ? "Creating..." : "Create Contract"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Client *</span>
            <Select value={formData.clientId} onChange={(e) => setFormData((f) => ({ ...f, clientId: e.target.value }))}>
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client._id} value={client._id}>
                  {client.companyName}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Property *</span>
            <Select
              value={formData.propertyId}
              onChange={(e) => setFormData((f) => ({ ...f, propertyId: e.target.value, floorId: "", cabinId: "", seatCode: "" }))}
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
            <span className="text-xs font-semibold text-slate-500">Floor</span>
            <Select value={formData.floorId} onChange={(e) => setFormData((f) => ({ ...f, floorId: e.target.value, cabinId: "", seatCode: "" }))} disabled={!formData.propertyId}>
              <option value="">Any floor</option>
              {floors.map((floor) => (
                <option key={floor._id} value={floor._id}>
                  {floor.name || `Floor ${floor.floorNumber}`}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Contract type</span>
            <Select value={formData.contractType} onChange={(e) => setFormData((f) => ({ ...f, contractType: e.target.value, seatCode: "" }))}>
              {CONTRACT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === "CABIN" ? "Whole Cabin" : "Single Seat"}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Cabin *</span>
            <Select value={formData.cabinId} onChange={(e) => setFormData((f) => ({ ...f, cabinId: e.target.value, seatCode: "" }))} disabled={!formData.propertyId}>
              <option value="">Select a cabin</option>
              {cabins.map((cabin) => (
                <option key={cabin._id} value={cabin._id}>
                  {cabin.cabinCode}
                </option>
              ))}
            </Select>
          </label>

          {formData.contractType === "SEAT" ? (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-semibold text-slate-500">Seat *</span>
              <Select value={formData.seatCode} onChange={(e) => setFormData((f) => ({ ...f, seatCode: e.target.value }))} disabled={!formData.cabinId}>
                <option value="">Select a seat</option>
                {cabinSeats.map((seat) => (
                  <option key={seat.seatCode} value={seat.seatCode}>
                    {seat.seatCode} ({seat.status})
                  </option>
                ))}
              </Select>
            </label>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Start date *</span>
            <Input type="date" value={formData.startDate} onChange={(e) => setFormData((f) => ({ ...f, startDate: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">End date *</span>
            <Input type="date" value={formData.endDate} onChange={(e) => setFormData((f) => ({ ...f, endDate: e.target.value }))} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Monthly rent *</span>
            <Input type="number" min={0} value={formData.rent} onChange={(e) => setFormData((f) => ({ ...f, rent: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Deposit</span>
            <Input type="number" min={0} value={formData.deposit} onChange={(e) => setFormData((f) => ({ ...f, deposit: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Lock-in (months)</span>
            <Input type="number" min={0} value={formData.lockInPeriodMonths} onChange={(e) => setFormData((f) => ({ ...f, lockInPeriodMonths: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Notice period (days)</span>
            <Input type="number" min={0} value={formData.noticePeriodDays} onChange={(e) => setFormData((f) => ({ ...f, noticePeriodDays: e.target.value }))} />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Notes</span>
            <textarea
              className="min-h-[60px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={formData.notes}
              onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <ContractDetailDrawer
        contract={selectedContract}
        onClose={() => setSelectedContract(null)}
        onChanged={(updated) => {
          setSelectedContract(updated);
          load();
        }}
      />
    </div>
  );
};

export default Contracts;
