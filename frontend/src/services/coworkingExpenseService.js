import api from "./api";

export const getExpenses = async (params = {}) => {
  const res = await api.get("/coworking/expenses", { params });
  return {
    expenses: Array.isArray(res.data?.expenses) ? res.data.expenses : [],
    pagination: res.data?.pagination || null,
  };
};

export const getExpenseById = async (expenseId) => {
  const res = await api.get(`/coworking/expenses/${expenseId}`);
  return res.data?.expense || null;
};

export const createExpense = async (payload) => {
  const res = await api.post("/coworking/expenses", payload);
  return res.data?.expense || null;
};

export const updateExpense = async (expenseId, payload) => {
  const res = await api.patch(`/coworking/expenses/${expenseId}`, payload);
  return res.data?.expense || null;
};

export const deleteExpense = async (expenseId) => {
  const res = await api.delete(`/coworking/expenses/${expenseId}`);
  return res.data;
};

export const approveExpense = async (expenseId) => {
  const res = await api.post(`/coworking/expenses/${expenseId}/approve`);
  return res.data?.expense || null;
};

export const rejectExpense = async (expenseId, reason) => {
  const res = await api.post(`/coworking/expenses/${expenseId}/reject`, { reason });
  return res.data?.expense || null;
};

export const markExpensePaid = async (expenseId) => {
  const res = await api.post(`/coworking/expenses/${expenseId}/mark-paid`);
  return res.data?.expense || null;
};

export const addExpenseReceipt = async (expenseId, payload) => {
  const res = await api.post(`/coworking/expenses/${expenseId}/receipts`, payload);
  return res.data?.expense || null;
};

export const removeExpenseReceipt = async (expenseId, receiptId) => {
  const res = await api.delete(`/coworking/expenses/${expenseId}/receipts/${receiptId}`);
  return res.data?.expense || null;
};
