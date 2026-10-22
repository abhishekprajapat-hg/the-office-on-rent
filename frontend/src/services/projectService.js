import api from "./api";

export const getProjectsWithMeta = async (params = {}) => {
  const res = await api.get("/projects", { params });
  return {
    projects: Array.isArray(res.data?.projects) ? res.data.projects : [],
    pagination: res.data?.pagination || null,
  };
};

export const getProjectById = async (projectId) => {
  const res = await api.get(`/projects/${projectId}`);
  return res.data?.project || null;
};

export const createProject = async (payload) => {
  const res = await api.post("/projects", payload);
  return res.data?.project;
};

export const updateProject = async (projectId, payload) => {
  const res = await api.patch(`/projects/${projectId}`, payload);
  return res.data?.project;
};

// For a Manager this only sends a delete request: the result then has
// approvalRequired: true (see deleteRequestService.js).
export const deleteProject = async (projectId) => {
  const res = await api.delete(`/projects/${projectId}`);
  return res.data || null;
};

// Project knowledge record, PDFs and linked units (requirements 16 Oct 2026, section 05).
export const getProjectKnowledge = async (projectId) => {
  const res = await api.get(`/projects/${projectId}`);
  return { project: res.data?.project || null, knowledge: res.data?.knowledge || null };
};
export const getProjectDetailsCatalogue = async () => (await api.get("/projects/meta/details-catalogue")).data?.catalogue;
export const updateProjectDetails = async (projectId, patch) => (await api.patch(`/projects/${projectId}/details`, patch)).data;
export const verifyProject = async (projectId) => (await api.post(`/projects/${projectId}/verify`)).data;
export const getProjectExport = async (projectId, type) => (await api.get(`/projects/${projectId}/export`, { params: { type } })).data;
export const getProjectInventory = async (projectId) => (await api.get(`/projects/${projectId}/inventory`)).data;
export const linkProjectInventory = async (projectId) => (await api.post(`/projects/${projectId}/link-inventory`)).data;
