import BrokerPhoneHint from "./BrokerPhoneHint";
import CoworkingRequirementFields from "./CoworkingRequirementFields";
import BillstackSection from '../../../components/billing/BillstackSection';
import React from "react";
import { motion as Motion } from "framer-motion";
import { createInventoryShareLink } from "../../../services/inventoryService";
import { uploadFile } from "../../../services/uploadService";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Briefcase,
  Building2,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Copy,
  Download,
  Eye,
  FileText,
  Flame,
  History,
  Home,
  Image,
  Layers,
  Link2,
  Loader,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  MoreHorizontal,
  MoreVertical,
  Phone,
  PencilLine,
  Plus,
  Save,
  Search,
  Send,
  Star,
  Trash2,
  User,
  Users,
} from "lucide-react";
import {
  getTasks as apiGetTasks,
  createTask as apiCreateTask,
  updateTask as apiUpdateTask,
  deleteTask as apiDeleteTask,
} from "../../../services/taskService";
import { deleteOutcomeMessage, isDeleteApprovalPending } from "../../../services/deleteRequestService";
import { canScheduleLeadFollowUp } from "../../calendar/calendarFollowUps";
import {
  FURNISHING_OPTIONS,
  LEAD_SOURCE_CHANNELS,
  PLOT_LOCATION_OPTIONS,
  PLOT_OCCUPANCY_OPTIONS,
  PLOT_PURPOSE_OPTIONS,
  getPropertySubtypeConfig,
  getPropertySubtypeLabel,
  getPropertySubtypeOptions,
} from "../../../config/propertyRequirementConfig";
import "./LeadDetailsMobile.css";

const CUSTOM_NUMBER_OPTION_VALUE = "__CUSTOM_NUMBER__";

