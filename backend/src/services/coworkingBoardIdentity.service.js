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
        // The server's link always wins; a browser that sent another one is flagged, not trusted.
        client.billingBindingConflict = Boolean(cabin.client.canonicalClientId)
          && String(cabin.client.canonicalClientId) !== String(old.client.canonicalClientId);
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

// A 10-digit mobile number (country code and spacing removed), or '' when there is none.
function phoneKey(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
  if (!/^\d{10}$/.test(phone)) phone = phone.length >= 10 ? phone.slice(-10) : '';
  return phone;
}
const emailKey = value => String(value || '').trim().toLowerCase();

function identityData(cabin) {
  const c = cabin?.client || {};
  // Priority: Company name first; if absent, use client name or contact person
  const companyName = String(c.companyName || '').trim();
  const individualName = String(c.name || c.contactPerson || '').trim();
  const displayName = companyName || individualName || ('Client ' + (cabin.code || 'Booking'));

  const phone = phoneKey(c.phone);
  const email = emailKey(c.email);
  const contactPerson = String(c.contactPerson || (companyName ? c.name : '') || '').trim();
  const gstRaw = String(c.gstin || c.gstNumber || '').trim().toUpperCase();
  const gstNumber = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstRaw) ? gstRaw : '';

  const data = {
    companyName: displayName,
    phone,
    email,
    contactPerson,
    gstNumber,
  };

  if (Object.prototype.hasOwnProperty.call(c, 'address')) {
    const address = typeof c.address === 'string' ? { line1: c.address } : c.address || {};
    data.address = Object.fromEntries(
      ['line1', 'line2', 'city', 'state', 'pincode', 'country'].map(key => [key, String(address[key] || '').trim()])
    );
  }
  return data;
}

const nameKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Two names describe the same party when equal after normalising, or one
// contains the other ("Credifin" / "Credifin Limited"). Shared phone numbers
// and e-mail addresses alone never prove it.
function sameParty(a, b) {
  const [x, y] = [nameKey(a), nameKey(b)];
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)));
}

// The contact details agree: at least one phone / email present on both sides and equal, and
// none present on both sides and different. A name alone never makes two records compatible.
function compatible(client, data) {
  let agreed = false;
  for (const [a, b] of [[phoneKey(client?.phone), phoneKey(data?.phone)], [emailKey(client?.email), emailKey(data?.email)]]) {
    if (!a || !b) continue;
    if (a !== b) return false;
    agreed = true;
  }
  return agreed;
}

// Cabins of one client (same board client id, else same identity key) must not disagree on a
// phone, email or GSTIN that both of them carry; a blank on one side is filled from the other.
function cabinGroupKey(cabin) {
  const c = cabin?.client || {};
  return c.id ? 'id:' + c.id : c.identityKey ? 'key:' + c.identityKey : '';
}
function conflictingCabins(cabin, boardCabins = []) {
  const key = cabinGroupKey(cabin);
  if (!key) return null;
  const group = boardCabins.filter(other => validBookedCabin(other) && cabinGroupKey(other) === key);
  const fields = [];
  for (const field of ['phone', 'email', 'gstNumber']) {
    const values = new Set(group.map(other => identityData(other)[field]).filter(Boolean));
    if (values.size > 1) fields.push(field === 'gstNumber' ? 'GSTIN' : field);
  }
  return fields.length ? { codes: group.map(other => other.code), fields } : null;
}

async function resolveClient(companyId, cabin, actorId, version = 0, syncDetails = true, boardCabins = []) {
  if (!validBookedCabin(cabin)) throw createHttpError(409, 'Only booked customers are eligible');
  const conflict = conflictingCabins(cabin, boardCabins);
  if (conflict) {
    throw createHttpError(409, `Conflicting customer details in cabins ${conflict.codes.join(', ')} (${conflict.fields.join(', ')}): make them the same before billing`);
  }
  const bound = /^[a-f\d]{24}$/i.test(String(cabin.client?.canonicalClientId))
    ? await Client.findOne({ _id: cabin.client.canonicalClientId, companyId }) : null;

  const data = identityData(!syncDetails && bound && cabin.client?.billingBindingEstablished
    ? { ...cabin, client: { ...cabin.client, phone: cabin.client.phone || bound.phone, email: cabin.client.email || bound.email } }
    : cabin);
  // Without a phone or email the customer can't be told apart from another of the same name, and
  // BillStack has nowhere to send the invoice.
  if (!data.phone && !data.email) {
    throw createHttpError(409, "Add the client's phone number or email before billing");
  }

  const resolved = async (found) => {
    if (syncDetails) return updateBoundClient(found, data, companyId, actorId, version, cabin.client?.billingBindingEstablished === true);
    return found;
  };

  // A renamed client keeps its binding. A binding is a wrong merge when it points
  // at a client that clearly belongs to ANOTHER booked cabin on the board (same
  // name as that cabin's client, different from this one) - typically two
  // companies sharing a contact person's phone number - or when both its name
  // and its contact details contradict this cabin.
  const contradicts = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() !== String(b).toLowerCase();
  const otherOwner = bound && !sameParty(bound.companyName, data.companyName) && boardCabins.some(other =>
    other !== cabin && validBookedCabin(other)
    && other.client?.id && other.client.id !== cabin.client?.id
    && sameParty(other.client.companyName || other.client.name, bound.companyName));
  const wrongMerge = bound && (otherOwner || (!sameParty(bound.companyName, data.companyName)
    && (contradicts(bound.phone, data.phone) || contradicts(bound.email, data.email))));
  if (bound && !wrongMerge) {
    return resolved(bound);
  }

  const identifiers = [];
  if (data.phone) identifiers.push({ phone: data.phone });
  if (data.email) identifiers.push({ email: data.email });
  if (data.companyName) identifiers.push({ companyName: data.companyName });

  const candidates = identifiers.length > 0 ? await Client.find({ companyId, $or: identifiers }).limit(25) : [];
  const byId = new Map();
  for (const row of [
    ...candidates.filter(row => nameKey(row.companyName) === nameKey(data.companyName)),
    ...candidates.filter(row => sameParty(row.companyName, data.companyName)),
  ]) byId.set(String(row._id), row);
  let matches = [...byId.values()];
  // Several customers fit the name: keep those whose phone / email agree. If that still leaves more
  // than one, refuse rather than guess which customer to bill.
  if (matches.length > 1) {
    const agreeing = matches.filter(row => compatible(row, data));
    if (agreeing.length === 1) matches = agreeing;
    else {
      const names = (agreeing.length ? agreeing : matches).slice(0, 3).map(row => row.clientCode || String(row._id));
      throw createHttpError(409, `This client fits multiple customers (${names.join(', ')}): merge them or correct the phone / email`);
    }
  }
  if (matches.length > 0) {
    return resolved(matches[0]);
  }

  const key = [data.phone ? ('phone:' + data.phone) : (data.email ? ('email:' + data.email) : ''), 'name:' + nameKey(data.companyName)].join('|');
  const id = createHash('sha256').update(String(companyId).toLowerCase() + ':' + key).digest('hex').slice(0, 24);
  let found = await Client.findOne({ _id: id, companyId });
  if (!found) {
    try {
      found = await Client.create({
        _id: id,
        companyId,
        clientCode: 'BOARD-' + id,
        ...data,
        status: 'ACTIVE',
        createdBy: actorId,
      });
    } catch (error) {
      if (error.code !== 11000) {
        found = await Client.create({
          companyId,
          clientCode: 'BOARD-' + Date.now(),
          ...data,
          status: 'ACTIVE',
          createdBy: actorId,
        });
      } else {
        found = await Client.findOne({ _id: id, companyId });
      }
    }
  }
  return resolved(found);
}

