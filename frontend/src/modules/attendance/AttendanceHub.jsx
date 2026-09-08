import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardCheck,
  CheckCircle2,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  PauseCircle,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import {
  checkInAttendance,
  checkOutAttendance,
  createLeaveRequest,
  endBreakAttendance,
  getAdminLeaveRequests,
  getDailyAttendanceForAdmin,
  getAttendancePolicy,
  getMyLeaveRequests,
  getMyAttendance,
  reviewLeaveRequest,
  startBreakAttendance,
  updateAttendancePolicy,
  updateUserAttendanceStatus,
} from "../../services/attendanceService";
import { toErrorMessage } from "../../utils/errorMessage";
import ToastNotice from "../../components/ui/ToastNotice";
import BreakCorrectionDialog from "./BreakCorrectionDialog";

const ADMIN_VIEW_ROLES = new Set([
  "ADMIN",
  "MANAGER",
]);

const STATUS_STYLES = {
  PRESENT: "bg-emerald-100 text-emerald-700 border-emerald-200",
  WORKING: "bg-emerald-100 text-emerald-700 border-emerald-200",
  BREAK: "bg-indigo-100 text-indigo-700 border-indigo-200",
  LATE: "bg-yellow-100 text-yellow-700 border-yellow-200",
  HALF_DAY: "bg-blue-100 text-blue-700 border-blue-200",
  LEAVE: "bg-teal-100 text-teal-700 border-teal-200",
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  ABSENT: "bg-rose-100 text-rose-700 border-rose-200",
  MISSED_CHECK_OUT: "bg-orange-100 text-orange-700 border-orange-200",
};

const LEAVE_TYPE_OPTIONS = ["CASUAL", "SICK", "EMERGENCY", "UNPAID", "OTHER"];
const MANUAL_ATTENDANCE_STATUS_OPTIONS = [
  { label: "Present", value: "PRESENT" },
  { label: "Half Day", value: "HALF_DAY" },
  { label: "Absent", value: "ABSENT" },
];

const getRoleFromStorage = () =>
  String(localStorage.getItem("role") || "").trim().toUpperCase();

const toLocalDateInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toMonthInputValue = (value = new Date()) =>
  toLocalDateInputValue(value).slice(0, 7);

