import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckSquare,
  Download,
  History,
  LayoutGrid,
  Map as MapIcon,
  Search,
  Square,
  Undo2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button, Input, Modal, Select } from "../../../components/ui";
import ToastNotice from "../../../components/ui/ToastNotice";
import ActivityLogDialog from "./components/ActivityLogDialog";
import CabinDetailPanel from "./components/CabinDetailPanel";
import FloorLayoutMap from "./components/FloorLayoutMap";
import FloorSummaryPanel from "./components/FloorSummaryPanel";
import HoldCabinDialog from "./components/HoldCabinDialog";
import OnboardClientDialog from "./components/OnboardClientDialog";
import SelectionBar from "./components/SelectionBar";
import Segmented from "./components/Segmented";
import TransferCabinDialog from "./components/TransferCabinDialog";
import WingSeatMap from "./components/WingSeatMap";
import { useBoard } from "./boardStore";
import { STATUS_META, STATUS_ORDER, WINGS } from "./floorPlanData";
import { SAMPLE_PROPERTY } from "./sampleFloor";

/*
 * Cabin Booking Board - the floor as a map of lettable cabins.
 *
 * Built around the three questions a coworking desk answers all day: what is
 * free right now, who is in the cabin someone is asking about, and can I put a
 * client into it today. So the board is one wide map, one narrow rail, and a
 * cart that turns a selection straight into an onboarding.
 *
 * Two views of the same 65 cabins. Wings is the default because vacancy is the
 * standing question and a list answers it faster than a drawing; Layout is the
 * real floor plate, for "where actually is C-13". The selection survives the
 * switch, so neither is a mode you have to commit to.
 *
 * Cabins let whole, so the unit throughout is the cabin: a cabin has a
 * capacity ("4 seater") and a status, never a count of filled seats.
 *
 * Every action runs through boardStore's reducer, which owns the floor, keeps
 * an undo stack and persists to localStorage. This screen holds only what is
 * genuinely view state - filters, selection, which dialog is open.
 *
 * The state is client-side: it is the shape a server would return, and each
 * reducer case is one endpoint, but nothing here talks to the API yet. See the
 * note at the top of boardStore.js.
 */

const SEAT_BANDS = [
  { id: "small", label: "Up to 4", test: (cabin) => cabin.seats <= 4 },
  { id: "medium", label: "5 to 6", test: (cabin) => cabin.seats >= 5 && cabin.seats <= 6 },
  { id: "large", label: "8+", test: (cabin) => cabin.seats >= 8 },
];

/** What each reducer action should say once it lands. */
const ACTION_MESSAGES = {
  RELEASE: (cabin) => `${cabin.label} released. ${cabin.client?.name} moved to its history.`,
  RENEW: (cabin) => `${cabin.label} renewed by 12 months.`,
  CONFIRM_HOLD: (cabin) => `${cabin.label} confirmed for ${cabin.client?.name}.`,
  DROP_HOLD: (cabin) => `Hold dropped on ${cabin.label}.`,
  RECORD_PAYMENT: (cabin) => `Payment recorded for ${cabin.label}.`,
  SET_UNAVAILABLE: (cabin) => `${cabin.label} taken off the market.`,
  RETURN_TO_INVENTORY: (cabin) => `${cabin.label} is back in inventory.`,
};