async function resolveBookedCustomer(companyId, cabinCode, actorId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await Board.findOne({ companyId }).lean();
    const index = row?.state?.cabins?.findIndex(c => c.code === cabinCode) ?? -1;
    const cabin = row?.state?.cabins?.[index];
    if (!validBookedCabin(cabin)) throw createHttpError(409, 'Only booked customers are eligible');

    const client = await resolveClient(companyId, cabin, actorId, row.version, false, row.state.cabins);
    const id = String(client._id);
    if (cabin.client?.canonicalClientId === id && cabin.client?.billingIdentityVerified && !cabin.client?.billingIdentityError) {
      return id;
    }
    const binding = { ...cabin.client, canonicalClientId: id, billingIdentityVerified: true, billingBindingEstablished: true };
    delete binding.billingIdentityError;
    delete binding.billingBindingConflict;

    const saved = await Board.updateOne({ _id: row._id, companyId, version: row.version, 'state.cabins': row.state.cabins }, {
      $set: { ['state.cabins.' + index + '.client']: binding },
    }, { timestamps: false });
    if (saved.matchedCount) return id;
  }
  throw createHttpError(409, 'Booking changed while preparing billing; retry shortly');
}

async function updateBoundClient(found, data, companyId, actorId, version, allowClear = true) {
  const sourceHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  // A newer board save has already written this customer: an older one (a delayed retry) must not
  // put back the details it replaced.
  if (Number(found.billstack?.boardVersion) > Number(version)) {
    throw createHttpError(409, 'A newer save of the board already updated this customer; save the board again');
  }
  if (found.billstack?.boardSourceHash === sourceHash) {
    await Client.updateOne({ _id: found._id, companyId }, { $set: { 'billstack.boardVersion': version } }, { timestamps: false });
    return found;
  }
  const updates = allowClear
    ? data
    : Object.fromEntries(Object.entries(data).filter(([, value]) => typeof value === 'object' ? Object.values(value).some(Boolean) : Boolean(value)));
  await Client.updateOne(
    { _id: found._id, companyId },
    { $set: { ...updates, updatedBy: actorId, 'billstack.boardVersion': version, 'billstack.boardSourceHash': sourceHash, 'billstack.syncStatus': 'PENDING' } },
    { runValidators: false }
  );
  return found;
}

async function bridgeSavedBoard(row) {
  if (!row?.billingBridgePending || !isBillstackEnabled(row.companyId)) return row;
  const state = JSON.parse(JSON.stringify(row.state));
  const ids = new Set();
  let transientFailure = false;

  for (const cabin of state.cabins || []) {
    if (!validBookedCabin(cabin)) continue;
    if (cabin.client.billingBindingConflict) {
      // Keep the server's link, but don't certify or sync it until someone confirms it from Billing.
      cabin.client.billingIdentityVerified = false;
      cabin.client.billingIdentityError = 'The customer link was changed outside the server; open Billing for this cabin to confirm it';
      continue;
    }
    try {
      const client = await resolveClient(row.companyId, cabin, row.updatedBy, row.version, true, state.cabins);
      cabin.client.canonicalClientId = String(client._id);
      cabin.client.billingIdentityVerified = true;
      cabin.client.billingBindingEstablished = true;
      delete cabin.client.billingIdentityError;
      delete cabin.client.billingBindingConflict;
      ids.add(String(client._id));
    } catch (error) {
      cabin.client.billingIdentityVerified = false;
      const transient = ![400, 409].includes(error.statusCode) && error.name !== 'ValidationError' && error.name !== 'CastError';
      if (transient) transientFailure = true;
      cabin.client.billingIdentityError = error.message || 'Customer identity needs review';
    }
  }

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
    catch { /* Keep marker */ }
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
