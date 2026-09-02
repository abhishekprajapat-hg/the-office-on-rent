import React from "react";
import { Plus } from "lucide-react";
import { FilterChips } from "../../../components/crm";
import { Button, cn } from "../../../components/ui";

/*
 * Toolbar for /inventory, matching docs/CRM_SCREENS.html:
 *   status segmented control with counts   ->  "what can I offer today"
 *   removable filter chips
 *   Grid / Table / Map view toggle, then Share list
 */

const Segmented = ({ options, value, onChange, className }) => (
  <div
    className={cn(
      "flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5",
      "dark:border-slate-700 dark:bg-slate-950",
      className,
    )}
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={active}
          onClick={() => onChange?.(option.value)}
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-[5px]",
            "text-[12.5px] font-medium outline-none transition",
            "focus-visible:ring-2 focus-visible:ring-blue-500/40",
            active
              ? "bg-white font-semibold text-slate-900 shadow-crm-soft dark:bg-slate-800 dark:text-slate-50"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
          )}
        >
          {option.label}
          {option.count !== undefined && option.count !== null ? (
            <span className="tabular-nums text-slate-400 dark:text-slate-500">{option.count}</span>
          ) : null}
        </button>
      );
    })}
  </div>
);

const InventoryToolbar = ({
  modeType,
  onModeChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts = {},
  filters = [],
  onToggleFilter,
  onRemoveFilter,
  onAddFilter,
  viewMode,
  onViewModeChange,
  onShareList,
  canManage = false,
  onOpenAddModal,
  className,
}) => (
  <div className={cn("flex flex-wrap items-center gap-2", className)}>
    {/* Sale vs Rent is a real filter on this data, not decoration - without it
        the list is permanently stuck on one transaction type. */}
    <Segmented
      value={modeType}
      onChange={onModeChange}
      options={[
        { value: "sale", label: "Sale" },
        { value: "rent", label: "Rent" },
      ]}
    />

    <Segmented
      value={statusFilter}
      onChange={onStatusFilterChange}
      options={[
        { value: "Available", label: "Available", count: statusCounts.Available },
        { value: "Blocked", label: "Blocked", count: statusCounts.Blocked },
        { value: "Sold", label: "Sold", count: statusCounts.Sold },
        { value: "all", label: "All", count: statusCounts.all },
      ]}
    />

    <FilterChips
      filters={filters}
      onToggle={onToggleFilter}
      onRemove={onRemoveFilter}
      onAdd={onAddFilter}
    />

    <div className="ml-auto flex items-center gap-2">
      <Segmented
        value={viewMode}
        onChange={onViewModeChange}
        options={[
          { value: "cards", label: "Grid" },
          { value: "table", label: "Table" },
          { value: "map", label: "Map" },
        ]}
      />
      {onShareList ? (
        <Button size="sm" variant="secondary" onClick={onShareList}>
          Share list
        </Button>
      ) : null}
      {canManage && onOpenAddModal ? (
        <Button size="sm" leftIcon={Plus} onClick={onOpenAddModal}>
          Add property
        </Button>
      ) : null}
    </div>
  </div>
);

export default InventoryToolbar;
