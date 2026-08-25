import api from "./api";

export const getTickets = async (params = {}) => {
  const res = await api.get("/coworking/tickets", { params });
  return {
    tickets: Array.isArray(res.data?.tickets) ? res.data.tickets : [],
    pagination: res.data?.pagination || null,
  };
};

export const createTicket = async (payload) => {
  const res = await api.post("/coworking/tickets", payload);
  return res.data?.ticket || null;
};

export const updateTicket = async (ticketId, payload) => {
  const res = await api.patch(`/coworking/tickets/${ticketId}`, payload);
  return res.data?.ticket || null;
};

export const resolveTicket = async (ticketId, resolutionNotes = "") => {
  const res = await api.post(`/coworking/tickets/${ticketId}/resolve`, { resolutionNotes });
  return res.data?.ticket || null;
};

export const closeTicket = async (ticketId) => {
  const res = await api.post(`/coworking/tickets/${ticketId}/close`);
  return res.data?.ticket || null;
};

export const reopenTicket = async (ticketId) => {
  const res = await api.post(`/coworking/tickets/${ticketId}/reopen`);
  return res.data?.ticket || null;
};

export const deleteTicket = async (ticketId) => {
  const res = await api.delete(`/coworking/tickets/${ticketId}`);
  return res.data;
};
