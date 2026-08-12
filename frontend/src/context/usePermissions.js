import { useContext } from "react";
import PermissionContext from "./permissionContext";

// Fails closed: if the provider hasn't mounted (or a component is rendered
// outside it), `can()` denies everything rather than allowing everything.
// The backend is the real enforcement point either way (see
// requirePermission in backend/src/middleware/permission.middleware.js) —
// this hook only drives UI-level hiding/disabling.
const DENY_ALL_FALLBACK = {
  role: "",
  isAdmin: false,
  permissions: [],
  loading: false,
  error: null,
  can: () => false,
  refresh: async () => {},
};

export const usePermissions = () => {
  const context = useContext(PermissionContext);
  return context || DENY_ALL_FALLBACK;
};
