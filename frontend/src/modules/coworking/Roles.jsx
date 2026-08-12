import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge, Button, Card, ErrorState, Skeleton } from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { PageToolbar } from "../../components/crm";
import { getRolePermissionMatrix, updateRolePermissions } from "../../services/permissionService";
import { PERMISSION_GROUPS, PERMISSION_LABELS } from "../../constants/permissions";
import { usePermissions } from "../../context/usePermissions";
import { toErrorMessage } from "../../utils/errorMessage";

const Roles = () => {
  const { can } = usePermissions();
  const canManage = can("roles.manage");

  const [roles, setRoles] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingRole, setSavingRole] = useState("");
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getRolePermissionMatrix();
      setRoles(rows);
      setDraft(Object.fromEntries(rows.map((row) => [row.role, new Set(row.permissions)])));
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load roles"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const togglePermission = (role, permission) => {
    if (!canManage) return;
    setDraft((prev) => {
      const next = new Set(prev[role] || []);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return { ...prev, [role]: next };
    });
  };

  const saveRole = async (role) => {
    setSavingRole(role);
    setToast(null);
    try {
      const permissions = [...(draft[role] || [])];
      await updateRolePermissions(role, permissions);
      setToast({ type: "success", message: `Permissions updated for ${role}` });
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to save permissions") });
    } finally {
      setSavingRole("");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load role permissions" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Roles & Permissions"
          description="Grant or revoke granular permissions per role. ADMIN always has full access and cannot be edited."
          actions={!canManage ? <Badge variant="amber">Read only</Badge> : null}
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {roles.map((row) => (
            <Card key={row.role} className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" size={16} className="text-violet-600" />
                  <h3 className="text-sm font-bold text-slate-950 dark:text-slate-100">{row.label}</h3>
                </div>
                {row.isFixed ? (
                  <Badge variant="emerald">Full access</Badge>
                ) : row.isOverridden ? (
                  <Badge variant="blue">Customized</Badge>
                ) : (
                  <Badge variant="slate">Default</Badge>
                )}
              </div>

              {row.isFixed ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ADMIN bypasses the permission system and always has every permission.
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(PERMISSION_GROUPS).map(([group, permissions]) => (
                    <div key={group}>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {permissions.map((permission) => {
                          const checked = draft[row.role]?.has(permission) || false;
                          return (
                            <label
                              key={permission}
                              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                                checked
                                  ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
                                  : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
                              } ${!canManage ? "cursor-not-allowed opacity-70" : ""}`}
                            >
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-slate-300"
                                checked={checked}
                                disabled={!canManage}
                                onChange={() => togglePermission(row.role, permission)}
                              />
                              {PERMISSION_LABELS[permission] || permission}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {canManage ? (
                    <div className="flex justify-end pt-1">
                      <Button size="sm" onClick={() => saveRole(row.role)} disabled={savingRole === row.role}>
                        {savingRole === row.role ? "Saving..." : "Save changes"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Roles;
