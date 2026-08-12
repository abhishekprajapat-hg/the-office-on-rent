import { useCallback, useEffect, useState } from "react";
import { Armchair, Ban, CheckCircle2, UserMinus, UserPlus } from "lucide-react";
import { Button, ErrorState, Input, Modal, Pagination, SearchInput, Select } from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, FilterBar, PageToolbar, StatusBadge } from "../../components/crm";
import {
  assignSeat,
  blockSeat,
  getAllSeats,
  releaseSeat,
  unblockSeat,
} from "../../services/coworkingCabinService";
import { getClients } from "../../services/coworkingClientService";
import { usePermissions } from "../../context/usePermissions";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { toErrorMessage } from "../../utils/errorMessage";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "AVAILABLE", label: "Available" },
  { value: "RESERVED", label: "Reserved" },
  { value: "OCCUPIED", label: "Occupied" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "MAINTENANCE", label: "Maintenance" },
];

const Seats = () => {
  const { can } = usePermissions();
  const canAssign = can("seats.assign");
  const canRelease = can("seats.release");
  const canBlock = can("cabins.block");

  const [seats, setSeats] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [activeSeat, setActiveSeat] = useState(null);
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [assignLabel, setAssignLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canAssign) return;
    getClients({ limit: 200 })
      .then((data) => setClients(data.clients))
      .catch(() => setClients([]));
  }, [canAssign]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllSeats({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
      });
      setSeats(data.seats);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load seats"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (actionFn, successMessage) => {
    setBusy(true);
    try {
      await actionFn();
      setToast({ type: "success", message: successMessage });
      setActiveSeat(null);
      setAssignLabel("");
      setSelectedClientId("");
      await load();
    } catch (actionError) {
      setToast({ type: "error", message: toErrorMessage(actionError, "Action failed") });
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load seats" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Seats"
          description="Individual seat inventory and live occupancy state across every cabin."
          filters={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search seat code..." className="max-w-xs" />
              <FilterBar
                filters={[{ name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS }]}
              />
            </>
          }
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && seats.length === 0} emptyTitle="No seats found">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Seat</th>
                <th className="px-4 py-2.5">Cabin</th>
                <th className="px-4 py-2.5">Property / Floor</th>
                <th className="px-4 py-2.5">Assigned To</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {seats.map((seat) => (
                <tr
                  key={seat.seatCode}
                  onClick={() => setActiveSeat(seat)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Armchair aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{seat.seatCode}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{seat.cabinCode}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {seat.property?.name || "-"} · Floor {seat.floor?.floorNumber ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{seat.assignedTo?.label || "-"}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={seat.status} />
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

      <Modal open={Boolean(activeSeat)} onClose={() => setActiveSeat(null)} title={activeSeat?.seatCode || ""} size="sm">
        {activeSeat ? (
          <div className="space-y-3">
            <StatusBadge status={activeSeat.status} />
            {activeSeat.assignedTo?.label ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Assigned to <span className="font-semibold">{activeSeat.assignedTo.label}</span>
              </p>
            ) : null}

            {activeSeat.status === "AVAILABLE" && canAssign ? (
              <div className="space-y-2">
                <Select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
                  <option value="">Select a client...</option>
                  {clients.map((client) => (
                    <option key={client._id} value={client._id}>
                      {client.companyName}
                    </option>
                  ))}
                </Select>
                {!selectedClientId ? (
                  <Input
                    placeholder="Or type a walk-in occupant name"
                    value={assignLabel}
                    onChange={(e) => setAssignLabel(e.target.value)}
                  />
                ) : null}
                <Button
                  className="w-full"
                  leftIcon={UserPlus}
                  disabled={busy || (!selectedClientId && !assignLabel.trim())}
                  onClick={() =>
                    runAction(
                      () =>
                        assignSeat(activeSeat.cabinId, activeSeat.seatCode, {
                          clientId: selectedClientId || undefined,
                          label: assignLabel,
                        }),
                      "Seat assigned",
                    )
                  }
                >
                  Assign Seat
                </Button>
              </div>
            ) : null}

            {(activeSeat.status === "OCCUPIED" || activeSeat.status === "RESERVED") && canRelease ? (
              <Button
                className="w-full"
                variant="secondary"
                leftIcon={UserMinus}
                disabled={busy}
                onClick={() => runAction(() => releaseSeat(activeSeat.cabinId, activeSeat.seatCode), "Seat released")}
              >
                Release Seat
              </Button>
            ) : null}

            {activeSeat.status === "AVAILABLE" && canBlock ? (
              <Button
                className="w-full"
                variant="danger"
                leftIcon={Ban}
                disabled={busy}
                onClick={() => runAction(() => blockSeat(activeSeat.cabinId, activeSeat.seatCode), "Seat blocked")}
              >
                Block Seat
              </Button>
            ) : null}

            {activeSeat.status === "BLOCKED" && canBlock ? (
              <Button
                className="w-full"
                variant="success"
                leftIcon={CheckCircle2}
                disabled={busy}
                onClick={() => runAction(() => unblockSeat(activeSeat.cabinId, activeSeat.seatCode), "Seat unblocked")}
              >
                Unblock Seat
              </Button>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default Seats;
