import api from "./api";

export const getCoworkingSettings = async () => {
  const res = await api.get("/coworking/settings");
  return res.data?.settings || null;
};

export const updateCoworkingSettings = async (payload) => {
  const res = await api.patch("/coworking/settings", payload);
  return res.data?.settings || null;
};
