import api from "./api";

export const getAllSeats = async (params = {}) => {
  const res = await api.get("/coworking/seats", { params });
  return {
    seats: Array.isArray(res.data?.seats) ? res.data.seats : [],
    pagination: res.data?.pagination || null,
  };
};

export const getCabins = async (params = {}) => {
  const res = await api.get("/coworking/cabins", { params });
  return {
    cabins: Array.isArray(res.data?.cabins) ? res.data.cabins : [],
    pagination: res.data?.pagination || null,
  };
};

export const getCabinById = async (cabinId) => {
  const res = await api.get(`/coworking/cabins/${cabinId}`);
  return res.data?.cabin || null;
};

export const createCabin = async (payload) => {
  const res = await api.post("/coworking/cabins", payload);
  return res.data?.cabin || null;
};

export const updateCabin = async (cabinId, payload) => {
  const res = await api.patch(`/coworking/cabins/${cabinId}`, payload);
  return res.data?.cabin || null;
};

export const deleteCabin = async (cabinId) => {
  const res = await api.delete(`/coworking/cabins/${cabinId}`);
  return res.data;
};

export const blockCabin = async (cabinId, reason) => {
  const res = await api.post(`/coworking/cabins/${cabinId}/block`, { reason });
  return res.data?.cabin || null;
};

export const unblockCabin = async (cabinId) => {
  const res = await api.post(`/coworking/cabins/${cabinId}/unblock`);
  return res.data?.cabin || null;
};

export const setCabinMaintenance = async (cabinId) => {
  const res = await api.post(`/coworking/cabins/${cabinId}/maintenance`);
  return res.data?.cabin || null;
};

export const clearCabinMaintenance = async (cabinId) => {
  const res = await api.post(`/coworking/cabins/${cabinId}/maintenance/clear`);
  return res.data?.cabin || null;
};

export const assignSeat = async (cabinId, seatCode, { clientId, label } = {}) => {
  const res = await api.post(`/coworking/cabins/${cabinId}/seats/${seatCode}/assign`, { clientId, label });
  return res.data?.cabin || null;
};

export const releaseSeat = async (cabinId, seatCode) => {
  const res = await api.post(`/coworking/cabins/${cabinId}/seats/${seatCode}/release`);
  return res.data?.cabin || null;
};

export const blockSeat = async (cabinId, seatCode) => {
  const res = await api.post(`/coworking/cabins/${cabinId}/seats/${seatCode}/block`);
  return res.data?.cabin || null;
};

export const unblockSeat = async (cabinId, seatCode) => {
  const res = await api.post(`/coworking/cabins/${cabinId}/seats/${seatCode}/unblock`);
  return res.data?.cabin || null;
};

export const setSeatMaintenance = async (cabinId, seatCode) => {
  const res = await api.post(`/coworking/cabins/${cabinId}/seats/${seatCode}/maintenance`);
  return res.data?.cabin || null;
};

export const clearSeatMaintenance = async (cabinId, seatCode) => {
  const res = await api.post(`/coworking/cabins/${cabinId}/seats/${seatCode}/maintenance/clear`);
  return res.data?.cabin || null;
};
