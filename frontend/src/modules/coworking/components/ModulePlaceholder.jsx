import { useState } from "react";
import { Construction } from "lucide-react";
import {
  Badge,
  Card,
  EmptyState,
  Pagination,
  SearchInput,
  Skeleton,
} from "../../../components/ui";
import { DataTableShell, FilterBar, PageToolbar } from "../../../components/crm";

const DEFAULT_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
];

/**
 * Shared "foundation" page for coworking modules that don't have business
 * logic wired up yet. Renders the same toolbar/search/filter/table/pagination
 * chrome the real module will use, so the shell, navigation, and reusable
 * components can be verified end-to-end ahead of Phase 2+.
 */
const ModulePlaceholder = ({
  title,
  description,
  icon,
  entityLabelPlural = "records",
  statusOptions = DEFAULT_STATUS_OPTIONS,
}) => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const Icon = icon || Construction;

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title={title}
          description={description}
          actions={<Badge variant="violet">Phase 1 · Foundation</Badge>}
          filters={
            <>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={`Search ${entityLabelPlural}...`}
                className="max-w-xs"
                disabled
              />
              <FilterBar
                filters={[
                  {
                    name: "status",
                    label: "Status",
                    value: status,
                    onChange: setStatus,
                    options: statusOptions,
                  },
                ]}
              />
            </>
          }
        />

        <Card className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
            <Icon aria-hidden="true" size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-950 dark:text-slate-100">
              This module is scaffolded and route-ready.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Navigation, permissions, and page chrome are live. Data model and business logic for{" "}
              {entityLabelPlural} land in a later implementation phase.
            </p>
          </div>
        </Card>

        <DataTableShell title="Recent activity" description={`Latest ${entityLabelPlural} will appear here`}>
          <div className="space-y-3 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-5/6" />
          </div>
        </DataTableShell>

        <EmptyState
          title={`No ${entityLabelPlural} yet`}
          description="This screen will populate once the data model for this module is implemented."
        />

        <Pagination page={1} totalPages={1} className="px-1" />
      </div>
    </div>
  );
};

export default ModulePlaceholder;
