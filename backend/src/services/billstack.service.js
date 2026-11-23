const axios = require('axios');
const { getBillstackConfig } = require('../config/billstack');
const { createHttpError } = require('../utils/httpError');

// The supplied contract does not specify the customer response envelope.
// Keep compatibility handling here; never infer an ID from an arbitrary field.
function parseCustomerResponse(body) {
  const data = body?.data || body;
  const id = data?.customerId || data?.customer?.id || data?.customer?._id;
  if (typeof id !== 'string' || !id.trim() || id.length > 200) {
    throw Object.assign(createHttpError(502, 'BillStack returned an invalid customer response'), { retryable: false });
  }
  return id.trim();
}
// BillStack's own wording for a refused salary sheet ("already paid ..."), kept short and
// plain; nothing else from the remote body is passed on.
const remoteReason = (error) => {
  const text = error?.response?.data?.message;
  return typeof text === 'string' && text.length <= 300 && !/[<>\r\n]/.test(text) ? text.trim() : '';
};
async function post(companyId, path, payload, { method = 'post', what = 'customer', payrollCompany = 'TOOR' } = {}) {
  const config = getBillstackConfig(companyId, { payrollCompany });
  try {
    const options = {
      headers: { 'X-Billstack-Api-Key': config.apiKey }, timeout: 15000,
      maxRedirects: 0, maxContentLength: 1024 * 1024,
    };
    const response = method === 'get'
      ? await axios.get(`${config.baseUrl}${path}`, options)
      : await axios.post(`${config.baseUrl}${path}`, payload, options);
    return response.data;
  } catch (error) {
    // Do not propagate Axios errors: they include headers and remote bodies.
    const status = Number(error?.response?.status);
    const retryable = !status || status === 408 || status === 429 || status >= 500;
    const reason = what === 'payroll' && [404, 409, 422].includes(status) ? remoteReason(error) : '';
    const message = reason ? `BillStack: ${reason}`
      : status === 401 || status === 403 ? 'BillStack rejected integration authentication'
      : status === 409 ? `BillStack ${what === 'payroll' ? 'refused the salary sheet' : 'customer identity conflicts; review customer details'}`
        : status === 400 || status === 422 ? `BillStack rejected ${what === 'payroll' ? 'the salary sheet' : 'customer data'}; correct the details before retrying`
          : retryable ? 'BillStack is unavailable; retry shortly' : 'BillStack rejected the request; review integration configuration';
    const failure = createHttpError(retryable ? 502 : 409, message);
    failure.retryable = retryable;
    failure.remoteStatus = status || null;
    const retryAfter = error?.response?.headers?.['retry-after'];
    const delay = /^\d+$/.test(String(retryAfter)) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
    if (status === 429 && Number.isFinite(delay)) failure.retryAfterMs = Math.min(86400000, Math.max(30000, delay));
    throw failure;
  }
}
async function upsertCustomer(companyId, payload) {
  return parseCustomerResponse(await post(companyId, '/api/integrations/customers/upsert', payload));
}
async function createInvoiceHandoff(companyId, customerId, billingContext = null) {
  const payload = { customerId };
  if (billingContext) payload.billingContext = billingContext;
  const body = await post(companyId, '/api/integrations/handoffs/invoice', payload);
  const handoffUrl = (body?.data || body)?.handoffUrl;
  let url;
  try { url = new URL(handoffUrl); } catch { throw createHttpError(502, 'BillStack returned an invalid handoff'); }
  if (url.origin !== getBillstackConfig(companyId).frontendOrigin || url.username || url.password) {
    throw createHttpError(502, 'BillStack returned an invalid handoff');
  }
  return url.href;
}
// A finalised month's salary sheet (payroll run). BillStack checks every figure adds up.
// payrollCompany picks the key: TOOR's people go to TOOR's books, Goldhawk's to Goldhawk's.
async function sendPayrollRun(companyId, payload, { payrollCompany = 'TOOR' } = {}) {
  const body = await post(companyId, '/api/integrations/payroll/runs', payload, { what: 'payroll', payrollCompany });
  const data = body?.data || body || {};
  return { outcome: String(data.outcome || ''), remoteRunId: String(data.runId || ''), remoteStatus: String(data.status || '') };
}
// Is the run in BillStack's books, and is anything of it paid?
async function getPayrollRunStatus(companyId, runId, { payrollCompany = 'TOOR' } = {}) {
  const body = await post(companyId, `/api/integrations/payroll/runs/${encodeURIComponent(runId)}`, null, { method: 'get', what: 'payroll', payrollCompany });
  const data = body?.data || body || {};
  return { status: String(data.status || ''), paid: Number(data.paid || 0), duesPaid: Number(data.duesPaid || 0), locked: Boolean(data.locked) };
}
module.exports = { upsertCustomer, createInvoiceHandoff, parseCustomerResponse, sendPayrollRun, getPayrollRunStatus };
