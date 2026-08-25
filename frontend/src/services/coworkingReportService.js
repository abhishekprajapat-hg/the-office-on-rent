import api from "./api";

export const getCoworkingReportSummary = async (params = {}) => {
  const res = await api.get("/coworking/reports/summary", { params });
  return res.data?.report || null;
};
