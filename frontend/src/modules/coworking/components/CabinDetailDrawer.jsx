import { useEffect, useState } from "react";
import { Armchair, Ban, CheckCircle2, PauseCircle, UserMinus, UserPlus, Wrench } from "lucide-react";
import { Badge, Button, Input, Modal, Select } from "../../../components/ui";
import { DetailDrawer, StatusBadge } from "../../../components/crm";
import {
  assignSeat,
  blockCabin,
  blockSeat,
  clearCabinMaintenance,
  clearSeatMaintenance,
  releaseSeat,
  setCabinMaintenance,
  setSeatMaintenance,
  unblockCabin,
  unblockSeat,
} from "../../../services/coworkingCabinService";
import { getClients } from "../../../services/coworkingClientService";
import { usePermissions } from "../../../context/usePermissions";
import { formatCurrency } from "../../../utils/format";
import { toErrorMessage } from "../../../utils/errorMessage";

const SEAT_TONE = {
  AVAILABLE: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  RESERVED: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  OCCUPIED: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  BLOCKED: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
  MAINTENANCE: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
};

const CabinDetailDrawer = ({ cabin, onClose, onChanged }) => {
  const { can } = usePermissions();
  const canAssign = can("seats.assign");
  const canRelease = can("seats.release");
  const canBlockSeat = can("cabins.block");
  const canBlockCabin = can("cabins.block");
  const canUpdateCabin = can("cabins.update");

  const [activeSeat, setActiveSeat] = useState(null);
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [assignLabel, setAssignLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canAssign) return;
    getClients({ limit: 200 })
      .then((data) => setClients(data.clients))
      .catch(() => setClients([]));
  }, [canAssign]);

  if (!cabin) return null;

  const runAction = async (actionFn) => {
    setBusy(true);
    setError(null);
    try {
      const updatedCabin = await actionFn();
      onChanged(updatedCabin);
      setActiveSeat(null);
      setAssignLabel("");
      setSelectedClientId("");
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DetailDrawer
        open={Boolean(cabin)}
        onClose={onClose}
        title={cabin.name ? `${cabin.cabinCode} · ${cabin.name}` : cabin.cabinCode}
        description={`${cabin.propertyId?.name || ""} · Floor ${cabin.floorId?.floorNumber ?? ""}`}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={cabin.status} />
            <Badge variant="slate">{cabin.cabinType}</Badge>
            <Badge variant="blue">{cabin.capacity} seats</Badge>
            {cabin.monthlyRent ? <Badge variant="emerald">{formatCurrency(cabin.monthlyRent)}/mo</Badge> : null}
          </div>

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </p>
          ) : null}

          {canBlockCabin || canUpdateCabin ? (
            <div className="flex flex-wrap gap-2">
              {cabin.manualOverride === "NONE" ? (
                <>
                  {canBlockCabin ? (
                    <Button
                      size="sm"
                      variant="danger"
                      leftIcon={Ban}
                      disabled={busy}
                      onClick={() => runAction(() => blockCabin(cabin._id, "Blocked from cabin detail"))}
                    >
                      Block Cabin
                    </Button>
                  ) : null}
                  {canUpdateCabin ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={Wrench}
                      disabled={busy}
                      onClick={() => runAction(() => setCabinMaintenance(cabin._id))}
                    >
                      Set Maintenance
                    </Button>
                  ) : null}
                </>
              ) : (
                <Button
                  size="sm"
                  variant="success"
                  leftIcon={CheckCircle2}
                  disabled={busy}
                  onClick={() =>
                    runAction(() =>
                      cabin.manualOverride === "BLOCKED" ? unblockCabin(cabin._id) : clearCabinMaintenance(cabin._id),
                    )
                  }
                >
                  Clear {cabin.manualOverride === "BLOCKED" ? "Block" : "Maintenance"}
                </Button>
              )}
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-400">
              Seats ({cabin.seats.filter((s) => s.status === "AVAILABLE").length} available)
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {cabin.seats.map((seat) => (
                <button
                  key={seat.seatCode}
                  type="button"
                  onClick={() => setActiveSeat(seat)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-bold transition hover:-translate-y-0.5 ${SEAT_TONE[seat.status] || SEAT_TONE.AVAILABLE}`}
                >
                  <Armchair aria-hidden="true" size={16} />
                  <span>S{String(seat.seatNumber).padStart(2, "0")}</span>
                </button>
              ))}
            </div>
          </div>

          {cabin.description ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{cabin.description}</p>
          ) : null}
        </div>
      </DetailDrawer>

      <Modal
        open={Boolean(activeSeat)}
        onClose={() => setActiveSeat(null)}
        title={activeSeat ? `Seat ${activeSeat.seatCode}` : ""}
        size="sm"
      >
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
                    runAction(() =>
                      assignSeat(cabin._id, activeSeat.seatCode, { clientId: selectedClientId || undefined, label: assignLabel }),
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
                onClick={() => runAction(() => releaseSeat(cabin._id, activeSeat.seatCode))}
              >
                Release Seat
              </Button>
            ) : null}

            {activeSeat.status === "AVAILABLE" && canBlockSeat ? (
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={Ban}
                  disabled={busy}
                  onClick={() => runAction(() => blockSeat(cabin._id, activeSeat.seatCode))}
                >
                  Block
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={PauseCircle}
                  disabled={busy}
                  onClick={() => runAction(() => setSeatMaintenance(cabin._id, activeSeat.seatCode))}
                >
                  Maintenance
                </Button>
              </div>
            ) : null}

            {(activeSeat.status === "BLOCKED" || activeSeat.status === "MAINTENANCE") && canBlockSeat ? (
              <Button
                className="w-full"
                variant="success"
                leftIcon={CheckCircle2}
                disabled={busy}
                onClick={() =>
                  runAction(() =>
                    activeSeat.status === "BLOCKED"
                      ? unblockSeat(cabin._id, activeSeat.seatCode)
                      : clearSeatMaintenance(cabin._id, activeSeat.seatCode),
                  )
                }
              >
                Make Available
              </Button>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
};

export default CabinDetailDrawer;
