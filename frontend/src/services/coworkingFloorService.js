import api from "./api";

export const getFloors = async (params = {}) => {
  const res = await api.get("/coworking/floors", { params });
  return {
    floors: Array.isArray(res.data?.floors) ? res.data.floors : [],
    pagination: res.data?.pagination || null,
  };
};

export const getFloorById = async (floorId) => {
  const res = await api.get(`/coworking/floors/${floorId}`);
  return res.data?.floor || null;
};

export const createFloor = async (payload) => {
  const res = await api.post("/coworking/floors", payload);
  return res.data?.floor || null;
};

export const updateFloor = async (floorId, payload) => {
  const res = await api.patch(`/coworking/floors/${floorId}`, payload);
  return res.data?.floor || null;
};

export const deleteFloor = async (floorId) => {
  const res = await api.delete(`/coworking/floors/${floorId}`);
  return res.data;
};
