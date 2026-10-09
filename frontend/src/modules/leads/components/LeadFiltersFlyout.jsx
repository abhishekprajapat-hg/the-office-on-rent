/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, SlidersHorizontal, Zap, Clock, Users as UsersIcon, Calendar } from "lucide-react";
import { Button, cn } from "../../../components/ui";
import { QUICK_FILTER_KEYS } from "./leadFilterConstants";

export default function LeadFiltersFlyout({
  isOpen,
  onClose,
  status = "ALL",
  source = "",
  assignedTo = "",
  inventoryType = "",
  propertyType = "",
  budgetRange = "",
  followUpDate = "",
  createdDate = "",
  quickFilter = "",
  onQuickFilterToggle,
  employees = [],
  statuses = [],
  propertySubtypes = [],
  onApply,
  onReset,
}) {
  const [draftStatus, setDraftStatus] = useState(status || "ALL");
  const [draftSource, setDraftSource] = useState(source || "");
  const [draftAssignedTo, setDraftAssignedTo] = useState(assignedTo || "");
  const [draftInventoryType, setDraftInventoryType] = useState(inventoryType || "");
  const [draftPropertyType, setDraftPropertyType] = useState(propertyType || "");
  const [draftBudgetRange, setDraftBudgetRange] = useState(budgetRange || "");
  const [draftFollowUpDate, setDraftFollowUpDate] = useState(followUpDate || "");
  const [draftCreatedDate, setDraftCreatedDate] = useState(createdDate || "");
  const [draftQuickFilter, setDraftQuickFilter] = useState(quickFilter || "");
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose?.(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener("keydown", handleKey);
    return () => { dialog?.removeEventListener("keydown", handleKey); previousFocus?.focus?.(); };
  }, [isOpen, onClose]);

  // The draft mirrors the flyout's committed values whenever it opens or the
  // parent applies a filter from the compact toolbar.
  useEffect(() => {
    setDraftStatus(status || "ALL");
    setDraftSource(source || "");
    setDraftAssignedTo(assignedTo || "");
    setDraftInventoryType(inventoryType || "");
    setDraftPropertyType(propertyType || "");
    setDraftBudgetRange(budgetRange || "");
    setDraftFollowUpDate(followUpDate || "");
    setDraftCreatedDate(createdDate || "");
    setDraftQuickFilter(quickFilter || "");
  }, [status, source, assignedTo, inventoryType, propertyType, budgetRange, followUpDate, createdDate, quickFilter, isOpen]);

  if (!isOpen) return null;

  // Calculate number of active filters
  let appliedCount = 0;
  if (draftStatus && draftStatus !== "ALL") appliedCount++;
  if (draftSource && draftSource !== "ALL" && draftSource !== "") appliedCount++;
  if (draftAssignedTo && draftAssignedTo !== "ALL" && draftAssignedTo !== "") appliedCount++;
  if (draftInventoryType && draftInventoryType !== "ALL") appliedCount++;
  if (draftPropertyType && draftPropertyType !== "ALL" && draftPropertyType !== "") appliedCount++;
  if (draftBudgetRange && draftBudgetRange !== "ALL" && draftBudgetRange !== "") appliedCount++;
  if (draftFollowUpDate && draftFollowUpDate !== "ALL" && draftFollowUpDate !== "") appliedCount++;
  if (draftCreatedDate && draftCreatedDate !== "ALL" && draftCreatedDate !== "") appliedCount++;
  if (draftQuickFilter) appliedCount++;

  const handleReset = () => {
    setDraftStatus("ALL");
    setDraftSource("");
    setDraftAssignedTo("");
    setDraftInventoryType("");
    setDraftPropertyType("");
    setDraftBudgetRange("");
    setDraftFollowUpDate("");
    setDraftCreatedDate("");
    setDraftQuickFilter("");
    onReset?.();
  };

  const handleApply = (e) => {
    e?.preventDefault();
    onApply?.({
      status: draftStatus,
      source: draftSource,
      assignedTo: draftAssignedTo,
      inventoryType: draftInventoryType,
      propertyType: draftPropertyType,
      budgetRange: draftBudgetRange,
      followUpDate: draftFollowUpDate,
      createdDate: draftCreatedDate,
      quickFilter: draftQuickFilter,
    });
    onClose?.();
  };

  const toggleQuickFilter = (key) => {
    const next = draftQuickFilter === key ? "" : key;
    setDraftQuickFilter(next);
    onQuickFilterToggle?.(next);
  };

