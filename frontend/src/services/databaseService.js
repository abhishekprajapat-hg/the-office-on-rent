import api from "./api";

/* Database module (Developmental Updates Oct 2026 - Update 01). */
export const getDatabaseMeta = async () => (await api.get("/database/meta")).data;
export const listDbContacts = async (params) => (await api.get("/database/contacts", { params })).data;
export const createDbContact = async (payload) => (await api.post("/database/contacts", payload)).data;
export const getContactLinks = async (id) => (await api.get(`/database/contacts/${id}/links`)).data;
export const checkDuplicates = async (payload) => (await api.post("/database/duplicates", payload)).data;
export const listBuildings = async (params) => (await api.get("/database/buildings", { params })).data;
export const createBuilding = async (payload) => (await api.post("/database/buildings", payload)).data;
export const getBuilding = async (id) => (await api.get(`/database/buildings/${id}`)).data;
export const updateBuilding = async (id, payload) => (await api.patch(`/database/buildings/${id}`, payload)).data;
export const mergeBuilding = async (keepId, duplicateId) => (await api.post(`/database/buildings/${keepId}/merge`, { duplicateId })).data;
export const createLink = async (payload) => (await api.post("/database/relationships", payload)).data;
export const updateLink = async (id, payload) => (await api.patch(`/database/relationships/${id}`, payload)).data;
export const logInteraction = async (payload) => (await api.post("/database/interactions", payload)).data;
export const getInventoryPanel = async (inventoryId) => (await api.get(`/database/inventory/${inventoryId}`)).data;
export const setInventoryBuilding = async (inventoryId, buildingId) => (await api.put(`/database/inventory/${inventoryId}/building`, { buildingId })).data;
export const setOccupancy = async (inventoryId, payload) => (await api.put(`/database/inventory/${inventoryId}/occupancy`, payload)).data;
export const addOwner = async (inventoryId, payload) => (await api.post(`/database/inventory/${inventoryId}/owners`, payload)).data;
