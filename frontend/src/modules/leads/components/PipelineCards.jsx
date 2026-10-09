import React from "react";
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, MessageCircle, MoreHorizontal, Phone, UserRound } from "lucide-react";
import { StatusBadge } from "../../../components/crm";
import { EmptyState, Skeleton, cn } from "../../../components/ui";
import { describeFollowUp, formatBudgetRange } from "./pipelineViews";
import PipelineAssigneePicker from "./PipelineAssigneePicker";

const titleCase = (value) => String(value || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const requirementLines = (lead) => {
  const requirements = lead?.requirements || {};
  const first = [requirements.inventoryType, requirements.transactionType].filter(Boolean).map(titleCase).join(" · ");
  const area = requirements.areaMax || requirements.areaMin;
  const second = [requirements.propertySubtype && titleCase(requirements.propertySubtype), area && `${Number(area).toLocaleString("en-IN")} sq ft`].filter(Boolean).join(" · ");
  return { first: first || "Requirement not captured", second };
};

const LeadCard = ({ lead, nowMs, selected, onToggleSelect, onOpen, onCall, onWhatsApp, statusOptions, onStatusChange, updatingStatusId, canAssignLead, assignees, onTransferLead }) => {
  const followUp = describeFollowUp(lead?.nextFollowUp, nowMs);
  const requirement = requirementLines(lead);
  const overdue = followUp.tone === "overdue";
  return <li className="pipeline-mobile-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_3px_12px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900">
    <div className="flex items-start gap-3 px-4 pb-3 pt-5">
      <input type="checkbox" checked={selected} onChange={() => onToggleSelect?.(lead)} aria-label={`Select ${lead?.name || "lead"}`} className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600" />
      <button type="button" onClick={() => onOpen?.(lead)} className="min-w-0 flex-1 text-left"><strong className="block truncate text-[23px] leading-6 tracking-[-0.035em] text-slate-950 dark:text-slate-100">{lead?.name || "Unnamed lead"}</strong><span className="mt-1 inline-flex items-center gap-2 text-[17px] font-semibold text-blue-500">{lead?.phone || "—"}<Phone size={20} fill="currentColor" /></span></button>
      <div className="flex items-center gap-2"><span className="relative inline-flex" onClick={(event) => event.stopPropagation()}><StatusBadge status={lead?.status} className="pointer-events-none px-3 py-1.5 text-[14px]" />{onStatusChange ? <select aria-label={`Change status for ${lead?.name || "lead"}`} value={lead?.status || "NEW"} disabled={updatingStatusId === String(lead?._id || "")} onChange={(event) => onStatusChange(lead, event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait">{statusOptions.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}</select> : null}</span><button type="button" onClick={() => onOpen?.(lead)} aria-label={`More actions for ${lead?.name || "lead"}`} className="p-1 text-slate-500"><MoreHorizontal size={25} /></button></div>
    </div>
    <button type="button" onClick={() => onOpen?.(lead)} className="block w-full px-[76px] pb-5 text-left"><span className="block text-[16px] text-slate-600 dark:text-slate-300">{requirement.first}</span>{requirement.second ? <span className="mt-1 block text-[16px] text-slate-500">{requirement.second}</span> : null}<span className="mt-1 block text-[16px] text-slate-500">Budget: <strong className="text-slate-950 dark:text-slate-100">{formatBudgetRange(lead?.requirements)}</strong></span></button>
    <div className="grid grid-cols-2 border-b border-t border-slate-100 px-5 py-4 dark:border-slate-800"><div className="min-w-0"><p className="text-[14px] text-slate-500">Assigned to</p><PipelineAssigneePicker lead={lead} assignees={assignees} canAssignLead={canAssignLead} onAssign={onTransferLead} variant="mobile" /></div><div className="border-l border-slate-200 pl-7 dark:border-slate-700"><p className="text-[14px] text-slate-500">Follow-up</p><p className={cn("mt-1 flex items-center gap-2 whitespace-nowrap text-[16px] font-semibold", overdue ? "text-rose-600" : "text-slate-700 dark:text-slate-200")}>
      {overdue ? <CalendarClock size={22} /> : <Clock3 size={22} />}{followUp.text}
    </p></div></div>
    <div className="grid grid-cols-3 divide-x divide-slate-200 px-3 py-2 dark:divide-slate-700"><button type="button" onClick={() => onCall?.(lead)} className="inline-flex h-12 items-center justify-center gap-2 text-[16px] font-semibold text-blue-600"><Phone size={25} fill="currentColor" />Call</button><button type="button" onClick={() => onWhatsApp?.(lead)} className="inline-flex h-12 items-center justify-center gap-2 text-[16px] font-semibold text-blue-600"><MessageCircle size={25} className="text-green-500" />WhatsApp</button><button type="button" onClick={() => onOpen?.(lead)} className="inline-flex h-12 items-center justify-center gap-2 text-[16px] font-semibold text-blue-600"><ArrowRight size={28} />View lead</button></div>
  </li>;
};

const PipelineCards = ({ leads = [], loading = false, nowMs = 0, selectedKeys = [], onSelectionChange, onOpenLead, onCall, onWhatsApp, statusOptions = [], onStatusChange, updatingStatusId = "", canAssignLead = false, assignees = [], onTransferLead, emptyState, className }) => {
  if (loading) return <ul className={cn("space-y-4 p-0", className)}>{[0, 1, 2].map((row) => <li key={row} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700"><Skeleton className="h-9 w-3/4" /><Skeleton className="mt-4 h-20 w-full" /></li>)}</ul>;
  if (!leads.length) return <div className={cn("p-3", className)}>{emptyState || <EmptyState title="Nothing needs action" description="Every live lead here has a follow-up in the future." />}</div>;
  const toggle = (lead) => { const key = lead?._id; if (key) onSelectionChange?.(selectedKeys.includes(key) ? selectedKeys.filter((item) => item !== key) : [...selectedKeys, key]); };
  return <div className={className}><h2 className="pipeline-card-count px-0 pb-3 pt-1 text-[25px] font-bold tracking-[-0.03em] text-slate-950 dark:text-slate-50">{leads.length} leads</h2><ul className={cn("space-y-4 p-0", className)}>{leads.map((lead) => <LeadCard key={lead?._id} lead={lead} nowMs={nowMs} selected={selectedKeys.includes(lead?._id)} onToggleSelect={toggle} onOpen={onOpenLead} onCall={onCall} onWhatsApp={onWhatsApp} statusOptions={statusOptions} onStatusChange={onStatusChange} updatingStatusId={updatingStatusId} canAssignLead={canAssignLead} assignees={assignees} onTransferLead={onTransferLead} />)}</ul></div>;
};

export default PipelineCards;
