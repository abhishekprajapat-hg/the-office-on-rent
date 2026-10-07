const { createHash } = require('node:crypto');
const Client = require('../models/CoworkingClient');
const Board = require('../models/CoworkingBoardState');
const { validBookedCabin } = require('./billstackCustomer.service');
const { scheduleSafely } = require('./billstackSync.service');
const { createHttpError } = require('../utils/httpError');
const { isBillstackEnabled } = require('../config/billstack');

// Preserve server-owned bindings even when older clients omit response metadata.
function preserveBindings(cabins, previous = [], companyId) {
  return cabins.map(cabin => {
    if (!cabin?.client || typeof cabin.client !== 'object' || Array.isArray(cabin.client)) return cabin;
    const old = previous.find(item => item.code === cabin.code);
    const same = old?.client && (old.client.identityKey
      ? (!cabin.client.identityKey || cabin.client.identityKey === old.client.identityKey) && cabin.client.id === old.client.id
      : (old.client.id && old.client.id === cabin.client.id) || (old.contract?.id === cabin.contract?.id && old.client.name === cabin.client.name));
    const client = { ...cabin.client, billingIdentityVerified: false, billingBindingEstablished: false, billingBindingConflict: false };
    delete client.billingIdentityError;
    if (same) {
      client.identityKey = old.client.identityKey || client.identityKey;
      if (old.client.canonicalClientId && (old.client.billingBindingEstablished === true || old.client.billingIdentityVerified === true)) {
        client.billingBindingConflict = Boolean(client.canonicalClientId && client.canonicalClientId !== old.client.canonicalClientId);
        client.canonicalClientId = old.client.canonicalClientId;
        client.billingBindingEstablished = old.client.billingBindingEstablished === true || old.client.billingIdentityVerified === true;
      }
    }
    if (!client.identityKey) {
      const source = same ? old : cabin;
      client.identityKey = createHash('sha256').update(JSON.stringify([String(companyId), source.contract?.id, source.client?.id, source.client?.name, source.client?.phone, source.client?.email])).digest('hex');
    }
    return { ...cabin, client };
  });
}

function identityData(cabin) {
  const c = cabin.client;
  const name = String(c.name || '').trim();
  let phone = String(c.phone || '').replace(/\D/g, '');
  if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
  const email = String(c.email || '').trim().toLowerCase();
  if (!/^\d{10}$/.test(phone)) phone = '';
  if (!name || (!phone && !email)) throw createHttpError(409, 'Complete the booked customer name and valid phone or email');
  const data = { companyName: name, phone, email, contactPerson: String(c.contactPerson || '').trim(), gstNumber: String(c.gstin || '').trim().toUpperCase() };
  if (Object.prototype.hasOwnProperty.call(c, 'address')) {
    const address = typeof c.address === 'string' ? { line1: c.address } : c.address || {};
    data.address = Object.fromEntries(['line1', 'line2', 'city', 'state', 'pincode', 'country'].map(key => [key, String(address[key] || '').trim()]));
  }
  return data;
}
function compatible(client, data) {
  // Display/legal names can differ between the board and the client directory.
  // Establish identity through a shared contact/GST identifier, not name equality.
  const normalize = (key, value) => {
    const text = String(value || '').trim().toLowerCase();
    if (key !== 'phone') return text;
    const digits = text.replace(/\D/g, '');
    return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  };
  const identifiers = ['phone', 'email', 'gstNumber'].map(key => [normalize(key, client[key]), normalize(key, data[key])]);
  return identifiers.some(([existing, incoming]) => existing && incoming && existing === incoming)
    && identifiers.every(([existing, incoming]) => !existing || !incoming || existing === incoming);
}
async function resolveClient(companyId, cabin, actorId, version = 0, syncDetails = true) {
  if (!validBookedCabin(cabin)) throw createHttpError(409, 'Only booked customers are eligible');
  const bound = /^[a-f\d]{24}$/i.test(String(cabin.client.canonicalClientId))
    ? await Client.findOne({ _id: cabin.client.canonicalClientId, companyId }) : null;
  const data = identityData(!syncDetails && bound && cabin.client.billingBindingEstablished
    ? { ...cabin, client: { ...cabin.client, phone: cabin.client.phone || bound.phone, email: cabin.client.email || bound.email } }
    : cabin);
  const resolved = async found => {
    if (syncDetails) return updateBoundClient(found, data, companyId, actorId, version, cabin.client.billingBindingEstablished === true);
    const identifiers = ['phone', 'email', 'gstNumber'].filter(key => data[key]).map(key => ({ [key]: data[key] }));
    if (await Client.findOne({ companyId, _id: { $ne: found._id }, $or: identifiers })) {
      throw createHttpError(409, 'Customer contact details belong to another customer; review before billing');
    }
    return found;
  };
  if (cabin.client.billingBindingConflict) throw createHttpError(409, 'Cannot replace an established customer binding');
  if (bound) {
    if (!cabin.client.billingBindingEstablished && !compatible(bound, data)) throw createHttpError(409, 'Customer contact details conflict; review before billing');
    // Billing reads must not overwrite structured edits or reset an already synced customer.
    return resolved(bound);
  }
  // Never use a name alone or a foreign tenant's record. Check all matches so
  // shared phones and phone/email pointing at different customers fail safely.
  const identifiers = ['phone', 'email', 'gstNumber'].filter(key => data[key]).map(key => ({ [key]: data[key] }));
  const matches = await Client.find({ companyId, $or: identifiers }).limit(2);
  if (matches.length > 1) throw createHttpError(409, 'Customer contact details match multiple customers; review before billing');
  if (matches.length === 1) {
    if (!compatible(matches[0], data)) throw createHttpError(409, 'Customer contact details conflict; review before billing');
    return resolved(matches[0]);
  }
  // A tenant/contact-derived ID makes simultaneous retries and different cabins
  // for the same customer converge through Mongo's unique _id constraint.
  const key = data.phone ? `phone:${data.phone}` : `email:${data.email}`;
  const id = createHash('sha256').update(`${String(companyId).toLowerCase()}:${key}`).digest('hex').slice(0, 24);
  let found = await Client.findOne({ _id: id, companyId });
  if (!found) {
    try { found = await Client.create({ _id: id, companyId, clientCode: `BOARD-${id}`, ...data, status: 'ACTIVE', createdBy: actorId }); }
    catch (error) { if (error.code !== 11000) throw error; found = await Client.findOne({ _id: id, companyId }); }
  }
  if (!found || !compatible(found, data)) throw createHttpError(409, 'Customer identity conflicts; review before billing');
  return resolved(found);
}

