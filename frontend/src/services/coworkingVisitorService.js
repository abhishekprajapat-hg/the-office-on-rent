import api from "./api";

export const getVisitors = async (params = {}) => {
  const res = await api.get("/coworking/visitors", { params });
  return {
    visitors: Array.isArray(res.data?.visitors) ? res.data.visitors : [],
    pagination: res.data?.pagination || null,
  };
};

export const createVisitor = async (payload) => {
  const res = await api.post("/coworking/visitors", payload);
  return res.data?.visitor || null;
};

export const updateVisitor = async (visitorId, payload) => {
  const res = await api.patch(`/coworking/visitors/${visitorId}`, payload);
  return res.data?.visitor || null;
};

export const checkoutVisitor = async (visitorId) => {
  const res = await api.post(`/coworking/visitors/${visitorId}/checkout`);
  return res.data?.visitor || null;
};

export const deleteVisitor = async (visitorId) => {
  const res = await api.delete(`/coworking/visitors/${visitorId}`);
  return res.data;
};
