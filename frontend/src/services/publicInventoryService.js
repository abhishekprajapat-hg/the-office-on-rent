import axios from "axios";

const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const fallbackBaseUrl = import.meta.env.DEV
  ? "/api/public"
  : "https://nemnidhi.cloud/api/public";

const getPublicApiBase = (url) => {
  if (!url) return fallbackBaseUrl;
  const clean = url.endsWith("/") ? url.slice(0, -1) : url;
  return clean.replace(/\/client$/, "").replace(/\/api$/, "/api/public");
};

const PUBLIC_API_BASE = getPublicApiBase(configuredBaseUrl);

const publicApi = axios.create({
  baseURL: PUBLIC_API_BASE,
  timeout: 15000,
});

export const getSharedInventory = async (shareToken) => {
  const res = await publicApi.get(`/inventory/${shareToken}`);
  return res.data?.inventory || null;
};
