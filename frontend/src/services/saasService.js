import api from "./api";

export const getMyTenantMetaIntegration = async () => {
  const res = await api.get("/saas/tenant/meta");
  return res.data?.integration || null;
};

export const updateMyTenantMetaIntegration = async (payload = {}) => {
  const res = await api.patch("/saas/tenant/meta", payload);
  return res.data?.integration || null;
};