const formatDateLabel = (value) => {
  if (!value) return "-";
  const [yearRaw, monthRaw, dayRaw] = String(value).split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return value;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateShort = (value) => {
  if (!value) return "-";
  const [yearRaw, monthRaw, dayRaw] = String(value).split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return formatDateLabel(value);
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return formatDateLabel(value);
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

const formatTimeOnly = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatDuration = (minutes) => {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}h ${mins}m`;
};

const getInitials = (name = "") => {
  const parts = String(name || "-").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "-";
};

const statCardClass = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
const cardClass = "rounded-lg border border-slate-200 bg-white shadow-sm";
const cardHeaderClass = "flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3";
const cardBodyClass = "p-4";
const fieldClass = "h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const secondaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-blue-700 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

const statusBadgeClass = (status) =>
  STATUS_STYLES[status] || "bg-slate-100 text-slate-700 border-slate-200";

const formatAttendanceStatus = (status) => {
  const normalized = String(status || "ABSENT").trim().toUpperCase();
  if (normalized === "PRESENT") return "Present";
  if (normalized === "WORKING") return "Working";
  if (normalized === "BREAK") return "Break";
  if (normalized === "LATE") return "Working";
  return normalized.replaceAll("_", " ");
};

const EMPTY_POLICY_FORM = {
  geofenceEnabled: false,
  officeLatitude: "",
  officeLongitude: "",
  officeRadiusMeters: 200,
};
const GEOLOCATION_RETRY_ACCURACY_METERS = 150;

const toLocationPayload = (coords = {}) => ({
  latitude: coords.latitude,
  longitude: coords.longitude,
  accuracy: coords.accuracy,
});

const readCurrentPosition = (options) =>
  new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toLocationPayload(position.coords || {})),
      reject,
      options,
    );
  });

const hasGoodLocationAccuracy = (location) => {
  const accuracy = Number(location?.accuracy);
  return Number.isFinite(accuracy) && accuracy <= GEOLOCATION_RETRY_ACCURACY_METERS;
};

const pickBetterLocation = (first, second) => {
  const firstAccuracy = Number(first?.accuracy);
  const secondAccuracy = Number(second?.accuracy);
  if (!first) return second || null;
  if (!second) return first;
  if (!Number.isFinite(firstAccuracy)) return second;
  if (!Number.isFinite(secondAccuracy)) return first;
  return secondAccuracy < firstAccuracy ? second : first;
};

const requestAttendanceLocation = async ({ required = false } = {}) => {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    if (required) {
      throw new Error("Location is required but this browser does not support geolocation");
    }
    return null;
  }

  try {
    const firstLocation = await readCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
    if (hasGoodLocationAccuracy(firstLocation)) return firstLocation;

    try {
      const secondLocation = await readCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });
      return pickBetterLocation(firstLocation, secondLocation);
    } catch {
      return firstLocation;
    }
  } catch {
    if (required) {
      throw new Error("Please allow location access to mark attendance");
    }
    return null;
  }
};

const formatDistance = (meters) => {
  const safeMeters = Number(meters);
  if (!Number.isFinite(safeMeters)) return "-";
  if (safeMeters >= 1000) return `${(safeMeters / 1000).toFixed(2)} km`;
  return `${Math.round(safeMeters)} m`;
};

const AttendanceHub = () => {
  const navigate = useNavigate();
  const [viewerRole] = useState(getRoleFromStorage);
  const isAdminViewer = ADMIN_VIEW_ROLES.has(viewerRole);
  const canUsePersonalAttendance = viewerRole !== "ADMIN";
  const [showTeamHistory, setShowTeamHistory] = useState(viewerRole === "ADMIN");
  const showPersonalHistory = canUsePersonalAttendance && !showTeamHistory;
  const [breakCorrectionRow, setBreakCorrectionRow] = useState(null);

  const [month, setMonth] = useState(toMonthInputValue(new Date()));
  const [myLoading, setMyLoading] = useState(true);
  const [myRefreshing, setMyRefreshing] = useState(false);
  const [attendanceAction, setAttendanceAction] = useState("");
  const [myError, setMyError] = useState("");
  const [mySuccess, setMySuccess] = useState("");
  const [myData, setMyData] = useState({
    timezone: "",
    today: null,
    policy: null,
    summary: {},
    attendance: [],
  });

  const [adminDate, setAdminDate] = useState(toLocalDateInputValue(new Date()));
  const [adminStatus, setAdminStatus] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminRefreshing, setAdminRefreshing] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [manualStatusAction, setManualStatusAction] = useState("");
  const [adminData, setAdminData] = useState({
    timezone: "",
    date: "",
    summary: {},
    attendance: [],
  });
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [attendancePolicy, setAttendancePolicy] = useState(null);
  const [policyForm, setPolicyForm] = useState(EMPTY_POLICY_FORM);

  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveForm, setLeaveForm] = useState({
    fromDate: toLocalDateInputValue(new Date()),
    toDate: toLocalDateInputValue(new Date()),
    leaveType: "CASUAL",
    reason: "",
  });

  const openUserProfile = useCallback(
    (targetUserId) => {
      const normalizedUserId = String(targetUserId || "").trim();
      if (!normalizedUserId) return;
      navigate(`/admin/users/${normalizedUserId}`);
    },
    [navigate],
  );

  const [adminWorkflowLoading, setAdminWorkflowLoading] = useState(false);
  const [adminLeaveRequests, setAdminLeaveRequests] = useState([]);
  const [adminLeaveStatusFilter, setAdminLeaveStatusFilter] = useState("PENDING");
  const [reviewAction, setReviewAction] = useState("");

  const loadMyAttendance = useCallback(async ({ quiet = false } = {}) => {
    if (!canUsePersonalAttendance) {
      setMyLoading(false);
      setMyRefreshing(false);
      return;
    }

    if (quiet) {
      setMyRefreshing(true);
    } else {
      setMyLoading(true);
    }
    setMyError("");

    try {
      const payload = await getMyAttendance({ month });
      setMyData({
        timezone: payload.timezone || "",
        today: payload.today || null,
        policy: payload.policy || null,
        summary: payload.summary || {},
        attendance: Array.isArray(payload.attendance) ? payload.attendance : [],
      });
    } catch (error) {
      setMyError(toErrorMessage(error, "Failed to load attendance"));
    } finally {
      setMyLoading(false);
      setMyRefreshing(false);
    }
  }, [canUsePersonalAttendance, month]);

  const loadAdminAttendance = useCallback(async ({
    quiet = false,
    date = adminDate,
    status = adminStatus,
  } = {}) => {
    if (!isAdminViewer) return;

    if (quiet) {
      setAdminRefreshing(true);
    } else {
      setAdminLoading(true);
    }
    setAdminError("");

    try {
      const payload = await getDailyAttendanceForAdmin({
        date,
        ...(status ? { status } : {}),
      });
      setAdminData({
        timezone: payload.timezone || "",
        date: payload.date || date,
        summary: payload.summary || {},
        attendance: Array.isArray(payload.attendance) ? payload.attendance : [],
      });
    } catch (error) {
      setAdminError(toErrorMessage(error, "Failed to load team attendance"));
    } finally {
      setAdminLoading(false);
      setAdminRefreshing(false);
    }
  }, [adminDate, adminStatus, isAdminViewer]);

  const loadLeaveRequestsData = useCallback(async () => {
    if (!canUsePersonalAttendance) {
      setLeaveLoading(false);
      return;
    }

    setLeaveLoading(true);
    try {
      const rows = await getMyLeaveRequests();
      setLeaveRequests(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setMyError(toErrorMessage(error, "Failed to load leave requests"));
    } finally {
      setLeaveLoading(false);
    }
  }, [canUsePersonalAttendance]);

  const loadAdminWorkflowData = useCallback(async () => {
    if (!isAdminViewer) return;

    setAdminWorkflowLoading(true);
    try {
      const leaveRows = await getAdminLeaveRequests({
        ...(adminLeaveStatusFilter ? { status: adminLeaveStatusFilter } : {}),
      });
      setAdminLeaveRequests(Array.isArray(leaveRows) ? leaveRows : []);
    } catch (error) {
      setAdminError(toErrorMessage(error, "Failed to load review workflows"));
    } finally {
      setAdminWorkflowLoading(false);
    }
  }, [adminLeaveStatusFilter, isAdminViewer]);

  const loadAttendancePolicy = useCallback(async () => {
    if (!isAdminViewer) return;

    setPolicyLoading(true);
    try {
      const policy = await getAttendancePolicy();
      setAttendancePolicy(policy || null);
      setPolicyForm({
        geofenceEnabled: Boolean(policy?.geofenceEnabled),
        officeLatitude: policy?.officeLatitude ?? "",
        officeLongitude: policy?.officeLongitude ?? "",
        officeRadiusMeters: Number(policy?.officeRadiusMeters || 200),
      });
    } catch (error) {
      setPolicyError(toErrorMessage(error, "Failed to load attendance policy"));
    } finally {
      setPolicyLoading(false);
    }
  }, [isAdminViewer]);

  useEffect(() => {
    loadMyAttendance();
  }, [loadMyAttendance]);

  useEffect(() => {
    if (!isAdminViewer) return;
    loadAdminAttendance();
  }, [isAdminViewer, loadAdminAttendance]);

  useEffect(() => {
    loadLeaveRequestsData();
  }, [loadLeaveRequestsData]);

  useEffect(() => {
    if (!isAdminViewer) return;
    loadAdminWorkflowData();
  }, [isAdminViewer, loadAdminWorkflowData]);

  useEffect(() => {
    if (!isAdminViewer) return;
    loadAttendancePolicy();
  }, [isAdminViewer, loadAttendancePolicy]);

  useEffect(() => {
    if (!mySuccess) return undefined;
    const timer = setTimeout(() => setMySuccess(""), 2000);
    return () => clearTimeout(timer);
  }, [mySuccess]);

  const todayAttendance = myData.today;
  const canCheckIn = canUsePersonalAttendance && !todayAttendance?.checkInAt;
  const canCheckOut = canUsePersonalAttendance && Boolean(todayAttendance?.checkInAt) && !todayAttendance?.checkOutAt;
  const isOnBreak = Boolean(todayAttendance?.isOnBreak);
  const canStartBreak =
    canUsePersonalAttendance
    && Boolean(todayAttendance?.checkInAt)
    && !todayAttendance?.checkOutAt
    && !isOnBreak;
  const canEndBreak =
    canUsePersonalAttendance
    && Boolean(todayAttendance?.checkInAt)
    && !todayAttendance?.checkOutAt
    && isOnBreak;

  const handleCheckIn = async () => {
    if (!canUsePersonalAttendance) return;

    try {
      setAttendanceAction("checkin");
      setMyError("");
      const location = await requestAttendanceLocation({
        required: Boolean(myData.policy?.geofenceEnabled),
      });
      const result = await checkInAttendance({
        source: "WEB",
        ...(location ? { location } : {}),
      });
      setMySuccess(result.message || "Checked in successfully");
      await loadMyAttendance({ quiet: true });
      if (isAdminViewer) {
        await loadAdminAttendance({ quiet: true });
      }
    } catch (error) {
      setMyError(toErrorMessage(error, "Check-in failed"));
    } finally {
      setAttendanceAction("");
    }
  };

  const handleCheckOut = async () => {
    if (!canUsePersonalAttendance) return;

    if (typeof window !== "undefined") {
      const warningLines = [
        "Are you sure you want to check out for today?",
        "After check-out, you cannot check in again today.",
      ];
      if (todayAttendance?.isOnBreak) {
        warningLines.push("You are currently on break. This check-out will end the active break.");
      }
      const shouldProceed = window.confirm(warningLines.join("\n"));
      if (!shouldProceed) return;
    }

    try {
      setAttendanceAction("checkout");
      setMyError("");
      const location = await requestAttendanceLocation({
        required: Boolean(myData.policy?.geofenceEnabled),
      });
      const result = await checkOutAttendance({
        source: "WEB",
        ...(location ? { location } : {}),
      });
      setMySuccess(result.message || "Checked out successfully");
      await loadMyAttendance({ quiet: true });
      if (isAdminViewer) {
        await loadAdminAttendance({ quiet: true });
      }
    } catch (error) {
      setMyError(toErrorMessage(error, "Check-out failed"));
    } finally {
      setAttendanceAction("");
    }
  };

  const handleSaveAttendancePolicy = async (event) => {
    event.preventDefault();
    if (!isAdminViewer) return;

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
      setPolicyForm({
        geofenceEnabled: Boolean(result.policy?.geofenceEnabled),
        officeLatitude: result.policy?.officeLatitude ?? "",
        officeLongitude: result.policy?.officeLongitude ?? "",
        officeRadiusMeters: Number(result.policy?.officeRadiusMeters || 200),
      });
      setMySuccess(result.message || "Attendance policy updated");
    } catch (error) {
      setPolicyError(toErrorMessage(error, "Failed to save attendance policy"));
    } finally {
      setPolicySaving(false);
    }
  };

  const handleUseCurrentOfficeLocation = async () => {
    if (!isAdminViewer) return;

    try {
      setPolicySaving(true);
      setPolicyError("");
      const location = await requestAttendanceLocation({ required: true });
      setPolicyForm((prev) => ({
        ...prev,
        officeLatitude: Number(location.latitude).toFixed(6),
        officeLongitude: Number(location.longitude).toFixed(6),
      }));
    } catch (error) {
      setPolicyError(toErrorMessage(error, "Failed to read current location"));
    } finally {
      setPolicySaving(false);
    }
  };

  const handleStartBreak = async () => {
    if (!canUsePersonalAttendance) return;

    try {
      setAttendanceAction("breakstart");
      setMyError("");
      const result = await startBreakAttendance({ source: "WEB" });
      setMySuccess(result.message || "Break started");
      await loadMyAttendance({ quiet: true });
      if (isAdminViewer) {
        await loadAdminAttendance({ quiet: true });
      }
    } catch (error) {
      setMyError(toErrorMessage(error, "Failed to start break"));
    } finally {
      setAttendanceAction("");
    }
  };

  const handleEndBreak = async () => {
    if (!canUsePersonalAttendance) return;

    try {
      setAttendanceAction("breakend");
      setMyError("");
      const result = await endBreakAttendance({ source: "WEB" });
      setMySuccess(result.message || "Break ended");
      await loadMyAttendance({ quiet: true });
      if (isAdminViewer) {
        await loadAdminAttendance({ quiet: true });
      }
    } catch (error) {
      setMyError(toErrorMessage(error, "Failed to end break"));
    } finally {
      setAttendanceAction("");
    }
  };

  const handleSubmitLeaveRequest = async (event) => {
    event.preventDefault();
    if (!canUsePersonalAttendance) return;

    const fromDate = String(leaveForm.fromDate || "").trim();
    const toDate = String(leaveForm.toDate || "").trim();
    const reason = String(leaveForm.reason || "").trim();

    if (!fromDate || !toDate) {
      setMyError("Please select leave start and end date.");
      return;
    }
    if (fromDate > toDate) {
      setMyError("Leave start date cannot be after end date.");
      return;
    }
    if (!reason) {
      setMyError("Please enter leave reason.");
      return;
    }

    try {
      setLeaveSubmitting(true);
      setMyError("");
      const result = await createLeaveRequest({
        fromDate,
        toDate,
        leaveType: leaveForm.leaveType,
        reason,
      });
      setMySuccess(result.message || "Leave request created");
      setLeaveForm((prev) => ({
        ...prev,
        reason: "",
      }));
      await Promise.all([
        loadLeaveRequestsData(),
        loadMyAttendance({ quiet: true }),
        isAdminViewer ? loadAdminAttendance({ quiet: true }) : Promise.resolve(),
        isAdminViewer ? loadAdminWorkflowData() : Promise.resolve(),
      ]);
    } catch (error) {
      setMyError(toErrorMessage(error, "Failed to create leave request"));
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleReviewLeave = async (requestId, status) => {
    if (!requestId || !status) return;
    const actionKey = `leave:${requestId}:${status}`;
    const reviewNoteInput = typeof window !== "undefined"
      ? window.prompt(`Optional note for ${status.toLowerCase()} action`, "")
      : "";
    if (reviewNoteInput === null) return;

    try {
      setReviewAction(actionKey);
      setAdminError("");
      const result = await reviewLeaveRequest(requestId, {
        status,
        reviewNote: String(reviewNoteInput || "").trim(),
      });
      setMySuccess(result.message || "Leave request updated");
      await Promise.all([
        loadAdminWorkflowData(),
        loadMyAttendance({ quiet: true }),
        loadLeaveRequestsData(),
        loadAdminAttendance({ quiet: true }),
      ]);
    } catch (error) {
      setAdminError(toErrorMessage(error, "Failed to review leave request"));
    } finally {
      setReviewAction("");
    }
  };

  const handleManualStatusChange = async (row, nextStatus) => {
    const userId = String(row?.user?._id || "").trim();
    const date = String(adminData.date || adminDate || "").trim();
    if (!userId || !date || !nextStatus) return;

    const actionKey = `${userId}:${date}`;
    try {
      setManualStatusAction(actionKey);
      setAdminError("");
      const result = await updateUserAttendanceStatus(userId, date, {
        status: nextStatus,
      });
      setMySuccess(result.message || "Attendance status updated");
      await loadAdminAttendance({
        quiet: true,
        date: adminDate,
        status: adminStatus,
      });
    } catch (error) {
      setAdminError(toErrorMessage(error, "Failed to update attendance status"));
    } finally {
      setManualStatusAction("");
    }
  };

  const todayStatus = todayAttendance?.status || "ABSENT";
  const todayWorkedMinutes = Number(todayAttendance?.workedMinutes || 0);
  const todayBreakSessions = Array.isArray(todayAttendance?.breakSessions)
    ? todayAttendance.breakSessions
    : [];

  const mySummaryCards = useMemo(() => {
    const summary = myData.summary || {};
    const totalDays = Number(summary.totalDays || 0);
    const presentDays = Number(summary.presentDays || 0);
    const workingDays = totalDays || Number(summary.workingDays || 0);
    const averageHours = presentDays
      ? (Number(summary.totalWorkedHours || 0) / presentDays).toFixed(1)
      : "0.0";
    return [
      {
        key: "presentDays",
        label: "Present",
        value: presentDays,
        detail: `of ${workingDays || totalDays} working days`,
      },
      {
        key: "lateDays",
        label: "Late",
        value: Number(summary.lateDays || 0),
        detail: "After 9:30 AM",
      },
      {
        key: "leaveDays",
        label: "Leave taken",
        value: Number(summary.leaveDays || 0),
        detail: `${Math.max(0, 10 - Number(summary.leaveDays || 0))} remaining`,
      },
      {
        key: "averageHours",
        label: "Avg. hours",
        value: averageHours,
        detail: "Target 9.0",
      },
    ];
  }, [myData.summary]);

  const adminSummaryCards = useMemo(() => {
    const summary = adminData.summary || {};
    const totalUsers = Number(summary.totalUsers || 0);
    const checkedIn = Number(summary.checkedIn || 0);
    const leave = Number(summary.leave || 0);
    const absent = Number(summary.absent || 0);
    const onBreak = Number(summary.onBreak || 0);
    const workedRows = adminData.attendance
      .map((row) => Number(row.attendance?.workedMinutes || 0))
      .filter((minutes) => minutes > 0);
    const averageHours = workedRows.length
      ? (workedRows.reduce((sum, minutes) => sum + minutes, 0) / workedRows.length / 60).toFixed(1)
      : "0.0";

    return [
      {
        key: "checkedIn",
        label: "Present",
        value: checkedIn,
        detail: `of ${totalUsers} users`,
      },
      {
        key: "onBreak",
        label: "Late",
        value: onBreak,
        detail: "On break now",
      },
      {
        key: "leave",
        label: "Leave taken",
        value: leave,
        detail: `${absent} absent today`,
      },
      {
        key: "averageHours",
        label: "Avg. hours",
        value: averageHours,
        detail: "Visible team rows",
      },
    ];
  }, [adminData.attendance, adminData.summary]);

  const todayDateKey = toLocalDateInputValue(new Date());
  const todayClockLabel = formatTimeOnly(todayAttendance?.checkInAt);
  const todayLocationLabel = todayAttendance?.checkInLocation
    ? `Office radius ${formatDistance(todayAttendance.checkInLocation.distanceMeters)}`
    : "Andheri branch";
  const pendingAdminLeaveRequests = adminLeaveRequests.filter((row) => row.status === "PENDING");
  const visibleAdminLeaveRequests = pendingAdminLeaveRequests.length
    ? pendingAdminLeaveRequests.slice(0, 2)
    : adminLeaveRequests.slice(0, 2);

  return (
    <div className="attendance-doc-screen ui-page-shell custom-scrollbar bg-slate-50/70 text-slate-900">
      <ToastNotice message={myError} type="error" />
      <ToastNotice message={mySuccess} type="success" />
      <ToastNotice message={adminError} type="error" />

      {myLoading && canUsePersonalAttendance ? (
        <div className={`${cardClass} flex h-40 items-center justify-center text-sm text-slate-500`}>
          <Loader2 size={18} className="mr-2 animate-spin" />
          Loading attendance...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col gap-4">
            <section className={cardClass}>
              <div className={`${cardBodyClass} flex flex-wrap items-center gap-5`}>
                <div className="min-w-[180px] flex-1">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Today · {formatDateShort(todayDateKey)}
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <span className="font-mono text-[26px] font-semibold leading-none tracking-normal text-slate-950">
                      {canUsePersonalAttendance ? todayClockLabel : formatDateShort(adminDate)}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] font-semibold ${statusBadgeClass(todayStatus)}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {canUsePersonalAttendance ? formatAttendanceStatus(todayStatus) : "Admin view"}
                    </span>
                    {isOnBreak ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-100 px-2 py-1 text-[11.5px] font-semibold text-indigo-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        On Break
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[11.5px] text-slate-500">
                    {canUsePersonalAttendance
                      ? `${todayLocationLabel} · ${formatDuration(todayWorkedMinutes)} elapsed`
                      : `Team attendance · ${Number(adminData.summary?.totalUsers || 0)} users`}
                  </p>
                </div>

                {canUsePersonalAttendance ? (
                  <div className="flex flex-wrap gap-2">
                    {canCheckIn ? (
                      <button type="button" onClick={handleCheckIn} disabled={Boolean(attendanceAction)} className={primaryButtonClass}>
                        {attendanceAction === "checkin" ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                        Check in
                      </button>
                    ) : null}
                    {canStartBreak ? (
                      <button type="button" onClick={handleStartBreak} disabled={Boolean(attendanceAction)} className={secondaryButtonClass}>
                        {attendanceAction === "breakstart" ? <Loader2 size={14} className="animate-spin" /> : <PauseCircle size={14} />}
                        Start break
                      </button>
                    ) : null}
                    {canEndBreak ? (
                      <button type="button" onClick={handleEndBreak} disabled={Boolean(attendanceAction)} className={secondaryButtonClass}>
                        {attendanceAction === "breakend" ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                        End break
                      </button>
                    ) : null}
                    <button type="button" onClick={handleCheckOut} disabled={!canCheckOut || Boolean(attendanceAction)} className={secondaryButtonClass}>
                      {attendanceAction === "checkout" ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                      Check out
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => loadAdminAttendance({ quiet: true, date: adminDate, status: adminStatus })}
                    disabled={adminLoading || adminRefreshing}
                    className={secondaryButtonClass}
                  >
                    {adminRefreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Refresh
                  </button>
                )}
              </div>
            </section>

            <section className={cardClass}>
              <div className={cardHeaderClass}>
                <h4 className="text-[13.5px] font-semibold text-slate-900">
                  {showPersonalHistory ? "This month" : "Team daily attendance"}
                </h4>
                {isAdminViewer && canUsePersonalAttendance && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowTeamHistory(false)} aria-pressed={!showTeamHistory} className={secondaryButtonClass}>My attendance</button>
                    <button type="button" onClick={() => setShowTeamHistory(true)} aria-pressed={showTeamHistory} className={secondaryButtonClass}>Team attendance</button>
                  </div>
                )}
                {showPersonalHistory ? (
                  <div className="ml-auto flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    <input
                      type="month"
                      value={month}
                      onChange={(event) => setMonth(event.target.value)}
                      className="h-8 rounded-md border-0 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => loadMyAttendance({ quiet: true })}
                      disabled={myRefreshing}
                      className="inline-flex h-8 items-center justify-center rounded-md px-2 text-slate-500 transition hover:text-blue-700 disabled:opacity-60"
                      title="Refresh"
                    >
                      {myRefreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                  </div>
                ) : (
                  <div className="ml-auto flex flex-wrap gap-2">
                    <input type="date" value={adminDate} onChange={(event) => setAdminDate(event.target.value)} className={fieldClass} />
                    <select value={adminStatus} onChange={(event) => setAdminStatus(event.target.value)} className={fieldClass}>
                      <option value="">All Statuses</option>
                      <option value="WORKING">Working</option>
                      <option value="BREAK">Break</option>
                      <option value="PRESENT">Present</option>
                      <option value="HALF_DAY">Half Day</option>
                      <option value="PENDING">Pending</option>
                      <option value="LEAVE">Leave</option>
                      <option value="ABSENT">Absent</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-slate-400">
                      {showPersonalHistory ? (
                        <>
                          <th className="border-b border-slate-200 px-3 py-2.5">Date</th>
                          <th className="border-b border-slate-200 px-3 py-2.5">In</th>
                          <th className="border-b border-slate-200 px-3 py-2.5">Out</th>
                          <th className="border-b border-slate-200 px-3 py-2.5">Hours</th>
                          <th className="border-b border-slate-200 px-3 py-2.5">Status</th>
                          {isAdminViewer ? <th className="border-b border-slate-200 px-3 py-2.5">Location</th> : null}
                        </>
                      ) : (
                        <>
                          <th className="border-b border-slate-200 px-3 py-2.5">User</th>
                          <th className="border-b border-slate-200 px-3 py-2.5">In</th>
                          <th className="border-b border-slate-200 px-3 py-2.5">Out</th>
                          <th className="border-b border-slate-200 px-3 py-2.5">Hours</th>
                          <th className="border-b border-slate-200 px-3 py-2.5">Status</th>
                          <th className="border-b border-slate-200 px-3 py-2.5">Role</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {showPersonalHistory ? (
                      myData.attendance.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-sm text-slate-500" colSpan={isAdminViewer ? 6 : 5}>No attendance records found for selected month.</td>
                        </tr>
                      ) : (
                        myData.attendance.map((row) => (
                          <tr key={String(row._id || row.attendanceDate)} className="transition hover:bg-slate-50">
                            <td className="border-b border-slate-100 px-3 py-2.5 font-semibold text-slate-900">{formatDateShort(row.attendanceDate)}</td>
                            <td className={`border-b border-slate-100 px-3 py-2.5 font-mono ${row.isLateCheckIn ? "font-semibold text-rose-700" : "text-slate-700"}`}>{formatTimeOnly(row.checkInAt)}</td>
                            <td className="border-b border-slate-100 px-3 py-2.5 font-mono text-slate-500">{formatTimeOnly(row.checkOutAt)}</td>
                            <td className="border-b border-slate-100 px-3 py-2.5 font-mono text-slate-600">{formatDuration(row.workedMinutes)}</td>
                            <td className="border-b border-slate-100 px-3 py-2.5">
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] font-semibold ${statusBadgeClass(row.status)}`}>
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                {formatAttendanceStatus(row.status)}
                              </span>
                            </td>
                            {isAdminViewer ? (
                              <td className="border-b border-slate-100 px-3 py-2.5 text-xs text-slate-500">
                                In {formatDistance(row.checkInLocation?.distanceMeters)} · Out {formatDistance(row.checkOutLocation?.distanceMeters)}
                              </td>
                            ) : null}
                          </tr>
                        ))
                      )
                    ) : adminLoading ? (
                      <tr>
                        <td className="px-3 py-4 text-sm text-slate-500" colSpan={6}>
                          <Loader2 size={16} className="mr-2 inline animate-spin" />
                          Loading team attendance...
                        </td>
                      </tr>
                    ) : adminData.attendance.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-sm text-slate-500" colSpan={6}>No users found for selected filters.</td>
                      </tr>
                    ) : (
                      adminData.attendance.map((row) => (
                        <tr key={String(row.user?._id || "")} className="transition hover:bg-slate-50">
                          <td className="border-b border-slate-100 px-3 py-2.5">
                            <button type="button" onClick={() => openUserProfile(row.user?._id)} className="text-left font-semibold text-slate-900 transition hover:text-blue-700">
                              {row.user?.name || "-"}
                            </button>
                          </td>
                          <td className={`border-b border-slate-100 px-3 py-2.5 font-mono ${row.attendance?.isLateCheckIn ? "font-semibold text-rose-700" : "text-slate-700"}`}>{formatTimeOnly(row.attendance?.checkInAt)}</td>
                          <td className="border-b border-slate-100 px-3 py-2.5 font-mono text-slate-500">{formatTimeOnly(row.attendance?.checkOutAt)}</td>
                          <td className="border-b border-slate-100 px-3 py-2.5 font-mono text-slate-600">{formatDuration(row.attendance?.workedMinutes || 0)}</td>
                          <td className="border-b border-slate-100 px-3 py-2.5">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] font-semibold ${statusBadgeClass(row.attendance?.status)}`}>
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {formatAttendanceStatus(row.attendance?.status)}
                            </span>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2.5">
                            <select
                              value={MANUAL_ATTENDANCE_STATUS_OPTIONS.some((option) => option.value === row.attendance?.status) ? row.attendance?.status : ""}
                              onChange={(event) => handleManualStatusChange(row, event.target.value)}
                              disabled={manualStatusAction === `${String(row.user?._id || "").trim()}:${String(adminData.date || adminDate || "").trim()}`}
                              className="h-8 w-28 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
                              title="Manual status"
                            >
                              <option value="">{row.user?.role || "-"}</option>
                              {MANUAL_ATTENDANCE_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                            {row.attendance?.checkInAt && (
                              <button type="button" onClick={() => setBreakCorrectionRow(row)} className="mt-2 block rounded border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700">Manage breaks</button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {breakCorrectionRow && isAdminViewer && (
              <BreakCorrectionDialog
                row={breakCorrectionRow}
                date={adminData.date || adminDate}
                onClose={() => setBreakCorrectionRow(null)}
                onSaved={() => {
                  setBreakCorrectionRow(null);
                  setMySuccess("Break saved. The correction has been recorded in the audit history.");
                  loadAdminAttendance({ quiet: true });
                  if (canUsePersonalAttendance) loadMyAttendance({ quiet: true });
                }}
              />
            )}

            {canUsePersonalAttendance && todayBreakSessions.length ? (
              <section className={cardClass}>
                <div className={cardHeaderClass}><h4 className="text-[13.5px] font-semibold text-slate-900">Break sessions today</h4></div>
                <div className={cardBodyClass}>
                  <div className="flex flex-col divide-y divide-slate-100">
                    {todayBreakSessions.map((session, index) => (
                      <div key={`${session.startAt || "break"}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-[12.8px]">
                        <span className="font-semibold text-slate-800">Break {index + 1}</span>
                        <span className="font-mono text-slate-500">{formatTimeOnly(session.startAt)} - {session.endAt ? formatTimeOnly(session.endAt) : "Running"}</span>
                        <span className="font-mono font-semibold text-slate-900">{formatDuration(session.durationMinutes || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(canUsePersonalAttendance ? mySummaryCards : adminSummaryCards).map((card) => (
                <div key={card.key} className={statCardClass}>
                  <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-400">{card.label}</div>
                  <div className="mt-2 font-mono text-[25px] font-semibold leading-none tracking-normal text-slate-950">{card.value}</div>
                  <div className="mt-2 text-[11.5px] text-slate-500">{card.detail}</div>
                </div>
              ))}
            </div>

            {canUsePersonalAttendance ? (
              <section className={cardClass}>
                <div className={cardHeaderClass}>
                  <h4 className="text-[13.5px] font-semibold text-slate-900">Requests</h4>
                  <button type="button" onClick={loadLeaveRequestsData} disabled={leaveLoading} className="ml-auto text-xs font-semibold text-blue-600 transition hover:text-blue-800 disabled:opacity-60">
                    {leaveLoading ? "Loading" : "New request"}
                  </button>
                </div>
                <div className={cardBodyClass}>
                  <form className="grid grid-cols-1 gap-2 sm:grid-cols-2" onSubmit={handleSubmitLeaveRequest}>
                    <input type="date" value={leaveForm.fromDate} onChange={(event) => setLeaveForm((prev) => ({ ...prev, fromDate: event.target.value }))} className={fieldClass} aria-label="Leave from date" />
                    <input type="date" value={leaveForm.toDate} onChange={(event) => setLeaveForm((prev) => ({ ...prev, toDate: event.target.value }))} className={fieldClass} aria-label="Leave to date" />
                    <select value={leaveForm.leaveType} onChange={(event) => setLeaveForm((prev) => ({ ...prev, leaveType: event.target.value }))} className={`${fieldClass} sm:col-span-2`} aria-label="Leave type">
                      {LEAVE_TYPE_OPTIONS.map((type) => (<option key={type} value={type}>{type}</option>))}
                    </select>
                    <textarea
                      value={leaveForm.reason}
                      onChange={(event) => setLeaveForm((prev) => ({ ...prev, reason: event.target.value }))}
                      rows={2}
                      placeholder="Reason"
                      className="sm:col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <button type="submit" disabled={leaveSubmitting} className={`${primaryButtonClass} sm:col-span-2`}>
                      {leaveSubmitting ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
                      Submit
                    </button>
                  </form>

                  <div className="mt-4 flex flex-col divide-y divide-slate-100">
                    {leaveRequests.length === 0 ? (
                      <div className="py-2 text-[12.8px] text-slate-500">No leave requests yet.</div>
                    ) : (
                      leaveRequests.slice(0, 3).map((row) => (
                        <div key={String(row._id)} className="flex items-center gap-3 py-2">
                          <div className="min-w-0">
                            <b className="block truncate text-[12.8px] font-semibold text-slate-900">{String(row.leaveType || "CASUAL").replaceAll("_", " ")} · {formatDateShort(row.fromDate)}</b>
                            <div className="truncate text-[11.5px] text-slate-500">{row.reason || "-"}</div>
                          </div>
                          <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] font-semibold ${statusBadgeClass(row.status)}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {String(row.status || "PENDING").replaceAll("_", " ")}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            ) : null}

            {isAdminViewer ? (
              <section className={cardClass}>
                <div className={cardHeaderClass}>
                  <h4 className="text-[13.5px] font-semibold text-slate-900">Team approvals</h4>
                  <select value={adminLeaveStatusFilter} onChange={(event) => setAdminLeaveStatusFilter(event.target.value)} className={`${fieldClass} ml-auto h-8`} aria-label="Approval status">
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="">All</option>
                  </select>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-100 px-2 py-1 text-[11.5px] font-semibold text-amber-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {pendingAdminLeaveRequests.length} pending
                  </span>
                </div>
                <div className={cardBodyClass}>
                  <div className="flex flex-col divide-y divide-slate-100">
                    {adminWorkflowLoading ? (
                      <div className="py-2 text-[12.8px] text-slate-500"><Loader2 size={16} className="mr-2 inline animate-spin" />Loading approvals...</div>
                    ) : visibleAdminLeaveRequests.length === 0 ? (
                      <div className="py-2 text-[12.8px] text-slate-500">No leave requests found.</div>
                    ) : (
                      visibleAdminLeaveRequests.map((row) => (
                        <div key={String(row._id)} className="flex flex-wrap items-center gap-3 py-2">
                          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-100 text-[9px] font-bold text-blue-700">{getInitials(row.user?.name)}</div>
                          <div className="min-w-[120px] flex-1">
                            <b className="block text-[12.5px] font-semibold text-slate-900">{row.user?.name || "-"}</b>
                            <div className="text-[11.5px] text-slate-500">{String(row.leaveType || "CASUAL").replaceAll("_", " ")} · {formatDateShort(row.fromDate)}</div>
                          </div>
                          {row.status === "PENDING" ? (
                            <div className="ml-auto flex gap-1.5">
                              <button type="button" onClick={() => handleReviewLeave(row._id, "APPROVED")} disabled={Boolean(reviewAction)} className="rounded-lg border border-blue-700 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">Approve</button>
                              <button type="button" onClick={() => handleReviewLeave(row._id, "REJECTED")} disabled={Boolean(reviewAction)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-60">Reject</button>
                            </div>
                          ) : (
                            <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] font-semibold ${statusBadgeClass(row.status)}`}>
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {String(row.status || "PENDING").replaceAll("_", " ")}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            ) : null}

            {isAdminViewer ? (
              <section className={cardClass}>
                <form onSubmit={handleSaveAttendancePolicy}>
                  <div className={cardHeaderClass}>
                    <h4 className="text-[13.5px] font-semibold text-slate-900">Attendance policy</h4>
                    <label className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <input type="checkbox" checked={Boolean(policyForm.geofenceEnabled)} onChange={(event) => setPolicyForm((prev) => ({ ...prev, geofenceEnabled: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      Geofence
                    </label>
                  </div>
                  <div className={`${cardBodyClass} grid grid-cols-1 gap-2 sm:grid-cols-3`}>
                    <ToastNotice message={policyError} type="error" />
                    <input type="number" step="any" value={policyForm.officeLatitude} onChange={(event) => setPolicyForm((prev) => ({ ...prev, officeLatitude: event.target.value }))} className={fieldClass} placeholder="Latitude" aria-label="Office latitude" />
                    <input type="number" step="any" value={policyForm.officeLongitude} onChange={(event) => setPolicyForm((prev) => ({ ...prev, officeLongitude: event.target.value }))} className={fieldClass} placeholder="Longitude" aria-label="Office longitude" />
                    <input type="number" min="10" max="5000" value={policyForm.officeRadiusMeters} onChange={(event) => setPolicyForm((prev) => ({ ...prev, officeRadiusMeters: event.target.value }))} className={fieldClass} placeholder="Radius" aria-label="Office radius" />
                    <button type="button" onClick={handleUseCurrentOfficeLocation} disabled={policyLoading || policySaving} className={secondaryButtonClass}>
                      <MapPin size={14} />
                      Current
                    </button>
                    <button type="submit" disabled={policyLoading || policySaving} className={`${primaryButtonClass} sm:col-span-2`}>
                      {policySaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Save
                    </button>
                  </div>
                </form>
              </section>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceHub;