async function resolveBookedCustomer(companyId, cabinCode, actorId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await Board.findOne({ companyId }).lean();
    const index = row?.state?.cabins?.findIndex(c => c.code === cabinCode) ?? -1;
    const cabin = row?.state?.cabins?.[index];
    if (!validBookedCabin(cabin)) throw createHttpError(409, 'Only booked customers are eligible');
    const identity = cabin.client.canonicalClientId || cabin.client.identityKey || cabin.contract?.id;
    const related = identity && row.state.cabins.filter(c => validBookedCabin(c)
      && (c.client.canonicalClientId || c.client.identityKey || c.contract?.id) === identity);
    if (related?.length > 1 && new Set(related.map(c => JSON.stringify(identityData(c)))).size > 1) {
      throw createHttpError(409, 'Conflicting customer details across cabins; review before billing');
    }
    const client = await resolveClient(companyId, cabin, actorId, row.version, false);
    const id = String(client._id);
    if (cabin.client.canonicalClientId === id && cabin.client.billingIdentityVerified && !cabin.client.billingIdentityError) return id;
    const binding = { ...cabin.client, canonicalClientId: id, billingIdentityVerified: true, billingBindingEstablished: true };
    delete binding.billingIdentityError;
    // Compare the snapshot as well as version: concurrent metadata repair does
    // not increment the business version and must not overwrite another repair.
    const saved = await Board.updateOne({ _id: row._id, companyId, version: row.version, 'state.cabins': row.state.cabins }, {
      $set: { [`state.cabins.${index}.client`]: binding },
    }, { timestamps: false });
    if (saved.matchedCount) return id;
  }
  throw createHttpError(409, 'Booking changed while preparing billing; retry shortly');
}

