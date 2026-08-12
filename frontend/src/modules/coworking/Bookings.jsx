import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Plus } from "lucide-react";
import { Button, ErrorState, Input, Modal, Pagination, Select } from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, FilterBar, PageToolbar, StatusBadge } from "../../components/crm";
import {
  createBooking,
  getAvailableCabins,
  getAvailableSeats,
  getBookings,
} from "../../services/coworkingBookingService";
import { getClients } from "../../services/coworkingClientService";
import { getProperties } from "../../services/coworkingPropertyService";
import { getFloors } from "../../services/coworkingFloorService";
import { usePermissions } from "../../context/usePermissions";
import { formatCurrency, formatDate } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";
import { BOOKING_STATUSES, BOOKING_TYPES, RECURRENCE_PATTERNS } from "../../constants/coworkingBooking";
import BookingDetailDrawer from "./components/BookingDetailDrawer";

const STATUS_OPTIONS = [{ value: "all", label: "All statuses" }, ...BOOKING_STATUSES.map((s) => ({ value: s, label: s }))];

const DEFAULT_FORM = {
  clientId: "",
  propertyId: "",
  floorId: "",
  bookingType: "SEAT",
  cabinId: "",
  seatCode: "",
  startDate: "",
  endDate: "",
  startTime: "",
  endTime: "",
  price: "",
  deposit: "",
  notes: "",
  isRecurring: false,
  recurrencePattern: "WEEKLY",
  recurrenceEndDate: "",
};

