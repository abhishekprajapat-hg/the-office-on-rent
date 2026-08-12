import api from "./api";

export const getBookings = async (params = {}) => {
  const res = await api.get("/coworking/bookings", { params });
  return {
    bookings: Array.isArray(res.data?.bookings) ? res.data.bookings : [],
    pagination: res.data?.pagination || null,
  };
};

export const getBookingById = async (bookingId) => {
  const res = await api.get(`/coworking/bookings/${bookingId}`);
  return res.data?.booking || null;
};

export const createBooking = async (payload) => {
  const res = await api.post("/coworking/bookings", payload);
  return {
    created: Array.isArray(res.data?.created) ? res.data.created : [],
    skipped: Array.isArray(res.data?.skipped) ? res.data.skipped : [],
  };
};

export const updateBooking = async (bookingId, payload) => {
  const res = await api.patch(`/coworking/bookings/${bookingId}`, payload);
  return res.data?.booking || null;
};

export const confirmBooking = async (bookingId) => {
  const res = await api.post(`/coworking/bookings/${bookingId}/confirm`);
  return res.data?.booking || null;
};

export const activateBooking = async (bookingId) => {
  const res = await api.post(`/coworking/bookings/${bookingId}/activate`);
  return res.data?.booking || null;
};

export const completeBooking = async (bookingId, actualEndDate) => {
  const res = await api.post(`/coworking/bookings/${bookingId}/complete`, { actualEndDate });
  return res.data?.booking || null;
};

export const cancelBooking = async (bookingId, reason) => {
  const res = await api.post(`/coworking/bookings/${bookingId}/cancel`, { reason });
  return res.data?.booking || null;
};

export const markNoShow = async (bookingId) => {
  const res = await api.post(`/coworking/bookings/${bookingId}/no-show`);
  return res.data?.booking || null;
};

export const extendBooking = async (bookingId, newEndDate) => {
  const res = await api.post(`/coworking/bookings/${bookingId}/extend`, { newEndDate });
  return res.data?.booking || null;
};

export const getCabinCalendar = async (cabinId, from, to) => {
  const res = await api.get(`/coworking/bookings/cabins/${cabinId}/calendar`, { params: { from, to } });
  return Array.isArray(res.data?.bookings) ? res.data.bookings : [];
};

export const getAvailableCabins = async (params) => {
  const res = await api.get("/coworking/bookings/available-cabins", { params });
  return Array.isArray(res.data?.cabins) ? res.data.cabins : [];
};

export const getAvailableSeats = async (params) => {
  const res = await api.get("/coworking/bookings/available-seats", { params });
  return Array.isArray(res.data?.seats) ? res.data.seats : [];
};
