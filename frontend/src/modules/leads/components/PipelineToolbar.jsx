import React from "react";
import { RefreshCw } from "lucide-react";
import { FilterChips } from "../../../components/crm";
import { Button, SearchInput, Tabs, TabButton, cn } from "../../../components/ui";
import { PIPELINE_VIEWS } from "./pipelineViews";

/**
 * Pipeline toolbar: which slice of the list you are looking at, then the
 * filters narrowing it, then how it is ordered.
 *
 * @param {string}   view              Active PIPELINE_VIEWS key.
 * @param {Function} onViewChange      (view) => void.
 * @param {number}   needsActionCount  Shown on the Needs action tab, in rose.
 * @param {boolean}  canSeeUnassigned  ADMIN and MANAGER only.
 * @param {Array}    filters           FilterChips model.
 * @param {Function} onToggleFilter    (filter) => void.
 * @param {Function} onRemoveFilter    (filter) => void.
 * @param {string}   query             Search text.
 * @param {Function} onQueryChange     (value) => void.
 * @param {string}   sortBy            LEAD_SORT_OPTIONS value.
 * @param {Function} onSortByChange    (value) => void.
 * @param {Array}    sortOptions       [{ value, label }].
 * @param {boolean}  refreshing        Disables the refresh control.
 * @param {Function} onRefresh         () => void.
 * @param {node}     actions           Add lead / bulk upload buttons.
 */
const PipelineToolbar = ({
  view,
  onViewChange,
  needsActionCount = 0,
  canSeeUnassigned = false,
  filters = [],
  onToggleFilter,
  onRemoveFilter,
  query,
  onQueryChange,
  sortBy,
  onSortByChange,
  sortOptions = [],
  refreshing = false,
  onRefresh,
  actions,
  className,
}) => {
  const views = [
    { key: PIPELINE_VIEWS.NEEDS_ACTION, label: "Needs action" },
    { key: PIPELINE_VIEWS.ALL, label: "All" },
    ...(canSeeUnassigned ? [{ key: PIPELINE_VIEWS.UNASSIGNED, label: "Unassigned" }] : []),
    { key: PIPELINE_VIEWS.CLOSED, label: "Closed" },
  ];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs className="flex-1">
          {views.map((item) => (
            <TabButton
              key={item.key}
              active={item.key === view}
              onClick={() => onViewChange?.(item.key)}
            >
              <span className="flex items-center gap-1.5">
                {item.label}
                {item.key === PIPELINE_VIEWS.NEEDS_ACTION && needsActionCount > 0 ? (
                  <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400">
                    {needsActionCount}
                  </span>
                ) : null}
              </span>
            </TabButton>
          ))}
        </Tabs>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <Button
            size="sm"
            variant="secondary"
            leftIcon={RefreshCw}
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
          <SearchInput value={query} onChange={onQueryChange} placeholder="Name, phone, project..." />
        </div>

        <FilterChips filters={filters} onToggle={onToggleFilter} onRemove={onRemoveFilter} />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11.5px] text-slate-500 dark:text-slate-400">Sort</span>
          <Tabs className="border-b-0">
            {sortOptions.map((option) => (
              <TabButton
                key={option.value}
                active={option.value === sortBy}
                onClick={() => onSortByChange?.(option.value)}
              >
                {option.label}
              </TabButton>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default PipelineToolbar;
