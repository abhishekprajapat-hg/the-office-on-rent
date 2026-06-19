import api from "./api";

export const checkInAttendance = async (payload = {}) => {
  const res = await api.post("/attendance/check-in", payload);
  return {
    message: res.data?.message || "Checked in successfully",
    attendance: res.data?.attendance || null,
    timezone: res.data?.timezone || "",
  };
};

export const checkOutAttendance = async (payload = {}) => {
  const res = await api.post("/attendance/check-out", payload);
  return {
    message: res.data?.message || "Checked out successfully",
    attendance: res.data?.attendance || null,
    timezone: res.data?.timezone || "",
  };
};

export const startBreakAttendance = async (payload = {}) => {
  const res = await api.post("/attendance/break/start", payload);
  return {
    message: res.data?.message || "Break started",
    attendance: res.data?.attendance || null,
    timezone: res.data?.timezone || "",
  };
};

export const endBreakAttendance = async (payload = {}) => {
  const res = await api.post("/attendance/break/end", payload);
  return {
    message: res.data?.message || "Break ended",
    attendance: res.data?.attendance || null,
    timezone: res.data?.timezone || "",
  };
};

export const getMyAttendance = async (params = {}) => {
  const res = await api.get("/attendance/me", { params });
  return {
    timezone: res.data?.timezone || "",
    from: res.data?.from || "",
    to: res.data?.to || "",
    today: res.data?.today || null,
    summary: res.data?.summary || {},
    attendance: Array.isArray(res.data?.attendance) ? res.data.attendance : [],
    pagination: res.data?.pagination || null,
    count: Number(res.data?.count || 0),
  };
};

export const getDailyAttendanceForAdmin = async (params = {}) => {
  const res = await api.get("/attendance/daily", { params });
  return {
    timezone: res.data?.timezone || "",
    date: res.data?.date || "",
    summary: res.data?.summary || {},
    attendance: Array.isArray(res.data?.attendance) ? res.data.attendance : [],
  };
};

export const getAttendancePolicy = async () => {
  const res = await api.get("/attendance/policy");
  return res.data?.policy || null;
};

export const updateAttendancePolicy = async (payload = {}) => {
  const res = await api.patch("/attendance/policy", payload);
  return {
    message: res.data?.message || "Attendance policy updated",
    policy: res.data?.policy || null,
  };
};

export const createLeaveRequest = async (payload = {}) => {
  const res = await api.post("/attendance/leave-requests", payload);
  return {
    message: res.data?.message || "Leave request created",
    leaveRequest: res.data?.leaveRequest || null,
  };
};

export const getMyLeaveRequests = async () => {
  const res = await api.get("/attendance/leave-requests/my");
  return Array.isArray(res.data?.leaveRequests) ? res.data.leaveRequests : [];
};

export const getAdminLeaveRequests = async (params = {}) => {
  const res = await api.get("/attendance/leave-requests/admin", { params });
  return Array.isArray(res.data?.leaveRequests) ? res.data.leaveRequests : [];
};

export const reviewLeaveRequest = async (requestId, payload = {}) => {
  const res = await api.patch(`/attendance/leave-requests/${requestId}/review`, payload);
  return {
    message: res.data?.message || "Leave request reviewed",
    leaveRequest: res.data?.leaveRequest || null,
  };
};
