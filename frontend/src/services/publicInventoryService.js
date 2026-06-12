import axios from "axios";

const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const fallbackBaseUrl = import.meta.env.DEV
  ? "/api/public"
  : "https://nemnidhi.cloud/api/public";
const PUBLIC_API_BASE = configuredBaseUrl
  ? configuredBaseUrl.replace(/\/client\/?$/, "/public")
  : fallbackBaseUrl;

const publicApi = axios.create({
  baseURL: PUBLIC_API_BASE,
  timeout: 15000,
});

export const getSharedInventory = async (shareToken) => {
  const res = await publicApi.get(`/inventory/${shareToken}`);
  return res.data?.inventory || null;
};
