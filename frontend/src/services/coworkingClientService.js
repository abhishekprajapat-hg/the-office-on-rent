import api from "./api";

export const getClients = async (params = {}) => {
  const res = await api.get("/coworking/clients", { params });
  return {
    clients: Array.isArray(res.data?.clients) ? res.data.clients : [],
    pagination: res.data?.pagination || null,
  };
};

export const getClientById = async (clientId) => {
  const res = await api.get(`/coworking/clients/${clientId}`);
  return res.data?.client || null;
};

export const createClient = async (payload) => {
  const res = await api.post("/coworking/clients", payload);
  return res.data?.client || null;
};

export const updateClient = async (clientId, payload) => {
  const res = await api.patch(`/coworking/clients/${clientId}`, payload);
  return res.data?.client || null;
};

export const deleteClient = async (clientId) => {
  const res = await api.delete(`/coworking/clients/${clientId}`);
  return res.data;
};

export const addClientContact = async (clientId, payload) => {
  const res = await api.post(`/coworking/clients/${clientId}/contacts`, payload);
  return res.data?.client || null;
};

export const removeClientContact = async (clientId, contactId) => {
  const res = await api.delete(`/coworking/clients/${clientId}/contacts/${contactId}`);
  return res.data?.client || null;
};

export const addClientDocument = async (clientId, payload) => {
  const res = await api.post(`/coworking/clients/${clientId}/documents`, payload);
  return res.data?.client || null;
};

export const removeClientDocument = async (clientId, documentId) => {
  const res = await api.delete(`/coworking/clients/${clientId}/documents/${documentId}`);
  return res.data?.client || null;
};

export const getClientAssignments = async (clientId) => {
  const res = await api.get(`/coworking/clients/${clientId}/assignments`);
  return Array.isArray(res.data?.assignments) ? res.data.assignments : [];
};

export const getClientActivity = async (clientId, params = {}) => {
  const res = await api.get(`/coworking/clients/${clientId}/activity`, { params });
  return {
    logs: Array.isArray(res.data?.logs) ? res.data.logs : [],
    pagination: res.data?.pagination || null,
  };
};

// Client portal login management — separate credential system from the
// staff/CRM login (see backend/src/services/clientPortalAuth.service.js).
export const getClientPortalUsers = async (clientId) => {
  const res = await api.get(`/coworking/clients/${clientId}/portal-users`);
  return Array.isArray(res.data?.portalUsers) ? res.data.portalUsers : [];
};

export const createClientPortalUser = async (clientId, payload) => {
  const res = await api.post(`/coworking/clients/${clientId}/portal-users`, payload);
  return res.data?.portalUser || null;
};

export const setClientPortalUserActive = async (clientId, portalUserId, isActive) => {
  const res = await api.patch(`/coworking/clients/${clientId}/portal-users/${portalUserId}/active`, { isActive });
  return res.data?.portalUser || null;
};

export const resetClientPortalUserPassword = async (clientId, portalUserId, newPassword) => {
  const res = await api.post(`/coworking/clients/${clientId}/portal-users/${portalUserId}/reset-password`, { newPassword });
  return res.data;
};
