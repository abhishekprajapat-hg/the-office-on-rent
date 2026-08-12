import api from "./api";

export const getMyPermissions = async () => {
  const res = await api.get("/coworking/permissions/me");
  return {
    role: res.data?.role || "",
    isAdmin: Boolean(res.data?.isAdmin),
    permissions: Array.isArray(res.data?.permissions) ? res.data.permissions : [],
  };
};

export const getRolePermissionMatrix = async () => {
  const res = await api.get("/coworking/roles");
  return Array.isArray(res.data?.roles) ? res.data.roles : [];
};

export const updateRolePermissions = async (role, permissions) => {
  const res = await api.patch(`/coworking/roles/${role}`, { permissions });
  return {
    role: res.data?.role || role,
    permissions: Array.isArray(res.data?.permissions) ? res.data.permissions : [],
  };
};

export const getCoworkingUsers = async () => {
  const res = await api.get("/coworking/users");
  return {
    users: Array.isArray(res.data?.users) ? res.data.users : [],
    roleLabels: res.data?.roleLabels || {},
    assignableRoles: Array.isArray(res.data?.assignableRoles) ? res.data.assignableRoles : [],
  };
};

export const updateCoworkingUserRole = async (userId, role, reportingToId) => {
  const res = await api.patch(`/coworking/users/${userId}/role`, { role, reportingToId });
  return res.data?.user || null;
};

export const getAuditLogs = async (params = {}) => {
  const res = await api.get("/coworking/audit-logs", { params });
  return {
    logs: Array.isArray(res.data?.logs) ? res.data.logs : [],
    pagination: res.data?.pagination || null,
  };
};
