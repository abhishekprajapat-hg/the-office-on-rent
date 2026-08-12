import { useCallback, useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Badge, ErrorState, Pagination } from "../../components/ui";
import { DataTableShell, PageToolbar } from "../../components/crm";
import { getAuditLogs } from "../../services/permissionService";
import { formatDateTime } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (targetPage) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditLogs({ page: targetPage, limit: 25 });
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load audit logs"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load audit logs" description={error} actionLabel="Retry" onAction={() => load(page)} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Audit Logs"
          description="Trail of administrative actions across the coworking module (role/permission changes and more as new domains land)."
        />

        <DataTableShell loading={loading} empty={!loading && logs.length === 0} emptyTitle="No audit entries yet">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Entity</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">When</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id} className="border-b border-slate-50 last:border-0 dark:border-slate-900">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <ClipboardList aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <Badge variant="blue">{log.action}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {log.entityType}
                    {log.entityId ? <span className="text-slate-400"> · {log.entityId}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {log.actorId?.name || "Unknown"}{" "}
                    <span className="text-xs text-slate-400">({log.actorRole})</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{formatDateTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>

        {pagination ? (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages || 1}
            totalItems={pagination.totalCount}
            pageSize={pagination.limit}
            onPageChange={setPage}
          />
        ) : null}
      </div>
    </div>
  );
};

export default AuditLogs;