const Bookings = () => {
  const { can } = usePermissions();
  const canCreate = can("bookings.create");

  const [bookings, setBookings] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const [clients, setClients] = useState([]);
  const [properties, setProperties] = useState([]);
  const [floors, setFloors] = useState([]);
  const [availableCabins, setAvailableCabins] = useState([]);
  const [availableSeats, setAvailableSeats] = useState([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBookings({ page, limit: 15, status: status === "all" ? undefined : status });
      setBookings(data.bookings);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load bookings"));
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

  const checkAvailability = useCallback(async () => {
    const { propertyId, floorId, startDate, endDate, bookingType, startTime, endTime } = formData;
    if (!propertyId || !startDate || !endDate) return;

    setCheckingAvailability(true);
    setAvailableCabins([]);
    setAvailableSeats([]);
    try {
      if (bookingType === "CABIN") {
        const cabins = await getAvailableCabins({ propertyId, floorId: floorId || undefined, startDate, endDate });
        setAvailableCabins(cabins);
      } else {
        const seats = await getAvailableSeats({
          propertyId,
          floorId: floorId || undefined,
          startDate,
          endDate,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
        });
        setAvailableSeats(seats);
      }
    } catch {
      // Availability check failures surface as an empty list — the create button stays disabled.
    } finally {
      setCheckingAvailability(false);
    }
  }, [formData]);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  const openCreateModal = () => {
    setFormData(DEFAULT_FORM);
    setAvailableCabins([]);
    setAvailableSeats([]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const selectedResource =
        formData.bookingType === "CABIN"
          ? availableCabins.find((c) => c.cabinId === formData.cabinId)
          : availableSeats.find((s) => s.cabinId === formData.cabinId && s.seatCode === formData.seatCode);
      if (!selectedResource) throw new Error("Select an available cabin/seat");

      const result = await createBooking({
        ...formData,
        floorId: formData.floorId || selectedResource.floor?._id,
        price: Number(formData.price) || 0,
        deposit: Number(formData.deposit) || 0,
      });
      const skippedNote = result.skipped.length ? ` (${result.skipped.length} occurrence(s) skipped due to conflicts)` : "";
      setToast({ type: "success", message: `${result.created.length} booking(s) created${skippedNote}` });
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to create booking") });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load bookings" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  const canSubmit =
    formData.clientId &&
    formData.propertyId &&
    formData.startDate &&
    formData.endDate &&
    (formData.bookingType === "CABIN" ? formData.cabinId : formData.cabinId && formData.seatCode);

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Bookings"
          description="Cabin and seat bookings, temporary reservations and recurring schedules."
          actions={
            canCreate ? (
              <Button leftIcon={Plus} onClick={openCreateModal}>
                New Booking
              </Button>
            ) : null
          }
          filters={
            <FilterBar filters={[{ name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS }]} />
          }
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && bookings.length === 0} emptyTitle="No bookings yet">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Booking</th>
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5">Resource</th>
                <th className="px-4 py-2.5">Dates</th>
                <th className="px-4 py-2.5">Price</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr
                  key={booking._id}
                  onClick={() => setSelectedBooking(booking)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <CalendarCheck aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{booking.bookingCode}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{booking.clientId?.companyName || "-"}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {booking.cabinId?.cabinCode}
                    {booking.seatCode ? ` · ${booking.seatCode}` : " (whole cabin)"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {formatDate(booking.startDate)} → {formatDate(booking.endDate)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatCurrency(booking.price)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={booking.status} />
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
        title="New Booking"
        description="Only cabins/seats confirmed available for the chosen dates can be selected — conflicts are rejected server-side too."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSubmit}>
              {saving ? "Creating..." : "Create Booking"}
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
            <Select
              value={formData.floorId}
              onChange={(e) => setFormData((f) => ({ ...f, floorId: e.target.value, cabinId: "", seatCode: "" }))}
              disabled={!formData.propertyId}
            >
              <option value="">Any floor</option>
              {floors.map((floor) => (
                <option key={floor._id} value={floor._id}>
                  {floor.name || `Floor ${floor.floorNumber}`}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Booking type</span>
            <Select
              value={formData.bookingType}
              onChange={(e) => setFormData((f) => ({ ...f, bookingType: e.target.value, cabinId: "", seatCode: "" }))}
            >
              {BOOKING_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === "CABIN" ? "Whole Cabin" : "Single Seat"}
                </option>
              ))}
            </Select>
          </label>
          <div />

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Start date *</span>
            <Input type="date" value={formData.startDate} onChange={(e) => setFormData((f) => ({ ...f, startDate: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">End date *</span>
            <Input type="date" value={formData.endDate} onChange={(e) => setFormData((f) => ({ ...f, endDate: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Start time (same-day only)</span>
            <Input type="time" value={formData.startTime} onChange={(e) => setFormData((f) => ({ ...f, startTime: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">End time (same-day only)</span>
            <Input type="time" value={formData.endTime} onChange={(e) => setFormData((f) => ({ ...f, endTime: e.target.value }))} />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">
              {formData.bookingType === "CABIN" ? "Available cabin *" : "Available seat *"}
              {checkingAvailability ? " (checking...)" : ""}
            </span>
            {formData.bookingType === "CABIN" ? (
              <Select value={formData.cabinId} onChange={(e) => setFormData((f) => ({ ...f, cabinId: e.target.value }))}>
                <option value="">
                  {availableCabins.length === 0 ? "No available cabins for these dates" : "Select a cabin"}
                </option>
                {availableCabins.map((cabin) => (
                  <option key={cabin.cabinId} value={cabin.cabinId}>
                    {cabin.cabinCode} · {cabin.capacity} seats
                  </option>
                ))}
              </Select>
            ) : (
              <Select
                value={formData.cabinId && formData.seatCode ? `${formData.cabinId}:${formData.seatCode}` : ""}
                onChange={(e) => {
                  const [cabinId, seatCode] = e.target.value.split(":");
                  setFormData((f) => ({ ...f, cabinId: cabinId || "", seatCode: seatCode || "" }));
                }}
              >
                <option value="">{availableSeats.length === 0 ? "No available seats for these dates" : "Select a seat"}</option>
                {availableSeats.map((seat) => (
                  <option key={`${seat.cabinId}-${seat.seatCode}`} value={`${seat.cabinId}:${seat.seatCode}`}>
                    {seat.cabinCode} · {seat.seatCode}
                  </option>
                ))}
              </Select>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Price</span>
            <Input type="number" min={0} value={formData.price} onChange={(e) => setFormData((f) => ({ ...f, price: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Deposit</span>
            <Input type="number" min={0} value={formData.deposit} onChange={(e) => setFormData((f) => ({ ...f, deposit: e.target.value }))} />
          </label>

          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={formData.isRecurring}
              onChange={(e) => setFormData((f) => ({ ...f, isRecurring: e.target.checked }))}
            />
            <span className="text-xs font-semibold text-slate-500">Recurring booking</span>
          </label>
          {formData.isRecurring ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500">Repeats</span>
                <Select value={formData.recurrencePattern} onChange={(e) => setFormData((f) => ({ ...f, recurrencePattern: e.target.value }))}>
                  {RECURRENCE_PATTERNS.filter((p) => p !== "NONE").map((pattern) => (
                    <option key={pattern} value={pattern}>
                      {pattern}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500">Repeat until *</span>
                <Input
                  type="date"
                  value={formData.recurrenceEndDate}
                  onChange={(e) => setFormData((f) => ({ ...f, recurrenceEndDate: e.target.value }))}
                />
              </label>
            </>
          ) : null}

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

      <BookingDetailDrawer
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onChanged={(updated) => {
          setSelectedBooking(updated);
          load();
        }}
      />
    </div>
  );
};

export default Bookings;
