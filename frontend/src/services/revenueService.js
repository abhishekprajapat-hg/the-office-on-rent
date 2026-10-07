import api from "./api";

/** Revenue Module report: rental income, brokerage, payouts, summary. */
export const getRevenueReport = async (params = {}) => {
  const res = await api.get("/finance/revenue", { params });
  return res.data;
};
