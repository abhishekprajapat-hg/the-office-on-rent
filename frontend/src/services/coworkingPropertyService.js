import api from "./api";

export const getProperties = async (params = {}) => {
  const res = await api.get("/coworking/properties", { params });
  return {
    properties: Array.isArray(res.data?.properties) ? res.data.properties : [],
    pagination: res.data?.pagination || null,
  };
};

export const getPropertyById = async (propertyId) => {
  const res = await api.get(`/coworking/properties/${propertyId}`);
  return res.data?.property || null;
};

export const createProperty = async (payload) => {
  const res = await api.post("/coworking/properties", payload);
  return res.data?.property || null;
};

export const updateProperty = async (propertyId, payload) => {
  const res = await api.patch(`/coworking/properties/${propertyId}`, payload);
  return res.data?.property || null;
};

export const deleteProperty = async (propertyId) => {
  const res = await api.delete(`/coworking/properties/${propertyId}`);
  return res.data;
};