const selectStyle =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Flyout panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-filters-title"
        tabIndex={-1}
        className={cn(
          "fixed inset-y-0 right-0 z-[1001] flex h-dvh w-full max-w-[380px] flex-col overflow-hidden border-l border-slate-200 bg-white text-slate-900 shadow-2xl outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={17} className="text-slate-700 dark:text-slate-200" />
            <h2 id="lead-filters-title" className="text-[15px] font-bold text-slate-900 dark:text-slate-100">Filters</h2>
            {appliedCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white">
                {appliedCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleApply} className="min-h-10 bg-blue-600 px-4 text-white">Apply</Button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-2 text-sm dark:border-slate-700"
            aria-label="Close filters"
          >
            <X size={18} />
            Close
          </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4">
          {/* Quick filters section */}
          <div>
            <h3 className="mb-2.5 text-[12px] font-bold text-slate-700 dark:text-slate-300">
              Quick filters
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => toggleQuickFilter(QUICK_FILTER_KEYS.NEEDS_FOLLOW_UP_TODAY)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11.5px] font-medium transition-all",
                  draftQuickFilter === QUICK_FILTER_KEYS.NEEDS_FOLLOW_UP_TODAY
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/15 dark:text-blue-300"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
                )}
              >
                <Zap size={14} className="shrink-0 text-amber-500" />
                <span className="truncate">Needs follow-up today</span>
              </button>

              <button
                type="button"
                onClick={() => toggleQuickFilter(QUICK_FILTER_KEYS.OVERDUE_FOLLOW_UPS)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11.5px] font-medium transition-all",
                  draftQuickFilter === QUICK_FILTER_KEYS.OVERDUE_FOLLOW_UPS
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/15 dark:text-blue-300"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
                )}
              >
                <Clock size={14} className="shrink-0 text-rose-500" />
                <span className="truncate">Overdue follow-ups</span>
              </button>

              <button
                type="button"
                onClick={() => toggleQuickFilter(QUICK_FILTER_KEYS.UNASSIGNED_LEADS)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11.5px] font-medium transition-all",
                  draftQuickFilter === QUICK_FILTER_KEYS.UNASSIGNED_LEADS
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/15 dark:text-blue-300"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
                )}
              >
                <UsersIcon size={14} className="shrink-0 text-blue-500" />
                <span className="truncate">Unassigned leads</span>
              </button>

              <button
                type="button"
                onClick={() => toggleQuickFilter(QUICK_FILTER_KEYS.NEW_THIS_WEEK)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11.5px] font-medium transition-all",
                  draftQuickFilter === QUICK_FILTER_KEYS.NEW_THIS_WEEK
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/15 dark:text-blue-300"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
                )}
              >
                <Calendar size={14} className="shrink-0 text-sky-500" />
                <span className="truncate">New this week</span>
              </button>
            </div>
          </div>

          {/* Filter by section */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[12px] font-bold text-slate-700 dark:text-slate-300">
                Filter by
              </h3>
              <button
                type="button"
                onClick={handleReset}
                className="text-[12px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                Reset
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Status */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Status
                </label>
                <select
                  value={draftStatus}
                  onChange={(e) => setDraftStatus(e.target.value)}
                  className={selectStyle}
                >
                  {(statuses.length ? ["ALL", ...statuses.filter((item) => item !== "ALL")] : ["ALL", "INTERESTED", "NEW", "CONTACTED", "REQUESTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT", "CLOSED", "LOST", "NOT_PICKING_CALLS", "INVALID"]).map((item) => (
                    <option key={item} value={item}>
                      {item === "ALL" ? "All statuses" : item.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lead source */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Lead source
                </label>
                <select
                  value={draftSource}
                  onChange={(e) => setDraftSource(e.target.value)}
                  className={selectStyle}
                >
                  <option value="">All</option>
                  <option value="MANUAL">Manual</option>
                  <option value="META">Meta Ads</option>
                </select>
              </div>

              {/* Assigned employee */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Assigned employee
                </label>
                <select
                  value={draftAssignedTo}
                  onChange={(e) => setDraftAssignedTo(e.target.value)}
                  className={selectStyle}
                >
                  <option value="">All</option>
                  <option value="UNASSIGNED">Unassigned</option>
                  {employees.map((emp) => (
                    <option key={emp._id || emp.id} value={emp._id || emp.id}>
                      {emp.name || emp.fullName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lead category */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Category
                </label>
                <select
                  value={draftInventoryType}
                  onChange={(e) => setDraftInventoryType(e.target.value)}
                  className={selectStyle}
                >
                  <option value="">All categories</option>
                  <option value="RESIDENTIAL">Residential</option>
                  <option value="COMMERCIAL">Commercial</option>
                  <option value="COWORKING">Coworking</option>
                </select>
              </div>

              {/* Property type */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Property type
                </label>
                <select
                  value={draftPropertyType}
                  onChange={(e) => setDraftPropertyType(e.target.value)}
                  className={selectStyle}
                >
                  <option value="">All</option>
                  {(propertySubtypes.length ? propertySubtypes : [
                    { value: "COMMERCIAL", label: "Commercial" },
                    { value: "COWORKING", label: "Coworking" },
                    { value: "OFFICE_SPACE", label: "Office Space" },
                    { value: "RESIDENTIAL", label: "Residential" },
                    { value: "RETAIL", label: "Retail" },
                    { value: "WAREHOUSE", label: "Warehouse" },
                    { value: "PLOT", label: "Plot" },
                  ]).map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label || item.value.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>

              {/* Budget range */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Budget range
                </label>
                <select
                  value={draftBudgetRange}
                  onChange={(e) => setDraftBudgetRange(e.target.value)}
                  className={selectStyle}
                >
                  <option value="">Any</option>
                  <option value="UNDER_50L">Under ₹50 L</option>
                  <option value="50L_1CR">₹50 L - ₹1 Cr</option>
                  <option value="1CR_3CR">₹1 Cr - ₹3 Cr</option>
                  <option value="3CR_5CR">₹3 Cr - ₹5 Cr</option>
                  <option value="ABOVE_5CR">Above ₹5 Cr</option>
                </select>
              </div>

              {/* Follow-up date */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Follow-up date
                </label>
                <select
                  value={draftFollowUpDate}
                  onChange={(e) => setDraftFollowUpDate(e.target.value)}
                  className={selectStyle}
                >
                  <option value="">Any</option>
                  <option value="TODAY">Today</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="TOMORROW">Tomorrow</option>
                  <option value="THIS_WEEK">This week</option>
                  <option value="NEXT_WEEK">Next week</option>
                </select>
              </div>

              {/* Created date */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Created date
                </label>
                <select
                  value={draftCreatedDate}
                  onChange={(e) => setDraftCreatedDate(e.target.value)}
                  className={selectStyle}
                >
                  <option value="">Any</option>
                  <option value="TODAY">Today</option>
                  <option value="YESTERDAY">Yesterday</option>
                  <option value="THIS_WEEK">This week</option>
                  <option value="THIS_MONTH">This month</option>
                  <option value="LAST_30_DAYS">Last 30 days</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-900">
          <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
            {appliedCount > 0 ? `${appliedCount} filter${appliedCount > 1 ? "s" : ""} applied` : "No filters applied"}
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={onClose} className="min-h-11">Close</Button>
          <Button
            size="sm"
            onClick={handleApply}
            className="min-h-11 bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700 shadow-sm"
          >
            Apply
          </Button>
          </div>
        </div>
      </div>
    </>, document.body
  );
}
