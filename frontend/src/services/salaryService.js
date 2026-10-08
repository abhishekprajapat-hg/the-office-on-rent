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
