import api from "./api";

// Salaries and attendance deductions. The API decides who may see whose: your
// own always; your team's if you are an admin or their manager.

export const getMySalary = async (params = {}) => {
  const res = await api.get("/salary/me", { params });
  return res.data;
};

export const getTeamSalaries = async (params = {}) => {
  const res = await api.get("/salary/team", { params });
  return res.data;
};

export const getUserSalary = async (userId, params = {}) => {
  const res = await api.get(`/salary/users/${userId}`, { params });
  return res.data;
};

export const setUserSalary = async (userId, payload) => {
  const res = await api.put(`/salary/users/${userId}`, payload);
  return res.data;
};

export const getPayrollPolicy = async () => {
  const res = await api.get("/salary/policy");
  return res.data;
};

export const updatePayrollPolicy = async (payload) => {
  const res = await api.patch("/salary/policy", payload);
  return res.data;
};

// Named deductions. Removing one as a manager answers 202 { approvalRequired }
// and waits for an admin, like every other delete (see deleteRequestService).

export const addCompanyDeduction = async (payload) => {
  const res = await api.post("/salary/policy/deductions", payload);
  return res.data;
};

export const updateCompanyDeduction = async (deductionId, payload) => {
  const res = await api.patch(`/salary/policy/deductions/${deductionId}`, payload);
  return res.data;
};

export const removeCompanyDeduction = async (deductionId) => {
  const res = await api.delete(`/salary/policy/deductions/${deductionId}`);
  return res.data;
};

export const addEmployeeDeduction = async (userId, payload) => {
  const res = await api.post(`/salary/users/${userId}/deductions`, payload);
  return res.data;
};

export const updateEmployeeDeduction = async (userId, deductionId, payload) => {
  const res = await api.patch(`/salary/users/${userId}/deductions/${deductionId}`, payload);
  return res.data;
};

export const removeEmployeeDeduction = async (userId, deductionId) => {
  const res = await api.delete(`/salary/users/${userId}/deductions/${deductionId}`);
  return res.data;
};

// One person's own attendance deduction amounts, or { useCompanyRules: true }.
export const setEmployeeRules = async (userId, payload) => {
  const res = await api.put(`/salary/users/${userId}/rules`, payload);
  return res.data;
};
