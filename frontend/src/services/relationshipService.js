import api from "./api";

/* Brokers, owners, firms and inventory sources (requirements 16 Oct 2026, 06/07/17). */
export const listContacts = async (params) => (await api.get("/contacts", { params })).data;
export const getContactProfile = async (id) => (await api.get(`/contacts/${id}`)).data;
export const updateContact = async (id, patch) => (await api.patch(`/contacts/${id}`, patch)).data;
export const mergeContact = async (keepId, duplicateId) => (await api.post(`/contacts/${keepId}/merge`, { duplicateId })).data;
export const importReraBrokers = async (rows) => (await api.post("/contacts/import-rera", { rows })).data;
export const listFirms = async (params) => (await api.get("/contacts/firms", { params })).data;
export const createFirm = async (payload) => (await api.post("/contacts/firms", payload)).data;

export const addInventorySource = async (inventoryId, payload) => (await api.post(`/inventory/${inventoryId}/sources`, payload)).data;
export const updateInventorySource = async (inventoryId, linkId, payload) => (await api.patch(`/inventory/${inventoryId}/sources/${linkId}`, payload)).data;
export const removeInventorySource = async (inventoryId, linkId) => (await api.delete(`/inventory/${inventoryId}/sources/${linkId}`)).data;
export const confirmInventory = async (inventoryId, payload = {}) => (await api.post(`/inventory/${inventoryId}/confirm`, payload)).data;
export const setInventoryOwner = async (inventoryId, contactId) => (await api.put(`/inventory/${inventoryId}/owner`, { contactId })).data;
