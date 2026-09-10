import api from "./api";

// Role Type / Role administration and the dependent dropdowns behind the
// Create User form. Nothing here hardcodes a role type or a role — every list
// comes from the backend, which is also where the permissions are enforced.

const unwrapList = (value) => (Array.isArray(value) ? value : []);

/** The signed-in account's effective permissions, page access and data scope. */
export const getMyAccess = async () => {
  const res = await api.get("/access/me");
  const access = res.data?.access || {};
  return {
    role: access.role || "",
    isAdmin: Boolean(access.isAdmin),
    roleId: access.roleId || null,
    roleTypeId: access.roleTypeId || null,
    roleName: access.roleName || "",
    permissions: unwrapList(access.permissions),
    pages: unwrapList(access.pages),
    dataScope: access.dataScope || "ASSIGNED",
    enforcePageAccess: Boolean(access.enforcePageAccess),
    hasDynamicRole: Boolean(access.hasDynamicRole),
  };
};

/** Pages, permissions and base roles the Role editor offers. */
export const getAccessCatalog = async () => {
  const res = await api.get("/access/catalog");
  return {
    pages: unwrapList(res.data?.pages),
    permissions: unwrapList(res.data?.permissions),
    permissionGroups: res.data?.permissionGroups || {},
    protectedPermissions: unwrapList(res.data?.protectedPermissions),
    baseRoles: unwrapList(res.data?.baseRoles),
    dataScopes: unwrapList(res.data?.dataScopes),
  };
};

/* ------------------------------ Role Types ------------------------------ */

export const getRoleTypes = async (params = {}) => {
  const res = await api.get("/access/role-types", { params });
  return unwrapList(res.data?.roleTypes);
};

export const getRoleTypeDetail = async (roleTypeId) => {
  const res = await api.get(`/access/role-types/${roleTypeId}`);
  return {
    roleType: res.data?.roleType || null,
    roles: unwrapList(res.data?.roles),
    assignedUsers: unwrapList(res.data?.assignedUsers),
    availablePages: unwrapList(res.data?.availablePages),
    reportingHierarchy: unwrapList(res.data?.reportingHierarchy),
    auditHistory: unwrapList(res.data?.auditHistory),
  };
};

export const createRoleType = async (payload) => {
  const res = await api.post("/access/role-types", payload);
  return res.data?.roleType || null;
};

export const updateRoleType = async (roleTypeId, payload) => {
  const res = await api.patch(`/access/role-types/${roleTypeId}`, payload);
  return res.data?.roleType || null;
};

export const setRoleTypeStatus = async (roleTypeId, status) => {
  const res = await api.patch(`/access/role-types/${roleTypeId}/status`, { status });
  return res.data?.roleType || null;
};

export const duplicateRoleType = async (roleTypeId, payload = {}) => {
  const res = await api.post(`/access/role-types/${roleTypeId}/duplicate`, payload);
  return res.data?.roleType || null;
};

export const deleteRoleType = async (roleTypeId) => {
  const res = await api.delete(`/access/role-types/${roleTypeId}`);
  return res.data;
};

/* --------------------------------- Roles --------------------------------- */

export const getRoles = async (params = {}) => {
  const res = await api.get("/access/roles", { params });
  return unwrapList(res.data?.roles);
};

export const getRoleDetail = async (roleId) => {
  const res = await api.get(`/access/roles/${roleId}`);
  return res.data || null;
};

export const createRole = async (payload) => {
  const res = await api.post("/access/roles", payload);
  return res.data?.role || null;
};

export const updateRole = async (roleId, payload) => {
  const res = await api.patch(`/access/roles/${roleId}`, payload);
  return res.data?.role || null;
};

export const setRoleStatus = async (roleId, status) => {
  const res = await api.patch(`/access/roles/${roleId}/status`, { status });
  return res.data?.role || null;
};

export const deleteRole = async (roleId) => {
  const res = await api.delete(`/access/roles/${roleId}`);
  return res.data;
};

/* -------------------- Create User dependent dropdowns -------------------- */

/** Active role types only. */
export const getAssignableRoleTypes = async () => {
  const res = await api.get("/access/assignable/role-types");
  return unwrapList(res.data?.roleTypes);
};

/** Active roles belonging to one role type. An empty array is a valid answer. */
export const getAssignableRoles = async (roleTypeId) => {
  const res = await api.get(`/access/assignable/role-types/${roleTypeId}/roles`);
  return unwrapList(res.data?.roles);
};

export const getRoleAuditLogs = async (params = {}) => {
  const res = await api.get("/access/audit-logs", { params });
  return {
    logs: unwrapList(res.data?.logs),
    pagination: res.data?.pagination || null,
  };
};