async function updateBoundClient(found, data, companyId, actorId, version, allowClear = true) {
  const identifiers = ['phone', 'email', 'gstNumber'].filter(key => data[key]).map(key => ({ [key]: data[key] }));
  const conflict = await Client.findOne({ companyId, _id: { $ne: found._id }, $or: identifiers });
  if (conflict) throw createHttpError(409, 'Customer contact details belong to another customer');
  const sourceHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  // Do not overwrite a newer board edit or repeatedly overwrite structured
  // client edits when the board's customer fields have not changed.
  if (found.billstack?.boardVersion > version) throw createHttpError(409, 'A newer customer edit is being processed');
  if (found.billstack?.boardSourceHash === sourceHash) {
    await Client.updateOne({ _id: found._id, companyId, 'billstack.boardVersion': { $lte: version } }, { $set: { 'billstack.boardVersion': version } }, { timestamps: false });
    return found;
  }
  const updates = allowClear ? data : Object.fromEntries(Object.entries(data).filter(([, value]) => typeof value === 'object' ? Object.values(value).some(Boolean) : Boolean(value)));
  const result = await Client.updateOne({ _id: found._id, companyId, $or: [
    { 'billstack.boardVersion': { $exists: false } }, { 'billstack.boardVersion': { $lte: version } },
  ] }, { $set: { ...updates, updatedBy: actorId, 'billstack.boardVersion': version, 'billstack.boardSourceHash': sourceHash, 'billstack.syncStatus': 'PENDING' } }, { runValidators: true });
  if (result && !result.matchedCount) throw createHttpError(409, 'A newer customer edit is being processed');
  return found;
}

async function bridgeSavedBoard(row) {
  if (!row?.billingBridgePending || !isBillstackEnabled(row.companyId)) return row;
  const state = JSON.parse(JSON.stringify(row.state));
  const ids = new Set();
  let transientFailure = false;
  const groups = new Map();
  for (const cabin of state.cabins || []) {
    if (!validBookedCabin(cabin)) continue;
    const key = cabin.client.canonicalClientId || cabin.client.identityKey || cabin.contract?.id || cabin.code;
    const members = groups.get(key) || [];
    members.push(cabin); groups.set(key, members);
  }
  const conflicts = new Set();
  for (const members of groups.values()) {
    try { if (new Set(members.map(cabin => JSON.stringify(identityData(cabin)))).size > 1) members.forEach(cabin => conflicts.add(cabin)); }
    catch { members.forEach(cabin => conflicts.add(cabin)); }
  }
  for (const cabin of state.cabins || []) {
    if (!validBookedCabin(cabin)) continue;
    try {
      if (conflicts.has(cabin)) throw createHttpError(409, 'Conflicting customer details across cabins');
      const client = await resolveClient(row.companyId, cabin, row.updatedBy, row.version);
      cabin.client.canonicalClientId = String(client._id);
      cabin.client.billingIdentityVerified = true;
      cabin.client.billingBindingEstablished = true;
      delete cabin.client.billingIdentityError;
      ids.add(String(client._id));
    } catch (error) {
      cabin.client.billingIdentityVerified = false;
      const transient = ![400, 409].includes(error.statusCode) && error.name !== 'ValidationError' && error.name !== 'CastError';
      if (transient) transientFailure = true;
      // A bad edit must not erase the customer's established identity.
      cabin.client.billingIdentityError = 'Customer identity needs review or complete contact details before billing';
    }
  }
  // CAS again: never overwrite a board edited while identities were resolved.
  const saved = await Board.findOneAndUpdate({ _id: row._id, companyId: row.companyId, version: row.version, 'state.cabins': row.state.cabins }, {
    $set: { state, billingBridgePending: true },
  }, { new: true, timestamps: false });
  if (!saved) return row;
  let scheduled = !transientFailure;
  for (const id of ids) {
    try {
      await Client.updateOne({ _id: id, companyId: row.companyId }, { $set: { 'billstack.syncStatus': 'PENDING' } });
      if (!await scheduleSafely(row.companyId, 'coworking-client', id)) scheduled = false;
    } catch { scheduled = false; }
  }
  if (scheduled) {
    try { await Board.updateOne({ _id: saved._id, companyId: row.companyId, version: saved.version }, { $set: { billingBridgePending: false } }); }
    catch { /* Keep the marker, but return the version we already persisted. */ }
  }
  return saved;
}
async function bridgeSafely(row) {
  try { return await bridgeSavedBoard(row); } catch { return row; }
}
async function reconcilePendingBoards(companyId) {
  const rows = await Board.find({ companyId, billingBridgePending: true }).limit(20);
  for (const row of rows) await bridgeSafely(row);
}
module.exports = { identityData, compatible, resolveClient, resolveBookedCustomer, bridgeSavedBoard, bridgeSafely, reconcilePendingBoards, preserveBindings };
