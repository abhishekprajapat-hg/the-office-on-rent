import api from "./api";

export const getPayments = async (params = {}) => {
  const res = await api.get("/coworking/payments", { params });
  return {
    payments: Array.isArray(res.data?.payments) ? res.data.payments : [],
    pagination: res.data?.pagination || null,
  };
};

export const recordPayment = async (payload) => {
  const res = await api.post("/coworking/payments", payload);
  return res.data?.payment || null;
};

export const refundPayment = async (paymentId, payload) => {
  const res = await api.post(`/coworking/payments/${paymentId}/refund`, payload);
  return res.data?.refund || null;
};
