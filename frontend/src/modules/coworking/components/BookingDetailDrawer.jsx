import { useState } from "react";
import { Ban, Calendar, CheckCircle2, LogIn, LogOut, UserX } from "lucide-react";
import { Badge, Button, Input } from "../../../components/ui";
import { DetailDrawer, StatusBadge } from "../../../components/crm";
import {
  activateBooking,
  cancelBooking,
  completeBooking,
  confirmBooking,
  extendBooking,
  markNoShow,
} from "../../../services/coworkingBookingService";
import { formatCurrency, formatDate } from "../../../utils/format";
import { toErrorMessage } from "../../../utils/errorMessage";

const BookingDetailDrawer = ({ booking, onClose, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [extendDate, setExtendDate] = useState("");
  const [showExtend, setShowExtend] = useState(false);

  if (!booking) return null;

  const run = async (actionFn) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await actionFn();
      onChanged(updated);
      setShowExtend(false);
      setExtendDate("");
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailDrawer
      open={Boolean(booking)}
      onClose={onClose}
      title={booking.bookingCode}
      description={`${booking.clientId?.companyName || ""} · ${booking.bookingType} booking`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={booking.status} />
          <Badge variant="slate">{booking.cabinId?.cabinCode}</Badge>
          {booking.seatCode ? <Badge variant="blue">{booking.seatCode}</Badge> : null}
          {booking.isRecurring ? <Badge variant="violet">Recurring</Badge> : null}
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="space-y-2 text-sm">
          <p><span className="font-semibold text-slate-500">Property:</span> {booking.propertyId?.name || "-"}</p>
          <p><span className="font-semibold text-slate-500">Floor:</span> {booking.floorId?.name || `Floor ${booking.floorId?.floorNumber ?? "-"}`}</p>
          <p>
            <span className="font-semibold text-slate-500">Dates:</span> {formatDate(booking.startDate)} → {formatDate(booking.endDate)}
            {booking.startTime ? ` · ${booking.startTime}-${booking.endTime}` : ""}
          </p>
          <p><span className="font-semibold text-slate-500">Price:</span> {formatCurrency(booking.price)}</p>
          <p><span className="font-semibold text-slate-500">Deposit:</span> {formatCurrency(booking.deposit)}</p>
          {booking.notes ? <p className="text-slate-500">{booking.notes}</p> : null}
          {booking.cancelledReason ? (
            <p className="text-rose-600 dark:text-rose-300">Cancelled: {booking.cancelledReason}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          {booking.status === "PENDING" ? (
            <Button size="sm" leftIcon={CheckCircle2} disabled={busy} onClick={() => run(() => confirmBooking(booking._id))}>
              Confirm
            </Button>
          ) : null}
          {booking.status === "CONFIRMED" ? (
            <Button size="sm" variant="success" leftIcon={LogIn} disabled={busy} onClick={() => run(() => activateBooking(booking._id))}>
              Check In
            </Button>
          ) : null}
          {booking.status === "ACTIVE" ? (
            <Button size="sm" variant="success" leftIcon={LogOut} disabled={busy} onClick={() => run(() => completeBooking(booking._id))}>
              Check Out
            </Button>
          ) : null}
          {["CONFIRMED", "ACTIVE"].includes(booking.status) ? (
            <Button size="sm" variant="secondary" leftIcon={Calendar} disabled={busy} onClick={() => setShowExtend((v) => !v)}>
              Extend
            </Button>
          ) : null}
          {["PENDING", "CONFIRMED"].includes(booking.status) ? (
            <Button size="sm" variant="secondary" leftIcon={UserX} disabled={busy} onClick={() => run(() => markNoShow(booking._id))}>
              No-show
            </Button>
          ) : null}
          {["PENDING", "CONFIRMED", "ACTIVE"].includes(booking.status) ? (
            <Button
              size="sm"
              variant="danger"
              leftIcon={Ban}
              disabled={busy}
              onClick={() => run(() => cancelBooking(booking._id, "Cancelled from booking detail"))}
            >
              Cancel
            </Button>
          ) : null}
        </div>

        {showExtend ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
            <Input type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
            <Button size="sm" disabled={busy || !extendDate} onClick={() => run(() => extendBooking(booking._id, extendDate))}>
              Save
            </Button>
          </div>
        ) : null}
      </div>
    </DetailDrawer>
  );
};

export default BookingDetailDrawer;
