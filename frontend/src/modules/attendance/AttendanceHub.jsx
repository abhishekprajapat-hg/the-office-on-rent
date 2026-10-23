import AttendanceViolations from "./AttendanceViolations";
import AttendanceOfficesPanel from "./AttendanceOfficesPanel";
import WorkCalendarPanel from "./WorkCalendarPanel";
import { MANUAL_ATTENDANCE_STATUS_OPTIONS, manualStatusSelectValue } from "./attendanceStatus";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlarmClock,
  Building2,
  CalendarOff,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Fingerprint,
  Info,
  Loader2,
  LocateFixed,
  LogOut,
  MapPin,
  Minus,
  MoreVertical,
  PauseCircle,
  Plane,
  PlayCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  Sun,
  Timer,
  User,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  checkInAttendance,
  checkOutAttendance,
  createLeaveRequest,
  endBreakAttendance,
  getAdminLeaveRequests,
  getAttendanceOffices,
  getDailyAttendanceForAdmin,
  getAttendancePolicy,
  getMyLeaveRequests,
  getMyLeaveBalance,
  getMyAttendance,
  manageUserBreak,
  reviewLeaveRequest,
  startBreakAttendance,
  updateAttendancePolicy,
  updateUserAttendanceStatus,
} from "../../services/attendanceService";
import { toErrorMessage } from "../../utils/errorMessage";
import ToastNotice from "../../components/ui/ToastNotice";
import { getMyDailyReportToday } from "../../services/dailyReportService";
import BreakCorrectionDialog from "./BreakCorrectionDialog";
import AvatarFace from "../../components/ui/AvatarFace";

/*
 * Attendance - "Attendance Admin" design (Claude Design, Oct 2026).
 *
 * Two views on one page:
 *   Admin view     today's team: a status strip that doubles as a filter, the
 *                  team list with one-tap P / H / A / L marking and bulk
 *                  marking, violations, approvals and the policy & offices list.
 *   My attendance  the signed-in person's day (check in / break / check out),
 *                  their month as a calendar, violations and leave requests.
 * Admins (no personal attendance) see the admin view only, employees the
 * personal one only; managers can switch.
 *
 * Colours come from the glass tokens (--g-*), so the page follows the colour
 * theme and light / dark mode like the rest of the CRM.
 */

const ADMIN_VIEW_ROLES = new Set(["ADMIN", "MANAGER"]);
const LEAVE_TYPE_OPTIONS = [["CASUAL", "Casual"], ["SICK", "Sick"], ["EMERGENCY", "Emergency"], ["UNPAID", "Unpaid"], ["OTHER", "Other"]];
const BREAK_OPTIONS = [["LUNCH", "Lunch · 30m"], ["TEA", "Tea · 15m"], ["COFFEE", "Coffee · 15m"], ["UTILITY", "Utility"]];
const BREAK_TYPE_LABELS = { LUNCH: "Lunch", TEA: "Tea", COFFEE: "Coffee", UTILITY: "Utility" };
const GEOLOCATION_RETRY_ACCURACY_METERS = 150;
const EMPTY_POLICY_FORM = { geofenceEnabled: false, officeLatitude: "", officeLongitude: "", officeRadiusMeters: 200 };

// Tone -> [foreground, soft background] from the glass tokens.
const T = {
  ok: ["var(--g-ok)", "var(--g-oks)"],
  warn: ["var(--g-warn)", "var(--g-warns)"],
  bad: ["var(--g-bad)", "var(--g-bads)"],
  info: ["var(--g-info)", "var(--g-infos)"],
  a: ["var(--g-b)", "var(--g-bs)"],
  mut: ["var(--g-mut)", "var(--g-track)"],
};
const AVATAR_TONES = ["a", "warn", "ok", "info", "bad"];

const getRoleFromStorage = () => String(localStorage.getItem("role") || "").trim().toUpperCase();
const pad = (n) => String(n).padStart(2, "0");
const toLocalDateInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const toMonthInputValue = (value = new Date()) => toLocalDateInputValue(value).slice(0, 7);
const parseDateKey = (key) => {
  const [y, m, d] = String(key || "").split("-").map((part) => Number.parseInt(part, 10));
  return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) ? new Date(y, m - 1, d) : null;
};
const formatDateShort = (key) => parseDateKey(key)?.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) || "-";
const formatTimeOnly = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
};
const minutesToClock = (minutes) => (minutes === null || minutes === undefined ? "" : new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }));
const formatDuration = (minutes) => {
  const safe = Math.max(0, Number(minutes || 0));
  return `${Math.floor(safe / 60)}h ${pad(safe % 60)}m`;
};
const minutesBetween = (from, to) => {
  const start = new Date(from).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor((to - start) / 60000));
};
const formatDistance = (meters) => {
  const safe = Number(meters);
  if (!Number.isFinite(safe)) return "";
  return safe >= 1000 ? `${(safe / 1000).toFixed(2)} km` : `${Math.round(safe)} m`;
};
const getInitials = (name = "") => String(name || "-").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "-";
const toneForName = (name = "") => {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
};
const readable = (value) => String(value || "").replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/* ------------------------------------------------------------ location */
const toLocationPayload = (coords = {}) => ({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy });
const readCurrentPosition = (options) => new Promise((resolve, reject) => {
  navigator.geolocation.getCurrentPosition((position) => resolve(toLocationPayload(position.coords || {})), reject, options);
});
const hasGoodLocationAccuracy = (location) => {
  const accuracy = Number(location?.accuracy);
  return Number.isFinite(accuracy) && accuracy <= GEOLOCATION_RETRY_ACCURACY_METERS;
};
const pickBetterLocation = (first, second) => {
  if (!first) return second || null;
  if (!second) return first;
  const a = Number(first?.accuracy), b = Number(second?.accuracy);
  if (!Number.isFinite(a)) return second;
  if (!Number.isFinite(b)) return first;
  return b < a ? second : first;
};
const requestAttendanceLocation = async ({ required = false } = {}) => {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    if (required) throw new Error("Location is required but this browser does not support geolocation");
    return null;
  }
  try {
    const first = await readCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    if (hasGoodLocationAccuracy(first)) return first;
    try {
      return pickBetterLocation(first, await readCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
    } catch {
      return first;
    }
  } catch {
    if (required) throw new Error("Please allow location access to mark attendance");
    return null;
  }
};

/* ------------------------------------------------------- status helpers */
// How a team row reads today: label + tone.
const rowState = (attendance = {}) => {
  const status = String(attendance?.status || "ABSENT").toUpperCase();
  if (attendance?.isOnBreak) return ["On break", "warn"];
  if (status === "LEAVE") return ["On leave", "info"];
  if (status === "WEEK_OFF") return ["Week off", "mut"];
  if (status === "HOLIDAY") return ["Holiday", "mut"];
  if (status === "HALF_DAY") return ["Half day", "info"];
  if (attendance?.checkInAt && !attendance?.checkOutAt) return [attendance?.isLateCheckIn ? "Late" : "Working", attendance?.isLateCheckIn ? "warn" : "ok"];
  if (attendance?.checkInAt) return [attendance?.isLateCheckIn ? "Late" : "Present", attendance?.isLateCheckIn ? "warn" : "ok"];
  if (status === "PENDING") return ["Pending", "warn"];
  if (status === "MISSED_CHECK_OUT") return ["Missed check-out", "warn"];
  if (status === "PRESENT") return ["Present", "ok"];
  return ["Absent", "bad"];
};
// Which summary bucket a team row falls in - derived from rowState so the
// strip, the filter chips and the rows always agree.
const attendanceBucket = (attendance = {}) => {
  const [label] = rowState(attendance);
  if (label === "Late") return "late";
  if (label === "Half day") return "half";
  if (label === "On leave") return "leave";
  if (label === "Absent") return "absent";
  if (["Present", "Working", "On break", "Missed check-out", "Pending"].includes(label)) return "present";
  return "other";
};
// A calendar day's category for the dot.
const dayCategory = (row) => {
  if (!row) return "none";
  const status = String(row.status || "").toUpperCase();
  if (["WEEK_OFF", "HOLIDAY"].includes(status)) return "off";
  if (status === "LEAVE") return "leave";
  if (row.checkInAt) return row.isLateCheckIn ? "late" : "present";
  if (["PRESENT", "WORKING", "BREAK"].includes(status)) return "present";
  if (["HALF_DAY", "PENDING", "MISSED_CHECK_OUT"].includes(status)) return "late";
  if (status === "ABSENT") return "absent";
  return "none";
};
const DAY_DOT = { present: "var(--g-ok)", late: "var(--g-warn)", absent: "var(--g-bad)", leave: "var(--g-info)", off: "var(--g-fnt)", none: "transparent" };
const DAY_TONE = { present: "ok", late: "warn", absent: "bad", leave: "info", off: "mut", none: "mut" };

// Admin quick marks. L = leave (the server has no manual "late" - late is a
// check-in fact, not a mark).
const MARKS = [["PRESENT", "P", "Present", "ok"], ["HALF_DAY", "H", "Half day", "info"], ["ABSENT", "A", "Absent", "bad"], ["LEAVE", "L", "Leave", "warn"]];
const MORE_MARKS = MANUAL_ATTENDANCE_STATUS_OPTIONS.filter((option) => !MARKS.some(([value]) => value === option.value));

