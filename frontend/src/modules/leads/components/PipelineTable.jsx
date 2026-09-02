import React from "react";
import { MessageCircle, NotebookPen, Phone } from "lucide-react";
import { DataTable, StatusBadge } from "../../../components/crm";
import { Badge, EmptyState, IconButton, cn } from "../../../components/ui";
import { describeFollowUp, formatBudgetRange } from "./pipelineViews";

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

/**
 * The pipeline list. Presentation only - every action is a callback, so the
 * container keeps ownership of the service calls.
 *
 * @param {Array}    leads          Rows to render.
 * @param {boolean}  loading        Skeleton rows.
 * @param {number}   nowMs          Clock used to colour follow-up dates.
 * @param {boolean}  showAssigned   Render the Assigned column (ADMIN/MANAGER).
 * @param {Array}    selectedKeys   Selected lead ids.
 * @param {Function} onSelectionChange (keys) => void.
 * @param {Function} onOpenLead     (lead) => void.
 * @param {Function} onCall         (lead) => void.
 * @param {Function} onWhatsApp     (lead) => void.
 * @param {Function} onLog          (lead) => void.
 * @param {node}     emptyState     Rendered when there are no rows.
 */
const PipelineTable = ({
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
  const columns = [
    {
      key: "name",
      header: "Lead",
      render: (lead) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
            {initialsOf(lead?.name)}
          </span>
          <span className="min-w-0">
            <b className="block truncate text-[13.2px] font-semibold text-slate-900 dark:text-slate-100">
              {lead?.name || "Unnamed lead"}
            </b>
            <span className="block truncate font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
              {lead?.phone || "—"}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (lead) => <StatusBadge status={lead?.status} />,
    },
    {
      key: "requirement",
      header: "Requirement",
      render: (lead) => {
        const requirements = lead?.requirements || {};
        const lead1 = [requirements.inventoryType, requirements.transactionType]
          .filter(Boolean)
          .map(titleCase)
          .join(" · ");
        const lead2 = [requirements.propertySubtype, requirements.areaMin && `${requirements.areaMin} sq ft`]
          .filter(Boolean)
          .map((value) => (typeof value === "string" ? titleCase(value) : value))
          .join(" · ");

        if (!lead1 && !lead2) {
          return <span className="text-slate-400 dark:text-slate-500">Not captured yet</span>;
        }

        return (
          <span className="block min-w-0">
            <span className="block truncate text-slate-700 dark:text-slate-300">{lead1 || "—"}</span>
            {lead2 ? (
              <span className="block truncate text-[11.5px] text-slate-500 dark:text-slate-400">{lead2}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      render: (lead) => formatBudgetRange(lead?.requirements),
    },
    {
      key: "source",
      header: "Source",
      render: (lead) =>
        lead?.source ? (
          <Badge variant="slate" className="text-[10.5px]">
            {titleCase(lead.source)}
          </Badge>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        ),
    },
    {
      key: "assigned",
      header: "Assigned",
      hidden: !showAssigned,
      render: (lead) =>
        lead?.assignedTo?.name ? (
          <span className="text-slate-600 dark:text-slate-400">{lead.assignedTo.name}</span>
        ) : (
          <span className="text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">Unassigned</span>
        ),
    },
    {
      key: "nextFollowUp",
      header: "Next follow-up",
      render: (lead) => {
        const { text, tone } = describeFollowUp(lead?.nextFollowUp, nowMs);
        return <span className={cn("whitespace-nowrap", FOLLOW_UP_TONES[tone])}>{text}</span>;
      },
    },
  ];

  return (
    <DataTable
      className={className}
      columns={columns}
      rows={leads}
      rowKey={(lead) => lead?._id}
      loading={loading}
      selectable
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      onRowClick={onOpenLead}
      emptyState={
        emptyState || (
          <EmptyState
            title="Nothing needs action"
            description="Every live lead here has a follow-up in the future. Switch to All to see the rest."
          />
        )
      }
      rowActions={(lead) => (
        <>
          <IconButton
            icon={Phone}
            label={`Call ${lead?.name || "lead"}`}
            size="sm"
            onClick={() => onCall?.(lead)}
          />
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
        </>
      )}
    />
  );
};

export default PipelineTable;
