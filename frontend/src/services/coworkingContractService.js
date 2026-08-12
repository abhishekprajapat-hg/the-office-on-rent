import api from "./api";

export const getContracts = async (params = {}) => {
  const res = await api.get("/coworking/contracts", { params });
  return {
    contracts: Array.isArray(res.data?.contracts) ? res.data.contracts : [],
    pagination: res.data?.pagination || null,
  };
};

export const getContractById = async (contractId) => {
  const res = await api.get(`/coworking/contracts/${contractId}`);
  return res.data?.contract || null;
};

export const createContract = async (payload) => {
  const res = await api.post("/coworking/contracts", payload);
  return res.data?.contract || null;
};

export const updateContract = async (contractId, payload) => {
  const res = await api.patch(`/coworking/contracts/${contractId}`, payload);
  return res.data?.contract || null;
};

export const activateContract = async (contractId) => {
  const res = await api.post(`/coworking/contracts/${contractId}/activate`);
  return res.data?.contract || null;
};

export const terminateContract = async (contractId, reason) => {
  const res = await api.post(`/coworking/contracts/${contractId}/terminate`, { reason });
  return res.data?.contract || null;
};

export const renewContract = async (contractId, newEndDate, newRent) => {
  const res = await api.post(`/coworking/contracts/${contractId}/renew`, { newEndDate, newRent });
  return res.data?.contract || null;
};

export const addContractDocument = async (contractId, payload) => {
  const res = await api.post(`/coworking/contracts/${contractId}/documents`, payload);
  return res.data?.contract || null;
};

export const removeContractDocument = async (contractId, documentId) => {
  const res = await api.delete(`/coworking/contracts/${contractId}/documents/${documentId}`);
  return res.data?.contract || null;
};