/* ------------------------------------------------------------ building blocks */
const glass = { background: "var(--g-glass)", border: "1px solid var(--g-line)", boxShadow: "var(--g-shadow)" };
const tile = { background: "var(--g-glassHi)", border: "1px solid var(--g-edge, var(--g-line))" };
const MUT = { color: "var(--g-mut)" };
const FNT = { color: "var(--g-fnt)" };

const Card = ({ className = "", style, children, ...rest }) => (
  <section className={`min-w-0 rounded-[22px] ${className}`} style={{ ...glass, ...style }} {...rest}>{children}</section>
);
const IconTile = ({ icon: Icon, tone = "a", size = 34, iconSize = 17, radius = 11 }) => (
  <span className="grid shrink-0 place-items-center" style={{ width: size, height: size, borderRadius: radius, background: T[tone][1], color: T[tone][0] }}>
    {Icon ? React.createElement(Icon, { size: iconSize, "aria-hidden": true }) : null}
  </span>
);
const Pill = ({ tone = "mut", dot = false, children, className = "" }) => (
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold ${className}`} style={{ background: T[tone][1], color: T[tone][0] }}>
    {dot ? <i className="h-1.5 w-1.5 rounded-full" style={{ background: T[tone][0] }} /> : null}
    {children}
  </span>
);
const SelectBox = ({ on, partial = false, onClick, label }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={partial ? "mixed" : on}
    aria-label={label}
    onClick={onClick}
    className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] transition-colors"
    style={{ border: `2px solid ${on || partial ? "var(--g-bfill)" : "var(--g-edge-strong, var(--g-fnt))"}`, background: on || partial ? "var(--g-bfill)" : "transparent", color: "#fff" }}
  >
    {on ? <CheckIcon /> : partial ? <Minus size={11} strokeWidth={3} /> : null}
  </button>
);
const CheckIcon = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;
const PrimaryButton = ({ children, className = "", ...rest }) => (
  <button type="button" className={`inline-flex items-center justify-center gap-2 rounded-[12px] px-4 text-[14px] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${className}`} style={{ background: "var(--g-bfill)", boxShadow: "0 6px 16px var(--g-bglow)" }} {...rest}>{children}</button>
);
const fieldStyle = { background: "var(--g-glassHi)", border: "1px solid var(--g-edge, var(--g-line))", color: "var(--g-ink)" };

// Right-side sheet used for the policy editors.
const Sheet = ({ title, onClose, children }) => {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/30 backdrop-blur-[3px]" onClick={onClose} />
      <div className="gl-att-sheet relative m-3 flex w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-[24px]" style={{ background: "var(--g-modal)", border: "1px solid var(--g-line)", boxShadow: "0 24px 60px rgba(14,22,48,.28)", backdropFilter: "blur(var(--g-blur)) saturate(180%)", WebkitBackdropFilter: "blur(var(--g-blur)) saturate(180%)" }}>
        <header className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--g-div)" }}>
          <h3 className="flex-1 text-[16px] font-extrabold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-[11px]" style={tile}><X size={16} /></button>
        </header>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
};

/* ================================================================== page */
const AttendanceHub = () => {
  const navigate = useNavigate();
  const [viewerRole] = useState(getRoleFromStorage);
  const isAdminViewer = ADMIN_VIEW_ROLES.has(viewerRole);
  const canUsePersonalAttendance = viewerRole !== "ADMIN";
  const [view, setView] = useState(isAdminViewer ? "admin" : "emp");
  const showAdmin = isAdminViewer && (view === "admin" || !canUsePersonalAttendance);
  const showEmp = canUsePersonalAttendance && !showAdmin;

  const [liveNow, setLiveNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setLiveNow(Date.now()), 1000); return () => clearInterval(timer); }, []);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 2200);
    return () => clearTimeout(timer);
  }, [success]);

  /* ----------------------------- personal state */
  const [month, setMonth] = useState(toMonthInputValue(new Date()));
  const [myLoading, setMyLoading] = useState(true);
  const [attendanceAction, setAttendanceAction] = useState("");
  const [myLeaveBalance, setMyLeaveBalance] = useState(null);
  const [myData, setMyData] = useState({ timezone: "", today: null, policy: null, summary: {}, attendance: [] });
  const [selectedDay, setSelectedDay] = useState(toLocalDateInputValue(new Date()));
  const [breakType, setBreakType] = useState("LUNCH");
  const [breakReason, setBreakReason] = useState("");
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ fromDate: toLocalDateInputValue(new Date()), toDate: toLocalDateInputValue(new Date()), leaveType: "CASUAL", reason: "" });

  /* ----------------------------- admin state */
  const [adminDate, setAdminDate] = useState(toLocalDateInputValue(new Date()));
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminRefreshing, setAdminRefreshing] = useState(false);
  const [adminData, setAdminData] = useState({ timezone: "", date: "", summary: {}, attendance: [], policy: null });
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [markAction, setMarkAction] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [openRowMenu, setOpenRowMenu] = useState("");
  const [teamBreakTypes, setTeamBreakTypes] = useState({});
  const [teamBreakAction, setTeamBreakAction] = useState("");
  const [breakCorrectionRow, setBreakCorrectionRow] = useState(null);
  const [adminLeaveRequests, setAdminLeaveRequests] = useState([]);
  const [adminLeaveStatusFilter, setAdminLeaveStatusFilter] = useState("PENDING");
  const [adminWorkflowLoading, setAdminWorkflowLoading] = useState(false);
  const [reviewAction, setReviewAction] = useState("");
  const [attendancePolicy, setAttendancePolicy] = useState(null);
  const [policyForm, setPolicyForm] = useState(EMPTY_POLICY_FORM);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [officeSummary, setOfficeSummary] = useState(null);
  const [sheet, setSheet] = useState("");

  /* ----------------------------- loaders */
  const loadMyAttendance = useCallback(async ({ quiet = false } = {}) => {
    if (!canUsePersonalAttendance) { setMyLoading(false); return; }
    if (!quiet) setMyLoading(true);
    try {
      const [payload, leaveBalance] = await Promise.all([getMyAttendance({ month }), getMyLeaveBalance({ month }).catch(() => null)]);
      setMyLeaveBalance(leaveBalance);
      setMyData({
        timezone: payload.timezone || "",
        today: payload.today || null,
        policy: payload.policy || null,
        summary: payload.summary || {},
        attendance: Array.isArray(payload.attendance) ? payload.attendance : [],
      });
    } catch (loadError) {
      setError(toErrorMessage(loadError, "Failed to load attendance"));
    } finally {
      setMyLoading(false);
    }
  }, [canUsePersonalAttendance, month]);

  const loadAdminAttendance = useCallback(async ({ quiet = false, date = adminDate } = {}) => {
    if (!isAdminViewer) return;
    if (quiet) setAdminRefreshing(true); else setAdminLoading(true);
    try {
      const payload = await getDailyAttendanceForAdmin({ date });
      setAdminData({
        timezone: payload.timezone || "",
        date: payload.date || date,
        summary: payload.summary || {},
        attendance: Array.isArray(payload.attendance) ? payload.attendance : [],
        policy: payload.policy || null,
      });
    } catch (loadError) {
      setError(toErrorMessage(loadError, "Failed to load team attendance"));
    } finally {
      setAdminLoading(false);
      setAdminRefreshing(false);
    }
  }, [adminDate, isAdminViewer]);

  const loadLeaveRequestsData = useCallback(async () => {
    if (!canUsePersonalAttendance) return;
    try {
      const rows = await getMyLeaveRequests();
      setLeaveRequests(Array.isArray(rows) ? rows : []);
    } catch (loadError) {
      setError(toErrorMessage(loadError, "Failed to load leave requests"));
    }
  }, [canUsePersonalAttendance]);

  const loadAdminWorkflowData = useCallback(async () => {
    if (!isAdminViewer) return;
    setAdminWorkflowLoading(true);
    try {
      const rows = await getAdminLeaveRequests(adminLeaveStatusFilter ? { status: adminLeaveStatusFilter } : {});
      setAdminLeaveRequests(Array.isArray(rows) ? rows : []);
    } catch (loadError) {
      setError(toErrorMessage(loadError, "Failed to load approvals"));
    } finally {
      setAdminWorkflowLoading(false);
    }
  }, [adminLeaveStatusFilter, isAdminViewer]);

  const loadAttendancePolicy = useCallback(async () => {
    if (!isAdminViewer) return;
    try {
      const [policy, offices] = await Promise.all([getAttendancePolicy(), getAttendanceOffices().catch(() => null)]);
      setAttendancePolicy(policy || null);
      setPolicyForm({
        geofenceEnabled: Boolean(policy?.geofenceEnabled),
        officeLatitude: policy?.officeLatitude ?? "",
        officeLongitude: policy?.officeLongitude ?? "",
        officeRadiusMeters: Number(policy?.officeRadiusMeters || 200),
      });
      if (offices) setOfficeSummary(offices.offices || []);
    } catch (loadError) {
      setPolicyError(toErrorMessage(loadError, "Failed to load attendance policy"));
    }
  }, [isAdminViewer]);

  useEffect(() => { loadMyAttendance(); }, [loadMyAttendance]);
  // A manager can change this person's break from the team list; a quiet poll
  // keeps the personal card current. Skipped while the tab is hidden.
  useEffect(() => {
    if (!canUsePersonalAttendance) return undefined;
    const timer = setInterval(() => { if (document.visibilityState === "visible") loadMyAttendance({ quiet: true }); }, 30000);
    return () => clearInterval(timer);
  }, [canUsePersonalAttendance, loadMyAttendance]);
  useEffect(() => { loadAdminAttendance(); }, [loadAdminAttendance]);
  useEffect(() => { loadLeaveRequestsData(); }, [loadLeaveRequestsData]);
  useEffect(() => { loadAdminWorkflowData(); }, [loadAdminWorkflowData]);
  useEffect(() => { loadAttendancePolicy(); }, [loadAttendancePolicy]);

  /* ----------------------------- personal actions */
  const todayAttendance = myData.today;
  const isOnBreak = Boolean(todayAttendance?.isOnBreak);
  const checkedIn = Boolean(todayAttendance?.checkInAt);
  const checkedOut = Boolean(todayAttendance?.checkOutAt);
  const refreshAfterPersonal = async () => {
    await loadMyAttendance({ quiet: true });
    if (isAdminViewer) await loadAdminAttendance({ quiet: true });
  };

  const handleCheckIn = async () => {
    try {
      setAttendanceAction("checkin");
      const location = await requestAttendanceLocation({ required: Boolean(myData.policy?.geofenceEnabled) });
      const result = await checkInAttendance({ source: "WEB", ...(location ? { location } : {}) });
      setSuccess(result.message || "Checked in");
      await refreshAfterPersonal();
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Check-in failed"));
    } finally {
      setAttendanceAction("");
    }
  };

  // Requirements 16 Oct 2026, 1.1: today's daily report comes before checkout.
  const sendToDailyReport = () => navigate("/daily-reports?from=checkout");
  const handleCheckOut = async () => {
    try {
      const reportState = await getMyDailyReportToday();
      if (reportState?.required && !reportState?.submitted) { sendToDailyReport(); return; }
    } catch {
      // The server checks again on checkout.
    }
    const lines = ["Are you sure you want to check out for today?", "After check-out, you cannot check in again today."];
    if (isOnBreak) lines.push("You are on a break. Checking out ends it.");
    if (!window.confirm(lines.join("\n"))) return;
    try {
      setAttendanceAction("checkout");
      const location = await requestAttendanceLocation({ required: false });
      const result = await checkOutAttendance({ source: "WEB", ...(location ? { location } : {}) });
      setSuccess(result.message || "Checked out");
      await refreshAfterPersonal();
    } catch (actionError) {
      if (actionError?.response?.data?.code === "DAILY_REPORT_REQUIRED") { sendToDailyReport(); return; }
      setError(toErrorMessage(actionError, "Check-out failed"));
    } finally {
      setAttendanceAction("");
    }
  };

  const handleStartBreak = async () => {
    try {
      setAttendanceAction("breakstart");
      const result = await startBreakAttendance({ source: "WEB", breakType, note: breakReason });
      setSuccess(result.message || "Break started");
      setBreakReason("");
      await refreshAfterPersonal();
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Failed to start break"));
    } finally {
      setAttendanceAction("");
    }
  };
  const handleEndBreak = async () => {
    try {
      setAttendanceAction("breakend");
      const result = await endBreakAttendance({ source: "WEB" });
      setSuccess(result.message || "Break ended");
      await refreshAfterPersonal();
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Failed to end break"));
    } finally {
      setAttendanceAction("");
    }
  };

  const handleSubmitLeaveRequest = async (event) => {
    event.preventDefault();
    const fromDate = String(leaveForm.fromDate || "").trim();
    const toDate = String(leaveForm.toDate || "").trim();
    const reason = String(leaveForm.reason || "").trim();
    if (!fromDate || !toDate) { setError("Please select leave start and end date."); return; }
    if (fromDate > toDate) { setError("Leave start date cannot be after end date."); return; }
    if (!reason) { setError("Add a reason first."); return; }
    try {
      setLeaveSubmitting(true);
      const result = await createLeaveRequest({ fromDate, toDate, leaveType: leaveForm.leaveType, reason });
      setSuccess(result.message || "Request sent to your manager");
      setLeaveForm((prev) => ({ ...prev, reason: "" }));
      await Promise.all([
        loadLeaveRequestsData(),
        loadMyAttendance({ quiet: true }),
        isAdminViewer ? loadAdminAttendance({ quiet: true }) : null,
        isAdminViewer ? loadAdminWorkflowData() : null,
      ]);
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Failed to create leave request"));
    } finally {
      setLeaveSubmitting(false);
    }
  };

  /* ----------------------------- admin actions */
  const effectiveAdminDate = String(adminData.date || adminDate || "").trim();

  const markUsers = async (rows, status) => {
    const date = effectiveAdminDate;
    const ids = rows.map((row) => String(row?.user?._id || "").trim()).filter(Boolean);
    if (!ids.length || !date || !status) return 0;
    let done = 0;
    for (const userId of ids) {
      setMarkAction(`${userId}:${date}`);
      await updateUserAttendanceStatus(userId, date, { status });
      done += 1;
    }
    return done;
  };

  const handleMark = async (row, status) => {
    try {
      setError("");
      const result = await markUsers([row], status);
      if (result) setSuccess(`${row.user?.name || "Attendance"} → ${MANUAL_ATTENDANCE_STATUS_OPTIONS.find((o) => o.value === status)?.label || readable(status)}`);
      await loadAdminAttendance({ quiet: true });
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Failed to update attendance status"));
    } finally {
      setMarkAction("");
    }
  };

  const handleBulkMark = async (status, label) => {
    const rows = adminData.attendance.filter((row) => selected.includes(String(row.user?._id || "")));
    if (!rows.length) return;
    try {
      setBulkBusy(true);
      setError("");
      const count = await markUsers(rows, status);
      setSuccess(`${count} marked ${label.toLowerCase()}`);
      setSelected([]);
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Some rows could not be updated"));
    } finally {
      setMarkAction("");
      setBulkBusy(false);
      await loadAdminAttendance({ quiet: true });
    }
  };

  const handleTeamBreak = async (row, action) => {
    const userId = String(row.user?._id || "");
    if (!userId) return;
    try {
      setTeamBreakAction(userId);
      const result = await manageUserBreak(userId, { action, ...(action === "START" ? { breakType: teamBreakTypes[userId] || "UTILITY" } : {}) });
      setSuccess(result.message || "Break updated");
      await loadAdminAttendance({ quiet: true });
      if (canUsePersonalAttendance) await loadMyAttendance({ quiet: true });
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Failed to update the break"));
    } finally {
      setTeamBreakAction("");
    }
  };

  const handleReviewLeave = async (requestId, status) => {
    if (!requestId || !status) return;
    const note = window.prompt(`Optional note for ${status.toLowerCase()} action`, "");
    if (note === null) return;
    try {
      setReviewAction(`${requestId}:${status}`);
      const result = await reviewLeaveRequest(requestId, { status, reviewNote: String(note || "").trim() });
      setSuccess(result.message || "Leave request updated");
      await Promise.all([loadAdminWorkflowData(), loadMyAttendance({ quiet: true }), loadLeaveRequestsData(), loadAdminAttendance({ quiet: true })]);
    } catch (actionError) {
      setError(toErrorMessage(actionError, "Failed to review leave request"));
    } finally {
      setReviewAction("");
    }
  };

  const handleSaveAttendancePolicy = async (event) => {
    event.preventDefault();
    const geofenceEnabled = Boolean(policyForm.geofenceEnabled);
    const officeLatitude = String(policyForm.officeLatitude || "").trim();
    const officeLongitude = String(policyForm.officeLongitude || "").trim();
    const officeRadiusMeters = Number(policyForm.officeRadiusMeters || 200);
    if (geofenceEnabled && (!officeLatitude || !officeLongitude)) {
      setPolicyError("Office latitude and longitude are required when geofence is enabled");
      return;
    }
    try {
      setPolicySaving(true);
      setPolicyError("");
      const result = await updateAttendancePolicy({
        ...(attendancePolicy || {}),
        geofenceEnabled,
        officeLatitude: officeLatitude || null,
        officeLongitude: officeLongitude || null,
        officeRadiusMeters,
      });
      setAttendancePolicy(result.policy || null);
      setSuccess(result.message || "Attendance policy updated");
      setSheet("");
    } catch (actionError) {
      setPolicyError(toErrorMessage(actionError, "Failed to save attendance policy"));
    } finally {
      setPolicySaving(false);
    }
  };
  const handleUseCurrentOfficeLocation = async () => {
    try {
      setPolicySaving(true);
      setPolicyError("");
      const location = await requestAttendanceLocation({ required: true });
      setPolicyForm((prev) => ({ ...prev, officeLatitude: Number(location.latitude).toFixed(6), officeLongitude: Number(location.longitude).toFixed(6) }));
    } catch (actionError) {
      setPolicyError(toErrorMessage(actionError, "Failed to read current location"));
    } finally {
      setPolicySaving(false);
    }
  };

  /* ----------------------------- derived: personal */
  const todayBreakSessions = Array.isArray(todayAttendance?.breakSessions) ? todayAttendance.breakSessions : [];
  const activeBreak = isOnBreak ? todayBreakSessions.at(-1) || null : null;
  const activeBreakMinutes = activeBreak?.startAt ? minutesBetween(activeBreak.startAt, liveNow) : 0;
  const liveWorkedMinutes = checkedIn && !checkedOut
    ? Math.max(0, minutesBetween(todayAttendance.checkInAt, liveNow) - todayBreakSessions.reduce((total, session) => total + minutesBetween(session.startAt, session.endAt ? new Date(session.endAt).getTime() : liveNow), 0))
    : Number(todayAttendance?.workedMinutes || 0);
  const targetMinutes = Number(myData.policy?.fullDayMinutes || 0) || 450;
  const phase = !checkedIn ? ["Not checked in", "rgba(255,255,255,.75)"] : checkedOut ? ["Checked out", "#ffffff"] : isOnBreak ? ["On break", "#ffcf5a"] : ["Working", "#7be0b1"];

  const mySummary = myData.summary || {};
  const myPresent = Number(mySummary.presentDays || 0);
  const myAvgHours = myPresent ? (Number(mySummary.totalWorkedHours || 0) / myPresent).toFixed(1) : "0.0";
  const myLateCutoff = Number(mySummary.lateCheckInCutoffMinutes || 0);
  const empKpis = [
    [CheckCircle2, "Present", myPresent, `of ${Number(mySummary.workingDays || 0)} working days`, "ok"],
    [XCircle, "Absent", Number(mySummary.absentDays || 0), Number(mySummary.unrecordedAbsentDays || 0) ? `${mySummary.unrecordedAbsentDays} with no check-in` : "Working days missed", "bad"],
    [AlarmClock, "Late", Number(mySummary.lateDays || 0), myLateCutoff ? `After ${minutesToClock(myLateCutoff)}` : "Late check-ins", "warn"],
    [Clock, "Avg. hours", myAvgHours, `Target ${(targetMinutes / 60).toFixed(1)}`, "info"],
  ];

  // Calendar for the selected month (weeks start Monday, as in the design).
  const rowsByDate = useMemo(() => new Map((myData.attendance || []).map((row) => [String(row.attendanceDate || ""), row])), [myData.attendance]);
  const todayKey = toLocalDateInputValue(new Date());
  const calendar = useMemo(() => {
    const [y, m] = month.split("-").map((part) => Number.parseInt(part, 10));
    const first = new Date(y, m - 1, 1);
    const days = new Date(y, m, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const cells = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= days; d += 1) cells.push(`${y}-${pad(m)}-${pad(d)}`);
    while (cells.length % 7) cells.push(null);
    return { cells, label: first.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }, [month]);
  const shiftMonth = (delta) => {
    const [y, m] = month.split("-").map((part) => Number.parseInt(part, 10));
    const next = new Date(y, m - 1 + delta, 1);
    const nextMonth = toMonthInputValue(next);
    setMonth(nextMonth);
    setSelectedDay(nextMonth === todayKey.slice(0, 7) ? todayKey : `${nextMonth}-01`);
  };
  const selectedRow = rowsByDate.get(selectedDay) || (selectedDay === todayKey ? todayAttendance : null);
  const selectedCategory = selectedDay === todayKey && checkedIn && !checkedOut ? "present" : dayCategory(selectedRow);
  const selectedDetail = (() => {
    if (selectedDay > todayKey) return ["Upcoming", "Future day", "mut"];
    if (!selectedRow) return ["No record", "Nothing recorded for this day", "mut"];
    const status = String(selectedRow.status || "").toUpperCase();
    if (selectedRow.checkInAt) {
      const out = selectedRow.checkOutAt ? formatTimeOnly(selectedRow.checkOutAt) : "still in";
      const worked = selectedDay === todayKey && !selectedRow.checkOutAt ? liveWorkedMinutes : Number(selectedRow.workedMinutes || 0);
      return [selectedDay === todayKey && !selectedRow.checkOutAt ? (isOnBreak ? "On break" : "Working") : selectedRow.isLateCheckIn ? "Late" : readable(status) || "Present",
        `In ${formatTimeOnly(selectedRow.checkInAt)} · out ${out} · ${formatDuration(worked)}`, DAY_TONE[selectedCategory]];
    }
    if (status === "WEEK_OFF") return ["Week off", "Weekly off", "mut"];
    if (status === "HOLIDAY") return ["Holiday", selectedRow.holidayName || "Company holiday", "mut"];
    if (status === "LEAVE") return ["On leave", readable(selectedRow.leaveType) || "Approved leave", "info"];
    return [readable(status) || "Absent", selectedRow.source === "NO_RECORD" ? "No check-in recorded · uninformed" : "Marked by admin", DAY_TONE[selectedCategory]];
  })();

  /* ----------------------------- derived: admin */
  const teamRows = useMemo(() => adminData.attendance || [], [adminData.attendance]);
  const counts = useMemo(() => {
    // Counted by the same state each row shows, so a member marked Present by
    // hand (no check-in time) is counted as present, not as nothing.
    const c = { all: teamRows.length, in: 0, late: 0, absent: 0, leave: 0, half: 0, present: 0 };
    teamRows.forEach((row) => {
      const bucket = attendanceBucket(row.attendance);
      if (bucket in c) c[bucket] += 1;
      if (["present", "late", "half"].includes(bucket)) c.in += 1;
    });
    return c;
  }, [teamRows]);
  const filters = {
    all: () => true,
    in: (a) => ["present", "late", "half"].includes(attendanceBucket(a)),
    late: (a) => attendanceBucket(a) === "late",
    absent: (a) => attendanceBucket(a) === "absent",
    leave: (a) => attendanceBucket(a) === "leave",
  };
  const q = query.trim().toLowerCase();
  const visibleRows = teamRows.filter((row) => filters[filter](row.attendance) && (!q || `${row.user?.name || ""} ${row.user?.role || ""} ${row.user?.email || ""}`.toLowerCase().includes(q)));
  const visibleIds = visibleRows.map((row) => String(row.user?._id || ""));
  const selectedVisible = selected.filter((id) => visibleIds.includes(id));
  const allOn = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const adminPolicy = attendancePolicy || adminData.policy || {};
  const fullDay = Number(adminPolicy.fullDayMinutes || 0) || 540;
  const graceTill = Number.isFinite(Number(adminPolicy.shiftStartMinutes)) ? Number(adminPolicy.shiftStartMinutes) + Number(adminPolicy.graceMinutes || 0) : null;
  const workedRows = teamRows.map((row) => Number(row.attendance?.workedMinutes || 0)).filter((m) => m > 0);
  const avgHours = workedRows.length ? (workedRows.reduce((s, m) => s + m, 0) / workedRows.length / 60).toFixed(1) : "0.0";
  const pendingApprovals = adminLeaveRequests.filter((row) => row.status === "PENDING");
  const approvalsShown = adminLeaveStatusFilter === "PENDING" ? pendingApprovals : adminLeaveRequests.slice(0, 8);
  const upcomingHoliday = (adminPolicy.holidays || []).filter((h) => h.date >= todayKey).sort((a, b) => a.date.localeCompare(b.date))[0];
  const policyRows = [
    ["geofence", LocateFixed, "Geofence", adminPolicy.geofenceEnabled ? `On · ${Number(adminPolicy.officeRadiusMeters || 200)} m around main office` : "Off · check-in from anywhere"],
    ["offices", Building2, "Other offices", officeSummary ? (officeSummary.length ? `${officeSummary.length} office${officeSummary.length === 1 ? "" : "s"} · ${officeSummary[0].name || "Unnamed"}` : "None added") : "Main office only"],
    ["calendar", Clock, "Half-day cutoff", adminPolicy.halfDayCheckInCutoffMinutes === null || adminPolicy.halfDayCheckInCutoffMinutes === undefined ? "Off" : minutesToClock(adminPolicy.halfDayCheckInCutoffMinutes)],
    ["calendar", Sun, "Company holidays", upcomingHoliday ? `${upcomingHoliday.name || "Holiday"} · ${formatDateShort(upcomingHoliday.date)}` : `${(adminPolicy.holidays || []).length} set`],
  ];

  const isToday = effectiveAdminDate === todayKey;
  const segBtn = (on) => ({ background: on ? "var(--g-glassHi)" : "transparent", color: on ? "var(--g-b)" : "var(--g-mut)", boxShadow: on ? "0 1px 4px rgba(0,0,0,.08)" : "none" });

  return (
    <div className="attendance-doc-screen ui-page-shell custom-scrollbar" style={{ color: "var(--g-ink)" }}>
      <ToastNotice message={error} type="error" />
      <ToastNotice message={success} type="success" />

      <div className="flex flex-col gap-3 pb-4">
        {/* Breadcrumb · day picker · view switch */}
        <div className="flex flex-wrap items-center gap-2.5 px-1">
          <nav aria-label="Breadcrumb" className="flex flex-1 items-center gap-1.5 text-[14px]" style={MUT}>
            <button type="button" onClick={() => navigate("/")} className="hover:underline">Home</button>
            <ChevronRight size={14} aria-hidden="true" />
            <b className="font-semibold" style={{ color: "var(--g-ink)" }}>Attendance</b>
          </nav>
          {showAdmin ? (
            <div className="flex items-center gap-1.5">
              <input type="date" value={adminDate} max={todayKey} onChange={(event) => { setAdminDate(event.target.value); setSelected([]); }} aria-label="Attendance date" className="h-9 rounded-[11px] px-3 text-[13px] font-semibold outline-none" style={fieldStyle} />
              <button type="button" onClick={() => loadAdminAttendance({ quiet: true })} disabled={adminRefreshing} title="Refresh" aria-label="Refresh" className="grid h-9 w-9 place-items-center rounded-[11px]" style={fieldStyle}>
                {adminRefreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              </button>
            </div>
          ) : null}
          {isAdminViewer && canUsePersonalAttendance ? (
            <div className="flex rounded-[11px] p-[3px]" style={{ background: "var(--g-glass)", border: "1px solid var(--g-line)" }} role="group" aria-label="Attendance view">
              {[["admin", "Admin view", Users], ["emp", "My attendance", User]].map(([key, label, Icon]) => (
                <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className="flex h-[30px] items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-bold" style={segBtn(view === key)}>
                  {React.createElement(Icon, { size: 15 })}{label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* ======================================================= EMPLOYEE */}
        {showEmp ? (
          myLoading ? (
            <Card className="flex h-40 items-center justify-center gap-2 text-[14px]" style={MUT}><Loader2 size={17} className="animate-spin" />Loading attendance…</Card>
          ) : (
            <>
              <div className="flex flex-wrap items-stretch gap-3">
                {/* Today card */}
                <section className="flex min-w-0 flex-[1_1_440px] flex-col gap-[18px] rounded-[22px] p-5 text-white" style={{ background: "linear-gradient(150deg, rgb(var(--blue-600)), rgb(var(--blue-800)))", boxShadow: "0 14px 34px var(--g-bglow)" }}>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[13px] font-semibold opacity-80">Today · {formatDateShort(todayKey)}</span>
                    <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: "rgba(255,255,255,.18)" }}>
                      <i className="h-[7px] w-[7px] rounded-full" style={{ background: phase[1] }} />{phase[0]}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold opacity-80">
                      <MapPin size={14} aria-hidden="true" />
                      {todayAttendance?.checkInLocation?.officeName || (myData.policy?.geofenceEnabled ? "Main office" : "Anywhere")}
                      {formatDistance(todayAttendance?.checkInLocation?.distanceMeters) ? ` · ${formatDistance(todayAttendance.checkInLocation.distanceMeters)}` : myData.policy?.geofenceEnabled ? ` · within ${Number(myData.policy?.officeRadiusMeters || 200)} m` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-end gap-6">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[12px] font-semibold opacity-80">Worked today</span>
                      <span className="font-mono text-[46px] font-semibold leading-none tracking-[-.02em]">{Math.floor(liveWorkedMinutes / 60)}:{pad(liveWorkedMinutes % 60)}</span>
                    </div>
                    <div className="flex min-w-[180px] flex-1 flex-col gap-1.5 pb-1.5">
                      <div className="flex justify-between text-[11.5px] font-semibold opacity-80">
                        <span>{checkedIn ? `In ${formatTimeOnly(todayAttendance.checkInAt)}` : "Not checked in"}{checkedOut ? ` · out ${formatTimeOnly(todayAttendance.checkOutAt)}` : ""}</span>
                        <span>Target {formatDuration(targetMinutes)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded" style={{ background: "rgba(255,255,255,.2)" }}>
                        <div className="h-full rounded bg-white transition-[width] duration-500" style={{ width: `${Math.min(100, (liveWorkedMinutes / targetMinutes) * 100)}%` }} />
                      </div>
                      {activeBreak ? (
                        <span className="text-[11.5px] font-semibold" style={{ color: activeBreak.expectedMinutes && activeBreakMinutes > activeBreak.expectedMinutes ? "#ffd0c9" : "rgba(255,255,255,.85)" }}>
                          {BREAK_TYPE_LABELS[activeBreak.breakType] || "Utility"} break · {activeBreakMinutes}m{activeBreak.expectedMinutes ? ` / ${activeBreak.expectedMinutes}m` : ""}
                        </span>
                      ) : todayBreakSessions.length ? (
                        <span className="text-[11.5px] font-semibold opacity-80">{todayBreakSessions.length} break{todayBreakSessions.length === 1 ? "" : "s"} · {formatDuration(todayAttendance?.totalBreakMinutes || 0)}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!checkedIn ? (
                      <HeroButton primary onClick={handleCheckIn} busy={attendanceAction === "checkin"} disabled={Boolean(attendanceAction)} icon={Fingerprint}>Check in</HeroButton>
                    ) : !checkedOut ? (
                      <>
                        {isOnBreak ? (
                          <HeroButton primary onClick={handleEndBreak} busy={attendanceAction === "breakend"} disabled={Boolean(attendanceAction)} icon={PlayCircle}>End break</HeroButton>
                        ) : (
                          <div className="flex min-w-0 flex-[1_1_220px] gap-1.5">
                            <select aria-label="Break type" value={breakType} onChange={(event) => setBreakType(event.target.value)} className="gl-att-hero-select h-[46px] min-w-0 rounded-[14px] px-3 text-[13px] font-bold outline-none">
                              {BREAK_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                            <HeroButton onClick={handleStartBreak} busy={attendanceAction === "breakstart"} disabled={Boolean(attendanceAction) || (breakType === "UTILITY" && !breakReason.trim())} icon={Coffee}>Start break</HeroButton>
                          </div>
                        )}
                        <HeroButton primary onClick={handleCheckOut} busy={attendanceAction === "checkout"} disabled={Boolean(attendanceAction)} icon={LogOut}>Check out</HeroButton>
                      </>
                    ) : (
                      <span className="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-[14px] text-[14px] font-bold" style={{ background: "rgba(255,255,255,.16)" }}><CheckCheck size={18} />Day complete</span>
                    )}
                  </div>
                  {checkedIn && !checkedOut && !isOnBreak && breakType === "UTILITY" ? (
                    <input value={breakReason} maxLength={240} onChange={(event) => setBreakReason(event.target.value)} placeholder="Reason for the utility break" aria-label="Utility break reason" className="gl-att-hero-select -mt-2 h-10 rounded-[12px] px-3 text-[13px] outline-none" />
                  ) : null}
                </section>

                <div className="grid min-w-0 flex-[1_1_360px] grid-cols-2 gap-3">
                  {empKpis.map(([icon, label, value, sub, tone]) => (
                    <Card key={label} className="flex flex-col gap-1.5 p-4" style={{ borderRadius: 20 }}>
                      <div className="flex items-center gap-2"><IconTile icon={icon} tone={tone} size={30} iconSize={15} radius={10} /><span className="text-[12.5px] font-bold" style={MUT}>{label}</span></div>
                      <span className="text-[24px] font-extrabold tracking-[-.02em]" style={{ color: tone === "bad" && Number(value) ? "var(--g-bad)" : "var(--g-ink)" }}>{value}</span>
                      <span className="truncate text-[11.5px]" style={MUT}>{sub}</span>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-3">
                <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-3">
                  {/* Month calendar */}
                  <Card className="flex flex-col gap-3.5 px-[18px] py-4">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="flex flex-1 items-center gap-1.5">
                        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-[10px]" style={tile}><ChevronLeft size={16} /></button>
                        <span className="min-w-[130px] text-center text-[15px] font-extrabold">{calendar.label}</span>
                        <button type="button" onClick={() => shiftMonth(1)} disabled={month >= todayKey.slice(0, 7)} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-[10px] disabled:opacity-40" style={tile}><ChevronRight size={16} /></button>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[11.5px] font-semibold" style={MUT}>
                        {[["Present", "present"], ["Late", "late"], ["Absent", "absent"], ["Leave", "leave"], ["Off", "off"]].map(([label, key]) => (
                          <span key={key} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[3px]" style={{ background: DAY_DOT[key] }} />{label}</span>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={`${d}${i}`} className="text-center text-[11px] font-bold" style={FNT}>{d}</span>)}
                      {calendar.cells.map((key, index) => {
                        if (!key) return <span key={`e${index}`} />;
                        const future = key > todayKey;
                        const on = key === selectedDay;
                        const cat = key === todayKey && checkedIn && !checkedOut ? "present" : dayCategory(rowsByDate.get(key) || (key === todayKey ? todayAttendance : null));
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={future}
                            onClick={() => setSelectedDay(key)}
                            aria-pressed={on}
                            aria-label={formatDateShort(key)}
                            className="flex aspect-[1.25] flex-col items-center justify-center gap-[3px] rounded-[10px] transition-colors disabled:cursor-default"
                            style={{ background: on ? "var(--g-bs)" : future ? "transparent" : "var(--g-glassHi)", border: `1.5px solid ${on ? "var(--g-b)" : key === todayKey ? "var(--g-edge-strong, var(--g-line))" : "transparent"}` }}
                          >
                            <span className="text-[13px] font-bold" style={{ color: future ? "var(--g-fnt)" : "var(--g-ink)" }}>{Number(key.slice(8))}</span>
                            <i className="h-1.5 w-1.5 rounded-full" style={{ background: future ? "transparent" : DAY_DOT[cat] }} />
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 rounded-[14px] px-3.5 py-3" style={tile}>
                      <span className="min-w-[110px] text-[13.5px] font-extrabold">{formatDateShort(selectedDay)}</span>
                      <span className="min-w-[160px] flex-1 text-[12.5px]" style={MUT}>{selectedDetail[1]}</span>
                      <Pill tone={selectedDetail[2]}>{selectedDetail[0]}</Pill>
                    </div>
                    {selectedDay === todayKey && todayBreakSessions.length ? (
                      <ol className="flex flex-col gap-1.5">
                        {todayBreakSessions.map((session, index) => {
                          const minutes = session.endAt ? Number(session.durationMinutes || 0) : minutesBetween(session.startAt, liveNow);
                          const overran = session.expectedMinutes && minutes > session.expectedMinutes;
                          return (
                            <li key={`${session.startAt}-${index}`} className="flex flex-wrap items-center gap-2.5 rounded-[12px] px-3 py-2 text-[12.5px]" style={{ background: "var(--g-glass2)" }}>
                              <Coffee size={14} style={FNT} aria-hidden="true" />
                              <span className="flex-1 font-semibold">{BREAK_TYPE_LABELS[session.breakType] || "Utility"} break{session.correctedByName ? <span className="font-normal" style={MUT}> · recorded by {session.correctedByName}</span> : null}</span>
                              <span className="font-mono" style={MUT}>{formatTimeOnly(session.startAt)} – {session.endAt ? formatTimeOnly(session.endAt) : "running"}</span>
                              <span className="font-mono font-semibold" style={{ color: overran ? "var(--g-bad)" : "var(--g-ink)" }}>{minutes}m{session.expectedMinutes ? ` / ${session.expectedMinutes}m` : ""}</span>
                            </li>
                          );
                        })}
                      </ol>
                    ) : null}
                  </Card>

                  <AttendanceViolations month={month} canReview={false} variant="personal" />
                </div>

                <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
                  {/* Request leave */}
                  <Card className="px-[18px] py-4">
                    <form className="flex flex-col gap-3" onSubmit={handleSubmitLeaveRequest}>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-[15px] font-extrabold">Request leave</span>
                        {myLeaveBalance ? <span className="text-[12px] font-bold" style={MUT}>{myLeaveBalance.available} available</span> : null}
                      </div>
                      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Leave type">
                        {LEAVE_TYPE_OPTIONS.map(([value, label]) => {
                          const on = leaveForm.leaveType === value;
                          return (
                            <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setLeaveForm((prev) => ({ ...prev, leaveType: value }))} className="flex h-[34px] items-center rounded-[10px] px-3 text-[12.5px] font-bold" style={{ background: on ? "var(--g-bs)" : "var(--g-glassHi)", color: on ? "var(--g-b)" : "var(--g-ink)", border: `1.5px solid ${on ? "var(--g-b)" : "var(--g-edge, var(--g-line))"}` }}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[["fromDate", "From"], ["toDate", "To"]].map(([key, label]) => (
                          <label key={key} className="flex min-w-0 flex-col gap-1">
                            <span className="text-[11.5px] font-bold" style={MUT}>{label}</span>
                            <input type="date" value={leaveForm[key]} onChange={(event) => setLeaveForm((prev) => ({ ...prev, [key]: event.target.value }))} className="h-10 min-w-0 rounded-[11px] px-2.5 text-[13px] outline-none" style={fieldStyle} />
                          </label>
                        ))}
                      </div>
                      <textarea value={leaveForm.reason} onChange={(event) => setLeaveForm((prev) => ({ ...prev, reason: event.target.value }))} placeholder="Reason (visible to your manager)" aria-label="Leave reason" className="min-h-[70px] resize-none rounded-[11px] px-3 py-2.5 text-[13px] outline-none" style={fieldStyle} />
                      <PrimaryButton type="submit" disabled={leaveSubmitting} className="h-11">
                        {leaveSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Submit request
                      </PrimaryButton>
                    </form>
                  </Card>

                  <Card className="flex flex-col gap-2.5 px-[18px] py-4">
                    <span className="text-[15px] font-extrabold">My requests</span>
                    {leaveRequests.length ? leaveRequests.slice(0, 6).map((row) => {
                      const status = String(row.status || "PENDING").toUpperCase();
                      const tone = status === "APPROVED" ? "ok" : status === "REJECTED" ? "bad" : status === "CANCELLED" ? "mut" : "warn";
                      const days = row.fromDate && row.toDate ? Math.round((parseDateKey(row.toDate) - parseDateKey(row.fromDate)) / 86400000) + 1 : 1;
                      return (
                        <div key={String(row._id)} className="flex items-center gap-2.5 rounded-[12px] px-3 py-2.5" style={tile}>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[13px] font-bold">{readable(row.leaveType || "CASUAL")} leave · {days} day{days === 1 ? "" : "s"}</span>
                            <span className="truncate text-[11.5px]" style={MUT}>{formatDateShort(row.fromDate)}{row.toDate && row.toDate !== row.fromDate ? ` – ${formatDateShort(row.toDate)}` : ""} · {row.reason || "-"}</span>
                          </div>
                          <Pill tone={tone}>{readable(status)}</Pill>
                        </div>
                      );
                    }) : <span className="text-[12.5px]" style={MUT}>No requests yet.</span>}
                  </Card>
                </div>
              </div>
            </>
          )
        ) : null}

        {/* ========================================================== ADMIN */}
        {showAdmin ? (
          <>
            <Card className="flex flex-col gap-3.5 px-[18px] py-4">
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
                {[
                  ["in", Users, counts.in, `/ ${counts.all}`, isToday ? "Checked in" : "Checked in that day", "ok"],
                  ["late", AlarmClock, counts.late, "", "Late", "warn"],
                  ["absent", XCircle, counts.absent, "", "Absent", "bad"],
                  ["leave", Plane, counts.leave, "", "On leave", "info"],
                  [null, Clock, avgHours, "h", "Avg. hours", "a"],
                ].map(([key, icon, value, of, label, tone]) => {
                  const on = key && filter === key;
                  const Tag = key ? "button" : "div";
                  return (
                    <Tag
                      key={label}
                      {...(key ? { type: "button", "aria-pressed": on, onClick: () => { setFilter(on ? "all" : key); setSelected([]); } } : {})}
                      className="flex min-w-0 items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors"
                      style={{ background: on ? "var(--g-glassHi)" : "transparent", border: `1px solid ${on ? "var(--g-edge, var(--g-line))" : "transparent"}` }}
                    >
                      <IconTile icon={icon} tone={tone} size={40} iconSize={19} radius={13} />
                      <div className="flex min-w-0 flex-col">
                        <div className="flex items-baseline gap-1"><span className="text-[24px] font-extrabold leading-7">{adminLoading ? "–" : value}</span><span className="text-[12px] font-semibold" style={FNT}>{of}</span></div>
                        <span className="truncate text-[12px] font-semibold" style={MUT}>{label}</span>
                      </div>
                    </Tag>
                  );
                })}
              </div>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]" style={{ background: "var(--g-track)" }} aria-hidden="true">
                {[[counts.present, "var(--g-ok)"], [counts.late + counts.half, "var(--g-warn)"], [counts.leave, "var(--g-info)"], [counts.absent, "var(--g-bad)"]].map(([v, c], i) => (
                  <div key={i} style={{ flex: v, background: c, transition: "flex .4s" }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-3.5 text-[12px] font-semibold" style={MUT}>
                {[["Present", counts.present, "var(--g-ok)"], ["Late / half day", counts.late + counts.half, "var(--g-warn)"], ["On leave", counts.leave, "var(--g-info)"], ["Absent", counts.absent, "var(--g-bad)"]].map(([l, v, c]) => (
                  <span key={l} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: c }} />{l} · {v}</span>
                ))}
                <span className="ml-auto flex items-center gap-1.5">
                  <MapPin size={14} style={{ color: "var(--g-b)" }} aria-hidden="true" />
                  {adminPolicy.geofenceEnabled ? `Geofence ${Number(adminPolicy.officeRadiusMeters || 200)} m` : "Geofence off"}
                  {graceTill !== null ? ` · Grace till ${minutesToClock(graceTill)}` : ""}
                  {Number(adminData.summary?.onBreak || 0) ? ` · ${adminData.summary.onBreak} on break` : ""}
                </span>
              </div>
            </Card>

            <div className="flex flex-wrap items-start gap-3">
              <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3">
                {/* Team list */}
                <Card className="overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5" style={{ borderBottom: "1px solid var(--g-div)" }}>
                    <label className="flex h-[38px] min-w-0 flex-[1_1_200px] items-center gap-2 rounded-[11px] px-3" style={fieldStyle}>
                      <Search size={15} style={FNT} aria-hidden="true" />
                      <input data-bare-input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team member" aria-label="Search team member" className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none" style={{ background: "transparent", border: 0, boxShadow: "none" }} />
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[["all", "All", counts.all], ["in", "In", counts.in], ["late", "Late", counts.late], ["absent", "Absent", counts.absent], ["leave", "Leave", counts.leave]].map(([key, label, n]) => {
                        const on = filter === key;
                        return (
                          <button key={key} type="button" aria-pressed={on} onClick={() => { setFilter(key); setSelected([]); }} className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12.5px] font-bold" style={{ background: on ? "var(--g-ink)" : "var(--g-glassHi)", color: on ? "var(--g-glassHi-solid, #fff)" : "var(--g-ink)", border: `1px solid ${on ? "var(--g-ink)" : "var(--g-edge, var(--g-line))"}` }}>
                            <span style={on ? { color: "var(--g-ink-inverse, #fff)" } : undefined}>{label}</span><span className="text-[11px] opacity-65" style={on ? { color: "var(--g-ink-inverse, #fff)" } : undefined}>{n}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedVisible.length ? (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-white" style={{ background: "var(--g-ink)" }}>
                      <span className="flex-1 text-[13px] font-bold" style={{ color: "var(--g-ink-inverse, #fff)" }}>{selectedVisible.length} selected{bulkBusy ? " · saving…" : ""}</span>
                      {[["PRESENT", "Present", "#7be0b1"], ["LEAVE", "On leave", "#9fbcf5"], ["ABSENT", "Absent", "#ff9f95"]].map(([status, label, color]) => (
                        <button key={status} type="button" disabled={bulkBusy} onClick={() => handleBulkMark(status, label)} className="flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-bold disabled:opacity-60" style={{ background: "rgba(128,128,128,.22)", color: "var(--g-ink-inverse, #fff)" }}>
                          <i className="h-2 w-2 rounded-full" style={{ background: color }} />{label}
                        </button>
                      ))}
                      <button type="button" onClick={() => setSelected([])} className="px-2 text-[12.5px] font-bold opacity-70" style={{ color: "var(--g-ink-inverse, #fff)" }}>Clear</button>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.06em]" style={{ ...FNT, borderBottom: "1px solid var(--g-div)" }}>
                    <SelectBox on={allOn} partial={!allOn && selectedVisible.length > 0} label="Select all" onClick={() => setSelected(allOn ? [] : visibleIds)} />
                    <span className="flex-1">Team member</span>
                    <span className="hidden sm:inline">Mark as</span>
                  </div>

                  {adminLoading ? (
                    <div className="flex items-center justify-center gap-2 p-8 text-[13px]" style={MUT}><Loader2 size={16} className="animate-spin" />Loading team…</div>
                  ) : visibleRows.length ? visibleRows.map((row, index) => {
                    const userId = String(row.user?._id || "");
                    const a = row.attendance || {};
                    const on = selected.includes(userId);
                    const [label, tone] = rowState(a);
                    const worked = a.checkInAt && !a.checkOutAt ? Math.max(0, minutesBetween(a.checkInAt, liveNow) - Number(a.totalBreakMinutes || 0)) : Number(a.workedMinutes || 0);
                    const current = manualStatusSelectValue(a);
                    const busy = markAction === `${userId}:${effectiveAdminDate}` || teamBreakAction === userId || bulkBusy;
                    const avTone = toneForName(row.user?.name);
                    return (
                      <div key={userId || index} className="gl-att-row flex flex-wrap items-center gap-x-3.5 gap-y-2.5 px-4 py-[11px]" style={{ borderTop: index ? "1px solid var(--g-div)" : 0, background: on ? "var(--g-bs)" : "transparent" }}>
                        <div className="flex min-w-0 flex-[1_1_230px] items-center gap-2.5">
                          <SelectBox on={on} label={`Select ${row.user?.name || "member"}`} onClick={() => setSelected((list) => (on ? list.filter((x) => x !== userId) : [...list, userId]))} />
                          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[12px] text-[12px] font-extrabold" style={{ background: T[avTone][1], color: T[avTone][0] }}>
                            <AvatarFace user={row.user} initials={getInitials(row.user?.name)} />
                          </span>
                          <div className="flex min-w-0 flex-col">
                            <button type="button" onClick={() => navigate(`/admin/users/${userId}`)} className="truncate text-left text-[13.5px] font-bold hover:underline">{row.user?.name || "-"}</button>
                            <span className="truncate text-[11.5px] capitalize" style={MUT}>{String(row.user?.role || "").replaceAll("_", " ").toLowerCase() || "-"}</span>
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-[1_1_200px] items-center gap-3">
                          <Pill tone={tone} dot>{label}</Pill>
                          <div className="flex min-w-[70px] flex-1 flex-col gap-1">
                            <span className="truncate font-mono text-[12px]" style={MUT}>
                              {a.checkInAt ? `In ${formatTimeOnly(a.checkInAt)}${a.checkOutAt ? ` · out ${formatTimeOnly(a.checkOutAt)}` : ""} · ${formatDuration(worked)}` : worked > 0 ? `Marked by admin · ${formatDuration(worked)}` : "No check-in"}
                              {a.isOnBreak && a.activeBreakStartedAt ? ` · break ${minutesBetween(a.activeBreakStartedAt, liveNow)}m` : ""}
                            </span>
                            <div className="h-1 overflow-hidden rounded-sm" style={{ background: "var(--g-track)" }}>
                              <div className="h-full" style={{ width: `${Math.min(100, (worked / fullDay) * 100)}%`, background: worked >= fullDay * 0.8 ? "var(--g-ok)" : "var(--g-warn)" }} />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-none items-center gap-1.5">
                          <div className="flex gap-0.5 rounded-[10px] p-[3px]" style={{ background: "var(--g-track)" }} role="group" aria-label={`Mark ${row.user?.name || "member"}`}>
                            {MARKS.map(([status, short, title, markTone]) => {
                              const act = current === status;
                              return (
                                <button key={status} type="button" title={title} aria-label={`${title}${act ? " (current)" : ""}`} aria-pressed={act} disabled={busy} onClick={() => !act && handleMark(row, status)} className="grid h-7 w-[38px] place-items-center rounded-[8px] text-[12px] font-extrabold disabled:cursor-wait" style={{ background: act ? T[markTone][0] : "transparent", color: act ? "#fff" : "var(--g-mut)", boxShadow: act ? "0 2px 6px rgba(0,0,0,.12)" : "none" }}>
                                  {short}
                                </button>
                              );
                            })}
                          </div>
                          <span className="relative inline-flex">
                            <button type="button" aria-label={`More for ${row.user?.name || "member"}`} aria-expanded={openRowMenu === userId} onClick={() => setOpenRowMenu((cur) => (cur === userId ? "" : userId))} className="grid h-[34px] w-[34px] place-items-center rounded-[10px]" style={tile}>
                              <MoreVertical size={15} />
                            </button>
                            {openRowMenu === userId ? (
                              <>
                                <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpenRowMenu("")} />
                                <div className="absolute right-0 top-10 z-20 w-60 rounded-[14px] p-2 text-left shadow-lg" style={{ background: "var(--g-modal)", border: "1px solid var(--g-line)", backdropFilter: "blur(var(--g-blur))" }} role="menu">
                                  {MORE_MARKS.map((option) => (
                                    <button key={option.value} type="button" role="menuitem" disabled={busy || current === option.value} onClick={() => { setOpenRowMenu(""); handleMark(row, option.value); }} className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-[13px] font-semibold hover:bg-[var(--g-bs)] disabled:opacity-50">
                                      <CalendarOff size={14} style={FNT} />Mark {option.label}{current === option.value ? <Check size={14} className="ml-auto" /> : null}
                                    </button>
                                  ))}
                                  {a.checkInAt && !a.checkOutAt ? (
                                    a.isOnBreak ? (
                                      <button type="button" role="menuitem" onClick={() => { setOpenRowMenu(""); handleTeamBreak(row, "END"); }} className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-[13px] font-semibold hover:bg-[var(--g-bs)]" style={{ color: "var(--g-ok)" }}>
                                        <PlayCircle size={14} />End break<span className="ml-auto font-mono text-[12px] font-normal" style={MUT}>{minutesBetween(a.activeBreakStartedAt, liveNow)}m</span>
                                      </button>
                                    ) : (
                                      <div className="px-2 py-1.5">
                                        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide" style={FNT}>Start a break</span>
                                        <div className="flex items-center gap-1.5">
                                          <select aria-label="Break type" value={teamBreakTypes[userId] || "UTILITY"} onChange={(event) => setTeamBreakTypes((v) => ({ ...v, [userId]: event.target.value }))} className="h-8 min-w-0 flex-1 rounded-[9px] px-2 text-[12.5px] font-semibold outline-none" style={fieldStyle}>
                                            {BREAK_OPTIONS.map(([value]) => <option key={value} value={value}>{BREAK_TYPE_LABELS[value]}</option>)}
                                          </select>
                                          <button type="button" onClick={() => { setOpenRowMenu(""); handleTeamBreak(row, "START"); }} className="flex h-8 items-center gap-1 rounded-[9px] px-2.5 text-[12.5px] font-bold" style={{ background: T.warn[1], color: T.warn[0] }}>
                                            <PauseCircle size={13} />Start
                                          </button>
                                        </div>
                                      </div>
                                    )
                                  ) : null}
                                  {a.checkInAt ? (
                                    <button type="button" role="menuitem" onClick={() => { setOpenRowMenu(""); setBreakCorrectionRow(row); }} className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-[13px] font-semibold hover:bg-[var(--g-bs)]">
                                      <Timer size={14} style={FNT} />Manage breaks
                                    </button>
                                  ) : null}
                                  <button type="button" role="menuitem" onClick={() => { setOpenRowMenu(""); navigate(`/admin/users/${userId}`); }} className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-[13px] font-semibold hover:bg-[var(--g-bs)]">
                                    <UserCheck size={14} style={FNT} />Open profile
                                  </button>
                                </div>
                              </>
                            ) : null}
                          </span>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="p-8 text-center text-[13px]" style={MUT}>{teamRows.length ? "Nobody matches this filter." : "No team members for this day."}</div>
                  )}
                  <div className="flex items-center gap-2 px-4 py-2.5 text-[12px]" style={{ ...MUT, borderTop: "1px solid var(--g-div)" }}>
                    <Info size={15} aria-hidden="true" />P present · H half day · A absent · L leave — saves instantly. More (week off, holiday, breaks) under ⋮.
                  </div>
                </Card>

                <AttendanceViolations month={effectiveAdminDate.slice(0, 7) || month} canReview variant="team" />
              </div>

              <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
                {/* Approvals */}
                <Card className="overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3.5" style={{ borderBottom: "1px solid var(--g-div)" }}>
                    <span className="flex-1 text-[15px] font-extrabold">Team approvals</span>
                    <div className="flex rounded-[10px] p-[3px]" style={{ background: "var(--g-track)" }} role="group" aria-label="Approval view">
                      {[["PENDING", `Pending${pendingApprovals.length ? ` ${pendingApprovals.length}` : ""}`], ["", "History"]].map(([value, label]) => (
                        <button key={label} type="button" aria-pressed={adminLeaveStatusFilter === value} onClick={() => setAdminLeaveStatusFilter(value)} className="rounded-[8px] px-2.5 py-1 text-[12px] font-bold" style={segBtn(adminLeaveStatusFilter === value)}>{label}</button>
                      ))}
                    </div>
                  </div>
                  {adminWorkflowLoading ? (
                    <div className="flex items-center gap-2 px-4 py-5 text-[13px]" style={MUT}><Loader2 size={15} className="animate-spin" />Loading…</div>
                  ) : approvalsShown.length ? approvalsShown.map((row, index) => {
                    const status = String(row.status || "PENDING").toUpperCase();
                    const days = row.fromDate && row.toDate ? Math.round((parseDateKey(row.toDate) - parseDateKey(row.fromDate)) / 86400000) + 1 : 1;
                    return (
                      <div key={String(row._id)} className="flex flex-col gap-2.5 px-4 py-3" style={{ borderTop: index ? "1px solid var(--g-div)" : 0 }}>
                        <div className="flex gap-2.5">
                          <IconTile icon={Plane} tone="info" size={34} iconSize={16} />
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-[13px] font-bold">Leave · {row.user?.name || "-"}</span>
                            <span className="text-[11.5px] leading-4" style={MUT}>
                              {readable(row.leaveType || "CASUAL")}, {formatDateShort(row.fromDate)}{row.toDate && row.toDate !== row.fromDate ? `–${formatDateShort(row.toDate)}` : ""} ({days} day{days === 1 ? "" : "s"}){row.reason ? ` — “${row.reason}”` : ""}
                            </span>
                          </div>
                          {status !== "PENDING" ? <Pill tone={status === "APPROVED" ? "ok" : status === "REJECTED" ? "bad" : "mut"}>{readable(status)}</Pill> : null}
                        </div>
                        {status === "PENDING" ? (
                          <div className="flex gap-1.5">
                            <button type="button" disabled={Boolean(reviewAction)} onClick={() => handleReviewLeave(row._id, "REJECTED")} className="h-8 flex-1 rounded-[9px] text-[12px] font-bold disabled:opacity-60" style={{ ...tile, color: "var(--g-bad)" }}>Reject</button>
                            <button type="button" disabled={Boolean(reviewAction)} onClick={() => handleReviewLeave(row._id, "APPROVED")} className="h-8 flex-1 rounded-[9px] text-[12px] font-bold text-white disabled:opacity-60" style={{ background: "var(--g-bfill)" }}>Approve</button>
                          </div>
                        ) : null}
                      </div>
                    );
                  }) : (
                    <div className="flex items-center gap-2.5 px-4 py-5 text-[13px] font-bold" style={{ color: "var(--g-ok)" }}>
                      <CheckCheck size={20} />{adminLeaveStatusFilter === "PENDING" ? "No pending requests" : "Nothing in the history"}
                    </div>
                  )}
                </Card>

                {/* Policy & offices */}
                <Card className="flex flex-col gap-1 px-4 py-3.5">
                  <span className="pb-1.5 text-[15px] font-extrabold">Policy &amp; offices</span>
                  {policyRows.map(([key, icon, label, value]) => (
                    <button key={label} type="button" onClick={() => setSheet(key)} className="flex items-center gap-2.5 rounded-[12px] px-2 py-2.5 text-left transition-colors hover:bg-[var(--g-glassHi)]">
                      <IconTile icon={icon} tone="a" size={32} iconSize={16} radius={10} />
                      <div className="flex min-w-0 flex-1 flex-col"><span className="text-[13px] font-bold">{label}</span><span className="truncate text-[11.5px]" style={MUT}>{value}</span></div>
                      <ChevronRight size={15} style={FNT} />
                    </button>
                  ))}
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Policy editors */}
      {sheet === "geofence" ? (
        <Sheet title="Geofence · main office" onClose={() => setSheet("")}>
          <form onSubmit={handleSaveAttendancePolicy} className="flex flex-col gap-3">
            <ToastNotice message={policyError} type="error" />
            <label className="flex items-center gap-2.5 rounded-[12px] px-3 py-3 text-[13.5px] font-bold" style={tile}>
              <input type="checkbox" checked={Boolean(policyForm.geofenceEnabled)} onChange={(event) => setPolicyForm((prev) => ({ ...prev, geofenceEnabled: event.target.checked }))} />
              Only allow check-in near an office
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {[["officeLatitude", "Office latitude"], ["officeLongitude", "Office longitude"]].map(([key, label]) => (
                <label key={key} className="flex min-w-0 flex-col gap-1">
                  <span className="text-[12px] font-bold" style={MUT}>{label}</span>
                  <input type="number" step="any" value={policyForm[key]} onChange={(event) => setPolicyForm((prev) => ({ ...prev, [key]: event.target.value }))} className="h-10 min-w-0 rounded-[11px] px-3 text-[13px] outline-none" style={fieldStyle} />
                </label>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold" style={MUT}>Allowed radius (meters)</span>
              <input type="number" min="10" max="5000" value={policyForm.officeRadiusMeters} onChange={(event) => setPolicyForm((prev) => ({ ...prev, officeRadiusMeters: event.target.value }))} className="h-10 rounded-[11px] px-3 text-[13px] outline-none" style={fieldStyle} />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={handleUseCurrentOfficeLocation} disabled={policySaving} className="flex h-11 items-center gap-2 rounded-[12px] px-3.5 text-[13px] font-bold disabled:opacity-60" style={tile}><MapPin size={15} />Use current</button>
              <PrimaryButton type="submit" disabled={policySaving} className="h-11 flex-1">{policySaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Save</PrimaryButton>
            </div>
            <p className="flex items-start gap-2 text-[12px] leading-relaxed" style={MUT}>
              <Info size={14} className="mt-px shrink-0" />Team members can only check in within the radius of the main office, or of another office they are allowed at. Break time is excluded from working hours, and check-out works from anywhere.
            </p>
          </form>
        </Sheet>
      ) : null}
      {sheet === "offices" ? (
        <Sheet title="Other offices" onClose={() => { setSheet(""); loadAttendancePolicy(); }}>
          <AttendanceOfficesPanel requestLocation={() => requestAttendanceLocation({ required: true })} />
        </Sheet>
      ) : null}
      {sheet === "calendar" && attendancePolicy ? (
        <Sheet title="Half day & holidays" onClose={() => setSheet("")}>
          <WorkCalendarPanel
            key={`work-calendar-${attendancePolicy.halfDayCheckInCutoffMinutes}-${(attendancePolicy.holidays || []).length}`}
            policy={attendancePolicy}
            onSaved={(next) => next && setAttendancePolicy(next)}
            cardClass="rounded-[18px] border border-[var(--g-line)] bg-[var(--g-glass)]"
            cardHeaderClass="flex flex-wrap items-center gap-3 border-b border-[var(--g-div)] px-4 py-3"
            fieldClass="h-10 rounded-[11px] border px-3 text-[13px] font-semibold outline-none"
            primaryButtonClass="inline-flex items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-4 py-2 text-[14px] font-bold text-white disabled:opacity-60"
          />
        </Sheet>
      ) : null}

      {breakCorrectionRow && isAdminViewer ? (
        <BreakCorrectionDialog
          row={breakCorrectionRow}
          date={effectiveAdminDate}
          onClose={() => setBreakCorrectionRow(null)}
          onSaved={() => {
            setBreakCorrectionRow(null);
            setSuccess("Break saved. The correction has been recorded in the audit history.");
            loadAdminAttendance({ quiet: true });
            if (canUsePersonalAttendance) loadMyAttendance({ quiet: true });
          }}
        />
      ) : null}
    </div>
  );
};

// White-on-accent action button used inside the today card.
const HeroButton = ({ primary = false, busy = false, icon: Icon, children, className = "", ...rest }) => (
  <button
    type="button"
    className={`flex h-[46px] min-w-0 flex-[1_1_140px] items-center justify-center gap-2 rounded-[14px] text-[14px] font-extrabold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    style={primary ? { background: "#fff", color: "rgb(var(--blue-700))" } : { background: "rgba(255,255,255,.16)", color: "#fff" }}
    {...rest}
  >
    {busy ? <Loader2 size={18} className="animate-spin" /> : Icon ? React.createElement(Icon, { size: 18 }) : null}
    {children}
  </button>
);

export default AttendanceHub;
