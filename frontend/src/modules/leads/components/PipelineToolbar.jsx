import React, { useEffect, useRef, useState } from "react";
import { ArrowDownUp, CalendarDays, ChevronDown, ChevronRight, CircleAlert, Filter, List, MoreHorizontal, Plus, RefreshCw, Search, Upload, Users, X } from "lucide-react";
import { cn } from "../../../components/ui";
import { PIPELINE_VIEWS } from "./pipelineViews";
import { QUICK_FILTER_KEYS } from "./leadFilterConstants";
import "./PipelineMobile.css";

const titleCase = (value) => String(value || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const statuses = ["NEW", "CONTACTED", "FOLLOW_UP_1", "FOLLOW_UP_2", "FOLLOW_UP_3", "QUALIFIED_LEAD", "REQUIREMENT_AFTER_1_MONTH", "REQUIREMENT_AFTER_2_MONTHS", "INTERESTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT", "SITE_VISIT_OVERDUE", "MISSING_IN_ACTION", "NOT_PICKING_CALLS", "INVALID", "OWNER", "BROKER", "REQUESTED", "CLOSED", "LOST"];
const Dropdown = ({ open, children, className = "" }) => open ? <div className={cn("absolute left-0 top-full z-40 mt-2 max-h-72 min-w-44 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800", className)}>{children}</div> : null;

const PipelineToolbar = ({
  view, onViewChange, needsActionCount = 0, canSeeUnassigned = false,
  query = "", onQueryChange, refreshing = false, onRefresh,
  onOpenAddModal, onOpenBulkUploadModal, canAddLead = true, canBulkUploadLeads = true,
  filterState = {}, onFilterChange, onOpenFiltersFlyout,
  sortBy = "FOLLOW_UP", onSortByChange, metrics = {}, className,
}) => {
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);
  useEffect(() => {
    const close = (event) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setOpenDropdown(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const update = (next) => onFilterChange?.({ ...filterState, ...next });
  const activeFilterCount = [filterState.status && filterState.status !== "ALL", filterState.assignedTo, filterState.inventoryType, filterState.source, filterState.propertyType, filterState.budgetRange, filterState.followUpDate, filterState.createdDate].filter(Boolean).length;
  const visibleViews = [
    { key: PIPELINE_VIEWS.ALL, label: "All leads", count: metrics.total },
    { key: PIPELINE_VIEWS.TEAM, label: "My team" },
    ...(canSeeUnassigned ? [{ key: PIPELINE_VIEWS.UNASSIGNED, label: "Unassigned", count: metrics.unassigned, alert: true }] : []),
    { key: PIPELINE_VIEWS.CLOSED, label: "Closed" },
    { key: PIPELINE_VIEWS.NEEDS_ACTION, label: "Needs action", count: needsActionCount, danger: true },
  ];
  const metricCards = [
    { label: "Total leads", value: metrics.total || 0, icon: Users, panel: "bg-blue-50 text-blue-600", valueTone: "text-blue-700" },
    { label: "Due today", value: metrics.today || 0, icon: CalendarDays, panel: "bg-sky-50 text-blue-600", valueTone: "text-blue-700" },
    { label: "Overdue", value: metrics.overdue || 0, icon: CircleAlert, panel: "bg-rose-50 text-rose-600", valueTone: "text-rose-600" },
    { label: "Unassigned", value: metrics.unassigned || 0, icon: Users, panel: "bg-amber-50 text-amber-600", valueTone: "text-amber-600" },
  ];
  const chips = [
    filterState.status && filterState.status !== "ALL" ? { key: "status", label: `Status: ${titleCase(filterState.status)}`, clear: () => update({ status: "ALL" }) } : null,
    filterState.inventoryType ? { key: "category", label: `Category: ${titleCase(filterState.inventoryType)}`, clear: () => update({ inventoryType: "" }) } : null,
    filterState.assignedTo ? { key: "assigned", label: "Assigned", clear: () => update({ assignedTo: "" }) } : null,
    filterState.quickFilter === QUICK_FILTER_KEYS.NEEDS_FOLLOW_UP_TODAY ? { key: "today", label: "Due today", icon: CalendarDays, clear: () => update({ quickFilter: "" }) } : null,
    filterState.quickFilter === QUICK_FILTER_KEYS.OVERDUE_FOLLOW_UPS ? { key: "overdue", label: "Overdue", icon: CircleAlert, danger: true, count: metrics.overdue, clear: () => update({ quickFilter: "" }) } : null,
  ].filter(Boolean);

  const actionButtons = <>
    {canBulkUploadLeads && <button type="button" onClick={onOpenBulkUploadModal} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><Upload size={21} /> Import</button>}
    <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh leads" className="inline-flex h-11 w-16 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><RefreshCw size={25} className={refreshing ? "animate-spin" : ""} /></button>
  </>;

  return <section className={cn("pipeline-reference", className)} ref={dropdownRef}>
    <div className="hidden lg:flex lg:flex-col lg:gap-4">
      <div className="flex items-center justify-between"><div><h1 className="text-[28px] font-bold leading-8 tracking-[-0.04em] text-slate-950 dark:text-slate-50">Pipeline</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage leads, follow-ups and conversions.</p></div><div className="flex gap-2">{canBulkUploadLeads && <button type="button" onClick={onOpenBulkUploadModal} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><Upload size={16} /> Import leads</button>}{canAddLead && <button type="button" onClick={onOpenAddModal} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-sm"><Plus size={18} /> Add lead</button>}<button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh leads" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><RefreshCw size={17} className={refreshing ? "animate-spin" : ""} /></button></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(({ label, value, icon, panel, valueTone }) => <div key={label} className="flex min-h-[74px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900"><span className={cn("grid h-12 w-12 place-items-center rounded-lg", panel)}>{React.createElement(icon, { size: 25 })}</span><span><span className="block text-[12px] text-slate-500">{label}</span><strong className={cn("block text-[24px]", valueTone)}>{value}</strong></span></div>)}</div>
    </div>

    <div className="pipeline-mobile-overview lg:hidden">
      <div className="flex items-start justify-between gap-3"><div><h1 className="text-[38px] font-bold leading-none tracking-[-0.055em] text-slate-950 dark:text-slate-50">Pipeline</h1><p className="mt-3 text-[17px] text-slate-500 dark:text-slate-400">Manage leads and follow-ups.</p></div>{canAddLead && <button type="button" onClick={onOpenAddModal} className="inline-flex h-[68px] shrink-0 items-center gap-2 rounded-2xl bg-blue-600 px-5 text-[17px] font-semibold text-white shadow-lg shadow-blue-600/20"><Plus size={28} /> Add lead</button>}</div>
      <div className="mt-4 flex justify-end gap-3">{actionButtons}</div>
      <div className="mt-6 grid grid-cols-2 gap-3">{metricCards.map(({ label, value, icon, panel, valueTone }) => <div key={label} className="flex min-h-[132px] min-w-0 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"><span className={cn("grid h-16 w-16 shrink-0 place-items-center rounded-2xl", panel)}>{React.createElement(icon, { size: 31, strokeWidth: 1.8 })}</span><span className="min-w-0"><span className="block text-[13px] font-medium leading-4 text-slate-500 dark:text-slate-400">{label}</span><strong className={cn("mt-1 block text-[31px] leading-none", valueTone)}>{value}</strong></span></div>)}</div>
    </div>

    <div className="pipeline-tabs mt-7 flex gap-4 overflow-x-auto border-b border-slate-200 lg:mt-4 lg:gap-2 dark:border-slate-700">{visibleViews.map((item) => <button key={item.key} type="button" onClick={() => onViewChange?.(item.key)} className={cn("relative shrink-0 px-4 py-3 text-[14px] font-semibold lg:px-2 lg:py-2.5 lg:text-[13px]", item.key === view ? "text-blue-600" : "text-slate-500")}><span className="inline-flex items-center gap-2">{item.label}{item.count ? <span className={cn("grid h-7 min-w-7 place-items-center rounded-full px-1 text-[13px] font-bold lg:h-5 lg:min-w-5 lg:text-[10px]", item.danger ? "bg-rose-600 text-white" : item.alert ? "border border-rose-200 bg-rose-50 text-rose-600" : "bg-blue-600 text-white")}>{item.count}</span> : null}</span>{item.key === view && <span className="absolute inset-x-0 bottom-0 h-1 rounded-t bg-blue-600 lg:h-0.5" />}</button>)}<ChevronRight className="my-auto shrink-0 text-slate-500 lg:hidden" size={25} /></div>

    <div className="pipeline-search-controls mt-5 lg:mt-4 lg:flex lg:items-center lg:gap-3">
      <div className="relative lg:max-w-[375px] lg:flex-1"><Search size={29} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 lg:left-3 lg:h-[19px] lg:w-[19px]" /><input type="text" value={query} onChange={(event) => onQueryChange?.(event.target.value)} placeholder="Search name or phone..." className="h-[72px] w-full rounded-2xl border border-slate-200 bg-white pl-16 pr-10 text-[18px] text-slate-800 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 lg:h-11 lg:rounded-lg lg:pl-10 lg:text-[13px]" />{query && <button type="button" onClick={() => onQueryChange?.("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"><X size={20} /></button>}</div>
      <div className="pipeline-filter-buttons mt-4 grid grid-cols-[1fr_1fr_92px] gap-3 lg:mt-0 lg:flex">
        <button type="button" onClick={onOpenFiltersFlyout} className="inline-flex h-[67px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-[17px] font-semibold text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 lg:h-10 lg:px-3 lg:text-[12px]"><Filter size={28} className="lg:h-4 lg:w-4" /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
        <div className="relative"><button type="button" onClick={() => setOpenDropdown(openDropdown === "sort" ? null : "sort")} className="inline-flex h-[67px] w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-[17px] font-semibold text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 lg:h-10 lg:w-auto lg:px-3 lg:text-[12px]"><ArrowDownUp size={27} className="lg:h-4 lg:w-4" /> Sort</button><Dropdown open={openDropdown === "sort"} className="left-auto right-0">{[["FOLLOW_UP", "Follow-up"], ["RECENT", "Recent"], ["NAME", "Name A-Z"]].map(([value, label]) => <button key={value} type="button" onClick={() => { onSortByChange?.(value); setOpenDropdown(null); }} className={cn("block w-full rounded-lg px-2.5 py-2 text-left text-[12px] hover:bg-slate-50", sortBy === value && "bg-blue-50 font-semibold text-blue-700")}>{label}</button>)}</Dropdown></div>
        <button type="button" onClick={onOpenFiltersFlyout} aria-label="More quick filters" className="grid h-[67px] place-items-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 lg:hidden"><MoreHorizontal size={30} /></button>
      </div>
      <div className="hidden lg:flex lg:gap-2"><div className="relative"><button type="button" onClick={() => setOpenDropdown(openDropdown === "status" ? null : "status")} className={cn("inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold", filterState.status && filterState.status !== "ALL" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100")}>{filterState.status && filterState.status !== "ALL" ? `Status: ${titleCase(filterState.status)}` : "Status"}<ChevronDown size={15} /></button><Dropdown open={openDropdown === "status"}>{[["ALL", "All statuses"], ...statuses.map((status) => [status, titleCase(status)])].map(([status, label]) => <button key={status} type="button" onClick={() => { update({ status }); setOpenDropdown(null); }} className={cn("block w-full rounded-lg px-2.5 py-2 text-left text-[12px] hover:bg-slate-50", filterState.status === status && "bg-blue-50 font-semibold text-blue-700")}>{label}</button>)}</Dropdown></div><div className="relative"><button type="button" onClick={() => setOpenDropdown(openDropdown === "category" ? null : "category")} className={cn("inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold", filterState.inventoryType ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100")}>{filterState.inventoryType ? titleCase(filterState.inventoryType) : "Category"}<ChevronDown size={15} /></button><Dropdown open={openDropdown === "category"}>{[["", "All categories"], ["RESIDENTIAL", "Residential"], ["COMMERCIAL", "Commercial"], ["COWORKING", "Coworking"]].map(([inventoryType, label]) => <button key={inventoryType || "all"} type="button" onClick={() => { update({ inventoryType }); setOpenDropdown(null); }} className={cn("block w-full rounded-lg px-2.5 py-2 text-left text-[12px] hover:bg-slate-50", filterState.inventoryType === inventoryType && "bg-blue-50 font-semibold text-blue-700")}>{label}</button>)}</Dropdown></div></div>
    </div>
    {chips.length ? <div className="pipeline-chips mt-4 flex flex-wrap gap-2">{chips.map(({ key, label, icon, danger, count, clear }) => <button key={key} type="button" onClick={clear} className={cn("inline-flex h-14 items-center gap-2 rounded-2xl px-4 text-[15px] font-medium lg:h-9 lg:rounded-full lg:px-3 lg:text-[12px]", danger ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-700")}>
      {icon ? React.createElement(icon, { size: 23, className: danger ? "text-rose-600" : "text-blue-600" }) : null}{label}{count ? <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-[12px] font-bold text-rose-600">{count}</span> : null}<X size={20} />
    </button>)}</div> : null}
    <div className="mt-2 flex flex-wrap gap-2 lg:hidden">
      {filterState.quickFilter !== QUICK_FILTER_KEYS.NEEDS_FOLLOW_UP_TODAY && <button type="button" onClick={() => update({ quickFilter: QUICK_FILTER_KEYS.NEEDS_FOLLOW_UP_TODAY })} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-blue-50 px-3 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"><CalendarDays size={17} />Due today</button>}
      {filterState.quickFilter !== QUICK_FILTER_KEYS.OVERDUE_FOLLOW_UPS && <button type="button" onClick={() => update({ quickFilter: QUICK_FILTER_KEYS.OVERDUE_FOLLOW_UPS })} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-rose-50 px-3 text-xs font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"><CircleAlert size={17} />Overdue <span>{metrics.overdue || 0}</span></button>}
    </div>
  </section>;
};

export default PipelineToolbar;
