import api from "./api";

export const getInvoices = async (params = {}) => {
  const res = await api.get("/coworking/invoices", { params });
  return {
    invoices: Array.isArray(res.data?.invoices) ? res.data.invoices : [],
    pagination: res.data?.pagination || null,
  };
};

export const getInvoiceById = async (invoiceId) => {
  const res = await api.get(`/coworking/invoices/${invoiceId}`);
  return res.data?.invoice || null;
};

// Note: the server always recomputes subtotal/discountAmount/gstAmount/
// totalAmount from lineItems+discount+charges+gstRate — anything the client
// sends for those derived fields is ignored, never trusted.
export const createInvoice = async (payload) => {
  const res = await api.post("/coworking/invoices", payload);
  return res.data?.invoice || null;
};

export const generateInvoiceForContract = async (payload) => {
  const res = await api.post("/coworking/invoices/generate-for-contract", payload);
  return res.data?.invoice || null;
};

export const updateInvoice = async (invoiceId, payload) => {
  const res = await api.patch(`/coworking/invoices/${invoiceId}`, payload);
  return res.data?.invoice || null;
};

export const cancelInvoice = async (invoiceId) => {
  const res = await api.post(`/coworking/invoices/${invoiceId}/cancel`);
  return res.data?.invoice || null;
};
