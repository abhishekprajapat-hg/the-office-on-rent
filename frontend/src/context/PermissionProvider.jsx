import { useCallback, useEffect, useMemo, useState } from "react";
import { getMyAccess } from "../services/accessService";
import { toPagePermission } from "../constants/permissions";
import PermissionContext from "./permissionContext";

const EMPTY_ACCESS = {
  permissions: [],
  pages: [],
  dataScope: "ASSIGNED",
  enforcePageAccess: false,
  hasDynamicRole: false,
  roleName: "",
  roleId: null,
  roleTypeId: null,
};

export const PermissionProvider = ({ children, enabled = true, userRole }) => {
  const [access, setAccess] = useState(EMPTY_ACCESS);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const isAdmin = userRole === "ADMIN";

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);
    try {
      // /api/access/me answers for every signed-in role, unlike the
      // coworking-only endpoint this used to call, so a lead-side account now
      // gets its real page grants instead of an empty list.
      const data = await getMyAccess();
      setAccess({
        permissions: data.permissions,
        pages: data.pages,
        dataScope: data.dataScope,
        enforcePageAccess: data.enforcePageAccess,
        hasDynamicRole: data.hasDynamicRole,
        roleName: data.roleName,
        roleId: data.roleId,
        roleTypeId: data.roleTypeId,
      });
    } catch {
      // Fail closed on permissions, but never on page access: leaving
      // enforcePageAccess false means a transient network error cannot lock a
      // user out of pages their role legitimately has. The backend guard is
      // the real gate either way.
      setAccess(EMPTY_ACCESS);
      setError("permissions_unavailable");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setAccess(EMPTY_ACCESS);
      setLoading(false);
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userRole]);

  const permissionSet = useMemo(() => new Set(access.permissions), [access.permissions]);

  const can = useCallback(
    (permission) => isAdmin || permissionSet.has(permission),
    [isAdmin, permissionSet],
  );

  /**
   * Page-level check used by route guards and navigation. Accepts one key or a
   * list; any one of them being granted is enough. Returns true while the role
   * does not enforce page access, which is every account that predates the
   * Role Types work.
   */
  const canPage = useCallback(
    (pageKeys) => {
      if (isAdmin || !access.enforcePageAccess) return true;
      const keys = Array.isArray(pageKeys) ? pageKeys : [pageKeys];
      return keys.some((pageKey) => permissionSet.has(toPagePermission(pageKey, "view")));
    },
    [isAdmin, access.enforcePageAccess, permissionSet],
  );

  const canPageAction = useCallback(
    (pageKey, action) =>
      isAdmin || !access.enforcePageAccess || permissionSet.has(toPagePermission(pageKey, action)),
    [isAdmin, access.enforcePageAccess, permissionSet],
  );

  const value = useMemo(
    () => ({
      role: userRole || "",
      isAdmin,
      permissions: access.permissions,
      pages: access.pages,
      dataScope: access.dataScope,
      enforcePageAccess: access.enforcePageAccess,
      hasDynamicRole: access.hasDynamicRole,
      roleName: access.roleName,
      roleId: access.roleId,
      roleTypeId: access.roleTypeId,
      loading,
      error,
      can,
      canPage,
      canPageAction,
      refresh,
    }),
    [userRole, isAdmin, access, loading, error, can, canPage, canPageAction, refresh],
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
};

export default PermissionProvider;
