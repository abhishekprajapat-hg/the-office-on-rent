import api from "./api";

export const getDailyReportForms = async () => (await api.get("/daily-reports/forms")).data;
export const getMyDailyReportToday = async () => (await api.get("/daily-reports/me/today")).data;
export const submitDailyReport = async (payload) => (await api.post("/daily-reports", payload)).data;
export const amendDailyReport = async (reportId, payload) => (await api.patch(`/daily-reports/${reportId}`, payload)).data;
export const getDailyReport = async (reportId) => (await api.get(`/daily-reports/${reportId}`)).data;
export const getDailyReportSummary = async (params = {}) => (await api.get("/daily-reports/summary", { params })).data;
export const getDailyReportDayStatus = async (params = {}) => (await api.get("/daily-reports/status", { params })).data;
