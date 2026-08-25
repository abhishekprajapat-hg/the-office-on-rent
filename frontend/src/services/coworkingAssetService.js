import api from "./api";

export const getAssets = async (params = {}) => {
  const res = await api.get("/coworking/assets", { params });
  return {
    assets: Array.isArray(res.data?.assets) ? res.data.assets : [],
    pagination: res.data?.pagination || null,
  };
};

export const createAsset = async (payload) => {
  const res = await api.post("/coworking/assets", payload);
  return res.data?.asset || null;
};

export const updateAsset = async (assetId, payload) => {
  const res = await api.patch(`/coworking/assets/${assetId}`, payload);
  return res.data?.asset || null;
};

export const markAssetMaintenance = async (assetId) => {
  const res = await api.post(`/coworking/assets/${assetId}/maintenance`);
  return res.data?.asset || null;
};

export const markAssetActive = async (assetId) => {
  const res = await api.post(`/coworking/assets/${assetId}/active`);
  return res.data?.asset || null;
};

export const retireAsset = async (assetId) => {
  const res = await api.post(`/coworking/assets/${assetId}/retire`);
  return res.data?.asset || null;
};

export const markAssetLost = async (assetId) => {
  const res = await api.post(`/coworking/assets/${assetId}/lost`);
  return res.data?.asset || null;
};

export const deleteAsset = async (assetId) => {
  const res = await api.delete(`/coworking/assets/${assetId}`);
  return res.data;
};
