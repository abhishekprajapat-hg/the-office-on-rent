import api from "./api";

// Performance scores. The API decides whose: your own always; your team's if
// you are an admin or their manager.

export const getMyPerformance = async (params = {}) => (await api.get("/performance/me", { params })).data;

export const getTeamPerformance = async (params = {}) => (await api.get("/performance/team", { params })).data;

export const getUserPerformance = async (userId, params = {}) =>
  (await api.get(`/performance/users/${userId}`, { params })).data;

// Score history and increment reviews (requirements 16 Oct 2026, 3.4).
export const getPerformanceHistory = async (userId, params = {}) => (await api.get(`/performance/users/${userId}/history`, { params })).data;
export const listIncrementReviews = async (params = {}) => (await api.get("/performance/increment-reviews", { params })).data;
export const createIncrementReview = async (payload) => (await api.post("/performance/increment-reviews", payload)).data;
export const updateIncrementReview = async (id, payload) => (await api.patch(`/performance/increment-reviews/${id}`, payload)).data;
