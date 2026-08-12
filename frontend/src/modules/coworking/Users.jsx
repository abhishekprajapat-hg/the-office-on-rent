import { useCallback, useEffect, useState } from "react";
import { UserCog } from "lucide-react";
import { Badge, ErrorState, Select } from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, PageToolbar } from "../../components/crm";
import { getCoworkingUsers, updateCoworkingUserRole } from "../../services/permissionService";
import { usePermissions } from "../../context/usePermissions";
import { toErrorMessage } from "../../utils/errorMessage";

const Users = () => {
  const { can } = usePermissions();
  const canUpdate = can("users.update");

  const [users, setUsers] = useState([]);
  const [roleLabels, setRoleLabels] = useState({});
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingUserId, setSavingUserId] = useState("");
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCoworkingUsers();
      setUsers(data.users);
      setRoleLabels(data.roleLabels);
      setAssignableRoles(data.assignableRoles);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load users"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRoleChange = async (userId, role) => {
    setSavingUserId(userId);
    setToast(null);
    try {
      await updateCoworkingUserRole(userId, role);
      setToast({ type: "success", message: "Role updated" });
      await load();
    } catch (updateError) {
      setToast({ type: "error", message: toErrorMessage(updateError, "Failed to update role") });
    } finally {
      setSavingUserId("");
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load users" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Users"
          description="Staff accounts and their assigned roles for this company."
          actions={!canUpdate ? <Badge variant="amber">Read only</Badge> : null}
        />
        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && users.length === 0} emptyTitle="No users found">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id} className="border-b border-slate-50 last:border-0 dark:border-slate-900">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <UserCog aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{user.email}</td>
                  <td className="px-4 py-2.5">
                    {user.role === "ADMIN" || !canUpdate ? (
                      <Badge variant={user.role === "ADMIN" ? "violet" : "slate"}>
                        {roleLabels[user.role] || user.role}
                      </Badge>
                    ) : (
                      <Select
                        value={user.role}
                        disabled={savingUserId === user._id}
                        onChange={(event) => handleRoleChange(user._id, event.target.value)}
                        className="h-8 w-48 text-xs"
                      >
                        {assignableRoles.map((role) => (
                          <option key={role} value={role}>
                            {roleLabels[role] || role}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={user.isActive ? "emerald" : "rose"}>
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      </div>
    </div>
  );
};

export default Users;
