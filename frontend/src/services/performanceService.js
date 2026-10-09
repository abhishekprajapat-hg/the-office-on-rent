import api from "./api";

// Performance scores. The API decides whose: your own always; your team's if
// you are an admin or their manager.

export const getMyPerformance = async (params = {}) => (await api.get("/performance/me", { params })).data;

export const getTeamPerformance = async (params = {}) => (await api.get("/performance/team", { params })).data;

export const getUserPerformance = async (userId, params = {}) =>
  (await api.get(`/performance/users/${userId}`, { params })).data;
