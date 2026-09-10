import React from "react";
import { MessageCircle, NotebookPen, Phone } from "lucide-react";
import { StatusBadge } from "../../../components/crm";
import { EmptyState, IconButton, Skeleton, cn } from "../../../components/ui";
import { describeFollowUp } from "./pipelineViews";

/*
 * The pipeline as cards, for phones.
 *
 * A seven-column table on a 390px screen is either a sideways scroll or a
 * column of unreadable stubs. The card keeps the four things a salesperson
 * acts on - who, what they want, whose lead it is, and how late the follow-up
 * is - and puts call / WhatsApp / log within thumb reach at the bottom.
 *
 * Presentation only: every action is a callback, so the container keeps
 * ownership of the service calls, exactly as PipelineTable does. The two are
 * deliberately fed the same props by the page.
 */

const initialsOf = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
};

const titleCase = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const FOLLOW_UP_TONES = {
  overdue: "font-semibold text-rose-600 dark:text-rose-400",
  today: "font-semibold text-amber-600 dark:text-amber-400",
  future: "text-slate-700 dark:text-slate-300",
  none: "text-slate-400 dark:text-slate-500",
};

const requirementOf = (lead) => {
  const requirements = lead?.requirements || {};
  const line = [requirements.inventoryType, requirements.transactionType, requirements.propertySubtype]
    .filter(Boolean)
    .map(titleCase)
    .join(" · ");
  return line || "Not captured yet";
};

/** Label above value, the three facts that decide whether this lead is next. */
const Fact = ({ label, children, className }) => (
  <div className={cn("min-w-0", className)}>
    <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-0.5 truncate text-[12.5px] text-slate-800 dark:text-slate-200">{children}</p>
  </div>
);

const LeadCard = ({ lead, nowMs, showAssigned, selected, onToggleSelect, onOpen, onCall, onWhatsApp, onLog }) => {
  const followUp = describeFollowUp(lead?.nextFollowUp, nowMs);

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-crm-soft dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-2.5 p-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.(lead)}
          aria-label={`Select ${lead?.name || "lead"}`}
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
        />

        {/*
          The whole identity block opens the lead. The checkbox stays outside it
          so selecting for a bulk action never navigates away by accident.
        */}
        <button
          type="button"
          onClick={() => onOpen?.(lead)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
            {initialsOf(lead?.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-slate-900 dark:text-slate-100">
              {lead?.name || "Unnamed lead"}
            </span>
            <span className="block truncate font-mono text-[12.5px] text-slate-500 dark:text-slate-400">
              {lead?.phone || "—"}
            </span>
          </span>
        </button>

        <StatusBadge status={lead?.status} className="shrink-0" />
      </div>

      <div
        className={cn(
          "grid gap-x-3 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800",
          showAssigned ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        <Fact label="Requirement">{requirementOf(lead)}</Fact>
        {showAssigned ? (
          <Fact label="Assigned" className="border-l border-slate-100 pl-3 dark:border-slate-800">
            {lead?.assignedTo?.name || (
              <span className="font-semibold text-amber-600 dark:text-amber-400">Unassigned</span>
            )}
          </Fact>
        ) : null}
        <Fact label="Next follow-up" className="border-l border-slate-100 pl-3 dark:border-slate-800">
          <span className={FOLLOW_UP_TONES[followUp.tone]}>{followUp.text}</span>
        </Fact>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        <IconButton icon={Phone} label={`Call ${lead?.name || "lead"}`} size="sm" onClick={() => onCall?.(lead)} />
        <IconButton
          icon={MessageCircle}
          label={`WhatsApp ${lead?.name || "lead"}`}
          size="sm"
          onClick={() => onWhatsApp?.(lead)}
        />
        <IconButton
          icon={NotebookPen}
          label={`Log an outcome for ${lead?.name || "lead"}`}
          size="sm"
          onClick={() => onLog?.(lead)}
        />
      </div>
    </li>
  );
};

const PipelineCards = ({
  leads = [],
  loading = false,
  nowMs = 0,
  showAssigned = false,
  selectedKeys = [],
  onSelectionChange,
  onOpenLead,
  onCall,
  onWhatsApp,
  onLog,
  emptyState,
  className,
}) => {
  if (loading) {
    return (
      <ul className={cn("space-y-2 p-3", className)}>
        {[0, 1, 2, 3].map((row) => (
          <li key={row} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="mt-2 h-8 w-full" />
          </li>
        ))}
      </ul>
    );
  }

  if (!leads.length) {
    return (
      <div className={cn("p-3", className)}>
        {emptyState || (
          <EmptyState
            title="Nothing needs action"
            description="Every live lead here has a follow-up in the future. Switch to All to see the rest."
          />
        )}
      </div>
    );
  }

  const toggle = (lead) => {
    const key = lead?._id;
    if (!key) return;
    onSelectionChange?.(
      selectedKeys.includes(key) ? selectedKeys.filter((item) => item !== key) : [...selectedKeys, key],
    );
  };

  return (
    <ul className={cn("space-y-2 p-3", className)}>
      {leads.map((lead) => (
        <LeadCard
          key={lead?._id}
          lead={lead}
          nowMs={nowMs}
          showAssigned={showAssigned}
          selected={selectedKeys.includes(lead?._id)}
          onToggleSelect={toggle}
          onOpen={onOpenLead}
          onCall={onCall}
          onWhatsApp={onWhatsApp}
          onLog={onLog}
        />
      ))}
    </ul>
  );
};

export default PipelineCards;
