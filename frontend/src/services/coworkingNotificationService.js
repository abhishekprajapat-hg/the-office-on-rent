import api from "./api";

export const getNotifications = async (params = {}) => {
  const res = await api.get("/coworking/notifications", { params });
  return {
    notifications: Array.isArray(res.data?.notifications) ? res.data.notifications : [],
    pagination: res.data?.pagination || null,
  };
};

export const createNotification = async (payload) => {
  const res = await api.post("/coworking/notifications", payload);
  return res.data?.notification || null;
};

export const updateNotification = async (notificationId, payload) => {
  const res = await api.patch(`/coworking/notifications/${notificationId}`, payload);
  return res.data?.notification || null;
};

export const markNotificationRead = async (notificationId) => {
  const res = await api.post(`/coworking/notifications/${notificationId}/read`);
  return res.data?.notification || null;
};

export const markNotificationUnread = async (notificationId) => {
  const res = await api.post(`/coworking/notifications/${notificationId}/unread`);
  return res.data?.notification || null;
};

export const archiveNotification = async (notificationId) => {
  const res = await api.post(`/coworking/notifications/${notificationId}/archive`);
  return res.data?.notification || null;
};

export const deleteNotification = async (notificationId) => {
  const res = await api.delete(`/coworking/notifications/${notificationId}`);
  return res.data;
};