// CRLF: what spreadsheet apps expect at the end of a CSV row.
const CSV_NEWLINE = String.fromCharCode(13, 10);
const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const BookingBoard = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [board, dispatch] = useBoard();
  const [view, setView] = useState("layout");
  const [statusFilter, setStatusFilter] = useState("all");
  const [wingFilter, setWingFilter] = useState("");
  const [seatBand, setSeatBand] = useState("");
  const [search, setSearch] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [cart, setCart] = useState([]);
  const [onboarding, setOnboarding] = useState(null);
  /*
   * The open cabin lives in the URL, so the clients page can link straight to
   * one and a reload keeps you where you were.
   */
  const detailCode = params.get("cabin") || "";
  const setDetailCode = (code) => setParams(code ? { cabin: code } : {}, { replace: true });
  const [holdCode, setHoldCode] = useState("");
  const [transferCode, setTransferCode] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [toast, setToast] = useState(null);

  const { cabins, activity, undoStack } = board;

  /*
   * Filters narrow by dimming rather than by removing. On a floor plan a
   * missing cabin reads as a gap in the building, and you lose the ability to
   * see that the only free 6-seater is stranded at the far end of Wing C.
   */
  const passesNonStatus = (cabin) => {
    if (wingFilter && cabin.wing !== wingFilter) return false;
    if (seatBand && !SEAT_BANDS.find((band) => band.id === seatBand)?.test(cabin)) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${cabin.label} ${cabin.code} ${cabin.client?.name || ""} ${cabin.client?.contactPerson || ""}`
      .toLowerCase()
      .includes(query);
  };

  const matches = (cabin) => passesNonStatus(cabin) && (statusFilter === "all" || cabin.status === statusFilter);

  /*
   * Everything the wing / size / search filters leave standing. The rail reads
   * off this rather than the full floor, so narrowing to Wing B re-answers
   * "how full is it" for Wing B instead of quietly still describing all 65.
   */
  const scoped = cabins.filter(passesNonStatus);

  // Counts ignore the status filter, so each tab states what it holds.
  const counts = STATUS_ORDER.reduce(
    (tally, status) => ({ ...tally, [status]: scoped.filter((cabin) => cabin.status === status).length }),
    { all: scoped.length },
  );

  /*
   * Everything downstream is looked up by code, not held as an object. After an
   * action the cabin is a new object, and a held copy would keep showing the
   * cabin as it was before the release you just made.
   */
  const byCode = (code) => cabins.find((cabin) => cabin.code === code) || null;
  const detailCabin = byCode(detailCode);
  const holdCabin = byCode(holdCode);
  const transferCabin = byCode(transferCode);
  const cartCabins = cart.map(byCode).filter(Boolean);
  const vacantCount = cabins.filter((cabin) => cabin.status === "VACANT").length;

  // Leaving select mode drops the cart with it - a selection you can no longer
  // see is worse than no selection.
  const toggleSelectMode = () => {
    setSelectMode((value) => !value);
    if (selectMode) setCart([]);
  };

  const handleSelect = (cabin) => {
    if (selectMode && cabin.status === "VACANT") {
      setCart((current) =>
        current.includes(cabin.code) ? current.filter((code) => code !== cabin.code) : [...current, cabin.code],
      );
      return;
    }
    if (selectMode) {
      setToast({
        type: "info",
        message: `${cabin.label} is ${STATUS_META[cabin.status].label.toLowerCase()} and cannot be allotted. Opened its details instead.`,
      });
    }
    // Clicking a cabin opens it. There is no half-state where a cabin is
    // "picked" but you still have to press something to read it.
    setDetailCode(cabin.code);
  };

  /** Every board action goes through here, so each one lands the same way. */
  const runAction = (action, message) => {
    dispatch(action);
    if (message) setToast({ type: "success", message });
  };

  const confirmOnboarding = ({ clientName, client, cabins: booked, terms }) => {
    setOnboarding(null);
    setCart([]);
    setSelectMode(false);
    dispatch({
      type: "ONBOARD",
      cabinCodes: booked.map((cabin) => cabin.code),
      client: { ...client, name: clientName },
      terms,
    });
    setToast({
      type: "success",
      message: `${clientName} onboarded into ${booked.map((cabin) => cabin.label).join(", ")}.`,
    });
  };

  /*
   * The floor as a spreadsheet. Asked for constantly - for the owner, for a
   * broker, for a meeting - and without it the answer is a screenshot.
   */
  const exportCsv = () => {
    const header = ["Cabin", "Wing", "Capacity", "Status", "Client", "Monthly rent", "Agreement ends", "Dues"];
    const rows = cabins.map((cabin) => [
      cabin.label,
      cabin.wing,
      `${cabin.seats} seater`,
      STATUS_META[cabin.status].label,
      cabin.client?.name || "",
      cabin.contract?.monthlyRent ?? cabin.monthlyRent,
      cabin.contract ? new Date(cabin.contract.endDate).toISOString().slice(0, 10) : "",
      cabin.contract?.duesAmount || 0,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join(CSV_NEWLINE);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `floor-${SAMPLE_PROPERTY.floorLabel.replace(/\s+/g, "-").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ type: "success", message: `Exported ${cabins.length} cabins to CSV.` });
  };

  const mapProps = { cabins, selectedCode: detailCode, cart, matches, onSelect: handleSelect };

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-[1560px] px-4 py-5 sm:px-6">
        {/* Title, then the two controls that scope the whole screen, then the
            one action the screen exists for. */}
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-slate-950 dark:text-slate-50">
              {view === "layout" ? "Floor View" : "Booking Board"}
            </h1>
            <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
              {SAMPLE_PROPERTY.name} · {SAMPLE_PROPERTY.address}
            </p>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <div className="w-[152px] shrink-0">
              <Select aria-label="Floor" value={SAMPLE_PROPERTY.floorLabel} onChange={() => {}}>
                <option>{SAMPLE_PROPERTY.floorLabel}</option>
              </Select>
            </div>
            <label className="relative min-w-[200px] max-w-sm flex-1">
              <span className="sr-only">Search cabins or clients</span>
              <Input
                leftIcon={Search}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search cabins, clients, or IDs…"
              />
            </label>
            <Button
              leftIcon={UserPlus}
              disabled={!vacantCount}
              onClick={() => {
                setSelectMode(true);
                setToast({
                  type: "info",
                  message: "Pick the vacant cabins to allot, then confirm from the bar at the bottom.",
                });
              }}
            >
              Onboard client
            </Button>
          </div>
        </header>

        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_312px]">
          {/*
            The two views carry different toolbars because they answer with
            different controls. The plan needs a legend and zoom; the wing lists
            need the status, wing and size filters. Search scopes both and lives
            in the header above.
          */}
          <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-crm-soft dark:border-slate-700 dark:bg-slate-900">
            {view === "layout" ? (
              <FloorLayoutMap
                {...mapProps}
                selectMode={selectMode}
                onToggleSelectMode={toggleSelectMode}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
                  <Segmented
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: "all", label: "All", count: counts.all },
                      ...STATUS_ORDER.map((status) => ({
                        value: status,
                        label: STATUS_META[status].label,
                        count: counts[status],
                        dot: STATUS_META[status].dot,
                      })),
                    ]}
                  />
                  <Segmented
                    value={wingFilter}
                    onChange={(value) => setWingFilter(value === wingFilter ? "" : value)}
                    options={[
                      { value: "", label: "All wings" },
                      ...WINGS.map((wing) => ({ value: wing.id, label: wing.id })),
                    ]}
                  />
                  <Segmented
                    value={seatBand}
                    onChange={(value) => setSeatBand(value === seatBand ? "" : value)}
                    options={SEAT_BANDS.map((band) => ({ value: band.id, label: band.label }))}
                  />
                  <Button
                    size="sm"
                    variant={selectMode ? "primary" : "secondary"}
                    leftIcon={selectMode ? CheckSquare : Square}
                    aria-pressed={selectMode}
                    className="ml-auto"
                    onClick={toggleSelectMode}
                  >
                    Select cabins
                  </Button>
                </div>
                <WingSeatMap {...mapProps} className="p-3" />
              </>
            )}
          </section>

          <aside className="space-y-3 xl:sticky xl:top-4">
            <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-crm-soft dark:border-slate-700 dark:bg-slate-900">
              <Segmented
                className="w-full border-0 bg-transparent p-0 dark:bg-transparent"
                value={view}
                onChange={setView}
                options={[
                  { value: "layout", label: "Layout", icon: MapIcon },
                  { value: "wings", label: "Wings", icon: LayoutGrid },
                ]}
              />
              <div className="grid grid-cols-2 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={Users}
                  className="px-1"
                  onClick={() => navigate("/coworking/clients")}
                >
                  Clients
                </Button>
                <Button size="sm" variant="ghost" leftIcon={History} className="px-1" onClick={() => setShowActivity(true)}>
                  Activity
                </Button>
                <Button size="sm" variant="ghost" leftIcon={Download} className="px-1" onClick={exportCsv}>
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={Undo2}
                  className="px-1"
                  disabled={!undoStack.length}
                  title={undoStack.length ? `Undo: ${activity[0]?.title}` : "Nothing to undo"}
                  onClick={() => {
                    const undone = activity[0]?.title;
                    dispatch({ type: "UNDO" });
                    setToast({ type: "info", message: undone ? `Undone: ${undone}` : "Undone." });
                  }}
                >
                  Undo
                </Button>
              </div>
            </div>

            <FloorSummaryPanel
              cabins={scoped}
              counts={counts}
              statusFilter={statusFilter}
              onStatusFilter={setStatusFilter}
            />


          </aside>
        </div>
      </div>

      <SelectionBar
        cabins={cartCabins}
        onRemove={(code) => setCart((current) => current.filter((value) => value !== code))}
        onClear={() => setCart([])}
        onOnboard={setOnboarding}
      />

      <Modal open={Boolean(detailCabin)} size="lg" onClose={() => setDetailCode("")}>
        {detailCabin ? (
          <CabinDetailPanel
            cabin={detailCabin}
            propertyLabel={SAMPLE_PROPERTY.floorLabel}
            onClose={() => setDetailCode("")}
            // The panel stays open and re-derives, so a release shows the
            // cabin turning vacant rather than the dialog vanishing.
            onAction={(action) => runAction(action, ACTION_MESSAGES[action.type]?.(detailCabin))}
            onOnboard={(list) => {
              setDetailCode("");
              setOnboarding(list);
            }}
            onHold={(cabin) => {
              setDetailCode("");
              setHoldCode(cabin.code);
            }}
            onTransfer={(cabin) => {
              setDetailCode("");
              setTransferCode(cabin.code);
            }}
            onOpenClient={() => navigate(`/coworking/clients?client=${detailCabin.client.id}`)}
          />
        ) : null}
      </Modal>

      <HoldCabinDialog
        open={Boolean(holdCabin)}
        cabin={holdCabin}
        onClose={() => setHoldCode("")}
        onConfirm={(payload) => {
          setHoldCode("");
          runAction(
            { type: "HOLD", ...payload },
            `${holdCabin.label} held for ${payload.name} for ${payload.days} days.`,
          );
        }}
      />

      <TransferCabinDialog
        open={Boolean(transferCabin)}
        cabin={transferCabin}
        cabins={cabins}
        onClose={() => setTransferCode("")}
        onConfirm={(payload) => {
          setTransferCode("");
          runAction(
            { type: "TRANSFER", ...payload },
            `${transferCabin.client?.name} moved to ${payload.toCode.replace(/^([A-D])/, "$1-")}.`,
          );
        }}
      />


      <ActivityLogDialog
        open={showActivity}
        activity={activity}
        onClose={() => setShowActivity(false)}
        onOpenCabin={(code) => {
          setShowActivity(false);
          setDetailCode(code);
        }}
      />

      <OnboardClientDialog
        open={Boolean(onboarding)}
        cabins={onboarding || []}
        onClose={() => setOnboarding(null)}
        onConfirm={confirmOnboarding}
      />

      {toast ? (
        <ToastNotice key={toast.message} type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}
    </div>
  );
};

export default BookingBoard;
