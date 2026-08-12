import { useCallback, useEffect, useMemo, useState } from "react";
import { getMyPermissions } from "../services/permissionService";
import PermissionContext from "./permissionContext";

export const PermissionProvider = ({ children, enabled = true, userRole }) => {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const isAdmin = userRole === "ADMIN";

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);
    try {
      const data = await getMyPermissions();
      setPermissions(data.permissions);
    } catch {
      // Roles outside the coworking module (e.g. EXECUTIVE) get a 403 here —
      // that's expected, not a fatal error; they simply have no permissions.
      setPermissions([]);
      setError("permissions_unavailable");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setPermissions([]);
      setLoading(false);
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userRole]);

  const permissionSet = useMemo(() => new Set(permissions), [permissions]);

  const can = useCallback(
    (permission) => isAdmin || permissionSet.has(permission),
    [isAdmin, permissionSet],
  );

  const value = useMemo(
    () => ({
      role: userRole || "",
      isAdmin,
      permissions,
      loading,
      error,
      can,
      refresh,
    }),
    [userRole, isAdmin, permissions, loading, error, can, refresh],
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
};

export default PermissionProvider;