const RequirementAdornedInput = ({
  adornment,
  adornmentPosition = "left",
  inputClassName,
  isDark,
  ...inputProps
}) => (
  <div className="relative">
    <input
      {...inputProps}
      className={`${inputClassName} ${adornmentPosition === "left" ? "pl-8" : "pr-14"}`}
    />
    <span
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-bold ${
        adornmentPosition === "left" ? "left-2.5" : "right-2.5"
      } ${isDark ? "text-slate-400" : "text-slate-500"}`}
    >
      {adornment}
    </span>
  </div>
);

const CUSTOM_BUDGET_RANGE_VALUE = "__CUSTOM_BUDGET__";

const SALE_BUDGET_RANGE_OPTIONS = [
  { value: "", label: "Budget Range", min: "", max: "" },
  { value: "0-2500000", label: "Under 25 Lakh", min: "0", max: "2500000" },
  { value: "2500000-5000000", label: "25 Lakh - 50 Lakh", min: "2500000", max: "5000000" },
  { value: "5000000-7500000", label: "50 Lakh - 75 Lakh", min: "5000000", max: "7500000" },
  { value: "7500000-10000000", label: "75 Lakh - 1 Cr", min: "7500000", max: "10000000" },
  { value: "10000000-20000000", label: "1 Cr - 2 Cr", min: "10000000", max: "20000000" },
  { value: "20000000-50000000", label: "2 Cr - 5 Cr", min: "20000000", max: "50000000" },
  { value: "50000000-", label: "5 Cr+", min: "50000000", max: "" },
  { value: CUSTOM_BUDGET_RANGE_VALUE, label: "Custom", min: "", max: "" },
];

const RENT_LEASE_BUDGET_RANGE_OPTIONS = [
  { value: "", label: "Budget Range", min: "", max: "" },
  { value: "0-25000", label: "Under 25,000", min: "0", max: "25000" },
  { value: "25000-50000", label: "25,000 - 50,000", min: "25000", max: "50000" },
  { value: "50000-100000", label: "50,000 - 1 Lakh", min: "50000", max: "100000" },
  { value: "100000-200000", label: "1 Lakh - 2 Lakh", min: "100000", max: "200000" },
  { value: "200000-500000", label: "2 Lakh - 5 Lakh", min: "200000", max: "500000" },
  { value: "500000-", label: "5 Lakh+", min: "500000", max: "" },
  { value: CUSTOM_BUDGET_RANGE_VALUE, label: "Custom", min: "", max: "" },
];

const getBudgetRangeOptions = (transactionType) =>
  ["RENT", "LEASE"].includes(String(transactionType || "").trim().toUpperCase())
    ? RENT_LEASE_BUDGET_RANGE_OPTIONS
    : SALE_BUDGET_RANGE_OPTIONS;

const getBudgetRangeOptionValue = (min, max, options = SALE_BUDGET_RANGE_OPTIONS) => {
  const minText = String(min || "").trim();
  const maxText = String(max || "").trim();
  if (!minText && !maxText) return "";
  const value = `${minText}-${maxText}`;
  return options.some((option) => option.value === value) ? value : CUSTOM_BUDGET_RANGE_VALUE;
};

const toPositivePlotMeasure = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const formatCalculatedPlotArea = (area) =>
  Number.isInteger(area) ? String(area) : String(Number(area.toFixed(2)));

const PLOT_INLINE_FIELD_KEYS = new Set(["plotLocation", "plotOccupancy", "plotPurpose"]);

const approvalLabel = (status) => {
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return "Pending";
};

const statusLabel = (status) =>
  String(status || "")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getUserDisplayName = (user, fallback = "-") => {
  if (!user) return fallback;
  if (typeof user === "string") return user || fallback;
  const name = String(user?.name || "").trim();
  const role = String(user?.role || "").trim();
  if (name && role) return `${name} (${statusLabel(role)})`;
  return name || role || fallback;
};

const getAssignmentActionLabel = (action) => {
  const normalized = String(action || "").trim().toUpperCase();
  if (normalized === "LEAD_CREATED") return "Lead Created";
  if (normalized === "AUTO_ASSIGNED") return "Auto Assigned";
  if (normalized === "QUALIFIED") return "Qualified";
  if (normalized === "MANUAL_TRANSFER") return "Manual Transfer";
  if (normalized === "REASSIGNED") return "Reassigned";
  if (normalized === "CLOSED") return "Closed";
  return statusLabel(normalized || "UPDATE");
};

const getAssignmentEventTime = (event) => {
  const date = new Date(event?.createdAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const buildAssignmentHistoryEvents = (lead = {}) => {
  const events = [];

  if (lead?.createdAt) {
    events.push({
      _id: `${lead?._id || "lead"}-created`,
      action: "LEAD_CREATED",
      toUser: lead?.assignedTo || null,
      reason: "",
      statusAtTransfer: "NEW",
      createdAt: lead.createdAt,
      createdBy: lead?.createdBy || null,
      synthetic: true,
    });
  }

  if (Array.isArray(lead?.assignmentHistory)) {
    lead.assignmentHistory.forEach((event, index) => {
      if (!event || typeof event !== "object") return;
      events.push({
        _id: event._id || `${lead?._id || "lead"}-assignment-${index}`,
        action: event.action || "REASSIGNED",
        fromUser: event.fromUser || null,
        toUser: event.toUser || null,
        reason: event.reason || "",
        statusAtTransfer: event.statusAtTransfer || "",
        createdAt: event.createdAt || lead.updatedAt || lead.createdAt,
        createdBy: event.createdBy || null,
      });
    });
  }

  const isClosed = String(lead?.status || "").trim().toUpperCase() === "CLOSED";
  if (isClosed) {
    events.push({
      _id: `${lead?._id || "lead"}-closed`,
      action: "CLOSED",
      fromUser: lead?.assignedTo || null,
      toUser: lead?.assignedTo || null,
      reason: lead?.dealPayment?.note || "",
      statusAtTransfer: "CLOSED",
      createdAt: lead?.brokerageClosedAt || lead?.updatedAt || lead?.createdAt,
      createdBy: lead?.brokerageClosedBy || lead?.dealPayment?.approvalReviewedBy || null,
      synthetic: true,
    });
  }

  return events
    .filter((event) => event?.createdAt || event?.action)
    .sort((a, b) => getAssignmentEventTime(b) - getAssignmentEventTime(a));
};

const INR_CURRENCY_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const formatCurrencyInr = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "On request";
  return INR_CURRENCY_FORMATTER.format(amount);
};

const getInventoryListingType = (inventory) => {
  const type = String(inventory?.type || "").trim().toUpperCase();
  if (type === "RENT") return "RENT";
  if (type === "BOTH") return "BOTH";
  return "SALE";
};

// A rental property is priced by its monthly rent, not its sale price.
const formatInventoryAmountInr = (inventory, format = formatCurrencyInr) => {
  const listingType = getInventoryListingType(inventory);
  if (listingType === "RENT") {
    const rent = format(inventory?.rent);
    return rent === "On request" ? rent : `${rent} / month`;
  }
  if (listingType === "BOTH") {
    const price = format(inventory?.price);
    const rent = format(inventory?.rent);
    return `${price} · ${rent === "On request" ? rent : `${rent} / month`}`;
  }
  return format(inventory?.price);
};

const getInventoryAmountLabel = (inventory) => {
  const listingType = getInventoryListingType(inventory);
  if (listingType === "RENT") return "Rent";
  if (listingType === "BOTH") return "Price / Rent";
  return "Price";
};

const getInventoryListingLabel = (inventory) => {
  const listingType = getInventoryListingType(inventory);
  if (listingType === "RENT") return "Rental";
  if (listingType === "BOTH") return "Sale & Rent";
  return "For Sale";
};

const toTitleCaseLabel = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

// Client-facing name for a property: its ID and listing name only. Building,
// tower (filled from the building name) and unit/office number stay internal.
const getInventoryClientLabel = (inventory = {}) =>
  [inventory?.propertyId, inventory?.projectName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(" - ");

const getInventoryLocationLabel = (inventory = {}) => {
  const parts = [inventory?.city, inventory?.area, inventory?.pincode]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(", ");
  return String(inventory?.location || "").trim();
};

const getInventorySubtypeLabel = (inventory = {}) => {
  const inventoryType = String(inventory?.inventoryType || "").trim().toUpperCase();
  if (inventoryType === "COMMERCIAL") {
    return toTitleCaseLabel(inventory?.commercialDetails?.officeType);
  }
  if (inventoryType === "RESIDENTIAL") {
    return toTitleCaseLabel(
      inventory?.residentialDetails?.bhkType
      || inventory?.residentialDetails?.propertyType,
    );
  }
  return "";
};

const getInventoryAreaLabel = (inventory = {}) => {
  const totalArea = Number(inventory?.totalArea);
  if (!Number.isFinite(totalArea) || totalArea <= 0) return "";
  const areaUnit =
    String(inventory?.areaUnit || "SQ_FT").trim().toUpperCase() === "SQ_M"
      ? "sq m"
      : "sq ft";
  return `${totalArea.toLocaleString("en-IN")} ${areaUnit}`;
};

const getInventoryQuickInfo = (inventory = {}) =>
  [
    toTitleCaseLabel(inventory?.inventoryType),
    getInventorySubtypeLabel(inventory),
    toTitleCaseLabel(inventory?.furnishingStatus),
    getInventoryAreaLabel(inventory),
  ]
    .filter(Boolean)
    .join(" | ");

const toDateTimeInputValue = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const buildDefaultCollectionFollowUp = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(11, 0, 0, 0);
  return toDateTimeInputValue(date);
};

const resolveImageExtension = (url, mimeType = "") => {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("bmp")) return "bmp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";

  const fromUrl = String(url || "")
    .split("?")[0]
    .split("#")[0]
    .split(".")
    .pop();
  const normalized = String(fromUrl || "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(normalized)) {
    return normalized === "jpeg" ? "jpg" : normalized;
  }
  return "jpg";
};

const PROPOSAL_MAX_IMAGES_PER_PROPERTY = 4;
const PDF_IMAGE_MAX_DIMENSION = 1400;
const PDF_IMAGE_QUALITY = 0.82;
const INITIAL_PROPERTIES_RENDER_COUNT = 18;
const INITIAL_PROPOSAL_OPTIONS_RENDER_COUNT = 24;
const INITIAL_DIARY_RENDER_COUNT = 20;
const INITIAL_ACTIVITY_RENDER_COUNT = 20;
const RENDER_STEP_COUNT = 20;
const MAX_CLOSURE_DOCUMENTS = 20;
const MAX_CLOSURE_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const CLOSURE_DOCUMENT_ACCEPT = "image/*,application/pdf";
const detectClosureDocumentKind = (mimeType = "") => {
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  if (normalizedMimeType.startsWith("image/")) return "image";
  if (normalizedMimeType === "application/pdf") return "pdf";
  return "file";
};

const sanitizeClosureDocument = (value = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const url = String(value.url || value.secure_url || "").trim();
  if (!url) return null;

  const mimeType = String(value.mimeType || value.type || "").trim().slice(0, 120);
  const normalizedKind = String(value.kind || "").trim().toLowerCase();
  const fallbackKind = detectClosureDocumentKind(mimeType);

  return {
    url: url.slice(0, 2048),
    kind: ["image", "pdf", "file"].includes(normalizedKind) ? normalizedKind : fallbackKind,
    mimeType,
    name: String(value.name || value.original_filename || "").trim().slice(0, 180),
    size: Math.max(0, Math.round(Number(value.size) || 0)),
    uploadedAt: value.uploadedAt || new Date().toISOString(),
    uploadedBy: value.uploadedBy || null,
  };
};

const sanitizeClosureDocumentList = (value) => {
  if (!Array.isArray(value)) return [];
  const dedupe = new Set();
  const rows = [];

  value.forEach((item) => {
    const doc = sanitizeClosureDocument(item);
    if (!doc || dedupe.has(doc.url)) return;
    dedupe.add(doc.url);
    rows.push(doc);
  });

  return rows.slice(0, MAX_CLOSURE_DOCUMENTS);
};

const formatFileSize = (size) => {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
};

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file data"));
    reader.readAsDataURL(blob);
  });

const blobToPdfImageSource = async (blob) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      dataUrl: await blobToDataUrl(blob),
      format: "JPEG",
    };
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const previewImage = new window.Image();
    previewImage.onload = () => {
      try {
        const originalWidth = previewImage.naturalWidth || previewImage.width || PDF_IMAGE_MAX_DIMENSION;
        const originalHeight = previewImage.naturalHeight || previewImage.height || PDF_IMAGE_MAX_DIMENSION;
        const maxSide = Math.max(originalWidth, originalHeight, 1);
        const scale = Math.min(1, PDF_IMAGE_MAX_DIMENSION / maxSide);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(originalWidth * scale));
        canvas.height = Math.max(1, Math.round(originalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Canvas unavailable"));
          return;
        }
        context.drawImage(previewImage, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", PDF_IMAGE_QUALITY);
        URL.revokeObjectURL(objectUrl);
        resolve({ dataUrl, format: "JPEG" });
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    previewImage.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to decode image"));
    };
    previewImage.src = objectUrl;
  });
};

const copyTextToClipboard = async (text) => {
  const normalizedText = String(text || "");
  if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalizedText);
    return true;
  }

  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = normalizedText;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    let copied = false;
    try {
      textarea.select();
      copied = document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
    return copied;
  }

  return false;
};

const LeadDetailsRebuiltContent = ({
  isDark,
  selectedLead,
  onClose,
  selectedLeadDialerHref,
  selectedLeadWhatsAppHref,
  selectedLeadMailHref,
  selectedLeadMapsHref,
  selectedLeadRelatedInventories,
  selectedLeadActiveInventoryId,
  propertyActionType,
  propertyActionInventoryId,
  canManageLeadProperties,
  toInventoryApiStatus,
  toInventoryStatusLabel,
  onSelectRelatedProperty,
  onOpenRelatedProperty,
  onRemoveRelatedProperty,
  availableRelatedInventoryOptions,
  relatedInventoryDraft,
  setRelatedInventoryDraft,
  linkingProperty,
  onLinkPropertyToLead,
  onOpenEditLeadForm,
  canDeleteLead = false,
  onDeleteLead,
  leadStatuses,
  nameDraft,
  setNameDraft,
  phoneDraft,
  setPhoneDraft,
  emailDraft,
  setEmailDraft,
  cityDraft,
  setCityDraft,
  projectInterestedDraft,
  setProjectInterestedDraft,
  clientProfessionDraft,
  setClientProfessionDraft,
  statusDraft,
  setStatusDraft,
  requirementsDraft,
  setRequirementsDraft,
  followUpDraft,
  setFollowUpDraft,
  dealPaymentModes,
  dealPaymentTypes,
  dealPaymentAdminDecisions,
  paymentModeDraft,
  setPaymentModeDraft,
  paymentTypeDraft,
  setPaymentTypeDraft,
  paymentRemainingDraft,
  setPaymentRemainingDraft,
  paymentReferenceDraft,
  setPaymentReferenceDraft,
  paymentNoteDraft,
  setPaymentNoteDraft,
  paymentApprovalStatusDraft,
  setPaymentApprovalStatusDraft,
  paymentApprovalNoteDraft,
  setPaymentApprovalNoteDraft,
  brokerageReceivedDraft,
  setBrokerageReceivedDraft,
  brokerageDistributedDraft,
  brokerageExtraDraft = { source: "", agreed: "", paymentDate: "" },
  setBrokerageExtraDraft = () => {},
  setBrokerageDistributedDraft,
  closureDocumentsDraft,
  setClosureDocumentsDraft,
  canReviewDealPayment,
  canEditLead = true,
  siteLatDraft,
  setSiteLatDraft,
  siteLngDraft,
  setSiteLngDraft,
  canConfigureSiteLocation,
  selectedLeadSiteLat,
  selectedLeadSiteLng,
  siteVisitRadiusMeters,
  userRole,
  onUpdateLead,
  savingUpdates,
  canAssignLead,
  executiveDraft,
  setExecutiveDraft,
  executives,
  transferReasonDraft,
  onToggleHotClient,
  setTransferReasonDraft,
  assigneeSearchDraft,
  setAssigneeSearchDraft,
  onAssignLead,
  assigning,
  diaryDraft,
  setDiaryDraft,
  onDiaryVoiceToggle,
  savingDiary,
  isDiaryMicSupported,
  isDiaryListening,
  onAddDiary,
  diaryLoading,
  diaryEntries,
  activityLoading,
  activities,
  formatDate,
  getInventoryLeadLabel,
  toObjectIdString,
  WhatsAppIcon,
}) => {
  const softCard = isDark
    ? "ui-soft-panel border-slate-700/90 bg-slate-900/80"
    : "ui-soft-panel border-slate-200 bg-slate-50/85";
  const input = isDark
    ? "border-slate-700 bg-slate-950/90 text-slate-100 placeholder:text-slate-500"
    : "border-slate-300 bg-white text-slate-700 placeholder:text-slate-400";
  const button = isDark
    ? "border-slate-600 bg-slate-900 text-slate-100 hover:border-sky-300/55 hover:bg-slate-800 hover:text-sky-100"
    : "border-slate-300 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700";
  const isClosedDealFlow =
    ["CLOSED", "REQUESTED"].includes(statusDraft)
    || ["CLOSED", "REQUESTED"].includes(String(selectedLead?.status || ""));
  const currentApprovalStatus = String(
    paymentApprovalStatusDraft || selectedLead?.dealPayment?.approvalStatus || "PENDING",
  ).toUpperCase();
  const showRemainingAmountField = paymentTypeDraft === "PARTIAL";
  const requiresPaymentReference = Boolean(paymentModeDraft) && paymentModeDraft !== "CASH";
  const normalizedPaymentType = String(
    paymentTypeDraft || selectedLead?.dealPayment?.paymentType || "",
  ).trim().toUpperCase();
  const rawRemainingAmountValue = Number(
    paymentRemainingDraft !== ""
      ? paymentRemainingDraft
      : selectedLead?.dealPayment?.remainingAmount,
  );
  const remainingAmountForCollection =
    Number.isFinite(rawRemainingAmountValue) && rawRemainingAmountValue > 0
      ? rawRemainingAmountValue
      : null;
  const requiresRemainingPaymentFollowUp =
    isClosedDealFlow && normalizedPaymentType === "PARTIAL";
  const hasFollowUpDraft = String(followUpDraft || "").trim().length > 0;
  // Closed, lost, invalid and missing leads get no follow-up; saving one clears it.
  const effectiveStatus = statusDraft || selectedLead?.status;
  const canHaveFollowUp = requiresRemainingPaymentFollowUp
    || canScheduleLeadFollowUp({ ...selectedLead, status: effectiveStatus });
  const isClosedStatusSelected =
    statusDraft === "CLOSED" || String(selectedLead?.status || "").toUpperCase() === "CLOSED";
  const normalizedActiveInventoryId = String(selectedLeadActiveInventoryId || "").trim();
  const proposalShareBaseWhatsappHref = String(selectedLeadWhatsAppHref || "").trim();
  const normalizedClosureDocuments = React.useMemo(
    () => sanitizeClosureDocumentList(closureDocumentsDraft),
    [closureDocumentsDraft],
  );
  const remainingClosureSlots = Math.max(0, MAX_CLOSURE_DOCUMENTS - normalizedClosureDocuments.length);
  const [proposalValidityDays, setProposalValidityDays] = React.useState("7");
  const [proposalSpecialNote, setProposalSpecialNote] = React.useState("");
  const [proposalActionMessage, setProposalActionMessage] = React.useState("");
  const [shareLinks, setShareLinks] = React.useState({});

  const [leadTasks, setLeadTasks] = React.useState([]);
  const [loadingTasks, setLoadingTasks] = React.useState(false);
  const [newTaskTitle, setNewTaskTitle] = React.useState("");
  const [newTaskDueDate, setNewTaskDueDate] = React.useState("");
  const [newTaskPriority, setNewTaskPriority] = React.useState("MEDIUM");
  const [newTaskAssignedTo, setNewTaskAssignedTo] = React.useState("");
  const [addingTask, setAddingTask] = React.useState(false);

  const fetchLeadTasks = React.useCallback(async () => {
    if (!selectedLead?._id) return;
    setLoadingTasks(true);
    try {
      const data = await apiGetTasks({ leadId: selectedLead._id });
      setLeadTasks(data || []);
    } catch (err) {
      console.error("Failed to load lead tasks", err);
    } finally {
      setLoadingTasks(false);
    }
  }, [selectedLead?._id]);

  React.useEffect(() => {
    fetchLeadTasks();
  }, [fetchLeadTasks]);

  const handleAddLeadTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setAddingTask(true);
    try {
      const payload = {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim(),
        status: "TODO",
        priority: newTaskPriority,
        dueDate: newTaskDueDate || null,
        assignedTo: newTaskAssignedTo || null,
        leadId: selectedLead._id
      };
      const created = await apiCreateTask(payload);
      if (created) {
        setNewTaskTitle("");
        setNewTaskDescription("");
        setNewTaskDueDate("");
        setNewTaskPriority("MEDIUM");
        setNewTaskAssignedTo("");
        fetchLeadTasks();
      }
    } catch (err) {
      console.error("Failed to create lead task", err);
    } finally {
      setAddingTask(false);
    }
  };

  const handleToggleLeadTaskStatus = async (task) => {
    const newStatus = task.status === "COMPLETED" ? "TODO" : "COMPLETED";
    try {
      setLeadTasks(prev => prev.map(t => t._id === task._id ? { ...t, status: newStatus } : t));
      await apiUpdateTask(task._id, { status: newStatus });
      fetchLeadTasks();
    } catch (err) {
      console.error("Failed to toggle task status", err);
      fetchLeadTasks();
    }
  };

  const handleDeleteLeadTask = async (taskId) => {
    // A Manager's delete is a request an Admin approves.
    const needsApproval = String(userRole || "").toUpperCase() === "MANAGER";
    if (!window.confirm(needsApproval ? "Send a request to Admin to delete this task?" : "Delete this task?")) return;
    try {
      if (!needsApproval) setLeadTasks(prev => prev.filter(t => t._id !== taskId));
      const result = await apiDeleteTask(taskId);
      if (isDeleteApprovalPending(result)) window.alert(deleteOutcomeMessage(result));
      fetchLeadTasks();
    } catch (err) {
      console.error("Failed to delete task", err);
      fetchLeadTasks();
    }
  };

  React.useEffect(() => {
    if (!Array.isArray(selectedLeadRelatedInventories) || !selectedLeadRelatedInventories.length) {
      setShareLinks({});
      return;
    }

    let isMounted = true;

    const fetchLinks = async () => {
      const links = {};
      const origin = window.location.origin;

      try {
        await Promise.all(
          selectedLeadRelatedInventories.map(async (inventory) => {
            const inventoryId = String(inventory?._id || "").trim();
            if (!inventoryId) return;

            try {
              const { shareToken } = await createInventoryShareLink(inventoryId);
              if (shareToken && isMounted) {
                links[inventoryId] = `${origin}/shared/inventory/${shareToken}`;
              }
            } catch (err) {
              console.error(`Failed to fetch share link for inventory ${inventoryId}:`, err);
            }
          })
        );

        if (isMounted) {
          setShareLinks(links);
        }
      } catch (err) {
        console.error("Failed to fetch share links:", err);
      }
    };

    fetchLinks();

    return () => {
      isMounted = false;
    };
  }, [selectedLeadRelatedInventories]);
  const [closureUploadMessage, setClosureUploadMessage] = React.useState("");
  const [uploadingClosureDocuments, setUploadingClosureDocuments] = React.useState(false);
  const [proposalSelectedPropertyIds, setProposalSelectedPropertyIds] = React.useState([]);
  const [isGeneratingProposalPdf, setIsGeneratingProposalPdf] = React.useState(false);
  const [linkableInventoryTypeFilter, setLinkableInventoryTypeFilter] = React.useState("ALL");
  const [visiblePropertiesCount, setVisiblePropertiesCount] = React.useState(INITIAL_PROPERTIES_RENDER_COUNT);
  const [visibleProposalOptionsCount, setVisibleProposalOptionsCount] = React.useState(
    INITIAL_PROPOSAL_OPTIONS_RENDER_COUNT,
  );
  const [visibleActivityCount, setVisibleActivityCount] = React.useState(INITIAL_ACTIVITY_RENDER_COUNT);
  const [customNumberFields, setCustomNumberFields] = React.useState({});
  const [isManualBudgetRange, setIsManualBudgetRange] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("overview");
  const [headerMenuOpen, setHeaderMenuOpen] = React.useState(false);
  const [mobileStatusOpen, setMobileStatusOpen] = React.useState(false);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = React.useState(false);
  const [transferConfirmOpen, setTransferConfirmOpen] = React.useState(false);
  const [emailEditorOpen, setEmailEditorOpen] = React.useState(false);
  const [contactEditorOpen, setContactEditorOpen] = React.useState(false);
  const [followUpEditorOpen, setFollowUpEditorOpen] = React.useState(false);
  const [propertyPane, setPropertyPane] = React.useState("linked");
  const [linkedPropertyFilter, setLinkedPropertyFilter] = React.useState("ALL");
  const [linkedPropertySearch, setLinkedPropertySearch] = React.useState("");
  const [openPropertyMenuId, setOpenPropertyMenuId] = React.useState("");
  const [siteVisitDateDraft, setSiteVisitDateDraft] = React.useState("");
  const [siteVisitTimeDraft, setSiteVisitTimeDraft] = React.useState("");
  const [scheduleVisitMessage, setScheduleVisitMessage] = React.useState("");
  const [locationDetailsOpen, setLocationDetailsOpen] = React.useState(true);
  const [showAllPropertyImages, setShowAllPropertyImages] = React.useState(false);
  const [proposalStep, setProposalStep] = React.useState(1);
  const [shareMenuOpen, setShareMenuOpen] = React.useState(false);
  const [includeProposalImages, setIncludeProposalImages] = React.useState(true);
  const [excludedProposalImageUrls, setExcludedProposalImageUrls] = React.useState([]);
  const [activityFilter, setActivityFilter] = React.useState("ALL");
  const [logActivityMode, setLogActivityMode] = React.useState("NOTE");
  const [newTaskFormOpen, setNewTaskFormOpen] = React.useState(false);
  const [newTaskDescription, setNewTaskDescription] = React.useState("");
  const [transferPanelOpen, setTransferPanelOpen] = React.useState(false);
  const proposalMessageTimerRef = React.useRef(null);
  const pdfImageSourceCacheRef = React.useRef(new Map());
  const normalizedRequirementInventoryType = String(
    requirementsDraft?.inventoryType || "",
  ).trim().toUpperCase();
  const normalizedRequirementPropertySubtype = String(
    requirementsDraft?.propertySubtype || "",
  ).trim().toUpperCase();
  const propertySubtypeOptions = getPropertySubtypeOptions(normalizedRequirementInventoryType);
  const propertySubtypeConfig = getPropertySubtypeConfig(
    normalizedRequirementInventoryType,
    normalizedRequirementPropertySubtype,
  );
  const showFurnishing = !propertySubtypeConfig || propertySubtypeConfig.showFurnishing !== false;
  const furnishingOptions = showFurnishing ? FURNISHING_OPTIONS : [];
  const furnishingValue = furnishingOptions.some((option) => option.value === requirementsDraft?.furnishingStatus)
    ? requirementsDraft?.furnishingStatus
    : "";
  const leadSourceChannel = String(selectedLead?.sourceChannel || "").trim().toUpperCase();
  const leadSourceLabel = LEAD_SOURCE_CHANNELS.find((option) => option.value && option.value === leadSourceChannel)?.label
    || (String(selectedLead?.source || "").trim().toUpperCase() === "META" ? "Meta" : "Not set");
  const isCoworkingRequirement = normalizedRequirementInventoryType === "COWORKING";
  const isPlotRequirement = normalizedRequirementPropertySubtype === "PLOT";
  // Homes (not plots) are rented; shops and offices are leased; coworking is never bought.
  const canRentRequirement = normalizedRequirementInventoryType === "RESIDENTIAL" && !isPlotRequirement;
  const canPurchaseRequirement = !isCoworkingRequirement;
  const rawTransactionType = String(requirementsDraft?.transactionType || "").trim().toUpperCase();
  let transactionTypeValue = rawTransactionType;
  if (rawTransactionType === "RENT" && !canRentRequirement) transactionTypeValue = "LEASE";
  if (rawTransactionType === "SALE" && !canPurchaseRequirement) transactionTypeValue = "";
  const budgetRangeOptions = isCoworkingRequirement
    ? RENT_LEASE_BUDGET_RANGE_OPTIONS
    : getBudgetRangeOptions(transactionTypeValue);
  const budgetRangeValue = getBudgetRangeOptionValue(
    requirementsDraft?.budgetMin,
    requirementsDraft?.budgetMax,
    budgetRangeOptions,
  );
  const isCustomBudgetRange = isManualBudgetRange || budgetRangeValue === CUSTOM_BUDGET_RANGE_VALUE;
  const selectedBudgetRangeValue = isCustomBudgetRange ? CUSTOM_BUDGET_RANGE_VALUE : budgetRangeValue;
  const plotLocationValue = String(requirementsDraft?.subtypeData?.plotLocation || "");
  const plotOccupancyValue = String(requirementsDraft?.subtypeData?.plotOccupancy || "");
  const plotPurposeValue = String(requirementsDraft?.subtypeData?.plotPurpose || "");

  const updateRequirementRootField = React.useCallback(
    (field, value) => {
      setRequirementsDraft((prev) => ({
        ...(prev || {}),
        [field]: value,
      }));
    },
    [setRequirementsDraft],
  );

  const updateBudgetRange = React.useCallback(
    (value) => {
      if (value === CUSTOM_BUDGET_RANGE_VALUE) {
        setIsManualBudgetRange(true);
        setRequirementsDraft((prev) => ({
          ...(prev || {}),
          budgetMin: "",
          budgetMax: "",
        }));
        return;
      }

      const selectedRange = budgetRangeOptions.find((option) => option.value === value)
        || budgetRangeOptions[0];
      setIsManualBudgetRange(false);
      setRequirementsDraft((prev) => ({
        ...(prev || {}),
        budgetMin: selectedRange.min,
        budgetMax: selectedRange.max,
      }));
    },
    [budgetRangeOptions, setRequirementsDraft],
  );

  const updateTransactionType = React.useCallback(
    (value) => {
      setIsManualBudgetRange(false);
      setRequirementsDraft((prev) => ({
        ...(prev || {}),
        transactionType: value,
        budgetMin: "",
        budgetMax: "",
      }));
    },
    [setRequirementsDraft],
  );

  const updateRequirementInventoryType = React.useCallback(
    (value) => {
      setRequirementsDraft((prev) => {
        return {
          ...(prev || {}),
          inventoryType: value,
          propertySubtype: "",
          subtypeData: {},
          furnishingStatus: FURNISHING_OPTIONS.some((option) => option.value === prev?.furnishingStatus)
            ? prev?.furnishingStatus
            : "",
        };
      });
    },
    [setRequirementsDraft],
  );

  const updateRequirementPropertySubtype = React.useCallback(
    (value) => {
      const nextConfig = getPropertySubtypeConfig(normalizedRequirementInventoryType, value);
      setRequirementsDraft((prev) => ({
        ...(prev || {}),
        propertySubtype: value,
        subtypeData: {},
        furnishingStatus: nextConfig?.showFurnishing === false
          ? ""
          : prev?.furnishingStatus || "",
        areaMin: "",
        areaMax: "",
        areaUnit: "SQ_FT",
      }));
    },
    [normalizedRequirementInventoryType, setRequirementsDraft],
  );

  const updateRequirementSubtypeField = React.useCallback(
    (field, value) => {
      setRequirementsDraft((prev) => {
        const nextSubtypeData = {
          ...(prev?.subtypeData || {}),
          [field]: value,
        };

        if (["plotLength", "plotWidth"].includes(field)) {
          const length = toPositivePlotMeasure(nextSubtypeData.plotLength);
          const width = toPositivePlotMeasure(nextSubtypeData.plotWidth);
          if (length !== null && width !== null) {
            nextSubtypeData.plotArea = formatCalculatedPlotArea(length * width);
          }
        }

        return {
          ...(prev || {}),
          subtypeData: nextSubtypeData,
        };
      });
    },
    [setRequirementsDraft],
  );

  const updateCustomNumberField = React.useCallback((fieldKey, isCustom) => {
    setCustomNumberFields((prev) => ({ ...prev, [fieldKey]: isCustom }));
  }, []);

  const renderSubtypeField = React.useCallback(
    (field) => {
      const value = requirementsDraft?.subtypeData?.[field.key] ?? "";
      const selectOptions = field.options || [];
      const normalizedValue = String(value || "");
      const isCustomNumberValue = field.allowCustomNumber
        && normalizedValue
        && !selectOptions.includes(normalizedValue);
      const isCustomNumberMode = Boolean(customNumberFields[field.key] || isCustomNumberValue);
      const selectValue = isCustomNumberMode ? CUSTOM_NUMBER_OPTION_VALUE : normalizedValue;
      const labelClass = `mb-1.5 block text-[13px] font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`;
      const inputClassName = `h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 ${input}`;

      if (field.type === "checkbox") {
        return (
          <label key={field.key} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${isDark ? "border-slate-700 bg-slate-950 text-slate-200" : "border-slate-300 bg-white text-slate-700"}`}>
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => updateRequirementSubtypeField(field.key, event.target.checked)}
            />
            {field.label}
          </label>
        );
      }

      return (
        <label key={field.key} className={`block ${field.fullWidth ? "sm:col-span-2" : ""}`}>
          <span className={labelClass}>{field.label}</span>
          {field.type === "select" ? (
            <>
              <select
                value={selectValue}
                onChange={(event) => {
                  if (event.target.value === CUSTOM_NUMBER_OPTION_VALUE) {
                    updateCustomNumberField(field.key, true);
                    updateRequirementSubtypeField(field.key, "");
                    return;
                  }
                  updateCustomNumberField(field.key, false);
                  updateRequirementSubtypeField(field.key, event.target.value);
                }}
                className={inputClassName}
              >
                <option value="">{field.label}</option>
                {selectOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
                {field.allowCustomNumber ? (
                  <option value={CUSTOM_NUMBER_OPTION_VALUE}>Custom Number</option>
                ) : null}
              </select>
              {field.allowCustomNumber && isCustomNumberMode ? (
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={normalizedValue === CUSTOM_NUMBER_OPTION_VALUE ? "" : normalizedValue}
                  onChange={(event) => updateRequirementSubtypeField(field.key, event.target.value)}
                  placeholder="Enter custom number"
                  className={`${inputClassName} mt-2`}
                />
              ) : null}
            </>
          ) : field.type === "textarea" ? (
            <textarea
              value={value}
              onChange={(event) => updateRequirementSubtypeField(field.key, event.target.value)}
              placeholder={field.placeholder || field.label}
              rows={3}
              className={`min-h-24 w-full rounded-lg border px-2.5 py-2 text-sm ${input}`}
            />
          ) : field.unit ? (
            <RequirementAdornedInput
              type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
              min={field.min}
              max={field.max}
              step={field.step || (field.type === "number" ? "any" : undefined)}
              value={value}
              onChange={(event) => updateRequirementSubtypeField(field.key, event.target.value)}
              placeholder={field.placeholder || field.label}
              adornment={field.unit}
              adornmentPosition="right"
              inputClassName={inputClassName}
              isDark={isDark}
            />
          ) : (
            <input
              type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
              min={field.min}
              max={field.max}
              step={field.step || (field.type === "number" ? "any" : undefined)}
              value={value}
              onChange={(event) => updateRequirementSubtypeField(field.key, event.target.value)}
              placeholder={field.placeholder || field.label}
              className={inputClassName}
            />
          )}
        </label>
      );
    },
    [customNumberFields, input, isDark, requirementsDraft?.subtypeData, updateCustomNumberField, updateRequirementSubtypeField],
  );

  const relatedInventoryRows = React.useMemo(
    () =>
      selectedLeadRelatedInventories.map((inventory) => {
        const inventoryId = String(toObjectIdString(inventory) || "").trim();
        const imageUrls = Array.isArray(inventory?.images)
          ? inventory.images.map((url) => String(url || "").trim()).filter(Boolean)
          : [];
        return {
          id: inventoryId,
          inventory,
          label: getInventoryLeadLabel(inventory),
          location: getInventoryLocationLabel(inventory),
          quickInfo: getInventoryQuickInfo(inventory),
          status: toInventoryApiStatus(inventory?.status),
          statusLabel: toInventoryStatusLabel(inventory?.status),
          imageUrls,
        };
      }),
    [getInventoryLeadLabel, selectedLeadRelatedInventories, toInventoryApiStatus, toInventoryStatusLabel, toObjectIdString],
  );

  const activeRelatedPropertyRow = React.useMemo(
    () => relatedInventoryRows.find((row) => row.id === normalizedActiveInventoryId),
    [normalizedActiveInventoryId, relatedInventoryRows],
  );
  const activePropertyLabel = activeRelatedPropertyRow?.label || "Not selected";

  const proposalPropertyOptions = React.useMemo(
    () =>
      relatedInventoryRows
        .filter((row) => row.id)
        .map((row) => ({
          id: row.id,
          inventory: row.inventory,
          label: row.label || `Property ${row.id.slice(-6).toUpperCase()}`,
          // What the client sees in proposals: never the building, tower or unit.
          clientLabel: getInventoryClientLabel(row.inventory) || `Property ${row.id.slice(-6).toUpperCase()}`,
          statusLabel: row.statusLabel,
          imageUrls: row.imageUrls,
        })),
    [relatedInventoryRows],
  );
  const proposalPropertyIds = React.useMemo(
    () => proposalPropertyOptions.map((row) => row.id),
    [proposalPropertyOptions],
  );
  const proposalPropertyIdSet = React.useMemo(
    () => new Set(proposalPropertyIds),
    [proposalPropertyIds],
  );

  React.useEffect(() => {
    setProposalValidityDays("7");
    setProposalSpecialNote("");
    setProposalActionMessage("");
    setIsGeneratingProposalPdf(false);
    setClosureUploadMessage("");
    setUploadingClosureDocuments(false);
    setLinkableInventoryTypeFilter("ALL");
    setVisiblePropertiesCount(INITIAL_PROPERTIES_RENDER_COUNT);
    setVisibleProposalOptionsCount(INITIAL_PROPOSAL_OPTIONS_RENDER_COUNT);
    setVisibleActivityCount(INITIAL_ACTIVITY_RENDER_COUNT);
    setActiveTab("overview");
    setHeaderMenuOpen(false);
    setEmailEditorOpen(false);
    setContactEditorOpen(false);
    setFollowUpEditorOpen(false);
    setPropertyPane("linked");
    setLinkedPropertyFilter("ALL");
    setLinkedPropertySearch("");
    setOpenPropertyMenuId("");
    setSiteVisitDateDraft("");
    setSiteVisitTimeDraft("");
    setScheduleVisitMessage("");
    setShowAllPropertyImages(false);
    setProposalStep(1);
    setShareMenuOpen(false);
    setIncludeProposalImages(true);
    setExcludedProposalImageUrls([]);
    setActivityFilter("ALL");
    setLogActivityMode("NOTE");
    setNewTaskFormOpen(false);
    setNewTaskDescription("");
    setTransferPanelOpen(false);
    pdfImageSourceCacheRef.current.clear();
  }, [selectedLead?._id]);

  React.useEffect(() => {
    if (!proposalPropertyIds.length) {
      setProposalSelectedPropertyIds([]);
      return;
    }

    setProposalSelectedPropertyIds((previous) => {
      const validSelection = previous.filter((id) => proposalPropertyIdSet.has(id));
      if (validSelection.length) {
        const sameSelection = validSelection.length === previous.length
          && validSelection.every((id, index) => id === previous[index]);
        return sameSelection ? previous : validSelection;
      }
      if (normalizedActiveInventoryId && proposalPropertyIdSet.has(normalizedActiveInventoryId)) {
        return [normalizedActiveInventoryId];
      }
      const fallbackId = proposalPropertyIds[0];
      if (previous.length === 1 && previous[0] === fallbackId) {
        return previous;
      }
      return [fallbackId];
    });
  }, [normalizedActiveInventoryId, proposalPropertyIdSet, proposalPropertyIds]);

  React.useEffect(() => () => {
    if (proposalMessageTimerRef.current) {
      clearTimeout(proposalMessageTimerRef.current);
    }
  }, []);

  const handleCreateRemainingPaymentFollowUp = React.useCallback(() => {
    setFollowUpDraft(buildDefaultCollectionFollowUp());
  }, [setFollowUpDraft]);

  const showProposalActionMessage = React.useCallback((message) => {
    setProposalActionMessage(message);
    if (proposalMessageTimerRef.current) {
      clearTimeout(proposalMessageTimerRef.current);
    }
    proposalMessageTimerRef.current = setTimeout(() => {
      setProposalActionMessage("");
      proposalMessageTimerRef.current = null;
    }, 2200);
  }, []);

  const uploadClosureDocumentFile = React.useCallback(async (file) => {
    const payload = await uploadFile(file, "lead-documents");

    const uploaded = sanitizeClosureDocument({
      url: payload.url,
      mimeType: file.type,
      name: file.name,
      size: file.size,
      kind: detectClosureDocumentKind(file.type),
    });

    if (!uploaded) {
      throw new Error("Invalid upload response");
    }

    return uploaded;
  }, []);

  const handleClosureDocumentsInput = React.useCallback(async (event) => {
    const selectedFiles = Array.from(event?.target?.files || []);
    if (event?.target) {
      event.target.value = "";
    }
    if (!selectedFiles.length) return;

    if (remainingClosureSlots <= 0) {
      setClosureUploadMessage(`Only ${MAX_CLOSURE_DOCUMENTS} documents are allowed`);
      return;
    }

    const allowedFiles = selectedFiles.slice(0, remainingClosureSlots);
    const validFiles = [];
    const skippedNames = [];

    allowedFiles.forEach((file) => {
      const mimeType = String(file?.type || "").trim().toLowerCase();
      const isAllowedType = mimeType.startsWith("image/") || mimeType === "application/pdf";
      if (!isAllowedType) {
        skippedNames.push(file?.name || "Unknown file");
        return;
      }
      if ((Number(file?.size) || 0) > MAX_CLOSURE_FILE_SIZE_BYTES) {
        skippedNames.push(file?.name || "Unknown file");
        return;
      }
      validFiles.push(file);
    });

    if (!validFiles.length) {
      setClosureUploadMessage("Please select JPG/PNG/WebP images or PDF files (max 25MB each)");
      return;
    }

    setUploadingClosureDocuments(true);
    setClosureUploadMessage("Uploading documents...");

    const uploadedRows = [];
    const failedNames = [];

    for (const file of validFiles) {
      try {
        const uploaded = await uploadClosureDocumentFile(file);
        uploadedRows.push(uploaded);
      } catch {
        failedNames.push(file.name || "Unknown file");
      }
    }

    if (uploadedRows.length > 0) {
      setClosureDocumentsDraft((previous) => {
        const merged = sanitizeClosureDocumentList([
          ...(Array.isArray(previous) ? previous : []),
          ...uploadedRows,
        ]);
        return merged;
      });
    }

    setUploadingClosureDocuments(false);

    const uploadedCount = uploadedRows.length;
    if (uploadedCount > 0 && failedNames.length === 0 && skippedNames.length === 0) {
      setClosureUploadMessage(`${uploadedCount} document${uploadedCount === 1 ? "" : "s"} uploaded`);
      return;
    }

    const messageParts = [];
    if (uploadedCount > 0) {
      messageParts.push(`${uploadedCount} uploaded`);
    }
    const rejectedCount = failedNames.length + skippedNames.length;
    if (rejectedCount > 0) {
      messageParts.push(`${rejectedCount} skipped`);
    }
    setClosureUploadMessage(messageParts.join(", "));
  }, [remainingClosureSlots, setClosureDocumentsDraft, uploadClosureDocumentFile]);

  const handleRemoveClosureDocument = React.useCallback((urlToRemove) => {
    setClosureDocumentsDraft((previous) => sanitizeClosureDocumentList(
      (Array.isArray(previous) ? previous : []).filter(
        (row) => String(row?.url || "") !== String(urlToRemove || ""),
      ),
    ));
  }, [setClosureDocumentsDraft]);

  const selectedProposalPropertyIdSet = React.useMemo(
    () => new Set(proposalSelectedPropertyIds),
    [proposalSelectedPropertyIds],
  );
  const selectedProposalPropertiesRaw = React.useMemo(() => {
    if (!proposalPropertyOptions.length || !selectedProposalPropertyIdSet.size) return [];
    return proposalPropertyOptions.filter((row) => selectedProposalPropertyIdSet.has(row.id));
  }, [proposalPropertyOptions, selectedProposalPropertyIdSet]);

  // Everything that leaves the app - preview, links, PDF, shares - reads the images the picker kept.
  const selectedProposalProperties = React.useMemo(
    () =>
      selectedProposalPropertiesRaw.map((row) => ({
        ...row,
        imageUrls: includeProposalImages
          ? row.imageUrls.filter((url) => !excludedProposalImageUrls.includes(url))
          : [],
      })),
    [excludedProposalImageUrls, includeProposalImages, selectedProposalPropertiesRaw],
  );

  const visibleProposalPropertyOptions = React.useMemo(
    () => proposalPropertyOptions.slice(0, visibleProposalOptionsCount),
    [proposalPropertyOptions, visibleProposalOptionsCount],
  );
  const hasMoreProposalPropertyOptions =
    proposalPropertyOptions.length > visibleProposalPropertyOptions.length;
  const visibleRelatedInventoryRows = React.useMemo(
    () => relatedInventoryRows.slice(0, visiblePropertiesCount),
    [relatedInventoryRows, visiblePropertiesCount],
  );
  const hasMoreRelatedInventories =
    relatedInventoryRows.length > visibleRelatedInventoryRows.length;
  const normalizedDiaryEntries = React.useMemo(
    () => (Array.isArray(diaryEntries) ? diaryEntries : []),
    [diaryEntries],
  );
  const normalizedActivities = React.useMemo(
    () => (Array.isArray(activities) ? activities : []),
    [activities],
  );
  const normalizedLeadStatus = String(statusDraft || selectedLead?.status || "").trim().toUpperCase();
  const showQualifiedTransferHelper =
    normalizedLeadStatus === "QUALIFIED_LEAD" || normalizedLeadStatus === "SITE_VISIT_REQUIRED";
  const currentOwnerName = selectedLead?.assignedTo?.name || "Unassigned";
  const currentOwnerRole = selectedLead?.assignedTo?.role || "";
  const assignmentHistoryEvents = React.useMemo(
    () => buildAssignmentHistoryEvents(selectedLead),
    [selectedLead],
  );
  const assigneeSearch = String(assigneeSearchDraft || "").trim().toLowerCase();
  const filteredAssignees = React.useMemo(() => {
    const rows = Array.isArray(executives) ? executives : [];
    if (!assigneeSearch) return rows;
    return rows.filter((user) => {
      const haystack = [
        user?.name,
        user?.role,
        user?.email,
        user?.phone,
      ].map((value) => String(value || "").toLowerCase()).join(" ");
      return haystack.includes(assigneeSearch);
    });
  }, [assigneeSearch, executives]);
  const selectedTransferAssignee = (Array.isArray(executives) ? executives : []).find(
    (user) => String(user?._id || "") === String(executiveDraft || ""),
  );
  const openAssigneePicker = () => {
    if (!canAssignLead) return;
    setAssigneeSearchDraft("");
    setAssigneeMenuOpen((open) => !open);
  };
  const selectTransferAssignee = (user) => {
    if (!user?._id) return;
    if (String(user._id) === String(selectedLead?.assignedTo?._id || "")) {
      setAssigneeMenuOpen(false);
      return;
    }
    setExecutiveDraft(user._id);
    setTransferReasonDraft("");
    setAssigneeMenuOpen(false);
    setTransferConfirmOpen(true);
  };
  const cancelTransferConfirmation = () => {
    setExecutiveDraft(selectedLead?.assignedTo?._id || "");
    setTransferReasonDraft("");
    setTransferConfirmOpen(false);
  };
  const sortedLinkableInventoryOptions = React.useMemo(
    () =>
      [...(Array.isArray(availableRelatedInventoryOptions) ? availableRelatedInventoryOptions : [])]
        .filter((inventory) => toInventoryApiStatus(inventory?.status) === "Available")
        .filter((inventory) => {
          const inventoryType = String(inventory?.type || "").trim().toUpperCase();
          // A "Both" listing is offered for sale and for rent, so it shows under each.
          if (linkableInventoryTypeFilter === "SALE") return inventoryType === "SALE" || inventoryType === "BOTH";
          if (linkableInventoryTypeFilter === "RENT") return inventoryType === "RENT" || inventoryType === "BOTH";
          return true;
        })
        .sort((a, b) => {
          const aLabel = String(getInventoryLeadLabel(a) || a?.title || a?._id || "").toLowerCase();
          const bLabel = String(getInventoryLeadLabel(b) || b?.title || b?._id || "").toLowerCase();
          const aText = `${aLabel} ${getInventoryLocationLabel(a).toLowerCase()}`;
          const bText = `${bLabel} ${getInventoryLocationLabel(b).toLowerCase()}`;
          return aText.localeCompare(bText);
        }),
    [
      availableRelatedInventoryOptions,
      getInventoryLeadLabel,
      linkableInventoryTypeFilter,
      toInventoryApiStatus,
    ],
  );

  React.useEffect(() => {
    if (!relatedInventoryDraft) return;
    const exists = sortedLinkableInventoryOptions.some(
      (inventory) => String(inventory?._id || "") === String(relatedInventoryDraft || ""),
    );
    if (!exists) {
      setRelatedInventoryDraft("");
    }
  }, [relatedInventoryDraft, setRelatedInventoryDraft, sortedLinkableInventoryOptions]);

  const selectedPropertyCount = selectedProposalProperties.length;
  const proposalSubjectPropertyLabel = React.useMemo(() => {
    if (selectedPropertyCount === 1) return selectedProposalProperties[0]?.label || activePropertyLabel;
    if (selectedPropertyCount > 1) return `${selectedPropertyCount} Properties`;
    return activePropertyLabel;
  }, [activePropertyLabel, selectedPropertyCount, selectedProposalProperties]);

  const proposalSubject = React.useMemo(
    () => `Property Proposal | ${proposalSubjectPropertyLabel}`,
    [proposalSubjectPropertyLabel],
  );
  const proposalFileBaseName = React.useMemo(
    () =>
      String(selectedLead?.name || "client")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "client",
    [selectedLead?.name],
  );
  const toProposalImageEntries = (properties) =>
    properties.flatMap((property) =>
      property.imageUrls.slice(0, PROPOSAL_MAX_IMAGES_PER_PROPERTY).map((url, index) => ({
        url,
        propertyId: property.id,
        propertyLabel: property.clientLabel,
        imageIndex: index + 1,
      })),
    );
  // The picker lists every image; proposalImageEntries is only the ones that ship.
  const allProposalImageEntries = React.useMemo(
    () => toProposalImageEntries(selectedProposalPropertiesRaw),
    [selectedProposalPropertiesRaw],
  );
  const proposalImageEntries = React.useMemo(
    () => toProposalImageEntries(selectedProposalProperties),
    [selectedProposalProperties],
  );
  const proposalPreviewImageEntries = React.useMemo(
    () => proposalImageEntries.slice(0, 8),
    [proposalImageEntries],
  );

  const proposalImageLinksText = React.useMemo(
    () => {
      if (!selectedProposalProperties.length) return "";
      const lines = [];
      selectedProposalProperties.forEach((property, propertyIndex) => {
        lines.push(`${propertyIndex + 1}. ${property.clientLabel}`);
        if (!property.imageUrls.length) {
          lines.push("   - No images");
          lines.push("");
          return;
        }
        property.imageUrls.forEach((url, imageIndex) => {
          lines.push(`   - ${imageIndex + 1}. ${url}`);
        });
        lines.push("");
      });
      return lines.join("\n").trim();
    },
    [selectedProposalProperties],
  );

  const proposalText = React.useMemo(() => {
    const now = new Date();
    const proposalDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
    const validityDays = String(proposalValidityDays || "7").trim() || "7";
    const clientName = String(selectedLead?.name || "Client").trim();

    const lines = [
      "THE OFFICE ON RENT - PROPERTY PROPOSAL",
      `Date: ${proposalDate}`,
      "",
      `Dear ${clientName},`,
      "Thank you for your interest. Please find your selected property proposal below:",
      `Selected Properties: ${selectedPropertyCount}`,
    ];

    selectedProposalProperties.forEach((property, index) => {
      const inventory = property.inventory || {};
      lines.push("");
      lines.push(`Property ${index + 1}: ${property.clientLabel}`);
      lines.push(`Project: ${String(inventory?.projectName || selectedLead?.projectInterested || "-").trim() || "-"}`);
      lines.push(`Location: ${getInventoryLocationLabel(inventory) || String(selectedLead?.city || "-").trim() || "-"}`);
      lines.push(`Property Type: ${String(inventory?.type || "Sale").trim() || "-"}`);
      lines.push(`Inventory Category: ${toTitleCaseLabel(inventory?.inventoryType) || "-"}`);
      lines.push(`Category: ${String(inventory?.category || "Apartment").trim() || "-"}`);
      lines.push(`${getInventoryAmountLabel(inventory)}: ${formatInventoryAmountInr(inventory)}`);
      if (shareLinks[property.id]) {
        lines.push(`Details Link: ${shareLinks[property.id]}`);
      }
    });

    lines.push("");
    lines.push(`Validity: ${validityDays} day(s)`);
    if (proposalSpecialNote) lines.push(`Special Note: ${proposalSpecialNote}`);
    lines.push("", "Regards,", "The Office on Rent");

    if (!selectedProposalProperties.length) {
      return [
        "THE OFFICE ON RENT - PROPERTY PROPOSAL",
        "",
        "Select at least one linked property to generate the proposal.",
      ].join("\n");
    }

    return lines.filter(Boolean).join("\n");
  }, [
    proposalSpecialNote,
    proposalValidityDays,
    selectedLead?.city,
    selectedLead?.name,
    selectedLead?.projectInterested,
    selectedPropertyCount,
    selectedProposalProperties,
    shareLinks,
  ]);

  const proposalWhatsAppHref = React.useMemo(() => {
    if (!proposalShareBaseWhatsappHref || !selectedProposalProperties.length) return "";
    const separator = proposalShareBaseWhatsappHref.includes("?") ? "&" : "?";
    return `${proposalShareBaseWhatsappHref}${separator}text=${encodeURIComponent(proposalText)}`;
  }, [proposalShareBaseWhatsappHref, proposalText, selectedProposalProperties.length]);

  const proposalMailHref = React.useMemo(() => {
    const emailAddress = String(selectedLead?.email || "").trim();
    const subject = encodeURIComponent(proposalSubject);
    const body = encodeURIComponent(proposalText);
    return emailAddress
      ? `mailto:${emailAddress}?subject=${subject}&body=${body}`
      : `mailto:?subject=${subject}&body=${body}`;
  }, [proposalSubject, proposalText, selectedLead?.email]);

  const canUseNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const hasProposalImages = proposalImageEntries.length > 0;

  const toggleProposalProperty = (propertyId) => {
    const normalizedId = String(propertyId || "");
    if (!normalizedId) return;
    setProposalSelectedPropertyIds((previous) => {
      if (previous.includes(normalizedId)) {
        if (previous.length === 1) return previous;
        return previous.filter((id) => id !== normalizedId);
      }
      return [...previous, normalizedId];
    });
  };

  const handleSelectAllProposalProperties = () => {
    setProposalSelectedPropertyIds((previous) => {
      if (
        previous.length === proposalPropertyIds.length
        && previous.every((id, index) => id === proposalPropertyIds[index])
      ) {
        return previous;
      }
      return proposalPropertyIds;
    });
  };

  const handleResetProposalSelection = () => {
    if (!proposalPropertyIds.length) {
      setProposalSelectedPropertyIds([]);
      return;
    }
    if (normalizedActiveInventoryId && proposalPropertyIdSet.has(normalizedActiveInventoryId)) {
      setProposalSelectedPropertyIds([normalizedActiveInventoryId]);
      return;
    }
    setProposalSelectedPropertyIds([proposalPropertyIds[0]]);
  };

  const handleCopyProposal = async () => {
    try {
      const copied = await copyTextToClipboard(proposalText);
      if (copied) {
        showProposalActionMessage("Proposal copied");
        return;
      }
      showProposalActionMessage("Copy is not supported on this browser");
    } catch {
      showProposalActionMessage("Unable to copy proposal");
    }
  };

  const fetchPdfImageSource = async (imageUrl) => {
    const normalizedUrl = String(imageUrl || "").trim();
    if (!normalizedUrl) {
      throw new Error("Invalid image url");
    }

    const cached = pdfImageSourceCacheRef.current.get(normalizedUrl);
    if (cached) {
      return cached;
    }

    const response = await fetch(normalizedUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch image for PDF");
    }
    const blob = await response.blob();
    const source = await blobToPdfImageSource(blob);
    pdfImageSourceCacheRef.current.set(normalizedUrl, source);
    return source;
  };

  const buildProposalPdfBlob = async () => {
    if (!selectedProposalProperties.length) return null;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36;
    let cursorY = margin;

    const validityDays = String(proposalValidityDays || "7").trim() || "7";
    const clientName = String(selectedLead?.name || "Client").trim();
    const now = new Date();
    const proposalDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    const formatCurrencyPdf = (value) => {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) return "On request";
      return `Rs. ${amount.toLocaleString("en-IN")}`;
    };

    // Page 1 Header
    doc.setFillColor(15, 118, 110); // Teal primary color
    doc.rect(0, 0, 595, 100, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("THE OFFICE ON RENT", 36, 45);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(204, 251, 241); // Light teal text
    doc.text("PROPERTY PROPOSAL SUMMARY", 36, 68);

    // Client & Metadata details
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate 500
    doc.text("PREPARED FOR:", 36, 135);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42); // slate 900
    doc.text(clientName.toUpperCase(), 36, 153);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("PROPOSAL DATE:", 360, 135);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(proposalDate, 360, 153);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("VALIDITY:", 470, 135);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${validityDays} Days`, 470, 153);

    // Separator line
    doc.setDrawColor(226, 232, 240); // slate 200
    doc.setLineWidth(1);
    doc.line(36, 175, 559, 175);

    cursorY = 200;

    for (let i = 0; i < selectedProposalProperties.length; i++) {
      const property = selectedProposalProperties[i];
      const inventory = property.inventory || {};
      const hasImages = property.imageUrls.length > 0;
      const spaceNeeded = hasImages ? 280 : 130;

      // Add a page break if details + photos won't fit on this page
      if (cursorY + spaceNeeded > pageHeight - margin) {
        doc.addPage();
        // Page header on subsequent pages
        doc.setFillColor(15, 118, 110);
        doc.rect(0, 0, 595, 35, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(`PROPERTY PROPOSAL FOR ${clientName.toUpperCase()}`, 36, 22);
        cursorY = 60;
      }

      // Property title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 118, 110); // Teal accent
      doc.text(`PROPERTY ${i + 1}: ${property.clientLabel.toUpperCase()}`, 36, cursorY);

      // Property card boundary box
      const cardStart = cursorY + 10;
      doc.setDrawColor(241, 245, 249); // slate 100
      doc.setFillColor(248, 250, 252); // slate 50
      doc.rect(36, cardStart, 523, 90, "FD");

      // Key details column 1 (x=50)
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text("Project:", 50, cardStart + 22);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(String(inventory?.projectName || selectedLead?.projectInterested || "-").trim(), 125, cardStart + 22);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text("Location:", 50, cardStart + 42);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(String(getInventoryLocationLabel(inventory) || selectedLead?.city || "-").trim(), 125, cardStart + 42);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text("Type:", 50, cardStart + 62);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(String(inventory?.type || "Sale").trim(), 125, cardStart + 62);

      // Key details column 2 (x=300)
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text("Category:", 300, cardStart + 22);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(String(inventory?.category || "Apartment").trim(), 370, cardStart + 22);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text(getInventoryListingType(inventory) === "RENT" ? "Rent:" : "Asking Price:", 300, cardStart + 42);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129); // Emerald price tag
      doc.text(formatInventoryAmountInr(inventory, formatCurrencyPdf).replace("·", "|"), 370, cardStart + 42);

      // Clickable detail link inside PDF
      const shareUrl = shareLinks[property.id];
      if (shareUrl) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(3, 102, 214); // Blue link color
        doc.text("CLICK TO VIEW DETAILS ONLINE", 300, cardStart + 62);
        const linkWidth = doc.getTextWidth("CLICK TO VIEW DETAILS ONLINE");
        // Draw underline
        doc.setDrawColor(3, 102, 214);
        doc.setLineWidth(0.5);
        doc.line(300, cardStart + 64, 300 + linkWidth, cardStart + 64);
        // Create actual PDF click link
        doc.link(300, cardStart + 52, linkWidth, 12, { url: shareUrl });
      }

      cursorY = cardStart + 105;

      // Draw property images if available
      const images = property.imageUrls.slice(0, 2); // limit to 2 inline images side-by-side
      if (images.length > 0) {
        const imgWidth = 250;
        const imgHeight = 140;

        for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
          const imgUrl = images[imgIdx];
          const imgX = 36 + (imgIdx * (imgWidth + 23)); // 23pt gutter gap

          try {
            const source = await fetchPdfImageSource(imgUrl);
            doc.addImage(
              source.dataUrl,
              source.format || "JPEG",
              imgX,
              cursorY,
              imgWidth,
              imgHeight,
              undefined,
              "FAST"
            );
          } catch {
            // Draw placeholder card if load fails
            doc.setDrawColor(226, 232, 240);
            doc.setFillColor(248, 250, 252);
            doc.rect(imgX, cursorY, imgWidth, imgHeight, "FD");
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text("Photo preview unavailable", imgX + 70, cursorY + 75);
          }
        }
        cursorY += imgHeight + 25;
      } else {
        cursorY += 15;
      }
    }

    // Special Note and Footer
    const footerNeededSpace = proposalSpecialNote ? 100 : 50;
    if (cursorY + footerNeededSpace > pageHeight - margin) {
      doc.addPage();
      doc.setFillColor(15, 118, 110);
      doc.rect(0, 0, 595, 35, "F");
      cursorY = 60;
    }

    if (proposalSpecialNote) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("SPECIAL NOTE:", 36, cursorY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      const noteLines = doc.splitTextToSize(proposalSpecialNote, 523);
      doc.text(noteLines, 36, cursorY + 15);
      cursorY += (noteLines.length * 12) + 25;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text("Regards,", 36, cursorY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 118, 110);
    doc.text("The Office on Rent", 36, cursorY + 15);

    // Apply Page Numbers on all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${p} of ${totalPages}`, 500, 815);
      doc.text("Generated by The Office On Rent", 36, 815);
    }

    return doc.output("blob");
  };

  const buildProposalPdfFile = async () => {
    const pdfBlob = await buildProposalPdfBlob();
    if (!pdfBlob) return null;
    const fileName = `proposal-${proposalFileBaseName}-${Date.now()}.pdf`;
    if (typeof File !== "undefined") {
      return new File([pdfBlob], fileName, { type: "application/pdf" });
    }
    return { blob: pdfBlob, fileName };
  };

  const triggerDownloadBlob = (blob, fileName) => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const toPdfDownloadPayload = (pdfFileLike) => {
    if (!pdfFileLike) return null;
    if (pdfFileLike instanceof File) {
      return { blob: pdfFileLike, fileName: pdfFileLike.name };
    }
    if (pdfFileLike?.blob && pdfFileLike?.fileName) {
      return { blob: pdfFileLike.blob, fileName: pdfFileLike.fileName };
    }
    return null;
  };

  const shareFilesWithNativeFallback = async (files, options = {}) => {
    if (!canUseNativeShare || !Array.isArray(files) || !files.length) return false;
    const title = String(options?.title || "").trim();
    const text = String(options?.text || "").trim();
    const payloads = [
      { title, text, files },
      { title, files },
      { text, files },
      { files },
    ];

    for (let i = 0; i < payloads.length; i += 1) {
      const payload = payloads[i];
      const sanitizedPayload = Object.fromEntries(
        Object.entries(payload).filter(([, value]) => {
          if (Array.isArray(value)) return value.length > 0;
          return Boolean(value);
        }),
      );

      try {
        if (sanitizedPayload.files && typeof navigator.canShare === "function") {
          const canShareFiles = navigator.canShare({ files: sanitizedPayload.files });
          if (!canShareFiles) continue;
        }
        await navigator.share(sanitizedPayload);
        return true;
      } catch (shareError) {
        if (String(shareError?.name || "") === "AbortError") {
          throw shareError;
        }
      }
    }
    return false;
  };

  const handleDownloadProposal = async () => {
    if (!selectedProposalProperties.length) {
      showProposalActionMessage("Select at least one property");
      return;
    }

    setIsGeneratingProposalPdf(true);
    try {
      const pdfFile = await buildProposalPdfFile();
      if (!pdfFile) {
        showProposalActionMessage("Unable to generate proposal PDF");
        return;
      }

      if (pdfFile instanceof File) {
        triggerDownloadBlob(pdfFile, pdfFile.name);
      } else {
        triggerDownloadBlob(pdfFile.blob, pdfFile.fileName);
      }
      showProposalActionMessage("Proposal PDF downloaded");
    } catch {
      showProposalActionMessage("Unable to generate proposal PDF");
    } finally {
      setIsGeneratingProposalPdf(false);
    }
  };

  const handleCopyImageLinks = async () => {
    if (!hasProposalImages) {
      showProposalActionMessage("No property images found");
      return;
    }

    try {
      const copied = await copyTextToClipboard(proposalImageLinksText);
      if (copied) {
        showProposalActionMessage("Image links copied");
        return;
      }
      showProposalActionMessage("Copy is not supported on this browser");
    } catch {
      showProposalActionMessage("Unable to copy image links");
    }
  };

  const fetchShareableImageFile = async (imageEntry, index) => {
    const response = await fetch(imageEntry.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image ${index + 1}`);
    }

    const blob = await response.blob();
    const extension = resolveImageExtension(imageEntry.url, blob.type);
    const propertySlug = String(imageEntry.propertyLabel || "property")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return new File(
      [blob],
      `${propertySlug || "property"}-image-${imageEntry.imageIndex}.${extension}`,
      { type: blob.type || `image/${extension}` },
    );
  };

  const buildShareableImageFiles = async () => {
    const settled = await Promise.allSettled(
      proposalPreviewImageEntries.map((entry, index) => fetchShareableImageFile(entry, index)),
    );
    return settled
      .filter((row) => row.status === "fulfilled")
      .map((row) => row.value);
  };

  const handleNativeShareImages = async () => {
    if (!hasProposalImages) {
      showProposalActionMessage("No property images found");
      return;
    }

    if (!canUseNativeShare) {
      showProposalActionMessage("Direct image sharing is not supported in this browser");
      return;
    }

    try {
      const files = await buildShareableImageFiles();

      if (!files.length) {
        showProposalActionMessage("Images could not be prepared for attachment sharing");
        return;
      }

      if (typeof navigator.canShare === "function" && !navigator.canShare({ files })) {
        showProposalActionMessage("Attachment sharing is not supported on this device");
        return;
      }

      await navigator.share({
        title: `${proposalSubject} - Images`,
        text: `Property images for ${proposalSubjectPropertyLabel}`,
        files,
      });
      showProposalActionMessage(`Shared ${files.length} image(s)`);
    } catch (error) {
      if (String(error?.name || "") === "AbortError") return;
      showProposalActionMessage("Image share failed. Try using mobile share sheet.");
    }
  };

  const handleShareToWhatsApp = async () => {
    if (!selectedProposalProperties.length) {
      showProposalActionMessage("Select at least one property");
      return;
    }

    setIsGeneratingProposalPdf(true);
    try {
      const pdfFile = await buildProposalPdfFile();
      if (pdfFile instanceof File && canUseNativeShare) {
        const shared = await shareFilesWithNativeFallback([pdfFile], {
          title: proposalSubject,
          text: proposalText,
        });
        if (shared) {
          showProposalActionMessage("Proposal ready. Choose WhatsApp in share options.");
          return;
        }
      }
    } catch {
      // fallback handled below
    } finally {
      setIsGeneratingProposalPdf(false);
    }

    if (proposalWhatsAppHref && typeof window !== "undefined") {
      window.open(proposalWhatsAppHref, "_blank", "noopener,noreferrer");
      showProposalActionMessage("Opening WhatsApp chat");
      return;
    }

    await handleCopyProposal();
    showProposalActionMessage("WhatsApp unavailable. Proposal copied.");
  };

  const handleShareByEmail = () => {
    if (!selectedProposalProperties.length) {
      showProposalActionMessage("Select at least one property");
      return;
    }
    if (typeof window === "undefined") return;
    window.location.href = proposalMailHref;
  };

  const handleNativeShareProposal = async () => {
    if (!selectedProposalProperties.length) {
      showProposalActionMessage("Select at least one property");
      return;
    }

    let generatedPdfFile = null;
    setIsGeneratingProposalPdf(true);
    try {
      generatedPdfFile = await buildProposalPdfFile();
      if (!generatedPdfFile) {
        showProposalActionMessage("Unable to generate proposal PDF");
        return;
      }

      if (generatedPdfFile instanceof File && canUseNativeShare) {
        const shared = await shareFilesWithNativeFallback([generatedPdfFile], {
          title: proposalSubject,
          text: proposalText,
        });
        if (shared) {
          showProposalActionMessage("Proposal PDF shared");
          return;
        }
      }

      const fallbackDownload = toPdfDownloadPayload(generatedPdfFile);
      if (fallbackDownload) {
        triggerDownloadBlob(fallbackDownload.blob, fallbackDownload.fileName);
        showProposalActionMessage("PDF share unsupported. PDF downloaded.");
        return;
      }
    } catch (error) {
      if (String(error?.name || "") === "AbortError") return;
      console.error("Proposal PDF share failed", error);
      showProposalActionMessage("PDF share failed. Downloading instead.");
      const generatedFallback = toPdfDownloadPayload(generatedPdfFile);
      if (generatedFallback) {
        triggerDownloadBlob(generatedFallback.blob, generatedFallback.fileName);
        return;
      }
      try {
        const regeneratedPdfFile = await buildProposalPdfFile();
        const fallbackDownload = toPdfDownloadPayload(regeneratedPdfFile);
        if (fallbackDownload) {
          triggerDownloadBlob(fallbackDownload.blob, fallbackDownload.fileName);
        }
      } catch {
        // Ignore fallback failure.
      }
    } finally {
      setIsGeneratingProposalPdf(false);
    }
  };

  const closureDocumentsBlock = (
              <div className={`mt-3 rounded-xl border p-3 space-y-3 ${softCard}`}>
                <div className={`flex items-center justify-between gap-2 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  <div className={`text-[10px] uppercase tracking-wider font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Document Submission</div>
                  <div className="text-[10px]">
                    {normalizedClosureDocuments.length}/{MAX_CLOSURE_DOCUMENTS}
                  </div>
                </div>
                <div className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Upload closing proof documents (photos or PDF).
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={`inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border px-3 text-xs font-semibold ${
                      uploadingClosureDocuments || remainingClosureSlots <= 0 ? `${input} cursor-not-allowed opacity-60` : button
                    }`}
                  >
                    {uploadingClosureDocuments ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
                    {uploadingClosureDocuments ? "Uploading..." : "Add Photos / PDFs"}
                    <input
                      type="file"
                      accept={CLOSURE_DOCUMENT_ACCEPT}
                      multiple
                      disabled={uploadingClosureDocuments || remainingClosureSlots <= 0}
                      onChange={handleClosureDocumentsInput}
                      className="hidden"
                    />
                  </label>
                  <div className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Max file size: 25MB each
                  </div>
                </div>
                {closureUploadMessage ? (
                  <div className={`text-[11px] font-semibold ${isDark ? "text-emerald-200" : "text-emerald-700"}`}>
                    {closureUploadMessage}
                  </div>
                ) : null}

                {normalizedClosureDocuments.length === 0 ? (
                  <div className={`rounded-lg border px-3 py-2 text-xs ${isDark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500"}`}>
                    No documents uploaded yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {normalizedClosureDocuments.map((doc, index) => (
                      <div key={doc.url || `${doc.name}-${index}`} className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-2 ${input}`}>
                        <div className="min-w-0">
                          <div className={`truncate text-xs font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                            {doc.name || `Document ${index + 1}`}
                          </div>
                          <div className={`text-[10px] uppercase tracking-wide ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            {doc.kind || "file"} - {formatFileSize(doc.size)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${button}`}
                            title="View document"
                          >
                            <Eye size={13} />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRemoveClosureDocument(doc.url)}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${button}`}
                            title="Remove document"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
  );

  const dealPaymentBlock = (
              <div className={`mt-3 rounded-xl border p-3 space-y-3 ${softCard}`}>
                <div className={`text-[10px] uppercase tracking-wider font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Deal Payment & Approval</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={paymentModeDraft}
                    onChange={(event) => { const nextMode = String(event.target.value || ""); setPaymentModeDraft(nextMode); if (nextMode === "CASH") setPaymentReferenceDraft(""); }}
                    className={`h-9 w-full rounded-lg border px-2 text-xs ${input}`}
                  >
                    <option value="">Payment mode</option>
                    {dealPaymentModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                  </select>
                  <select
                    value={paymentTypeDraft}
                    onChange={(event) => {
                      const nextPaymentType = String(event.target.value || "");
                      setPaymentTypeDraft(nextPaymentType);
                      if (nextPaymentType === "PARTIAL" && !String(followUpDraft || "").trim()) {
                        setFollowUpDraft(buildDefaultCollectionFollowUp());
                      }
                    }}
                    className={`h-9 w-full rounded-lg border px-2 text-xs ${input}`}
                  >
                    <option value="">Payment type</option>
                    {dealPaymentTypes.map((paymentType) => <option key={paymentType.value} value={paymentType.value}>{paymentType.label}</option>)}
                  </select>
                </div>
                {requiresPaymentReference ? (
                  <input type="text" value={paymentReferenceDraft} onChange={(event) => setPaymentReferenceDraft(event.target.value)} placeholder="UTR / Txn / Cheque no." className={`h-9 w-full rounded-lg border px-3 text-sm ${input}`} />
                ) : null}
                {showRemainingAmountField ? (
                  <input type="number" min="0" step="0.01" value={paymentRemainingDraft} onChange={(event) => setPaymentRemainingDraft(event.target.value)} placeholder="Remaining amount" className={`h-9 w-full rounded-lg border px-3 text-sm ${input}`} />
                ) : null}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Brokerage Received *
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={brokerageReceivedDraft}
                      onChange={(event) => setBrokerageReceivedDraft(event.target.value)}
                      placeholder="Company brokerage received"
                      className={`h-9 w-full rounded-lg border px-3 text-sm ${input}`}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Brokerage Distributed
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={brokerageDistributedDraft}
                      onChange={(event) => setBrokerageDistributedDraft(event.target.value)}
                      placeholder="0"
                      className={`h-9 w-full rounded-lg border px-3 text-sm ${input}`}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Brokerage Paid By
                    </span>
                    <select
                      value={brokerageExtraDraft.source}
                      onChange={(event) => setBrokerageExtraDraft((prev) => ({ ...prev, source: event.target.value }))}
                      className={`h-9 w-full rounded-lg border px-2 text-xs ${input}`}
                    >
                      <option value="">Not set</option>
                      <option value="TENANT">Tenant</option>
                      <option value="OWNER">Owner</option>
                      <option value="BOTH">Both</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Agreed Brokerage
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={brokerageExtraDraft.agreed}
                      onChange={(event) => setBrokerageExtraDraft((prev) => ({ ...prev, agreed: event.target.value }))}
                      placeholder="Total agreed"
                      className={`h-9 w-full rounded-lg border px-3 text-sm ${input}`}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Brokerage Payment Date
                    </span>
                    <input
                      type="date"
                      value={brokerageExtraDraft.paymentDate}
                      onChange={(event) => setBrokerageExtraDraft((prev) => ({ ...prev, paymentDate: event.target.value }))}
                      className={`h-9 w-full rounded-lg border px-3 text-sm ${input}`}
                    />
                  </label>
                </div>
                {(() => {
                  const agreed = brokerageExtraDraft.agreed === "" ? null : Number(brokerageExtraDraft.agreed);
                  const received = Number(brokerageReceivedDraft) || 0;
                  const pending = agreed !== null && Number.isFinite(agreed) ? Math.max(0, agreed - received) : null;
                  return pending ? (
                    <div className={`rounded-lg border px-2 py-1.5 text-[11px] ${isDark ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                      Pending brokerage: {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(pending)}
                    </div>
                  ) : null;
                })()}
                <div className={`rounded-lg border px-2 py-1.5 text-[11px] ${isDark ? "border-sky-500/30 bg-sky-500/10 text-sky-100" : "border-sky-200 bg-sky-50 text-sky-700"}`}>
                  Only Brokerage Received will be counted as company revenue.
                </div>
                <textarea value={paymentNoteDraft} onChange={(event) => setPaymentNoteDraft(event.target.value)} placeholder="Executive payment note..." maxLength={1000} className={`min-h-[68px] w-full rounded-lg border px-3 py-2 text-xs ${input}`} />
                <div className={`rounded-lg border px-2 py-1.5 text-xs ${
                  currentApprovalStatus === "APPROVED"
                    ? isDark ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : currentApprovalStatus === "REJECTED"
                      ? isDark ? "border-rose-500/40 bg-rose-500/10 text-rose-100" : "border-rose-200 bg-rose-50 text-rose-700"
                      : isDark ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-700"
                }`}>
                  Payment Approval Status: {approvalLabel(currentApprovalStatus)}
                </div>
                {canReviewDealPayment ? (
                  <div className="space-y-2">
                    <select value={paymentApprovalStatusDraft} onChange={(event) => setPaymentApprovalStatusDraft(event.target.value)} className={`h-9 w-full rounded-lg border px-2 text-xs ${input}`}>
                      <option value="">Keep current status</option>
                      {dealPaymentAdminDecisions.map((decision) => <option key={decision.value} value={decision.value}>{decision.label}</option>)}
                    </select>
                    <textarea value={paymentApprovalNoteDraft} onChange={(event) => setPaymentApprovalNoteDraft(event.target.value)} placeholder="Admin note..." maxLength={1000} className={`min-h-[60px] w-full rounded-lg border px-3 py-2 text-xs ${input}`} />
                  </div>
                ) : null}
              </div>
  );

  const shellSurface = isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white";
  const shellCard = `rounded-xl border ${shellSurface} ${isDark ? "" : "shadow-[0_1px_2px_rgba(16,24,40,0.05)]"}`;
  const headingText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";
  const dividerBorder = isDark ? "border-slate-800" : "border-slate-200";
  const fieldCls = `h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 ${
    isDark
      ? "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
      : "border-slate-300 bg-white text-slate-800 placeholder:text-slate-400"
  }`;
  const areaCls = `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 ${
    isDark
      ? "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
      : "border-slate-300 bg-white text-slate-800 placeholder:text-slate-400"
  }`;
  const ghostBtn = `inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3.5 text-[13px] font-semibold transition ${
    isDark
      ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  }`;
  const smallGhostBtn = `inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${
    isDark
      ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  }`;
  const blueBtn =
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
  const smallBlueBtn =
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
  const labelCls = `mb-1.5 block text-[13px] font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`;
  const cardTitle = `text-[15px] font-bold ${headingText}`;

  const toneClass = (tone) => {
    const tones = {
      emerald: isDark ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700",
      blue: isDark ? "border-blue-500/35 bg-blue-500/10 text-blue-200" : "border-blue-200 bg-blue-50 text-blue-700",
      indigo: isDark ? "border-indigo-500/35 bg-indigo-500/10 text-indigo-200" : "border-indigo-200 bg-indigo-50 text-indigo-700",
      violet: isDark ? "border-violet-500/35 bg-violet-500/10 text-violet-200" : "border-violet-200 bg-violet-50 text-violet-700",
      amber: isDark ? "border-amber-500/35 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-700",
      rose: isDark ? "border-rose-500/35 bg-rose-500/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700",
      orange: isDark ? "border-orange-500/35 bg-orange-500/10 text-orange-200" : "border-orange-200 bg-orange-50 text-orange-700",
      slate: isDark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-200 bg-slate-100 text-slate-600",
    };
    return tones[tone] || tones.slate;
  };
  const pillCls = (tone) =>
    `inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${toneClass(tone)}`;

  const leadDisplayName = String(nameDraft || "").trim() || selectedLead?.name || "Lead";
  const leadInitials =
    leadDisplayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "L";
  const leadIdLabel = String(selectedLead?._id || "").slice(-6).toUpperCase();
  const assignedToName = selectedLead?.assignedTo?.name || "Unassigned";
  const assignedToInitials =
    String(assignedToName)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "NA";
  const leadPhoneLabel = String(phoneDraft || selectedLead?.phone || "").trim();
  const leadEmailLabel = String(emailDraft || selectedLead?.email || "").trim();
  const leadProjectLabel = String(projectInterestedDraft || selectedLead?.projectInterested || "").trim();

  const savedFollowUpValue = toDateTimeInputValue(selectedLead?.nextFollowUp);
  const savedSiteLat = selectedLead?.siteLocation?.lat ?? selectedLeadSiteLat;
  const savedSiteLng = selectedLead?.siteLocation?.lng ?? selectedLeadSiteLng;
  // The save bar only shows up once something on this page actually differs from the saved lead.
  const hasPendingLeadEdits =
    String(statusDraft || "") !== String(selectedLead?.status || "")
    || String(followUpDraft || "") !== String(savedFollowUpValue || "")
    || String(siteLatDraft ?? "") !== String(savedSiteLat ?? "")
    || String(siteLngDraft ?? "") !== String(savedSiteLng ?? "")
    || String(nameDraft || "") !== String(selectedLead?.name || "")
    || String(phoneDraft || "") !== String(selectedLead?.phone || "")
    || String(emailDraft || "") !== String(selectedLead?.email || "")
    || String(cityDraft || "") !== String(selectedLead?.city || "")
    || String(clientProfessionDraft || "") !== String(selectedLead?.clientProfession || "")
    || String(projectInterestedDraft || "") !== String(selectedLead?.projectInterested || "")
    || contactEditorOpen
    || emailEditorOpen;

  const followUpDate = followUpDraft ? new Date(followUpDraft) : null;
  const hasValidFollowUp = Boolean(followUpDate) && !Number.isNaN(followUpDate.getTime());
  const isFollowUpOverdue = hasValidFollowUp && followUpDate.getTime() < Date.now();

  const handleCopyLeadId = async () => {
    try {
      await navigator.clipboard.writeText(leadIdLabel);
      showProposalActionMessage("Lead ID copied");
    } catch {
      showProposalActionMessage("Could not copy lead ID");
    }
  };

  const handleScheduleSiteVisit = () => {
    if (!siteVisitDateDraft) {
      setScheduleVisitMessage("Pick a visit date first.");
      return;
    }
    const time = siteVisitTimeDraft || "11:00";
    setFollowUpDraft(`${siteVisitDateDraft}T${time}`);
    if ((leadStatuses || []).includes("SITE_VISIT")) setStatusDraft("SITE_VISIT");
    setScheduleVisitMessage("Site visit set. Save changes to confirm.");
  };

  const activityIconFor = (activity) => {
    const text = String(activity?.action || "").toLowerCase();
    if (text.includes("call")) return { Icon: Phone, tone: "emerald" };
    if (text.includes("visit")) return { Icon: MapPin, tone: "blue" };
    if (text.includes("assign") || text.includes("transfer")) return { Icon: Users, tone: "amber" };
    if (text.includes("propert") || text.includes("inventory")) return { Icon: Building2, tone: "violet" };
    if (text.includes("created")) return { Icon: User, tone: "orange" };
    return { Icon: FileText, tone: "indigo" };
  };

  const activityMatchesFilter = (activity) => {
    const text = String(activity?.action || "").toLowerCase();
    if (activityFilter === "ALL") return true;
    if (activityFilter === "NOTES") return text.includes("note") || text.includes("diary");
    if (activityFilter === "CALLS") return text.includes("call");
    if (activityFilter === "VISITS") return text.includes("visit");
    if (activityFilter === "ASSIGNMENTS") return text.includes("assign") || text.includes("transfer");
    if (activityFilter === "PROPERTIES") return text.includes("propert") || text.includes("inventory");
    return true;
  };
  const combinedTimelineEntries = [
    ...normalizedActivities.map((activity) => ({
      key: `activity-${activity._id}`,
      title: activity.action,
      detail: "",
      author: activity.performedBy?.name || "",
      at: activity.createdAt,
    })),
    ...normalizedDiaryEntries.map((entry) => ({
      key: `note-${entry._id}`,
      title: "Note added",
      detail: entry.note,
      author: entry.createdBy?.name || "",
      at: entry.createdAt,
    })),
  ]
    .filter((entry) => activityMatchesFilter({ action: `${entry.title} ${entry.detail}` }))
    .sort((left, right) => new Date(right.at || 0).getTime() - new Date(left.at || 0).getTime());
  const visibleTimelineEntries = combinedTimelineEntries.slice(0, visibleActivityCount);
  const hasMoreTimelineEntries = combinedTimelineEntries.length > visibleTimelineEntries.length;

  const handleLogActivityMode = (mode) => {
    setLogActivityMode(mode);
    const prefixes = { NOTE: "", CALL: "Call: ", VISIT: "Visit: " };
    const nextPrefix = prefixes[mode] || "";
    const currentNote = String(diaryDraft || "");
    const withoutPrefix = currentNote.replace(/^(Call|Visit):\s*/, "");
    setDiaryDraft(`${nextPrefix}${withoutPrefix}`);
  };

  const propertyMatchesFilters = (row) => {
    const listingType = getInventoryListingType(row?.inventory);
    if (linkedPropertyFilter === "SALE" && listingType !== "SALE") return false;
    if (linkedPropertyFilter === "RENT" && listingType !== "RENT") return false;
    const term = String(linkedPropertySearch || "").trim().toLowerCase();
    if (!term) return true;
    return [row.label, row.location, row.id, row?.inventory?.projectName]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(term));
  };
  const filteredLinkedRows = visibleRelatedInventoryRows.filter(propertyMatchesFilters);

  const selectedPropertyRow = activeRelatedPropertyRow || relatedInventoryRows[0] || null;
  const selectedPropertyInventory = selectedPropertyRow?.inventory || {};
  const selectedPropertyImages = selectedPropertyRow?.imageUrls || [];
  const hasSiteCoordinates =
    savedSiteLat !== null && savedSiteLat !== undefined && savedSiteLng !== null && savedSiteLng !== undefined;
  const selectedPropertyMapsHref = hasSiteCoordinates
    ? `https://www.google.com/maps/search/?api=1&query=${savedSiteLat},${savedSiteLng}`
    : selectedLeadMapsHref;

  const requirementSummaryRows = [
    { label: "Inventory type", value: toTitleCaseLabel(normalizedRequirementInventoryType), Icon: Building2 },
    {
      label: normalizedRequirementInventoryType === "COMMERCIAL" ? "Commercial type" : "Residential type",
      value:
        getPropertySubtypeLabel(normalizedRequirementInventoryType, normalizedRequirementPropertySubtype)
        || toTitleCaseLabel(normalizedRequirementPropertySubtype),
      Icon: Home,
    },
    {
      label: "Deal type",
      value: transactionTypeValue === "SALE" ? "Purchase" : toTitleCaseLabel(transactionTypeValue),
      Icon: FileText,
    },
    {
      label: "Budget",
      value:
        requirementsDraft?.budgetMin || requirementsDraft?.budgetMax
          ? [requirementsDraft?.budgetMin, requirementsDraft?.budgetMax]
              .filter((amount) => amount !== "" && amount !== null && amount !== undefined)
              .map((amount) => formatCurrencyInr(amount))
              .join(" - ")
          : "",
      Icon: FileText,
    },
    { label: "Preferred location", value: plotLocationValue || String(cityDraft || "").trim(), Icon: MapPin },
    { label: "Occupancy", value: plotOccupancyValue, Icon: Users },
    { label: "Purpose", value: plotPurposeValue, Icon: FileText },
    { label: "Work profile", value: String(clientProfessionDraft || "").trim(), Icon: Briefcase },
  ];
  const missingRequirementItems = [
    { label: "Work profile", done: Boolean(String(clientProfessionDraft || "").trim()) },
    { label: "Budget range", done: Boolean(requirementsDraft?.budgetMin || requirementsDraft?.budgetMax) },
    { label: "Preferred location", done: Boolean(plotLocationValue || String(cityDraft || "").trim()) },
    { label: "Occupancy", done: Boolean(plotOccupancyValue) },
    { label: "Purpose", done: Boolean(plotPurposeValue) },
    { label: "Project interested", done: Boolean(leadProjectLabel) },
    { label: "Inventory type", done: Boolean(normalizedRequirementInventoryType) },
    { label: "Property type", done: Boolean(normalizedRequirementPropertySubtype) },
    { label: "Deal type", done: Boolean(transactionTypeValue) },
  ];
  const missingRequirementCount = missingRequirementItems.filter((item) => !item.done).length;

  const detailTabs = [
    { key: "overview", label: "Overview" },
    { key: "requirements", label: "Requirements" },
    { key: "properties", label: "Properties" },
    { key: "proposals", label: "Proposals" },
    { key: "activity", label: "Activity & Tasks" },
  ];
  const mobilePropertyLabel = selectedPropertyRow?.label || leadProjectLabel || "Property not selected";
  const mobilePropertyLocation = selectedPropertyRow?.location || String(cityDraft || "").trim() || "Location not set";

  const proposalDateLabel = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const proposalValidTillLabel = (() => {
    const days = Number(proposalValidityDays) || 7;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  })();

  return (
    <Motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className={`relative z-10 w-full overflow-x-hidden pb-6 ${headingText}`}
    >
      {selectedLead?.status === "CLOSED" && (
        <BillstackSection key={selectedLead._id} entityType="lead" entityId={selectedLead._id} />
      )}

      <div className={`lead-details-breadcrumb mb-3 flex items-center gap-2 text-[13px] ${mutedText}`}>
        <button
          type="button"
          onClick={onClose}
          className={`inline-flex items-center gap-1.5 font-medium transition hover:text-blue-600 ${mutedText}`}
        >
          <ArrowLeft size={14} />
          Pipeline
        </button>
        <span className={isDark ? "text-slate-600" : "text-slate-300"}>/</span>
        <span className={`font-semibold ${headingText}`}>Lead details</span>
      </div>

      <section className={`lead-details-mobile-hero md:hidden ${shellCard}`}>
        <div className="lead-details-mobile-identity">
          <span
            className={`lead-details-mobile-avatar ${isDark ? "bg-blue-500/15 text-blue-200" : "bg-blue-50 text-blue-700"}`}
          >
            {leadInitials}
          </span>
          <h1>{leadDisplayName}</h1>
          <button
            type="button"
            disabled={!canEditLead}
            aria-pressed={Boolean(selectedLead?.hotClient)}
            onClick={onToggleHotClient}
            className={`lead-details-mobile-hot ${selectedLead?.hotClient ? toneClass("orange") : toneClass("slate")}`}
          >
            <Flame size={16} className={selectedLead?.hotClient ? "" : "opacity-50"} />
            Hot lead
          </button>
          <button
            type="button"
            onClick={() => setHeaderMenuOpen((open) => !open)}
            className="lead-details-mobile-more"
            aria-label="More lead actions"
          >
            <MoreHorizontal size={22} />
          </button>
        </div>

        <div className={`lead-details-mobile-contact ${mutedText}`}>
          <span>Lead ID: <strong>{leadIdLabel}</strong></span>
          <button type="button" onClick={handleCopyLeadId} title="Copy lead ID" aria-label="Copy lead ID"><Copy size={18} /></button>
          <i aria-hidden="true" />
          <span>{leadPhoneLabel || "Not provided"}</span>
          {selectedLeadDialerHref ? <a href={selectedLeadDialerHref} aria-label="Call lead"><Phone size={20} /></a> : null}
        </div>

        <div className="lead-details-mobile-selects">
          <div className="lead-details-mobile-status">
            <button type="button" disabled={!canEditLead} aria-expanded={mobileStatusOpen} onClick={() => setMobileStatusOpen((open) => !open)} className={fieldCls}>
              <Calendar size={18} />
              <span>{statusLabel(statusDraft)}</span>
              <ChevronDown size={17} />
            </button>
            {mobileStatusOpen ? <div className={`lead-details-mobile-status-menu ${shellSurface}`}>
              {leadStatuses.map((status) => <button key={status} type="button" disabled={!canReviewDealPayment && status === "REQUESTED"} onClick={() => { setStatusDraft(status); setMobileStatusOpen(false); }} className={status === statusDraft ? "is-selected" : ""}>{statusLabel(status)}</button>)}
            </div> : null}
          </div>
          <div className="lead-details-mobile-assignee-picker">
            <button type="button" disabled={!canAssignLead} onClick={openAssigneePicker} className={fieldCls} aria-expanded={assigneeMenuOpen}>
              <span className={`lead-details-mobile-assignee ${isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-700"}`}>{assignedToInitials}</span>
              <span>{assignedToName}</span>
              <ChevronDown size={17} />
            </button>
            {assigneeMenuOpen ? <div className={`lead-details-mobile-assignee-menu ${shellSurface}`}>
              <div className="lead-details-mobile-assignee-search"><Search size={15} /><input type="search" value={assigneeSearchDraft} onChange={(event) => setAssigneeSearchDraft(event.target.value)} placeholder="Search user..." /></div>
              <div className="lead-details-mobile-assignee-list">
                {filteredAssignees.length ? filteredAssignees.map((user) => <button key={user._id} type="button" onClick={() => selectTransferAssignee(user)}><span>{String(user.name || "?").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><strong>{user.name}</strong><small>{statusLabel(user.role)}</small></button>) : <p>No matching users</p>}
              </div>
            </div> : null}
          </div>
        </div>

        <button type="button" className={`lead-details-mobile-property ${dividerBorder}`} onClick={() => setActiveTab("properties")}>
          <span className={isDark ? "bg-slate-800 text-blue-300" : "bg-blue-50 text-blue-600"}><Building2 size={28} /></span>
          <span><strong>{mobilePropertyLabel}</strong><small>{mobilePropertyLocation}</small></span>
          <ChevronRight size={24} />
        </button>

        <div className="lead-details-mobile-actions">
          {selectedLeadDialerHref ? <a href={selectedLeadDialerHref}><Phone size={26} />Call</a> : <button type="button" disabled><Phone size={26} />Call</button>}
          {selectedLeadWhatsAppHref ? <a href={selectedLeadWhatsAppHref} target="_blank" rel="noreferrer">{WhatsAppIcon ? <WhatsAppIcon size={26} /> : <MessageCircle size={26} />}WhatsApp</a> : <button type="button" disabled>WhatsApp</button>}
          <button type="button" disabled={!canEditLead} onClick={onOpenEditLeadForm}><PencilLine size={26} />Edit</button>
          <button type="button" onClick={() => setHeaderMenuOpen((open) => !open)}><MoreHorizontal size={26} />More</button>
        </div>

        {headerMenuOpen ? (
          <div className={`lead-details-mobile-menu ${shellSurface}`}>
            {canAssignLead ? <button type="button" onClick={() => { setHeaderMenuOpen(false); openAssigneePicker(); }}><ArrowRightLeft size={16} />Transfer lead</button> : null}
            {canDeleteLead && onDeleteLead ? <button type="button" className="text-rose-600" onClick={() => { setHeaderMenuOpen(false); onDeleteLead(); }}><Trash2 size={16} />Delete</button> : null}
          </div>
        ) : null}
      </section>

      <nav className={`lead-details-mobile-tabs md:hidden ${shellCard}`} aria-label="Lead detail sections">
        {detailTabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={isActive ? "is-active" : ""}>{tab.key === "activity" ? "Activity" : tab.label}</button>;
        })}
        <ChevronRight size={20} aria-hidden="true" />
      </nav>

      <div className={`${shellCard} lead-details-desktop-hero hidden md:block`}>
        <div className="px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-bold ${
                  isDark ? "bg-blue-500/15 text-blue-200" : "bg-blue-50 text-blue-700"
                }`}
              >
                {leadInitials}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className={`truncate text-[22px] font-bold tracking-tight ${headingText}`}>{leadDisplayName}</h1>
                  <button
                    type="button"
                    disabled={!canEditLead}
                    aria-pressed={Boolean(selectedLead?.hotClient)}
                    onClick={onToggleHotClient}
                    title="High-intent client who is ready to transact and mainly needs the right inventory"
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      selectedLead?.hotClient ? toneClass("orange") : toneClass("slate")
                    }`}
                  >
                    <Flame size={13} className={selectedLead?.hotClient ? "" : "opacity-50"} />
                    Hot lead
                  </button>
                  <div className="relative">
                    <Calendar size={15} className={`pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 ${mutedText}`} />
                    <ChevronDown size={15} className={`pointer-events-none absolute right-2.5 top-1/2 z-10 -translate-y-1/2 ${mutedText}`} />
                    <select
                      value={statusDraft}
                      disabled={!canEditLead}
                      onChange={(event) => setStatusDraft(event.target.value)}
                      className={`h-9 w-auto appearance-none pl-8 pr-8 text-[13px] font-semibold ${fieldCls}`}
                    >
                      {leadStatuses.map((status) => (
                        <option key={status} value={status} disabled={!canReviewDealPayment && status === "REQUESTED"}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className={`mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] ${mutedText}`}>
                  <span className="inline-flex items-center gap-1.5">
                    Lead ID: <span className="font-semibold">{leadIdLabel}</span>
                    <button
                      type="button"
                      onClick={handleCopyLeadId}
                      title="Copy lead ID"
                      className={`transition hover:text-blue-600 ${mutedText}`}
                    >
                      <Copy size={13} />
                    </button>
                  </span>
                  {leadPhoneLabel ? (
                    <>
                      <span className={isDark ? "text-slate-700" : "text-slate-300"}>|</span>
                      <span>{leadPhoneLabel}</span>
                    </>
                  ) : null}
                  {leadEmailLabel ? (
                    <>
                      <span className={isDark ? "text-slate-700" : "text-slate-300"}>|</span>
                      <span className="truncate">{leadEmailLabel}</span>
                    </>
                  ) : null}
                  {leadProjectLabel ? (
                    <>
                      <span className={isDark ? "text-slate-700" : "text-slate-300"}>|</span>
                      <span className="truncate">{leadProjectLabel}</span>
                    </>
                  ) : null}
                  <BrokerPhoneHint phone={phoneDraft} />
                  {selectedLead?.brokerContactId ? (
                    <span className="font-semibold text-violet-600">Known broker</span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="relative mr-1">
                <button type="button" disabled={!canAssignLead} onClick={openAssigneePicker} aria-expanded={assigneeMenuOpen} className="rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-50 disabled:cursor-default dark:hover:bg-slate-800">
                  <div className={`text-[12px] ${mutedText}`}>Assigned to</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-700"}`}>{assignedToInitials}</span>
                    <span className={`max-w-[150px] truncate text-[13px] font-semibold ${headingText}`}>{assignedToName}</span>
                    {canAssignLead ? <ChevronDown size={14} className={mutedText} /> : null}
                  </div>
                </button>
                {assigneeMenuOpen ? <div className={`absolute right-0 top-[calc(100%+8px)] z-40 w-72 overflow-hidden rounded-xl border shadow-xl ${shellSurface}`}>
                  <div className={`border-b p-2 ${dividerBorder}`}><div className="relative"><Search size={15} className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 ${mutedText}`} /><input type="search" value={assigneeSearchDraft} onChange={(event) => setAssigneeSearchDraft(event.target.value)} placeholder="Search user, email or role..." className={`${fieldCls} h-9 pl-8 text-[12px]`} /></div></div>
                  <div className="max-h-64 overflow-y-auto p-1.5 custom-scrollbar">{filteredAssignees.length ? filteredAssignees.map((user) => <button key={user._id} type="button" onClick={() => selectTransferAssignee(user)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${String(user._id) === String(selectedLead?.assignedTo?._id || "") ? "bg-blue-50 dark:bg-blue-500/10" : ""}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-700"}`}>{String(user.name || "?").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span className="min-w-0"><span className={`block truncate text-[12px] font-semibold ${headingText}`}>{user.name}</span><span className={`block truncate text-[10px] ${mutedText}`}>{statusLabel(user.role)}</span></span></button>) : <p className={`px-2.5 py-3 text-[12px] ${mutedText}`}>No matching users</p>}</div>
                </div> : null}
              </div>

              {selectedLeadDialerHref ? (
                <a href={selectedLeadDialerHref} className={ghostBtn}>
                  <Phone size={15} className="text-blue-600" />
                  Call
                </a>
              ) : (
                <button type="button" disabled className={`${ghostBtn} cursor-not-allowed opacity-50`}>
                  <Phone size={15} />
                  Call
                </button>
              )}
              {selectedLeadWhatsAppHref ? (
                <a href={selectedLeadWhatsAppHref} target="_blank" rel="noreferrer" className={ghostBtn}>
                  {WhatsAppIcon ? <WhatsAppIcon size={15} className="text-emerald-600" /> : null}
                  WhatsApp
                </a>
              ) : (
                <button type="button" disabled className={`${ghostBtn} cursor-not-allowed opacity-50`}>
                  WhatsApp
                </button>
              )}
              {canEditLead ? (
                <button type="button" onClick={onOpenEditLeadForm} className={ghostBtn}>
                  <PencilLine size={15} className="text-blue-600" />
                  Edit lead
                </button>
              ) : null}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setHeaderMenuOpen((open) => !open)}
                  aria-label="More lead actions"
                  className={`${ghostBtn} w-10 px-0`}
                >
                  <MoreHorizontal size={16} />
                </button>
                {headerMenuOpen ? (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setHeaderMenuOpen(false)} />
                    <div className={`absolute right-0 top-11 z-30 w-48 overflow-hidden rounded-xl border py-1 shadow-lg ${shellSurface}`}>
                      {canAssignLead ? (
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            openAssigneePicker();
                          }}
                          className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium ${
                            isDark ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <ArrowRightLeft size={15} />
                          Transfer lead
                        </button>
                      ) : null}
                      {canDeleteLead && onDeleteLead ? (
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            onDeleteLead();
                          }}
                          className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-rose-600 ${
                            isDark ? "hover:bg-rose-500/10" : "hover:bg-rose-50"
                          }`}
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className={`border-t px-4 sm:px-5 ${dividerBorder}`}>
          <nav className="-mb-px flex gap-7 overflow-x-auto">
            {detailTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`whitespace-nowrap border-b-2 px-0.5 py-3 text-[14px] font-semibold transition ${
                    isActive ? "border-blue-600 text-blue-600" : `border-transparent ${mutedText} hover:text-blue-600`
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {activeTab === "overview" ? (
        <div className="lead-details-overview-grid mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-5">
            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <User size={17} className="text-blue-600" />
                  <h2 className={cardTitle}>Contact details</h2>
                </div>
                {canEditLead ? (
                  <button
                    type="button"
                    onClick={() => setContactEditorOpen((open) => !open)}
                    className="text-[13px] font-semibold text-blue-600"
                  >
                    {contactEditorOpen ? "Done" : "Edit"}
                  </button>
                ) : null}
              </div>
              <dl className="mt-4 space-y-3 text-[13px]">
                <div className="flex items-start justify-between gap-3">
                  <dt className={mutedText}>Name</dt>
                  <dd className="text-right">
                    {contactEditorOpen ? (
                      <input
                        type="text"
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        placeholder="Lead name"
                        className={`h-8 w-56 ${fieldCls}`}
                      />
                    ) : (
                      <span className={`font-semibold ${headingText}`}>{leadDisplayName}</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className={mutedText}>Phone</dt>
                  <dd className="flex items-center gap-2 text-right">
                    {contactEditorOpen ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={phoneDraft}
                        onChange={(event) => setPhoneDraft(event.target.value)}
                        placeholder="Phone"
                        className={`h-8 w-56 ${fieldCls}`}
                      />
                    ) : (
                      <>
                        <span className={`font-semibold ${headingText}`}>{leadPhoneLabel || "Not provided"}</span>
                        {selectedLeadDialerHref ? (
                          <a href={selectedLeadDialerHref} title="Call lead" className="text-blue-600">
                            <Phone size={14} />
                          </a>
                        ) : null}
                      </>
                    )}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className={mutedText}>Email</dt>
                  <dd className="flex min-w-0 items-center gap-2 text-right">
                    {leadEmailLabel && !emailEditorOpen && !contactEditorOpen ? (
                      <>
                        <span className={`truncate font-semibold ${headingText}`}>{leadEmailLabel}</span>
                        {selectedLeadMailHref ? (
                          <a href={selectedLeadMailHref} title="Email lead" className="text-blue-600">
                            <Mail size={14} />
                          </a>
                        ) : null}
                      </>
                    ) : emailEditorOpen || contactEditorOpen ? (
                      <input
                        type="email"
                        autoFocus
                        value={emailDraft}
                        onChange={(event) => setEmailDraft(event.target.value)}
                        onBlur={() => setEmailEditorOpen(false)}
                        placeholder="name@company.com"
                        className={`h-8 w-56 ${fieldCls}`}
                      />
                    ) : (
                      <>
                        <span className={mutedText}>Not provided</span>
                        {canEditLead ? (
                          <button
                            type="button"
                            onClick={() => setEmailEditorOpen(true)}
                            className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-600"
                          >
                            <Plus size={13} />
                            Add email
                          </button>
                        ) : null}
                      </>
                    )}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className={mutedText}>City</dt>
                  <dd className="text-right">
                    {contactEditorOpen ? (
                      <input
                        type="text"
                        value={cityDraft}
                        onChange={(event) => setCityDraft(event.target.value)}
                        placeholder="City"
                        className={`h-8 w-56 ${fieldCls}`}
                      />
                    ) : (
                      <span className={`font-semibold ${headingText}`}>
                        {String(cityDraft || "").trim() || "Not provided"}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className={mutedText}>Source</dt>
                  <dd className={`text-right font-semibold ${headingText}`}>{leadSourceLabel || "Not set"}</dd>
                </div>
              </dl>
            </section>

            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText size={17} className="text-blue-600" />
                  <h2 className={cardTitle}>Requirements summary</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("requirements")}
                  className="text-[13px] font-semibold text-blue-600"
                >
                  Edit
                </button>
              </div>
              <dl className="mt-4 space-y-3 text-[13px]">
                {requirementSummaryRows.slice(0, 5).map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-3">
                    <dt className={mutedText}>{row.label}</dt>
                    <dd className="text-right">
                      {row.value ? (
                        <span className={`font-semibold ${headingText}`}>{row.value}</span>
                      ) : (
                        <span className={pillCls("rose")}>Not provided</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                onClick={() => setActiveTab("requirements")}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-600"
              >
                View requirements
                <ArrowRight size={14} />
              </button>
            </section>

            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex items-center gap-2">
                <History size={17} className="text-blue-600" />
                <h2 className={cardTitle}>Recent activity</h2>
              </div>
              {activityLoading ? (
                <div className={`mt-4 flex h-20 items-center justify-center gap-2 text-sm ${mutedText}`}>
                  <Loader size={15} className="animate-spin" /> Loading activity...
                </div>
              ) : normalizedActivities.length === 0 ? (
                <p className={`mt-4 text-[13px] ${mutedText}`}>No activity yet.</p>
              ) : (
                <ol className="mt-4 space-y-4">
                  {normalizedActivities.slice(0, 4).map((activity, index, list) => {
                    const { Icon, tone } = activityIconFor(activity);
                    return (
                      <li key={activity._id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${toneClass(tone)}`}>
                            <Icon size={13} />
                          </span>
                          {index < list.length - 1 ? (
                            <span className={`mt-1 w-px flex-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                          ) : null}
                        </div>
                        <div className="min-w-0 pb-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className={`text-[13px] font-semibold ${headingText}`}>{activity.action}</p>
                            <span className={`shrink-0 text-[12px] ${mutedText}`}>{formatDate(activity.createdAt)}</span>
                          </div>
                          {activity.performedBy?.name ? (
                            <p className={`mt-0.5 text-[12px] ${mutedText}`}>By {activity.performedBy.name}</p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <div className="space-y-4 xl:col-span-7">
            {canHaveFollowUp ? (
              <section
                className={`rounded-xl border p-4 sm:p-5 ${
                  isDark ? "border-amber-500/35 bg-amber-500/10" : "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        isDark ? "bg-amber-500/20 text-amber-200" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      <CalendarClock size={17} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className={`text-[15px] font-bold ${isDark ? "text-amber-100" : "text-amber-900"}`}>
                          {requiresRemainingPaymentFollowUp ? "Remaining payment follow-up" : "Next follow-up"}
                        </h2>
                        {isFollowUpOverdue ? <span className={pillCls("rose")}>Overdue</span> : null}
                      </div>
                      <p
                        className={`mt-1.5 text-[17px] font-bold ${
                          isFollowUpOverdue ? "text-rose-600" : isDark ? "text-amber-100" : "text-amber-900"
                        }`}
                      >
                        {hasValidFollowUp ? formatDate(followUpDraft) : "No follow-up scheduled"}
                      </p>
                      <p className={`mt-1 text-[13px] ${isDark ? "text-amber-200/90" : "text-amber-800"}`}>
                        {requiresRemainingPaymentFollowUp
                          ? `Collect the pending amount${
                              remainingAmountForCollection ? ` (${formatCurrencyInr(remainingAmountForCollection)})` : ""
                            }.`
                          : "Follow up with client on property options."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFollowUpEditorOpen((open) => !open)}
                      className={ghostBtn}
                    >
                      <Calendar size={15} />
                      Reschedule
                    </button>
                    <button
                      type="button"
                      disabled={!hasValidFollowUp}
                      onClick={() => setFollowUpDraft("")}
                      className={blueBtn}
                    >
                      <Check size={15} />
                      Mark complete
                    </button>
                  </div>
                </div>
                {followUpEditorOpen ? (
                  <div className="mt-3">
                    <input
                      type="datetime-local"
                      value={followUpDraft}
                      onChange={(event) => setFollowUpDraft(event.target.value)}
                      className={`${fieldCls} max-w-xs`}
                    />
                  </div>
                ) : null}
                {requiresRemainingPaymentFollowUp ? (
                  <button
                    type="button"
                    onClick={handleCreateRemainingPaymentFollowUp}
                    className={`mt-3 ${smallGhostBtn}`}
                  >
                    <CalendarClock size={13} />
                    {hasFollowUpDraft ? "Recreate follow-up" : "Create follow-up"}
                  </button>
                ) : null}
              </section>
            ) : (
              <section className={`${shellCard} p-4 sm:p-5`}>
                <div className="flex items-center gap-2">
                  <CalendarClock size={17} className="text-blue-600" />
                  <h2 className={cardTitle}>Next follow-up</h2>
                </div>
                <p className={`mt-3 text-[13px] ${mutedText}`}>
                  {statusLabel(effectiveStatus)} leads do not get follow-ups. Any follow-up on this lead is removed when you save.
                </p>
              </section>
            )}

            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex items-center gap-2">
                <MapPin size={17} className="text-blue-600" />
                <h2 className={cardTitle}>Next site visit</h2>
              </div>
              <div
                className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
                  isDark ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      isDark ? "bg-slate-800 text-slate-300" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    <Home size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className={`truncate text-[13px] font-semibold ${headingText}`}>
                      {selectedPropertyRow ? selectedPropertyRow.label : "Property not selected"}
                    </p>
                    <p className={`mt-0.5 truncate text-[12px] ${mutedText}`}>
                      {selectedPropertyRow
                        ? selectedPropertyRow.location || "Location not set"
                        : "Select a property from inventory to schedule a site visit."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setActiveTab("properties")} className={ghostBtn}>
                    <Search size={15} />
                    Choose property
                  </button>
                  <button type="button" onClick={() => setActiveTab("properties")} className={blueBtn}>
                    <Calendar size={15} />
                    Schedule visit
                  </button>
                </div>
              </div>
            </section>

            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex items-center gap-2">
                <FileText size={17} className="text-blue-600" />
                <h2 className={cardTitle}>Quick note</h2>
              </div>
              <textarea
                value={diaryDraft}
                onChange={(event) => setDiaryDraft(event.target.value)}
                placeholder="Add a note about this lead..."
                maxLength={2000}
                className={`mt-4 min-h-[96px] resize-y ${areaCls}`}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className={`text-[12px] ${mutedText}`}>{diaryDraft.length}/2000</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onDiaryVoiceToggle}
                    disabled={savingDiary || !isDiaryMicSupported}
                    className={`${ghostBtn} disabled:opacity-50`}
                  >
                    {isDiaryListening ? <MicOff size={15} /> : <Mic size={15} />}
                    {isDiaryListening ? "Stop mic" : "Voice"}
                  </button>
                  <button
                    type="button"
                    onClick={onAddDiary}
                    disabled={savingDiary || !diaryDraft.trim()}
                    className={blueBtn}
                  >
                    {savingDiary ? <Loader size={15} className="animate-spin" /> : <FileText size={15} />}
                    Add note
                  </button>
                </div>
              </div>
            </section>

            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 size={17} className="text-blue-600" />
                  <h2 className={cardTitle}>Linked properties</h2>
                </div>
                {relatedInventoryRows.length ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab("properties")}
                    className="text-[13px] font-semibold text-blue-600"
                  >
                    View all
                  </button>
                ) : null}
              </div>
              {relatedInventoryRows.length === 0 ? (
                <div className="mt-4 flex flex-col items-center justify-center px-4 py-8 text-center">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${
                      isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <Home size={22} />
                  </span>
                  <p className={`mt-3 text-[14px] font-semibold ${headingText}`}>No properties linked yet</p>
                  <p className={`mt-1 text-[13px] ${mutedText}`}>
                    Link relevant properties from inventory to keep track of client interest.
                  </p>
                  <button type="button" onClick={() => setActiveTab("properties")} className={`mt-4 ${blueBtn}`}>
                    <Search size={15} />
                    Browse inventory
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {relatedInventoryRows.slice(0, 3).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => {
                        setActiveTab("properties");
                        if (row.id) onSelectRelatedProperty(row.id);
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition ${
                        isDark ? "border-slate-800 hover:border-slate-700" : "border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`truncate text-[13px] font-semibold ${headingText}`}>{row.label || "Property"}</p>
                        <p className={`mt-0.5 truncate text-[12px] ${mutedText}`}>{row.location || "Location not set"}</p>
                      </div>
                      <span className={pillCls("emerald")}>{row.statusLabel || "-"}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {isClosedDealFlow ? <section className={`${shellCard} p-4 sm:p-5`}>{dealPaymentBlock}</section> : null}

            {isClosedStatusSelected ? (
              <section className={`${shellCard} p-4 sm:p-5`}>{closureDocumentsBlock}</section>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === "requirements" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className={`text-[18px] font-bold ${headingText}`}>Property requirements</h2>
                <span className={pillCls("blue")}>
                  <PencilLine size={12} />
                  Edit mode
                </span>
              </div>
              <p className={`mt-1 text-[13px] ${mutedText}`}>
                Capture the client&apos;s property requirements. Property-specific fields change with inventory type.
              </p>

              <div className={`mt-5 rounded-xl border p-4 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[12px] font-bold text-white">
                    1
                  </span>
                  <h3 className={`text-[14px] font-bold ${headingText}`}>General</h3>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelCls}>
                      Work profile <span className="text-rose-500">*</span>
                    </span>
                    <input
                      type="text"
                      value={clientProfessionDraft}
                      onChange={(event) => setClientProfessionDraft(event.target.value)}
                      placeholder="Select work profile"
                      maxLength={120}
                      className={fieldCls}
                    />
                  </label>
                  <label className="block">
                    <span className={labelCls}>
                      Inventory type <span className="text-rose-500">*</span>
                    </span>
                    <select
                      value={requirementsDraft?.inventoryType || ""}
                      onChange={(event) => updateRequirementInventoryType(event.target.value)}
                      className={fieldCls}
                    >
                      <option value="">Any</option>
                      <option value="COMMERCIAL">Commercial</option>
                      <option value="RESIDENTIAL">Residential</option>
                      <option value="COWORKING">Coworking</option>
                    </select>
                  </label>
                  {normalizedRequirementInventoryType && !isCoworkingRequirement ? (
                    <label className="block">
                      <span className={labelCls}>
                        {normalizedRequirementInventoryType === "COMMERCIAL" ? "Commercial type" : "Residential type"}{" "}
                        <span className="text-rose-500">*</span>
                      </span>
                      <select
                        value={requirementsDraft?.propertySubtype || ""}
                        onChange={(event) => updateRequirementPropertySubtype(event.target.value)}
                        className={fieldCls}
                      >
                        <option value="">Any</option>
                        {propertySubtypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="block">
                    <span className={labelCls}>
                      Deal type <span className="text-rose-500">*</span>
                    </span>
                    <select
                      value={transactionTypeValue}
                      onChange={(event) => updateTransactionType(event.target.value)}
                      className={fieldCls}
                    >
                      <option value="">Any</option>
                      {canPurchaseRequirement ? <option value="SALE">Purchase</option> : null}
                      {canRentRequirement ? <option value="RENT">Rent</option> : null}
                      <option value="LEASE">Lease</option>
                    </select>
                  </label>
                  {showFurnishing ? (
                    <label className="block">
                      <span className={labelCls}>Furnishing</span>
                      <select
                        value={furnishingValue}
                        onChange={(event) => updateRequirementRootField("furnishingStatus", event.target.value)}
                        className={fieldCls}
                      >
                        {furnishingOptions.map((option) => (
                          <option key={option.value || "any-furnishing"} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="block sm:col-span-2">
                    <span className={labelCls}>Project interested</span>
                    <input
                      type="text"
                      value={projectInterestedDraft}
                      onChange={(event) => setProjectInterestedDraft(event.target.value)}
                      placeholder="Search and select project (optional)"
                      className={fieldCls}
                    />
                  </label>
                </div>
              </div>

              <div className={`mt-4 rounded-xl border p-4 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[12px] font-bold text-white">
                    2
                  </span>
                  <h3 className={`text-[14px] font-bold ${headingText}`}>Budget &amp; location</h3>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className={labelCls}>Budget range</span>
                    <select
                      value={selectedBudgetRangeValue}
                      onChange={(event) => updateBudgetRange(event.target.value)}
                      className={fieldCls}
                    >
                      {budgetRangeOptions.map((option) => (
                        <option key={option.value || "any-budget"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelCls}>
                      Budget (Min) <span className="text-rose-500">*</span>
                    </span>
                    <RequirementAdornedInput
                      type="number"
                      step="any"
                      min="0"
                      value={requirementsDraft?.budgetMin || ""}
                      onChange={(event) => updateRequirementRootField("budgetMin", event.target.value)}
                      placeholder="Enter minimum budget"
                      adornment="&#8377;"
                      inputClassName={fieldCls}
                      isDark={isDark}
                    />
                  </label>
                  <label className="block">
                    <span className={labelCls}>
                      Budget (Max) <span className="text-rose-500">*</span>
                    </span>
                    <RequirementAdornedInput
                      type="number"
                      step="any"
                      min="0"
                      value={requirementsDraft?.budgetMax || ""}
                      onChange={(event) => updateRequirementRootField("budgetMax", event.target.value)}
                      placeholder="Enter maximum budget"
                      adornment="&#8377;"
                      inputClassName={fieldCls}
                      isDark={isDark}
                    />
                  </label>
                  {isPlotRequirement ? (
                    <>
                      <label className="block">
                        <span className={labelCls}>
                          Preferred plot location <span className="text-rose-500">*</span>
                        </span>
                        <select
                          value={plotLocationValue}
                          onChange={(event) => updateRequirementSubtypeField("plotLocation", event.target.value)}
                          className={fieldCls}
                        >
                          <option value="">Search and select location</option>
                          {PLOT_LOCATION_OPTIONS.map((location) => (
                            <option key={location} value={location}>
                              {location}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className={labelCls}>
                          Occupancy <span className="text-rose-500">*</span>
                        </span>
                        <select
                          value={plotOccupancyValue}
                          onChange={(event) => updateRequirementSubtypeField("plotOccupancy", event.target.value)}
                          className={fieldCls}
                        >
                          <option value="">Select occupancy</option>
                          {PLOT_OCCUPANCY_OPTIONS.map((occupancy) => (
                            <option key={occupancy} value={occupancy}>
                              {occupancy}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className={labelCls}>
                          Purpose <span className="text-rose-500">*</span>
                        </span>
                        <select
                          value={plotPurposeValue}
                          onChange={(event) => updateRequirementSubtypeField("plotPurpose", event.target.value)}
                          className={fieldCls}
                        >
                          <option value="">Select purpose</option>
                          {PLOT_PURPOSE_OPTIONS.map((purpose) => (
                            <option key={purpose} value={purpose}>
                              {purpose}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <label className="block sm:col-span-2">
                      <span className={labelCls}>Preferred location</span>
                      <input
                        type="text"
                        value={cityDraft}
                        onChange={(event) => setCityDraft(event.target.value)}
                        placeholder="Search and select location"
                        className={fieldCls}
                      />
                    </label>
                  )}
                </div>
              </div>

              {propertySubtypeConfig || isCoworkingRequirement ? (
                <div className={`mt-4 rounded-xl border p-4 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[12px] font-bold text-white">
                      3
                    </span>
                    <h3 className={`text-[14px] font-bold ${headingText}`}>
                      {isCoworkingRequirement
                        ? "Coworking preferences"
                        : `${propertySubtypeConfig?.label || "Property"} preferences`}
                    </h3>
                  </div>
                  {isCoworkingRequirement ? (
                    <div className="mt-4">
                      <CoworkingRequirementFields
                        value={requirementsDraft?.coworking || {}}
                        onChange={(next) => updateRequirementRootField("coworking", next)}
                        inputClass={fieldCls}
                        labelClass={labelCls}
                      />
                    </div>
                  ) : null}
                  {propertySubtypeConfig ? (
                    <>
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {(propertySubtypeConfig.fields || [])
                          .filter((field) => field.type !== "checkbox" && !PLOT_INLINE_FIELD_KEYS.has(field.key))
                          .map(renderSubtypeField)}
                      </div>
                      {(propertySubtypeConfig.fields || []).some(
                        (field) => field.type === "checkbox" && !PLOT_INLINE_FIELD_KEYS.has(field.key),
                      ) ? (
                        <div className="mt-4">
                          <div className={`mb-2 text-[13px] font-medium ${mutedText}`}>Additional preferences</div>
                          <div className="flex flex-wrap gap-2">
                            {(propertySubtypeConfig.fields || [])
                              .filter((field) => field.type === "checkbox" && !PLOT_INLINE_FIELD_KEYS.has(field.key))
                              .map(renderSubtypeField)}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>

          <div className="space-y-4 xl:col-span-4">
            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex items-center gap-2">
                <FileText size={17} className="text-blue-600" />
                <h2 className={cardTitle}>Requirements summary</h2>
              </div>
              <dl className="mt-4 space-y-3 text-[13px]">
                {requirementSummaryRows.map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-3">
                    <dt className={`inline-flex items-center gap-2 ${mutedText}`}>
                      <row.Icon size={14} />
                      {row.label}
                    </dt>
                    <dd className="text-right">
                      {row.value ? (
                        <span className={`font-semibold ${headingText}`}>{row.value}</span>
                      ) : (
                        <span className={mutedText}>Not specified</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex items-center gap-2">
                <AlertCircle size={17} className="text-rose-500" />
                <h2 className={cardTitle}>Missing details checklist</h2>
              </div>
              <p className={`mt-1 text-[13px] ${mutedText}`}>
                {missingRequirementCount
                  ? "Add the following details to complete requirements."
                  : "All requirement details are captured."}
              </p>
              <ul className="mt-4 space-y-2.5 text-[13px]">
                {missingRequirementItems.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5">
                    {item.done ? (
                      <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                    ) : (
                      <Circle size={16} className="shrink-0 text-rose-400" />
                    )}
                    <span className={item.done ? mutedText : headingText}>{item.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === "properties" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className={`text-[17px] font-bold ${headingText}`}>
                    Linked properties ({relatedInventoryRows.length})
                  </h2>
                  <p className={`mt-1 text-[13px] ${mutedText}`}>
                    Properties linked to this lead and other potential options
                  </p>
                </div>
                {canManageLeadProperties ? (
                  <button type="button" onClick={() => setPropertyPane("browse")} className={blueBtn}>
                    <Plus size={15} />
                    Link property
                  </button>
                ) : null}
              </div>

              <div className={`mt-4 flex gap-6 border-b ${dividerBorder}`}>
                <button
                  type="button"
                  onClick={() => setPropertyPane("linked")}
                  className={`-mb-px border-b-2 px-0.5 pb-2.5 text-[13px] font-semibold transition ${
                    propertyPane === "linked" ? "border-blue-600 text-blue-600" : `border-transparent ${mutedText}`
                  }`}
                >
                  Linked ({relatedInventoryRows.length})
                </button>
                {canManageLeadProperties ? (
                  <button
                    type="button"
                    onClick={() => setPropertyPane("browse")}
                    className={`-mb-px border-b-2 px-0.5 pb-2.5 text-[13px] font-semibold transition ${
                      propertyPane === "browse" ? "border-blue-600 text-blue-600" : `border-transparent ${mutedText}`
                    }`}
                  >
                    Browse inventory
                  </button>
                ) : null}
              </div>

              {propertyPane === "linked" ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {[
                      { value: "ALL", label: "All" },
                      { value: "SALE", label: "For sale" },
                      { value: "RENT", label: "Rental" },
                    ].map((chip) => (
                      <button
                        key={chip.value}
                        type="button"
                        onClick={() => setLinkedPropertyFilter(chip.value)}
                        className={`inline-flex h-9 items-center rounded-lg border px-4 text-[13px] font-semibold transition ${
                          linkedPropertyFilter === chip.value
                            ? isDark
                              ? "border-blue-500/50 bg-blue-500/15 text-blue-200"
                              : "border-blue-200 bg-blue-50 text-blue-700"
                            : isDark
                              ? "border-slate-700 bg-slate-900 text-slate-300"
                              : "border-slate-300 bg-white text-slate-600"
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                    <div className="relative min-w-[200px] flex-1">
                      <Search size={15} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${mutedText}`} />
                      <input
                        type="search"
                        value={linkedPropertySearch}
                        onChange={(event) => setLinkedPropertySearch(event.target.value)}
                        placeholder="Search by property name, ID or location..."
                        className={`${fieldCls} h-9 pl-9`}
                      />
                    </div>
                  </div>

                  {relatedInventoryRows.length === 0 ? (
                    <div className="mt-6 flex flex-col items-center justify-center px-4 py-10 text-center">
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-full ${
                          isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        <Home size={22} />
                      </span>
                      <p className={`mt-3 text-[14px] font-semibold ${headingText}`}>No properties linked yet</p>
                      <p className={`mt-1 text-[13px] ${mutedText}`}>
                        Link relevant properties from inventory to keep track of client interest.
                      </p>
                    </div>
                  ) : filteredLinkedRows.length === 0 ? (
                    <p className={`mt-6 text-[13px] ${mutedText}`}>No linked property matches these filters.</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {filteredLinkedRows.map((row) => {
                        const inventoryId = row.id;
                        const inventory = row.inventory || {};
                        const isActiveProperty = normalizedActiveInventoryId === inventoryId;
                        const isSelectingThisProperty =
                          propertyActionType === "select" && String(propertyActionInventoryId || "") === String(inventoryId || "");
                        const isRemovingThisProperty =
                          propertyActionType === "remove" && String(propertyActionInventoryId || "") === String(inventoryId || "");
                        const listingType = getInventoryListingType(inventory);
                        const coverImage = row.imageUrls[0] || "";
                        const specs = [
                          getInventoryAreaLabel(inventory),
                          getInventorySubtypeLabel(inventory),
                          String(inventory?.buildingName || inventory?.projectName || "").trim(),
                          getInventoryQuickInfo(inventory),
                        ].filter(Boolean);

                        return (
                          <div
                            key={inventoryId || row.label}
                            className={`rounded-xl border p-3 transition ${
                              isActiveProperty
                                ? isDark
                                  ? "border-blue-500/50 bg-blue-500/5"
                                  : "border-blue-300 bg-blue-50/40"
                                : isDark
                                  ? "border-slate-800 hover:border-slate-700"
                                  : "border-slate-200 hover:border-blue-200"
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => inventoryId && onSelectRelatedProperty(inventoryId)}
                                className={`relative h-[150px] w-full shrink-0 overflow-hidden rounded-lg sm:w-[270px] ${
                                  isDark ? "bg-slate-800" : "bg-slate-100"
                                }`}
                              >
                                {coverImage ? (
                                  <img src={coverImage} alt={row.label || "Property"} loading="lazy" className="h-full w-full object-cover" />
                                ) : (
                                  <span className={`flex h-full w-full items-center justify-center ${mutedText}`}>
                                    <Building2 size={28} />
                                  </span>
                                )}
                                {isActiveProperty ? (
                                  <span
                                    className={`absolute left-2 top-2 rounded-md px-2 py-1 text-[11px] font-semibold ${
                                      isDark ? "bg-emerald-500/90 text-white" : "bg-emerald-100 text-emerald-800"
                                    }`}
                                  >
                                    Linked property
                                  </span>
                                ) : null}
                              </button>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <h3 className={`truncate text-[15px] font-bold ${headingText}`}>
                                      {row.label || "Property"}
                                    </h3>
                                    <p className={`mt-0.5 text-[12px] ${mutedText}`}>
                                      Property ID: {String(inventoryId || "").slice(-6).toUpperCase()}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    {isActiveProperty ? (
                                      <span className={pillCls("blue")}>
                                        <Star size={12} />
                                        Primary option
                                      </span>
                                    ) : canManageLeadProperties && inventoryId ? (
                                      <button
                                        type="button"
                                        onClick={() => onSelectRelatedProperty(inventoryId)}
                                        className={smallGhostBtn}
                                      >
                                        {isSelectingThisProperty ? <Loader size={12} className="animate-spin" /> : <Star size={12} />}
                                        Primary option
                                      </button>
                                    ) : null}
                                    {canManageLeadProperties && inventoryId ? (
                                      <div className="relative">
                                        <button
                                          type="button"
                                          aria-label="Property actions"
                                          onClick={() =>
                                            setOpenPropertyMenuId((current) => (current === inventoryId ? "" : inventoryId))
                                          }
                                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${
                                            isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-600"
                                          }`}
                                        >
                                          <MoreHorizontal size={15} />
                                        </button>
                                        {openPropertyMenuId === inventoryId ? (
                                          <>
                                            <div className="fixed inset-0 z-20" onClick={() => setOpenPropertyMenuId("")} />
                                            <div
                                              className={`absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border py-1 shadow-lg ${shellSurface}`}
                                            >
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setOpenPropertyMenuId("");
                                                  onOpenRelatedProperty(inventoryId);
                                                }}
                                                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium ${
                                                  isDark ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-50"
                                                }`}
                                              >
                                                <Eye size={15} />
                                                View details
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setOpenPropertyMenuId("");
                                                  onRemoveRelatedProperty(inventoryId);
                                                }}
                                                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-rose-600 ${
                                                  isDark ? "hover:bg-rose-500/10" : "hover:bg-rose-50"
                                                }`}
                                              >
                                                {isRemovingThisProperty ? (
                                                  <Loader size={15} className="animate-spin" />
                                                ) : (
                                                  <Trash2 size={15} />
                                                )}
                                                Remove from lead
                                              </button>
                                            </div>
                                          </>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className={pillCls("emerald")}>{row.statusLabel || "-"}</span>
                                  {getInventorySubtypeLabel(inventory) ? (
                                    <span className={pillCls("blue")}>{getInventorySubtypeLabel(inventory)}</span>
                                  ) : null}
                                  <span className={pillCls(listingType === "RENT" ? "indigo" : "violet")}>
                                    {getInventoryListingLabel(inventory)}
                                  </span>
                                </div>

                                {row.location ? (
                                  <p className={`mt-2 inline-flex items-center gap-1.5 text-[13px] ${mutedText}`}>
                                    <MapPin size={14} />
                                    {row.location}
                                  </p>
                                ) : null}

                                {specs.length ? (
                                  <div className={`mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] ${mutedText}`}>
                                    {specs.map((spec, specIndex) => (
                                      <span key={`${spec}-${specIndex}`} className="inline-flex items-center gap-1.5">
                                        <Layers size={14} />
                                        {spec}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}

                                <div className={`mt-2 text-[13px] ${mutedText}`}>
                                  {getInventoryAmountLabel(inventory)}:{" "}
                                  <span className={`font-semibold ${headingText}`}>{formatInventoryAmountInr(inventory)}</span>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => inventoryId && onOpenRelatedProperty(inventoryId)}
                                    className={ghostBtn}
                                  >
                                    {isSelectingThisProperty ? <Loader size={14} className="animate-spin" /> : <Eye size={14} />}
                                    View details
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (inventoryId) setProposalSelectedPropertyIds([inventoryId]);
                                      setProposalStep(2);
                                      setActiveTab("proposals");
                                    }}
                                    className={blueBtn}
                                  >
                                    <FileText size={14} />
                                    Create proposal
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {hasMoreRelatedInventories ? (
                        <button
                          type="button"
                          onClick={() => setVisiblePropertiesCount((previous) => previous + RENDER_STEP_COUNT)}
                          className={ghostBtn}
                        >
                          Show more properties ({relatedInventoryRows.length - visibleRelatedInventoryRows.length} left)
                        </button>
                      ) : null}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { value: "ALL", label: "All" },
                      { value: "SALE", label: "For sale" },
                      { value: "RENT", label: "Rental" },
                    ].map((chip) => (
                      <button
                        key={chip.value}
                        type="button"
                        onClick={() => setLinkableInventoryTypeFilter(chip.value)}
                        className={`inline-flex h-9 items-center rounded-lg border px-4 text-[13px] font-semibold transition ${
                          linkableInventoryTypeFilter === chip.value
                            ? isDark
                              ? "border-blue-500/50 bg-blue-500/15 text-blue-200"
                              : "border-blue-200 bg-blue-50 text-blue-700"
                            : isDark
                              ? "border-slate-700 bg-slate-900 text-slate-300"
                              : "border-slate-300 bg-white text-slate-600"
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={relatedInventoryDraft}
                      onChange={(event) => setRelatedInventoryDraft(String(event.target.value || ""))}
                      className={`${fieldCls} min-w-0 flex-1`}
                    >
                      <option value="">
                        {sortedLinkableInventoryOptions.length ? "Select property to link" : "No properties found"}
                      </option>
                      {sortedLinkableInventoryOptions.map((inventory) => {
                        const inventoryId = String(inventory?._id || "");
                        const inventoryLabel =
                          getInventoryLeadLabel(inventory) || String(inventory?.title || "").trim() || inventoryId;
                        const inventoryLocation = getInventoryLocationLabel(inventory);
                        const inventoryQuickInfo = getInventoryQuickInfo(inventory);
                        const inventoryPriceLabel = formatInventoryAmountInr(inventory);
                        const inventoryAmountLabel = getInventoryAmountLabel(inventory);
                        const inventoryTypeLabel = getInventoryListingLabel(inventory);
                        return (
                          <option key={inventoryId} value={inventoryId}>
                            {[
                              inventoryLabel,
                              inventoryLocation ? `(${inventoryLocation})` : "",
                              inventoryQuickInfo,
                              `Type: ${inventoryTypeLabel}`,
                              `${inventoryAmountLabel}: ${inventoryPriceLabel}`,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      onClick={() => onLinkPropertyToLead(relatedInventoryDraft)}
                      disabled={!relatedInventoryDraft || linkingProperty}
                      className={blueBtn}
                    >
                      {linkingProperty ? <Loader size={15} className="animate-spin" /> : <Plus size={15} />}
                      Link property
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="xl:col-span-4">
            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={cardTitle}>Selected property</h2>
                {selectedPropertyRow ? (
                  <span className={pillCls("blue")}>
                    <Star size={12} />
                    Primary property
                  </span>
                ) : null}
              </div>

              {!selectedPropertyRow ? (
                <p className={`mt-4 text-[13px] ${mutedText}`}>
                  Select a linked property to schedule a site visit and review its location.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex gap-3">
                    <div className={`h-[70px] w-[90px] shrink-0 overflow-hidden rounded-lg ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
                      {selectedPropertyImages[0] ? (
                        <img src={selectedPropertyImages[0]} alt={selectedPropertyRow.label || "Property"} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className={`flex h-full w-full items-center justify-center ${mutedText}`}>
                          <Building2 size={20} />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className={`truncate text-[14px] font-bold ${headingText}`}>{selectedPropertyRow.label}</h3>
                      <p className={`mt-0.5 text-[12px] ${mutedText}`}>
                        Property ID: {String(selectedPropertyRow.id || "").slice(-6).toUpperCase()}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={pillCls("emerald")}>{selectedPropertyRow.statusLabel || "-"}</span>
                        {getInventorySubtypeLabel(selectedPropertyInventory) ? (
                          <span className={pillCls("blue")}>{getInventorySubtypeLabel(selectedPropertyInventory)}</span>
                        ) : null}
                        <span className={pillCls("indigo")}>{getInventoryListingLabel(selectedPropertyInventory)}</span>
                      </div>
                    </div>
                  </div>
                  {selectedPropertyRow.location ? (
                    <p className={`mt-2.5 inline-flex items-center gap-1.5 text-[13px] ${mutedText}`}>
                      <MapPin size={14} />
                      {selectedPropertyRow.location}
                    </p>
                  ) : null}

                  <h4 className={`mt-5 text-[14px] font-bold ${headingText}`}>Site visit</h4>
                  <div
                    className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                      isDark ? "border-amber-500/35 bg-amber-500/10" : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <span className={`inline-flex items-center gap-2 text-[12px] ${isDark ? "text-amber-200" : "text-amber-800"}`}>
                      <AlertCircle size={14} />
                      Visit verification uses a {siteVisitRadiusMeters} m radius around this location.
                    </span>
                    <span className={pillCls(statusDraft === "SITE_VISIT" ? "emerald" : "rose")}>
                      {statusDraft === "SITE_VISIT" ? "Scheduled" : "Not verified"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelCls}>Visit date</span>
                      <input
                        type="date"
                        value={siteVisitDateDraft}
                        onChange={(event) => setSiteVisitDateDraft(event.target.value)}
                        className={fieldCls}
                      />
                    </label>
                    <label className="block">
                      <span className={labelCls}>Visit time</span>
                      <input
                        type="time"
                        value={siteVisitTimeDraft}
                        onChange={(event) => setSiteVisitTimeDraft(event.target.value)}
                        className={fieldCls}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={handleScheduleSiteVisit}
                    disabled={!canEditLead}
                    className={`mt-3 w-full ${blueBtn}`}
                  >
                    Schedule visit
                  </button>
                  {scheduleVisitMessage ? (
                    <p className={`mt-2 text-[12px] font-semibold ${isDark ? "text-emerald-200" : "text-emerald-700"}`}>
                      {scheduleVisitMessage}
                    </p>
                  ) : null}
                  {userRole === "FIELD_EXECUTIVE" && statusDraft === "SITE_VISIT" ? (
                    <p
                      className={`mt-2 rounded-lg border px-3 py-2 text-[12px] ${
                        isDark ? "border-amber-500/35 bg-amber-500/15 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      Site visit requires your live location within {siteVisitRadiusMeters} meters.
                    </p>
                  ) : null}

                  <div className="mt-5 flex items-center justify-between gap-2">
                    <h4 className={`text-[14px] font-bold ${headingText}`}>Location</h4>
                    {selectedPropertyMapsHref ? (
                      <a href={selectedPropertyMapsHref} target="_blank" rel="noreferrer" className={smallGhostBtn}>
                        <MapPin size={13} className="text-blue-600" />
                        Open in Maps
                      </a>
                    ) : null}
                  </div>
                  <div
                    className={`mt-2 flex h-[140px] items-center justify-center overflow-hidden rounded-lg border text-center ${
                      isDark ? "border-slate-800 bg-slate-950/60" : "border-slate-200 bg-slate-100"
                    }`}
                  >
                    <div className={`px-4 text-[12px] ${mutedText}`}>
                      <MapPin size={20} className="mx-auto mb-1.5 text-rose-500" />
                      <div className={`font-semibold ${headingText}`}>{selectedPropertyRow.label}</div>
                      <div>{hasSiteCoordinates ? `${savedSiteLat}, ${savedSiteLng}` : "Site location not configured"}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLocationDetailsOpen((open) => !open)}
                    className={`mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold ${headingText}`}
                  >
                    {locationDetailsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    Location details
                  </button>
                  {locationDetailsOpen ? (
                    canConfigureSiteLocation ? (
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className={labelCls}>Latitude</span>
                          <input
                            type="number"
                            step="any"
                            value={siteLatDraft}
                            onChange={(event) => setSiteLatDraft(event.target.value)}
                            placeholder="Latitude"
                            className={fieldCls}
                          />
                        </label>
                        <label className="block">
                          <span className={labelCls}>Longitude</span>
                          <input
                            type="number"
                            step="any"
                            value={siteLngDraft}
                            onChange={(event) => setSiteLngDraft(event.target.value)}
                            placeholder="Longitude"
                            className={fieldCls}
                          />
                        </label>
                      </div>
                    ) : (
                      <p className={`mt-2 text-[13px] ${mutedText}`}>
                        {hasSiteCoordinates ? `${savedSiteLat}, ${savedSiteLng}` : "Not configured by admin/manager"}
                      </p>
                    )
                  ) : null}

                  <div className="mt-5 flex items-center justify-between gap-2">
                    <h4 className={`text-[14px] font-bold ${headingText}`}>
                      Property images ({selectedPropertyImages.length})
                    </h4>
                    {selectedPropertyImages.length > 5 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllPropertyImages((open) => !open)}
                        className="text-[13px] font-semibold text-blue-600"
                      >
                        {showAllPropertyImages ? "Show less" : "View all"}
                      </button>
                    ) : null}
                  </div>
                  {selectedPropertyImages.length === 0 ? (
                    <p className={`mt-2 text-[13px] ${mutedText}`}>No images uploaded for this property.</p>
                  ) : (
                    <div className="mt-2 grid grid-cols-5 gap-2">
                      {(showAllPropertyImages ? selectedPropertyImages : selectedPropertyImages.slice(0, 5)).map(
                        (imageUrl, imageIndex) => {
                          const isLastVisible =
                            !showAllPropertyImages && imageIndex === 4 && selectedPropertyImages.length > 5;
                          return (
                            <a
                              key={`${imageUrl}-${imageIndex}`}
                              href={imageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={`relative block h-14 overflow-hidden rounded-md border ${
                                isDark ? "border-slate-800" : "border-slate-200"
                              }`}
                            >
                              <img src={imageUrl} alt={`Property ${imageIndex + 1}`} loading="lazy" className="h-full w-full object-cover" />
                              {isLastVisible ? (
                                <span className="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-[12px] font-bold text-white">
                                  +{selectedPropertyImages.length - 5}
                                </span>
                              ) : null}
                            </a>
                          );
                        },
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === "proposals" ? (
        <div className="mt-4 space-y-4">
          <section className={`${shellCard} p-4 sm:p-5`}>
            <ol className="flex flex-wrap items-center gap-4">
              {[
                { step: 1, title: "Select properties", hint: "Choose properties to include" },
                { step: 2, title: "Configure proposal", hint: "Set details and preferences" },
                { step: 3, title: "Preview & share", hint: "Review and send to client" },
              ].map((item, index, list) => {
                const isActive = proposalStep === item.step;
                const isDone = proposalStep > item.step;
                return (
                  <li key={item.step} className="flex min-w-[210px] flex-1 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setProposalStep(item.step)}
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                          isActive || isDone
                            ? "bg-blue-600 text-white"
                            : isDark
                              ? "bg-slate-800 text-slate-400"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isDone ? <Check size={15} /> : item.step}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block truncate text-[13px] font-bold ${isActive ? "text-blue-600" : headingText}`}
                        >
                          {item.title}
                        </span>
                        <span className={`block truncate text-[12px] ${mutedText}`}>{item.hint}</span>
                      </span>
                    </button>
                    {index < list.length - 1 ? (
                      <span className={`hidden h-px flex-1 sm:block ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>

          {proposalPropertyOptions.length === 0 ? (
            <section className={`${shellCard} p-6 text-center`}>
              <span
                className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
                  isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-400"
                }`}
              >
                <FileText size={22} />
              </span>
              <p className={`mt-3 text-[14px] font-semibold ${headingText}`}>No properties linked yet</p>
              <p className={`mt-1 text-[13px] ${mutedText}`}>Link at least one property before generating a proposal.</p>
              <button type="button" onClick={() => setActiveTab("properties")} className={`mt-4 ${blueBtn} mx-auto`}>
                <Search size={15} />
                Browse inventory
              </button>
            </section>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="space-y-4 xl:col-span-4">
                <section className={`${shellCard} p-4 sm:p-5`}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className={`text-[14px] font-bold ${headingText}`}>
                      Selected properties ({selectedPropertyCount})
                    </h2>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleSelectAllProposalProperties}
                        disabled={selectedPropertyCount === proposalPropertyOptions.length}
                        className={`${smallGhostBtn} disabled:opacity-50`}
                      >
                        All
                      </button>
                      <button type="button" onClick={handleResetProposalSelection} className={smallGhostBtn}>
                        Reset
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {visibleProposalPropertyOptions.map((property) => {
                      const checked = selectedProposalPropertyIdSet.has(property.id);
                      const coverImage = property.imageUrls[0] || "";
                      return (
                        <button
                          key={property.id}
                          type="button"
                          onClick={() => toggleProposalProperty(property.id)}
                          className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition ${
                            checked
                              ? isDark
                                ? "border-blue-500/50 bg-blue-500/10"
                                : "border-blue-300 bg-blue-50"
                              : isDark
                                ? "border-slate-800 hover:border-slate-700"
                                : "border-slate-200 hover:border-blue-200"
                          }`}
                        >
                          <span
                            className={`h-11 w-14 shrink-0 overflow-hidden rounded-md ${
                              isDark ? "bg-slate-800" : "bg-slate-100"
                            }`}
                          >
                            {coverImage ? (
                              <img src={coverImage} alt={property.label} loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <span className={`flex h-full w-full items-center justify-center ${mutedText}`}>
                                <Building2 size={16} />
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[12px] font-bold ${headingText}`}>
                              {String(property.id || "").slice(-6).toUpperCase()}
                            </span>
                            <span className={`block truncate text-[12px] ${mutedText}`}>{property.label}</span>
                          </span>
                          {checked ? (
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                              <Check size={13} />
                            </span>
                          ) : (
                            <span
                              className={`h-5 w-5 shrink-0 rounded-full border ${
                                isDark ? "border-slate-700" : "border-slate-300"
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                    {hasMoreProposalPropertyOptions ? (
                      <button
                        type="button"
                        onClick={() => setVisibleProposalOptionsCount((previous) => previous + RENDER_STEP_COUNT)}
                        className={smallGhostBtn}
                      >
                        Show more options ({proposalPropertyOptions.length - visibleProposalPropertyOptions.length} left)
                      </button>
                    ) : null}
                  </div>
                </section>

                <section className={`${shellCard} p-4 sm:p-5`}>
                  <h2 className={`text-[14px] font-bold ${headingText}`}>
                    Images included ({proposalImageEntries.length})
                  </h2>
                  <p className={`mt-1 text-[12px] ${mutedText}`}>Select property images to include in proposal</p>
                  {allProposalImageEntries.length === 0 ? (
                    <p className={`mt-3 text-[13px] ${mutedText}`}>No images attached for selected properties.</p>
                  ) : (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {allProposalImageEntries.map((entry, index) => {
                        const isExcluded = excludedProposalImageUrls.includes(entry.url);
                        const isIncluded = includeProposalImages && !isExcluded;
                        return (
                          <button
                            key={`${entry.propertyId}-${entry.url}-${index}`}
                            type="button"
                            onClick={() =>
                              setExcludedProposalImageUrls((previous) =>
                                previous.includes(entry.url)
                                  ? previous.filter((url) => url !== entry.url)
                                  : [...previous, entry.url],
                              )
                            }
                            className={`relative h-20 overflow-hidden rounded-lg border ${
                              isIncluded ? "border-blue-500" : isDark ? "border-slate-800" : "border-slate-200"
                            }`}
                          >
                            <img
                              src={entry.url}
                              alt={entry.propertyLabel}
                              loading="lazy"
                              className={`h-full w-full object-cover ${isIncluded ? "" : "opacity-50"}`}
                            />
                            <span
                              className={`absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded border ${
                                isIncluded ? "border-blue-600 bg-blue-600 text-white" : "border-white/80 bg-white/70"
                              }`}
                            >
                              {isIncluded ? <Check size={11} strokeWidth={3} /> : null}
                            </span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setActiveTab("properties")}
                        className={`flex h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[11px] font-semibold ${
                          isDark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"
                        }`}
                      >
                        <Plus size={16} />
                        Add more images
                      </button>
                    </div>
                  )}
                </section>

                <section className={`${shellCard} p-4 sm:p-5`}>
                  <label className="block">
                    <span className={labelCls}>Validity period</span>
                    <select
                      value={proposalValidityDays}
                      onChange={(event) => setProposalValidityDays(event.target.value)}
                      className={fieldCls}
                    >
                      {["3", "7", "15", "30", "45", "60", "90"].map((days) => (
                        <option key={days} value={days}>
                          {days} days
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mt-4 block">
                    <span className={labelCls}>
                      Special note <span className={mutedText}>(optional)</span>
                    </span>
                    <textarea
                      value={proposalSpecialNote}
                      maxLength={500}
                      onChange={(event) => setProposalSpecialNote(event.target.value)}
                      placeholder="Add any special note for this proposal..."
                      className={`min-h-[90px] resize-y ${areaCls}`}
                    />
                    <span className={`mt-1 block text-right text-[12px] ${mutedText}`}>
                      {proposalSpecialNote.length}/500
                    </span>
                  </label>

                  <div className="mt-3 flex items-start gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={includeProposalImages}
                      onClick={() => setIncludeProposalImages((value) => !value)}
                      className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition ${
                        includeProposalImages ? "bg-blue-600" : isDark ? "bg-slate-700" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`h-5 w-5 rounded-full bg-white transition ${
                          includeProposalImages ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                    <div>
                      <p className={`text-[13px] font-semibold ${headingText}`}>Include property images in proposal</p>
                      <p className={`mt-0.5 text-[12px] ${mutedText}`}>
                        Selected images will be shown in the proposal document
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <div className="space-y-4 xl:col-span-8">
                <section className={`${shellCard} p-4 sm:p-5`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className={cardTitle}>Proposal preview</h2>
                    <span className={pillCls("slate")}>
                      <Image size={12} />
                      {proposalImageEntries.length} images
                    </span>
                  </div>

                  <div
                    className={`mt-3 rounded-xl border p-5 ${
                      isDark ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className={`text-[17px] font-bold tracking-tight ${headingText}`}>THE OFFICE ON RENT</div>
                        <div className={`text-[12px] ${mutedText}`}>Commercial &amp; residential property advisory</div>
                      </div>
                      <div className={`inline-flex items-center gap-2 text-[14px] font-bold ${headingText}`}>
                        <Building2 size={18} className="text-blue-600" />
                        Office on Rent
                      </div>
                    </div>

                    <h3 className={`mt-5 text-[16px] font-bold tracking-tight ${headingText}`}>PROPERTY PROPOSAL</h3>
                    <div className={`mt-3 grid grid-cols-2 gap-3 border-b pb-3 sm:grid-cols-4 ${dividerBorder}`}>
                      <div>
                        <div className={`text-[12px] ${mutedText}`}>Client name</div>
                        <div className={`mt-0.5 text-[13px] font-bold ${headingText}`}>{leadDisplayName}</div>
                      </div>
                      <div>
                        <div className={`text-[12px] ${mutedText}`}>Lead ID</div>
                        <div className={`mt-0.5 text-[13px] font-bold ${headingText}`}>{leadIdLabel}</div>
                      </div>
                      <div>
                        <div className={`text-[12px] ${mutedText}`}>Date</div>
                        <div className={`mt-0.5 text-[13px] font-bold ${headingText}`}>{proposalDateLabel}</div>
                      </div>
                      <div>
                        <div className={`text-[12px] ${mutedText}`}>Valid till</div>
                        <div className={`mt-0.5 text-[13px] font-bold ${headingText}`}>
                          {proposalValidTillLabel} ({proposalValidityDays} days)
                        </div>
                      </div>
                    </div>

                    <p className={`mt-3 text-[13px] ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                      Thank you for considering The Office on Rent. We are pleased to present the following property
                      options as per your requirements.
                    </p>

                    {selectedProposalProperties.length === 0 ? (
                      <p className={`mt-4 text-[13px] ${mutedText}`}>
                        Select at least one linked property to generate the proposal.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-5">
                        {selectedProposalProperties.map((property) => {
                          const inventory = property.inventory || {};
                          const images = includeProposalImages
                            ? property.imageUrls.filter((url) => !excludedProposalImageUrls.includes(url)).slice(0, 3)
                            : [];
                          return (
                            <div key={property.id} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                              {images.length ? (
                                <div className="space-y-2">
                                  <div className={`h-[170px] overflow-hidden rounded-lg ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
                                    <img src={images[0]} alt={property.clientLabel} loading="lazy" className="h-full w-full object-cover" />
                                  </div>
                                  {images.length > 1 ? (
                                    <div className="grid grid-cols-2 gap-2">
                                      {images.slice(1, 3).map((imageUrl, imageIndex) => (
                                        <div
                                          key={`${imageUrl}-${imageIndex}`}
                                          className={`h-[75px] overflow-hidden rounded-lg ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
                                        >
                                          <img src={imageUrl} alt={property.clientLabel} loading="lazy" className="h-full w-full object-cover" />
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}

                              <div className={images.length ? "" : "lg:col-span-2"}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <h4 className={`text-[15px] font-bold ${headingText}`}>{property.clientLabel}</h4>
                                  <span className={pillCls("slate")}>{String(property.id || "").slice(-6).toUpperCase()}</span>
                                </div>
                                <p className={`mt-1 inline-flex items-center gap-1.5 text-[13px] ${mutedText}`}>
                                  <MapPin size={14} />
                                  {getInventoryLocationLabel(inventory) || String(selectedLead?.city || "").trim() || "-"}
                                </p>
                                <dl className="mt-3 text-[13px]">
                                  {[
                                    ["Property type", getInventorySubtypeLabel(inventory) || toTitleCaseLabel(inventory?.inventoryType) || "-"],
                                    ["Transaction type", getInventoryListingLabel(inventory)],
                                    ["Project", String(inventory?.projectName || selectedLead?.projectInterested || "-").trim() || "-"],
                                    ["Location", getInventoryLocationLabel(inventory) || "-"],
                                    [getInventoryAmountLabel(inventory), formatInventoryAmountInr(inventory)],
                                  ].map(([term, value]) => (
                                    <div key={term} className={`flex items-center justify-between gap-3 border-b py-2 ${dividerBorder}`}>
                                      <dt className={mutedText}>{term}</dt>
                                      <dd className={`text-right font-semibold ${headingText}`}>{value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {proposalSpecialNote ? (
                      <p className={`mt-4 rounded-lg border px-3 py-2 text-[13px] ${toneClass("amber")}`}>
                        {proposalSpecialNote}
                      </p>
                    ) : null}
                  </div>

                  <details className="mt-3">
                    <summary className={`cursor-pointer text-[13px] font-semibold ${mutedText}`}>
                      Proposal text (shared on WhatsApp and email)
                    </summary>
                    <textarea value={proposalText} readOnly className={`mt-2 min-h-[200px] text-[12px] leading-5 ${areaCls}`} />
                  </details>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyProposal}
                        disabled={!selectedPropertyCount}
                        className={`${ghostBtn} disabled:opacity-50`}
                      >
                        <Copy size={15} />
                        Copy text
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadProposal}
                        disabled={isGeneratingProposalPdf || !selectedPropertyCount}
                        className={`${ghostBtn} disabled:opacity-50`}
                      >
                        {isGeneratingProposalPdf ? <Loader size={15} className="animate-spin" /> : <Download size={15} />}
                        Download PDF
                      </button>
                      {proposalImageEntries.length ? (
                        <button type="button" onClick={handleCopyImageLinks} className={ghostBtn}>
                          <Link2 size={15} />
                          Image links
                        </button>
                      ) : null}
                      {canUseNativeShare && proposalImageEntries.length ? (
                        <button type="button" onClick={handleNativeShareImages} className={ghostBtn}>
                          <Image size={15} />
                          Share images
                        </button>
                      ) : null}
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShareMenuOpen((open) => !open)}
                        disabled={!selectedPropertyCount}
                        className={`${blueBtn} pr-3`}
                      >
                        <Send size={15} />
                        Share
                        <ChevronDown size={15} />
                      </button>
                      {shareMenuOpen ? (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setShareMenuOpen(false)} />
                          <div
                            className={`absolute bottom-12 right-0 z-30 w-44 overflow-hidden rounded-xl border py-1 shadow-lg ${shellSurface}`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setShareMenuOpen(false);
                                handleShareToWhatsApp();
                              }}
                              disabled={isGeneratingProposalPdf || (!proposalWhatsAppHref && !canUseNativeShare)}
                              className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium disabled:opacity-50 ${
                                isDark ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {WhatsAppIcon ? <WhatsAppIcon size={15} className="text-emerald-600" /> : null}
                              WhatsApp
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShareMenuOpen(false);
                                handleShareByEmail();
                              }}
                              className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium ${
                                isDark ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <Mail size={15} />
                              Email
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShareMenuOpen(false);
                                handleNativeShareProposal();
                              }}
                              disabled={isGeneratingProposalPdf}
                              className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium disabled:opacity-50 ${
                                isDark ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <FileText size={15} />
                              Share PDF
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {isGeneratingProposalPdf ? (
                    <p className={`mt-2 text-[12px] ${mutedText}`}>Generating PDF with property images...</p>
                  ) : null}
                  {proposalActionMessage ? (
                    <p className={`mt-2 text-[12px] font-semibold ${isDark ? "text-emerald-200" : "text-emerald-700"}`}>
                      {proposalActionMessage}
                    </p>
                  ) : null}
                </section>

                <section className={`${shellCard} p-4 sm:p-5`}>
                  <h2 className={cardTitle}>Previous proposals</h2>
                  <div className="mt-4 flex flex-col items-center justify-center gap-2 py-6 text-center">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-full ${
                        isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <FileText size={20} />
                    </span>
                    <p className={`text-[13px] font-semibold ${headingText}`}>No previous proposals</p>
                    <p className={`text-[12px] ${mutedText}`}>Proposals you create for this lead will appear here.</p>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "activity" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-7">
            <section className={`${shellCard} p-4 sm:p-5`}>
              <h2 className={cardTitle}>Log activity</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { value: "NOTE", label: "Add note", Icon: FileText },
                  { value: "CALL", label: "Log call", Icon: Phone },
                  { value: "VISIT", label: "Log visit", Icon: Calendar },
                ].map((mode) => {
                  const isActive = logActivityMode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => handleLogActivityMode(mode.value)}
                      className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-[13px] font-semibold transition ${
                        isActive
                          ? isDark
                            ? "border-blue-500/50 bg-blue-500/15 text-blue-200"
                            : "border-blue-300 bg-blue-50 text-blue-700"
                          : isDark
                            ? "border-slate-700 bg-slate-900 text-slate-300"
                            : "border-slate-300 bg-white text-slate-600"
                      }`}
                    >
                      <mode.Icon size={15} />
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              <div className="relative mt-3">
                <textarea
                  value={diaryDraft}
                  onChange={(event) => setDiaryDraft(event.target.value)}
                  maxLength={2000}
                  placeholder={
                    logActivityMode === "CALL"
                      ? "Write what was discussed on this call..."
                      : logActivityMode === "VISIT"
                        ? "Write how the site visit went..."
                        : "Write a note about this lead..."
                  }
                  className={`min-h-[110px] resize-y pb-12 ${areaCls}`}
                />
                <button
                  type="button"
                  onClick={onDiaryVoiceToggle}
                  disabled={savingDiary || !isDiaryMicSupported}
                  className={`absolute bottom-3 right-3 ${smallGhostBtn} disabled:opacity-50`}
                >
                  {isDiaryListening ? <MicOff size={13} /> : <Mic size={13} />}
                  {isDiaryListening ? "Stop mic" : "Voice"}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={`text-[12px] ${mutedText}`}>{diaryDraft.length}/2000</span>
                <button
                  type="button"
                  onClick={onAddDiary}
                  disabled={savingDiary || !diaryDraft.trim()}
                  className={blueBtn}
                >
                  {savingDiary ? <Loader size={15} className="animate-spin" /> : null}
                  Save note
                </button>
              </div>
              {!isDiaryMicSupported ? (
                <p className={`mt-2 text-[12px] ${isDark ? "text-amber-200" : "text-amber-700"}`}>
                  Voice input is not supported in this browser.
                </p>
              ) : null}
            </section>

            <section className={`${shellCard} p-4 sm:p-5`}>
              <h2 className={cardTitle}>Activity timeline</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { value: "ALL", label: "All" },
                  { value: "NOTES", label: "Notes" },
                  { value: "CALLS", label: "Calls" },
                  { value: "VISITS", label: "Visits" },
                  { value: "ASSIGNMENTS", label: "Assignments" },
                  { value: "PROPERTIES", label: "Properties" },
                ].map((chip) => {
                  const isActive = activityFilter === chip.value;
                  return (
                    <button
                      key={chip.value}
                      type="button"
                      onClick={() => setActivityFilter(chip.value)}
                      className={`inline-flex h-8 items-center rounded-full border px-3.5 text-[12px] font-semibold transition ${
                        isActive
                          ? "border-blue-600 bg-blue-600 text-white"
                          : isDark
                            ? "border-slate-700 bg-slate-900 text-slate-300"
                            : "border-slate-300 bg-white text-slate-600"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              {activityLoading || diaryLoading ? (
                <div className={`mt-5 flex h-24 items-center justify-center gap-2 text-sm ${mutedText}`}>
                  <Loader size={15} className="animate-spin" /> Loading timeline...
                </div>
              ) : visibleTimelineEntries.length === 0 ? (
                <p className={`mt-5 text-[13px] ${mutedText}`}>No activity for this filter yet.</p>
              ) : (
                <ol className="mt-5 space-y-5">
                  {visibleTimelineEntries.map((entry, index) => {
                    const { Icon, tone } = activityIconFor({ action: `${entry.title} ${entry.detail}` });
                    return (
                      <li key={entry.key} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${toneClass(tone)}`}>
                            <Icon size={14} />
                          </span>
                          {index < visibleTimelineEntries.length - 1 ? (
                            <span className={`mt-1.5 w-px flex-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                          ) : null}
                        </div>
                        <div className="min-w-0 pb-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className={`text-[13px] font-bold ${headingText}`}>{entry.title}</p>
                            <span className={`shrink-0 text-[12px] ${mutedText}`}>{formatDate(entry.at)}</span>
                          </div>
                          {entry.detail ? (
                            <p className={`mt-1 whitespace-pre-wrap break-words text-[13px] ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                              {entry.detail}
                            </p>
                          ) : null}
                          {entry.author ? <p className={`mt-1 text-[12px] ${mutedText}`}>By {entry.author}</p> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              {hasMoreTimelineEntries ? (
                <button
                  type="button"
                  onClick={() => setVisibleActivityCount((previous) => previous + RENDER_STEP_COUNT)}
                  className={`mt-4 ${ghostBtn}`}
                >
                  Show more activity ({combinedTimelineEntries.length - visibleTimelineEntries.length} left)
                </button>
              ) : null}
            </section>

            <section className={`${shellCard} p-4 sm:p-5`}>
              <h2 className={cardTitle}>Assignment history</h2>
              {assignmentHistoryEvents.length === 0 ? (
                <p className={`mt-3 text-[13px] ${mutedText}`}>No assignment history yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
                    <thead>
                      <tr className={isDark ? "bg-slate-950/60" : "bg-slate-50"}>
                        {["From", "To", "Assigned on", "Reason"].map((columnLabel) => (
                          <th
                            key={columnLabel}
                            className={`border-b px-3 py-2.5 font-semibold ${dividerBorder} ${mutedText}`}
                          >
                            {columnLabel}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {assignmentHistoryEvents.map((event, index) => (
                        <tr key={event._id || `${event.action}-${index}`}>
                          <td className={`border-b px-3 py-2.5 ${dividerBorder} ${headingText}`}>
                            {getUserDisplayName(event.fromUser)}
                          </td>
                          <td className={`border-b px-3 py-2.5 ${dividerBorder} ${headingText}`}>
                            {getUserDisplayName(event.toUser)}
                          </td>
                          <td className={`border-b px-3 py-2.5 ${dividerBorder} ${mutedText}`}>
                            {formatDate(event.createdAt)}
                          </td>
                          <td className={`border-b px-3 py-2.5 ${dividerBorder} ${mutedText}`}>
                            {String(event.reason || "").trim() || getAssignmentActionLabel(event.action)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4 xl:col-span-5">
            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className={cardTitle}>Tasks</h2>
                <button type="button" onClick={() => setNewTaskFormOpen((open) => !open)} className={smallBlueBtn}>
                  <Plus size={13} />
                  Add task
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {loadingTasks ? (
                  <p className={`py-3 text-center text-[13px] ${mutedText}`}>Loading tasks...</p>
                ) : leadTasks.length === 0 ? (
                  <p className={`py-3 text-center text-[13px] ${mutedText}`}>No tasks linked to this lead.</p>
                ) : (
                  leadTasks.map((task) => {
                    const isCompleted = task.status === "COMPLETED";
                    const expired =
                      !isCompleted && task.dueDate && new Date(task.dueDate) < new Date().setHours(0, 0, 0, 0);
                    const priorityTone =
                      task.priority === "HIGH" ? "rose" : task.priority === "MEDIUM" ? "amber" : "blue";
                    return (
                      <div
                        key={task._id}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${
                          isCompleted
                            ? isDark
                              ? "border-slate-800 opacity-60"
                              : "border-slate-200 bg-slate-50 opacity-70"
                            : isDark
                              ? "border-slate-800"
                              : "border-slate-200"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleLeadTaskStatus(task)}
                          aria-label={isCompleted ? "Mark task as pending" : "Mark task as complete"}
                          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition ${
                            isCompleted
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : isDark
                                ? "border-slate-600 hover:border-blue-400"
                                : "border-slate-300 hover:border-blue-500"
                          }`}
                        >
                          {isCompleted ? <Check size={12} strokeWidth={3} /> : null}
                        </button>

                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-[13px] font-bold ${
                              isCompleted ? `line-through ${mutedText}` : headingText
                            }`}
                          >
                            {task.title}
                          </p>
                          {task.description ? (
                            <p className={`mt-0.5 break-words text-[12px] ${mutedText}`}>{task.description}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={pillCls(priorityTone)}>{statusLabel(task.priority)}</span>
                            {task.assignedTo?.name ? (
                              <span className={`inline-flex items-center gap-1.5 text-[12px] ${mutedText}`}>
                                <span
                                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                                    isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {String(task.assignedTo.name)
                                    .split(/\s+/)
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((part) => part.charAt(0).toUpperCase())
                                    .join("")}
                                </span>
                                {task.assignedTo.name}
                              </span>
                            ) : null}
                            {task.dueDate ? (
                              <span
                                className={`inline-flex items-center gap-1.5 text-[12px] ${
                                  expired ? "font-semibold text-rose-600" : mutedText
                                }`}
                              >
                                <Calendar size={13} />
                                {new Date(task.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                {expired ? " (Overdue)" : ""}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteLeadTask(task._id)}
                          aria-label="Delete task"
                          className={`shrink-0 rounded-lg p-1.5 transition ${
                            isDark ? "text-slate-400 hover:bg-rose-500/10 hover:text-rose-300" : "text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          }`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {newTaskFormOpen ? (
                <form
                  onSubmit={(event) => {
                    handleAddLeadTask(event);
                    setNewTaskFormOpen(false);
                  }}
                  className={`mt-4 rounded-xl border p-4 ${isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`text-[14px] font-bold ${headingText}`}>New task</h3>
                    <button
                      type="button"
                      onClick={() => setNewTaskFormOpen(false)}
                      aria-label="Close new task form"
                      className={mutedText}
                    >
                      <ChevronUp size={16} />
                    </button>
                  </div>
                  <label className="mt-3 block">
                    <span className={labelCls}>
                      Title <span className="text-rose-500">*</span>
                    </span>
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(event) => setNewTaskTitle(event.target.value)}
                      placeholder="e.g. Follow up with client"
                      className={fieldCls}
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className={labelCls}>Description</span>
                    <textarea
                      value={newTaskDescription}
                      onChange={(event) => setNewTaskDescription(event.target.value)}
                      placeholder="Add task details..."
                      className={`min-h-[70px] resize-y ${areaCls}`}
                    />
                  </label>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className={labelCls}>
                        Priority <span className="text-rose-500">*</span>
                      </span>
                      <select
                        value={newTaskPriority}
                        onChange={(event) => setNewTaskPriority(event.target.value)}
                        className={fieldCls}
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className={labelCls}>
                        Assign to <span className="text-rose-500">*</span>
                      </span>
                      <select
                        value={newTaskAssignedTo}
                        onChange={(event) => setNewTaskAssignedTo(event.target.value)}
                        className={fieldCls}
                      >
                        <option value="">Unassigned</option>
                        {executives.map((user) => (
                          <option key={user._id} value={user._id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className={labelCls}>
                        Due date <span className="text-rose-500">*</span>
                      </span>
                      <input
                        type="date"
                        value={newTaskDueDate}
                        onChange={(event) => setNewTaskDueDate(event.target.value)}
                        className={fieldCls}
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setNewTaskFormOpen(false)} className={ghostBtn}>
                      Cancel
                    </button>
                    <button type="submit" disabled={addingTask || !newTaskTitle.trim()} className={blueBtn}>
                      {addingTask ? <Loader size={15} className="animate-spin" /> : null}
                      Create task
                    </button>
                  </div>
                </form>
              ) : null}
            </section>

            <section className={`${shellCard} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={cardTitle}>Current owner</h2>
                {canAssignLead ? (
                  <button type="button" onClick={() => setTransferPanelOpen((open) => !open)} className={ghostBtn}>
                    <ArrowRightLeft size={15} />
                    Transfer lead
                  </button>
                ) : null}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold ${
                    isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {assignedToInitials}
                </span>
                <div className="min-w-0">
                  <p className={`truncate text-[14px] font-bold ${headingText}`}>{currentOwnerName}</p>
                  <p className={`truncate text-[12px] ${mutedText}`}>
                    {selectedLead?.assignedTo?.email || (currentOwnerRole ? statusLabel(currentOwnerRole) : "Not assigned")}
                  </p>
                </div>
              </div>

              {canAssignLead && transferPanelOpen ? (
                <div
                  id="lead-transfer-panel"
                  className={`mt-4 rounded-xl border p-4 ${isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}
                >
                  <h3 className={`text-[14px] font-bold ${headingText}`}>Transfer lead</h3>
                  {showQualifiedTransferHelper ? (
                    <p className={`mt-2 rounded-lg border px-3 py-2 text-[12px] ${toneClass("emerald")}`}>
                      This lead is qualified. You can assign it to a Field Executive for site visit or deal handling.
                    </p>
                  ) : null}
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelCls}>
                        Search user or role <span className="text-rose-500">*</span>
                      </span>
                      <div className="relative">
                        <Search size={15} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${mutedText}`} />
                        <input
                          type="search"
                          value={assigneeSearchDraft}
                          onChange={(event) => setAssigneeSearchDraft(event.target.value)}
                          placeholder="Search by name, email or role..."
                          className={`${fieldCls} pl-9`}
                        />
                      </div>
                    </label>
                    <label className="block">
                      <span className={labelCls}>Selected assignee</span>
                      <select
                        value={executiveDraft}
                        onChange={(event) => setExecutiveDraft(event.target.value)}
                        className={fieldCls}
                      >
                        <option value="">Select user</option>
                        {filteredAssignees.map((user) => (
                          <option key={user._id} value={user._id}>
                            {user.name} ({statusLabel(user.role)})
                            {user.lastAssignedAt ? ` - last ${formatDate(user.lastAssignedAt)}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="mt-3 block">
                    <span className={labelCls}>
                      Reason <span className="text-rose-500">*</span>
                    </span>
                    <textarea
                      value={transferReasonDraft}
                      onChange={(event) => setTransferReasonDraft(event.target.value)}
                      placeholder="e.g. Client location change, better coverage, etc."
                      className={`min-h-[70px] resize-y ${areaCls}`}
                    />
                  </label>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExecutiveDraft(selectedLead?.assignedTo?._id || "");
                        setTransferReasonDraft("");
                        setAssigneeSearchDraft("");
                        setTransferPanelOpen(false);
                      }}
                      className={ghostBtn}
                    >
                      Cancel
                    </button>
                    <button type="button" onClick={onAssignLead} disabled={!executiveDraft || !String(transferReasonDraft || "").trim() || assigning} className={blueBtn}>
                      {assigning ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
                      {assigning ? "Transferring..." : "Confirm transfer"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}

      {transferConfirmOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="transfer-lead-title">
          <div className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${shellSurface}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-[12px] font-semibold uppercase tracking-wide ${mutedText}`}>Transfer lead</p>
                <h2 id="transfer-lead-title" className={`mt-1 text-[19px] font-bold ${headingText}`}>Assign to {selectedTransferAssignee?.name || "selected user"}</h2>
              </div>
              <button type="button" onClick={cancelTransferConfirmation} aria-label="Close transfer dialog" className={`rounded-lg p-1.5 ${mutedText}`}><ChevronUp size={18} /></button>
            </div>
            <label className="mt-4 block">
              <span className={labelCls}>Reason for transfer <span className="text-rose-500">*</span></span>
              <textarea value={transferReasonDraft} onChange={(event) => setTransferReasonDraft(event.target.value)} placeholder="Why is this lead being reassigned?" className={`min-h-[92px] resize-y ${areaCls}`} autoFocus />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={cancelTransferConfirmation} className={ghostBtn}>Cancel</button>
              <button type="button" onClick={onAssignLead} disabled={!String(transferReasonDraft || "").trim() || assigning} className={blueBtn}>
                {assigning ? <Loader size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />}
                {assigning ? "Transferring..." : "Confirm transfer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {canEditLead && (activeTab === "requirements" || hasPendingLeadEdits) ? (
        <div
          className={`sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-end gap-2 rounded-xl border px-4 py-3 ${
            isDark ? "border-slate-800 bg-slate-900/95" : "border-slate-200 bg-white/95"
          }`}
        >
          <button type="button" onClick={onClose} className={ghostBtn}>
            Cancel
          </button>
          <button type="button" onClick={onUpdateLead} disabled={savingUpdates} className={blueBtn}>
            {savingUpdates ? <Loader size={15} className="animate-spin" /> : <Save size={15} />}
            {savingUpdates ? "Saving..." : activeTab === "requirements" ? "Save requirements" : "Save changes"}
          </button>
        </div>
      ) : null}
    </Motion.section>
  );
};

export const LeadDetailsRebuilt = (props) => {
  if (!props.selectedLead) return null;
  return <LeadDetailsRebuiltContent {...props} />;
};
