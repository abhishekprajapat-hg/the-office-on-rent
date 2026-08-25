import api from "./api";

export const getMeetingRooms = async (params = {}) => {
  const res = await api.get("/coworking/meeting-rooms", { params });
  return {
    meetingRooms: Array.isArray(res.data?.meetingRooms) ? res.data.meetingRooms : [],
    pagination: res.data?.pagination || null,
  };
};

export const createMeetingRoom = async (payload) => {
  const res = await api.post("/coworking/meeting-rooms", payload);
  return res.data?.meetingRoom || null;
};

export const updateMeetingRoom = async (meetingRoomId, payload) => {
  const res = await api.patch(`/coworking/meeting-rooms/${meetingRoomId}`, payload);
  return res.data?.meetingRoom || null;
};

export const deleteMeetingRoom = async (meetingRoomId) => {
  const res = await api.delete(`/coworking/meeting-rooms/${meetingRoomId}`);
  return res.data;
};
