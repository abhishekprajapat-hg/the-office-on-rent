const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const companyId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const entityId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const actorId = 'cccccccccccccccccccccccc';
const otherCompany = 'dddddddddddddddddddddddd';
const inventoryId = 'eeeeeeeeeeeeeeeeeeeeeeee';
const q = value => ({ select() { return this; }, sort() { return this; }, populate() { return this; }, limit() { return this; }, lean() { return Promise.resolve(value); }, then(a,b) { return Promise.resolve(value).then(a,b); } });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function load(relative, stubs = {}, extra = '') {
  const filename = path.resolve(__dirname, '../src', relative);
  stubs = { '../config/billstack': { getBillstackConfig() {}, isBillstackEnabled: () => true, configuredCompany: () => companyId }, ...stubs };
  const module = { exports: {} }, localRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + extra, { module, exports: module.exports, require: name => name in stubs ? stubs[name] : localRequire(name), process, console, Date, URL, setTimeout, clearTimeout, setInterval, clearInterval, Buffer }, { filename });
  return module.exports;
}
const core = require('../src/services/billstackCustomer.service');
const get = (obj, key) => key.split('.').reduce((v,k) => v?.[k], obj);
function matches(row, filter) {
  return Boolean(row) && Object.entries(filter).every(([k,v]) => {
    if (k === '$or') return v.some(f => matches(row, f));
    const current = get(row,k);
    if (v && typeof v === 'object' && !(v instanceof Date)) return Object.entries(v).every(([op,value]) => op === '$ne' ? current !== value : op === '$in' ? value.includes(current) : op === '$lte' ? current <= value : op === '$exists' ? (current !== undefined) === value : false);
    return String(current) === String(v);
  });
}
function apply(row, update) {
  for (const [key,value] of Object.entries(update.$set || {})) {
    const keys = key.split('.'); let obj = row;
    while (keys.length > 1) { const part = keys.shift(); obj[part] ||= {}; obj = obj[part]; }
    obj[keys[0]] = value;
  }
  for (const [key,value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
}
function queueHarness({ fail = false, onUpsert = () => {} } = {}) {
  const rows = new Map();
  const entity = { _id: entityId, companyId, name: 'Customer', phone: '9876543210', status: 'CLOSED', billstack: {} };
  let calls = 0;
  const Job = {
    async updateOne(filter, update, options) {
      let row = rows.get(filter._id);
      if (!row && options?.upsert) { row = { _id: filter._id, status: 'PENDING', attempts: 0, nextRetryAt: new Date(), ...update.$setOnInsert }; rows.set(row._id, row); }
      if (!matches(row, filter)) return { matchedCount: 0 };
      apply(row, update); return { matchedCount: 1 };
    },
    findById: id => q(rows.get(id)),
    async findOneAndUpdate(filter, update) { const row = rows.get(filter._id); if (!matches(row, filter)) return null; apply(row, update); return { ...row }; },
    async exists(filter) { return matches(rows.get(filter._id), filter); },
  };
  const Model = { async updateOne(filter, update) { assert.equal(String(filter.companyId), companyId); apply(entity, update); return { matchedCount: 1 }; } };
  const service = load('services/billstackSync.service.js', {
    '../models/BillstackSyncJob': Job,
    '../config/billstack': { getBillstackConfig() {}, isBillstackEnabled: () => true, configuredCompany: () => companyId },
    './billstack.service': { async upsertCustomer() { calls++; onUpsert(entity); if (fail) throw typeof fail === 'object' ? fail : Object.assign(new Error('BillStack is unavailable; retry shortly'), { statusCode: 502 }); return 'remote-customer'; } },
    './billstackCustomer.service': { ...core, modelFor: () => Model, async loadEligible(company, type, id) { assert.equal(String(company), companyId); if (entity.status !== 'CLOSED') throw Object.assign(new Error('Only closed customers are eligible'), { statusCode: 409 }); return entity; } },
  });
  return { service, rows, entity, calls: () => calls, recover() { fail = false; } };
}

test('repeated closed scheduling has one external identity and one successful remote upsert', async () => {
  const h = queueHarness();
  const first = await h.service.schedule(companyId, 'lead', entityId);
  await h.service.schedule(companyId, 'lead', entityId);
  assert.equal(h.rows.size, 1);
  await Promise.all([h.service.processJob(first._id), h.service.processJob(first._id)]);
  await h.service.schedule(companyId, 'lead', entityId);
  assert.equal(h.calls(), 1);
  assert.equal(h.entity.billstack.customerId, 'remote-customer');
});
test('ObjectId casing cannot create a second sync identity', async () => {
  const h = queueHarness();
  await h.service.schedule(companyId, 'lead', entityId);
  await h.service.schedule(companyId, 'lead', entityId.toUpperCase());
  assert.equal(h.rows.size, 1);
  assert.equal(core.externalId(companyId, 'lead', entityId.toUpperCase()), core.externalId(companyId, 'lead', entityId));
});
test('outage is durable, leaves customer CLOSED, and retry recovers', async () => {
  const h = queueHarness({ fail: true });
  const job = await h.service.schedule(companyId, 'lead', entityId);
  assert.equal(await h.service.processJob(job._id), false);
  assert.equal(h.entity.status, 'CLOSED');
  assert.equal(h.rows.get(job._id).status, 'FAILED');
  assert.ok(h.rows.get(job._id).nextRetryAt > new Date());
  h.recover();
  await h.service.schedule(companyId, 'lead', entityId, true);
  assert.equal(await h.service.processJob(job._id), true);
  assert.equal(h.entity.billstack.syncStatus, 'SYNCED');
});
test('a non-CLOSED lead never reaches BillStack', async () => {
  const h = queueHarness(); h.entity.status = 'INTERESTED';
  await assert.rejects(h.service.schedule(companyId, 'lead', entityId), /closed/);
  assert.equal(h.calls(), 0); assert.equal(h.rows.size, 0);
});
test('expired lease can be reclaimed, live lease cannot', async () => {
  const h = queueHarness(); const job = await h.service.schedule(companyId, 'lead', entityId);
  job.status = 'PROCESSING'; job.leaseUntil = new Date(Date.now()+50000);
  assert.equal(await h.service.processJob(job._id), false);
  job.leaseUntil = new Date(0);
  assert.equal(await h.service.processJob(job._id), true);
});
test('changed customer attributes update under the same external ID', async () => {
  const h = queueHarness(); const job = await h.service.schedule(companyId, 'lead', entityId);
  await h.service.processJob(job._id); h.entity.email = 'new@example.test';
  await h.service.schedule(companyId, 'lead', entityId); await h.service.processJob(job._id);
  assert.equal(h.calls(), 2); assert.equal(h.rows.size, 1);
});
test('customer edits during an in-flight upsert remain pending for another attempt', async () => {
  const h = queueHarness({ onUpsert(entity) { entity.email = 'changed@example.test'; } });
  const job = await h.service.schedule(companyId, 'lead', entityId);
  assert.equal(await h.service.processJob(job._id), false);
  assert.equal(h.entity.billstack.syncStatus, 'PENDING');
  await h.service.schedule(companyId, 'lead', entityId);
  assert.equal(await h.service.processJob(job._id), true);
});

function leadHarness() {
  const scheduled = [], events = [];
  const lead = { _id: entityId, companyId, name: 'Customer', phone: '9876543210', status: 'INTERESTED', inventoryId, brokerageReceived: 100,
    dealPayment: { mode: 'CASH', paymentType: 'FULL', remainingAmount: 0 },
    set(key,value) { apply(this, { $set: { [key]: value } }); }, async save() { events.push('lead-saved'); } };
  const request = { _id: actorId, companyId, lead: entityId, proposedStatus: 'CLOSED', proposedBrokerage: { brokerageReceived: 100 }, proposedSaleMeta: { paymentMode: 'CASH', paymentType: 'FULL' }, async save() { events.push('request-saved'); } };
  const inventory = { _id: inventoryId, companyId, status: 'Available', price: 1000, async save() { events.push('inventory-saved'); } };
  const controller = load('controllers/lead.controller.js', {
    '../models/Lead': { findOne: () => q(lead) }, '../models/Inventory': { findOne: () => q(inventory) },
    '../models/LeadStatusRequest': { findOne: () => q(request), findById: () => q(request) },
    '../models/leadActivity.model': { async create() {} },
    '../config/logger': { error(error) { events.push(error.error); } },
    '../services/billstackSync.service': { async scheduleSafely(...args) { events.push('scheduled'); scheduled.push(args); return null; } },
  });
  const req = { params: { leadId: entityId, requestId: actorId }, user: { _id: actorId, companyId, role: 'ADMIN' }, body: { status: 'CLOSED' }, app: { get: () => null } };
  return { controller, lead, req, events, scheduled, inventory };
}
test('direct closure persists sold inventory and CLOSED before scheduling', async () => {
  const h = leadHarness(), res = response();
  await h.controller.updateLeadStatus(h.req, res);
  assert.equal(res.code, 200, JSON.stringify(h.events));
  assert.equal(h.lead.status, 'CLOSED'); assert.equal(h.inventory.status, 'Sold');
  assert.ok(h.events.indexOf('scheduled') > h.events.indexOf('lead-saved'));
  assert.equal(h.scheduled.length, 1);
});
test('approved closure request schedules after both lead and request persistence', async () => {
  const h = leadHarness(), res = response();
  await h.controller.approveLeadStatusRequest(h.req, res);
  assert.equal(res.code, 200, JSON.stringify(h.events));
  assert.equal(h.lead.status, 'CLOSED');
  assert.ok(h.events.indexOf('scheduled') > h.events.indexOf('request-saved'));
});
test('ordinary status update does not schedule sync', async () => {
  const h = leadHarness(), res = response(); h.req.body.status = 'CONTACTED';
  await h.controller.updateLeadStatus(h.req, res);
  assert.equal(res.code, 200); assert.equal(h.scheduled.length, 0);
});

const cabin = (code = 'A1', status = 'BOOKED') => ({ code, status, client: { name: 'Customer Co', phone: '9876543210', identityKey: 'uuid-one' }, contract: { id: 'AGR-1', startDate: '2026-09-01', endDate: '2027-09-01' } });
function boardHarness(cabins, conflict = false) {
  const clients = new Map(), scheduled = [];
  const row = { _id: entityId, companyId, updatedBy: actorId, version: 3, billingBridgePending: true, state: { cabins, activity: [] } };
  const service = load('services/coworkingBoardIdentity.service.js', {
    '../models/CoworkingClient': {
      find(filter) { return q([...clients.values()].filter(c => matches(c, filter))); },
      async findOne(filter) { return [...clients.values()].find(c => matches(c, filter)) || null; },
      async create(data) { if (clients.has(data._id)) throw Object.assign(new Error('duplicate'), { code: 11000 }); clients.set(data._id, data); return data; }, async updateOne(filter, update) { const row = [...clients.values()].find(c => matches(c, filter)); if (!row) return { matchedCount: 0 }; apply(row, update); return { matchedCount: 1 }; },
    },
    '../models/CoworkingBoardState': {
      findOne(filter) { assert.equal(filter.companyId, companyId); return q(structuredClone(row)); },
      async findOneAndUpdate(filter, update) { assert.equal(filter.version, 3); if (conflict) return null; apply(row, update); return row; },
      async updateOne(filter, update) {
        if (conflict) return { matchedCount: 0 };
        assert.equal(filter.companyId, companyId);
        if (!filter['state.cabins']) return { matchedCount: 1 };
        if (JSON.stringify(filter['state.cabins']) !== JSON.stringify(row.state.cabins)) return { matchedCount: 0 };
        apply(row, update); return { matchedCount: 1 };
      },
    },
    './billstackSync.service': { async scheduleSafely(...args) { scheduled.push(args); return {}; } },
  });
  return { service, clients, scheduled, row };
}
test('BOOKED board customer resolves stable canonical ID and deduplicates multiple cabins', async () => {
  const h = boardHarness([cabin('A1'), cabin('A2')]);
  await h.service.bridgeSavedBoard(h.row);
  assert.equal(h.clients.size, 1); assert.equal(h.scheduled.length, 1);
  assert.equal(h.row.state.cabins[0].client.canonicalClientId, h.row.state.cabins[1].client.canonicalClientId);
  assert.match(h.scheduled[0][2], /^[a-f\d]{24}$/);
});
test('RESERVED and historical snapshots never become canonical customers', async () => {
  const c = cabin('A1', 'RESERVED'); c.previousClients = [cabin().client];
  const h = boardHarness([c]); await h.service.bridgeSavedBoard(h.row);
  assert.equal(h.clients.size, 0); assert.equal(h.scheduled.length, 0);
});
test('incomplete BOOKED placeholder is flagged without synchronization', async () => {
  const c = cabin(); c.client.phone = '';
  const h = boardHarness([c]); await h.service.bridgeSavedBoard(h.row);
  assert.equal(h.scheduled.length, 0); assert.ok(h.row.state.cabins[0].client.billingIdentityError);
});
test('board CAS conflict never schedules an unpersisted canonical binding', async () => {
  const h = boardHarness([cabin()], true); await h.service.bridgeSavedBoard(h.row);
  assert.equal(h.scheduled.length, 0); assert.equal(h.row.version, 3);
});
test('foreign-company canonical ID is never reused; recovery creates a tenant-local customer', async () => {
  const h = boardHarness([cabin()]); h.row.state.cabins[0].client.canonicalClientId = actorId;
  h.clients.set(actorId, { _id: actorId, companyId: otherCompany, companyName: 'Customer Co', phone: '9876543210' });
  await h.service.bridgeSavedBoard(h.row);
  assert.equal(h.scheduled.length, 1);
  const id = h.row.state.cabins[0].client.canonicalClientId;
  assert.notEqual(id, actorId); assert.equal(h.clients.get(id).companyId, companyId);
  assert.equal(h.clients.get(actorId).companyId, otherCompany);
});

for (const stale of [undefined, actorId, 'old-invalid-id']) test(`billing repairs ${stale || 'missing'} binding without a contract`, async () => {
  const c = cabin('TEST-ROOM'); delete c.contract;
  c.client.canonicalClientId = stale;
  c.client.billingIdentityError = 'Old identity failure';
  const h = boardHarness([c]);
  const id = await h.service.resolveBookedCustomer(companyId, c.code, actorId);
  assert.equal(h.clients.size, 1);
  assert.equal(h.row.state.cabins[0].client.canonicalClientId, id);
  assert.equal(h.row.state.cabins[0].client.billingIdentityError, undefined);
  assert.equal(await h.service.resolveBookedCustomer(companyId, c.code, actorId), id);
  assert.equal(h.clients.size, 1);
});

for (const contact of ['phone', 'email']) test(`billing resolves an existing customer by ${contact}`, async () => {
  const c = cabin('TEST-ROOM'); delete c.contract;
  if (contact === 'email') { c.client.phone = ''; c.client.email = ' CUSTOMER@EXAMPLE.TEST '; }
  else c.client.phone = '+91 98765 43210';
  const h = boardHarness([c]);
  h.clients.set(entityId, { _id: entityId, companyId, companyName: c.client.name,
    [contact]: contact === 'phone' ? '9876543210' : 'customer@example.test',
    billstack: { syncStatus: 'SYNCED', customerId: 'existing-remote' } });
  assert.equal(await h.service.resolveBookedCustomer(companyId, c.code, actorId), entityId);
  assert.equal(h.clients.size, 1);
  assert.equal(h.clients.get(entityId).billstack.syncStatus, 'SYNCED');
  assert.equal(h.clients.get(entityId).billstack.customerId, 'existing-remote');
});

test('valid established binding keeps the canonical identity and synced state', async () => {
  const c = cabin(); c.client.canonicalClientId = entityId; c.client.billingBindingEstablished = true;
  const h = boardHarness([c]);
  h.clients.set(entityId, { _id: entityId, companyId, companyName: 'Updated structured name', phone: c.client.phone,
    billstack: { syncStatus: 'SYNCED', customerId: 'remote' } });
  assert.equal(await h.service.resolveBookedCustomer(companyId, c.code, actorId), entityId);
  assert.equal(h.clients.get(entityId).companyName, 'Updated structured name');
  assert.equal(h.clients.get(entityId).billstack.syncStatus, 'SYNCED');
  h.row.state.cabins[0].client.phone = '';
  assert.equal(await h.service.resolveBookedCustomer(companyId, c.code, actorId), entityId, 'canonical contact is usable when legacy board contact is missing');
});

test('repeated board handoff repairs identity, syncs once and preserves invoice source', async () => {
  const c = cabin('TEST-ROOM'); c.contract = { monthlyRent: 0 };
  const board = boardHarness([c]);
  const queue = queueHarness(); queue.entity.companyName = c.client.name;
  board.clients.set(entityId, queue.entity);
  const customer = contextHarness({ cabins: board.row.state.cabins, entity: queue.entity });
  const contexts = [];
  const controller = load('controllers/billstack.controller.js', {
    '../services/access.service': { hasPermission: async () => true },
    '../services/coworkingBoardIdentity.service': board.service,
    '../services/billstackCustomer.service': { ...customer,
      buildBillingContext: (...args) => contextHarness({ cabins: board.row.state.cabins }).buildBillingContext(...args) },
    '../services/billstackSync.service': queue.service,
    '../services/billstack.service': { async createInvoiceHandoff(company, remote, context) {
      assert.equal(company, companyId); assert.equal(remote, 'remote-customer');
      contexts.push(context); return 'https://billing.example.test/invoice';
    } },
  });
  for (let i = 0; i < 2; i++) {
    const res = response();
    await controller.handoff({ user: { companyId, _id: actorId }, params: { type: 'board', id: c.code } }, res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
  }
  assert.equal(queue.calls(), 1); assert.equal(queue.rows.size, 1);
  assert.equal(JSON.stringify(contexts[0].sourceRef), JSON.stringify(contexts[1].sourceRef));
  assert.equal(contexts[0].prefill.lineItems[0].rateReliable, true);
  assert.equal(contexts[0].prefill.lineItems[0].rate, 0);
});

test('ambiguous phone/email recovery does not create or bind another customer', async () => {
  const c = cabin(); c.client.email = 'customer@example.test';
  const h = boardHarness([c]);
  h.clients.set(entityId, { _id: entityId, companyId, companyName: c.client.name, phone: c.client.phone });
  h.clients.set(actorId, { _id: actorId, companyId, companyName: c.client.name, email: c.client.email });
  await assert.rejects(h.service.resolveBookedCustomer(companyId, c.code, actorId), /multiple customers/);
  assert.equal(h.clients.size, 2); assert.equal(c.client.canonicalClientId, undefined);
});

test('non-BOOKED billing requests reject before identity creation', async () => {
  const c = cabin('TEST-ROOM', 'RESERVED'), h = boardHarness([c]);
  await assert.rejects(h.service.resolveBookedCustomer(companyId, c.code, actorId), /Only booked/);
  assert.equal(h.clients.size, 0);
});

test('a concurrent board edit cannot receive a stale billing binding', async () => {
  const c = cabin(), h = boardHarness([c], true);
  await assert.rejects(h.service.resolveBookedCustomer(companyId, c.code, actorId), /Booking changed/);
  assert.equal(c.client.canonicalClientId, undefined);
  assert.equal(h.clients.size, 1, 'retries converge on one customer');
});

test('concurrent first billing requests converge on one customer and binding', async () => {
  const c = cabin('TEST-ROOM'), h = boardHarness([c]);
  const ids = await Promise.all([
    h.service.resolveBookedCustomer(companyId, c.code, actorId),
    h.service.resolveBookedCustomer(companyId, c.code, actorId),
  ]);
  assert.equal(ids[0], ids[1]); assert.equal(h.clients.size, 1);
  assert.equal(h.row.state.cabins[0].client.canonicalClientId, ids[0]);
});

test('name and email alone satisfy canonical model and BillStack payload', () => {
  const c = cabin(); c.client.phone = ''; c.client.email = 'billing@example.test';
  const h = boardHarness([c]);
  const data = h.service.identityData(c);
  const Client = require('../src/models/CoworkingClient');
  const client = new Client({ ...data, _id: entityId, companyId, createdBy: actorId, clientCode: 'TEST-CUSTOMER' });
  assert.equal(client.validateSync(), undefined);
  const payload = core.customerPayload(companyId, 'coworking-client', client);
  assert.equal(payload.phone, ''); assert.equal(payload.email, c.client.email);
});

function contextHarness({ cabins = [], contract = null, booking = null, entity } = {}) {
  return load('services/billstackCustomer.service.js', {
    '../models/CoworkingBoardState': { findOne(filter) { assert.equal(filter.companyId, companyId); return q({ state: { cabins } }); } },
    '../models/CoworkingClient': { findOne(filter) { assert.equal(filter.companyId, companyId); return q(entity); } },
    '../models/CoworkingContract': { findOne: () => q(contract), exists: async () => false },
    '../models/CoworkingBooking': { findOne: () => q(booking), exists: async () => false },
  });
}

for (const source of ['board', 'contract', 'booking']) for (const amount of [0, null, undefined, '', 'invalid', 1200]) {
  test(`${source} prefill distinguishes amount ${String(amount)} from intentional zero`, async () => {
    const c = cabin('TEST-ROOM'); c.client.canonicalClientId = entityId;
    c.contract.monthlyRent = amount;
    const entity = { _id: entityId, companyName: c.client.name };
    const service = contextHarness({ cabins: [c],
      contract: source === 'contract' ? { _id: actorId, rent: amount } : null,
      booking: source === 'booking' ? { _id: actorId, price: amount } : null });
    const first = await service.buildBillingContext(companyId, 'coworking-client', entity, c.code);
    const second = await service.buildBillingContext(companyId, 'coworking-client', entity, c.code);
    const item = first.prefill.lineItems[0];
    assert.equal(item.rate, typeof amount === 'number' ? amount : 0);
    assert.equal(item.rateReliable, typeof amount === 'number');
    assert.equal(first.billingType, 'COWORKING'); assert.equal(first.billingEntityCode, '');
    assert.deepEqual(first.sourceRef, second.sourceRef, 'repeated handoff keeps duplicate prevention key');
  });
}

test('BOOKED canonical client is eligible without agreement dates; same name alone cannot prefill another client', async () => {
  const c = cabin(); delete c.contract; c.client.canonicalClientId = entityId;
  const entity = { _id: entityId, companyName: c.client.name };
  const service = contextHarness({ cabins: [c], entity });
  assert.equal((await service.loadEligible(companyId, 'coworking-client', entityId))._id, entityId);
  const other = await service.buildBillingContext(companyId, 'coworking-client', { ...entity, _id: actorId });
  assert.equal(other.sourceRef.sourceType, 'coworking-client');
});

test('residential and commercial zero brokerage retain entity routing', async () => {
  for (const inventoryType of ['RESIDENTIAL', 'COMMERCIAL']) {
    const context = await core.buildBillingContext(companyId, 'lead', { _id: entityId, brokerageReceived: 0, requirements: { inventoryType } });
    assert.equal(context.billingEntityCode, inventoryType === 'RESIDENTIAL' ? 'GOLDHAWK' : '');
    assert.equal(context.prefill.lineItems[0].rate, 0);
    assert.equal(context.prefill.lineItems[0].rateReliable, true);
  }
});

for (const [role, override, allowed] of [
  ['ADMIN', undefined, true], ['MANAGER', undefined, true], ['EXECUTIVE', undefined, false],
  ['COWORKING_ADMIN', undefined, false], ['EXECUTIVE', [{ pageKey: 'billing', actions: ['create_invoice'] }], true],
  ['EXECUTIVE', [{ pageKey: 'billing', actions: ['view'] }], false],
]) test(`billing authorization: ${role} ${JSON.stringify(override)} => ${allowed}`, async () => {
  const access = load('services/access.service.js', { '../models/RolePermission': { findOne: () => q(null) } });
  const middleware = load('middleware/permission.middleware.js', { '../services/permission.service': access });
  const res = response(); let passed = false;
  await middleware.requirePermission('page.billing.create_invoice')({ user: { companyId, role, pageAccessOverride: override } }, res, () => { passed = true; });
  assert.equal(passed, allowed); if (!allowed) assert.equal(res.code, 403);
});
test('API key is backend-owned, HTTP redirects disabled, response parsing isolated', async () => {
  let request;
  const service = load('services/billstack.service.js', {
    axios: { async post(url, payload, options) { request = { url, payload, options }; return { data: { customerId: 'remote-id' } }; } },
    '../config/billstack': { getBillstackConfig: () => ({ baseUrl: 'https://billing.example.test', origin: 'https://billing.example.test', apiKey: 'test-backend-key' }) },
  });
  assert.equal(await service.upsertCustomer(companyId, { externalId: 'stable' }), 'remote-id');
  assert.equal(request.options.headers['X-Billstack-Api-Key'], 'test-backend-key'); assert.equal(request.options.maxRedirects, 0);
  assert.throws(() => service.parseCustomerResponse({ id: 'guessed' }), /invalid customer/);
});
test('remote errors cannot leak request headers or response bodies', async () => {
  const service = load('services/billstack.service.js', {
    axios: { async post() { throw { message: 'secret', config: { headers: { key: 'secret' } }, response: { status: 500, data: 'secret' } }; } },
    '../config/billstack': { getBillstackConfig: () => ({ baseUrl: 'https://billing.example.test', apiKey: 'secret' }) },
  });
  await assert.rejects(service.upsertCustomer(companyId, {}), error => !JSON.stringify(error).includes('secret') && /unavailable/.test(error.message));
});
test('handoff rejects destinations outside the configured BillStack origin', async () => {
  const service = load('services/billstack.service.js', {
    axios: { async post() { return { data: { handoffUrl: 'https://attacker.example/steal' } }; } },
    '../config/billstack': { getBillstackConfig: () => ({ baseUrl: 'https://billing.example.test', origin: 'https://billing.example.test', apiKey: 'test' }) },
  });
  await assert.rejects(service.createInvoiceHandoff(companyId, 'customer'), /invalid handoff/);
});
test('company binding rejects another tenant before any network request', () => {
  const config = load('config/billstack.js');
  const names = ['BILLSTACK_COMPANY_ID', 'BILLSTACK_BASE_URL', 'BILLSTACK_FRONTEND_URL', 'BILLSTACK_API_KEY', 'NODE_ENV'];
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, { NODE_ENV: 'production', BILLSTACK_COMPANY_ID: companyId, BILLSTACK_BASE_URL: 'https://api.example.test', BILLSTACK_FRONTEND_URL: 'https://app.example.test', BILLSTACK_API_KEY: 'test-only' });
  try { assert.throws(() => config.getBillstackConfig(otherCompany), /not enabled/); }
  finally { for (const name of names) if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; }
});
test('handoff uses eligible CRM entity, ignores browser customer ID and API key', async () => {
  let resolved, received;
  const controller = load('controllers/billstack.controller.js', {
    '../services/access.service': { async hasPermission() { return true; } },
    './lead.controller': { async findAccessibleLeadById() { return {}; } },
    '../services/billstackCustomer.service': { ...core, async loadEligible() { return { status: 'CLOSED' }; } },
    '../services/billstackSync.service': { async ensureSynced(...args) { resolved = args; return 'canonical-remote'; }, safeError: e => e.message },
    '../services/billstack.service': { async createInvoiceHandoff(company, id) { received = id; return 'https://billing.example/handoff'; } },
  });
  const res = response();
  await controller.handoff({ user: { companyId }, params: { type: 'lead', id: entityId }, body: { companyId: otherCompany, customerId: 'attacker', apiKey: 'attacker' } }, res);
  assert.equal(res.code, 200); assert.equal(resolved[0], companyId); assert.equal(received, 'canonical-remote');
  assert.deepEqual(Object.keys(res.body), ['handoffUrl']);
});
test('ineligible CRM record cannot request a handoff', async () => {
  let called = false;
  const controller = load('controllers/billstack.controller.js', {
    '../services/access.service': { async hasPermission() { return true; } },
    './lead.controller': { async findAccessibleLeadById() { return {}; } },
    '../services/billstackCustomer.service': { ...core, async loadEligible() { throw Object.assign(new Error('Not closed'), { statusCode: 409 }); } },
    '../services/billstack.service': { async createInvoiceHandoff() { called = true; } },
  });
  const res = response(); await controller.handoff({ user: { companyId }, params: { type: 'lead', id: entityId } }, res);
  assert.equal(res.code, 409); assert.equal(called, false);
});
test('frontend contains no BillStack secret or direct integration request', () => {
  for (const file of ['services/billstackService.js', 'components/billing/BillstackSection.jsx']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src', file), 'utf8');
    assert.doesNotMatch(source, /BILLSTACK_API_KEY|X-Billstack-Api-Key|api\/integrations/);
  }
});

test('manager delegates Billing only within their team and preserves other page grants', async () => {
  const user = { _id: entityId, companyId, role: 'EXECUTIVE', pageAccessOverride: [{ pageKey: 'leads', actions: ['view'] }], async save() { this.saved = true; } };
  const controller = load('controllers/userPageAccess.controller.js', {
    '../models/User': { findOne: filter => { assert.equal(filter.companyId, companyId); return q(user); }, async updateOne(filter, update) { assert.equal(filter.companyId, companyId); assert.deepEqual(Object.keys(update.$set), ['pageActionOverrides.billing']); user.patched = true; } },
    '../services/hierarchy.service': { async getDescendantUsers() { return [{ _id: entityId }]; } },
    '../services/access.service': { async resolveAccessProfile(target) { return { pages: target.pageAccessOverride || [], permissions: target.role === 'MANAGER' ? ['page.billing.view', 'page.billing.create_invoice'] : [] }; }, invalidateAccessCache() {} },
    '../services/auditLog.service': { async writeAuditLog() {} },
  });
  const res = response();
  await controller.handle(true)({ params: { userId: entityId }, user: { _id: actorId, companyId, role: 'MANAGER' }, body: { pageAccess: [{ pageKey: 'billing', actions: ['view', 'create_invoice'] }] } }, res);
  assert.equal(res.code, 200); assert.equal(user.patched, true); assert.equal(user.saved, undefined); assert.ok(user.pageActionOverrides.billing.includes('create_invoice'));
  assert.equal(user.pageAccessOverride.find(p => p.pageKey === 'leads').actions[0], 'view');
  assert.equal(res.body.pages.length, 1); assert.equal(res.body.pages[0].key, 'billing');
});
for (const [label, team, pageAccess, permissions] of [
  ['outside team', [], [{ pageKey: 'billing', actions: ['view'] }], ['page.billing.view']],
  ['unrelated page', [{ _id: entityId }], [{ pageKey: 'leads', actions: ['view'] }], ['page.billing.view']],
  ['unheld invoice action', [{ _id: entityId }], [{ pageKey: 'billing', actions: ['create_invoice'] }], ['page.billing.view']],
  ['implicit unheld view', [{ _id: entityId }], [{ pageKey: 'billing', actions: [] }], []],
]) test(`manager Billing delegation refuses ${label}`, async () => {
  const user = { _id: entityId, companyId, role: 'EXECUTIVE', async save() { assert.fail('Forbidden grant saved'); } };
  const controller = load('controllers/userPageAccess.controller.js', {
    '../models/User': { findOne: () => q(user) },
    '../services/hierarchy.service': { async getDescendantUsers() { return team; } },
    '../services/access.service': { async resolveAccessProfile() { return { pages: [], permissions }; }, invalidateAccessCache() {} },
  });
  const res = response(); await controller.handle(true)({ params: { userId: entityId }, user: { _id: actorId, companyId, role: 'MANAGER' }, body: { pageAccess } }, res);
  assert.equal(res.code, 403);
});
test('eligible customer loader always scopes the record by authenticated company', async () => {
  let observed;
  const service = load('services/billstackCustomer.service.js', { '../models/Lead': { findOne(filter) { observed = filter; return q(null); } } });
  await assert.rejects(service.loadEligible(otherCompany, 'lead', entityId), /not found/);
  assert.equal(observed.companyId, otherCompany);
  assert.equal(observed._id, entityId);
});
test('structured activation shares the canonical customer scheduling path', async () => {
  for (const kind of ['booking', 'contract']) {
    const events = [];
    const row = { _id: entityId, companyId, clientId: actorId, cabinId: inventoryId, status: kind === 'booking' ? 'PENDING' : 'DRAFT', bookingType: 'CABIN', contractType: 'CABIN', async save() { events.push('saved'); } };
    const service = load(`services/coworking${kind === 'booking' ? 'Booking' : 'Contract'}.service.js`, {
      [`../models/Coworking${kind === 'booking' ? 'Booking' : 'Contract'}`]: { findOne: () => q(row) },
      '../models/CoworkingCabin': { findOne: () => q({ seats: [], async save() {} }) },
      './coworkingAvailability.service': { async assertAvailable() {} },
      './auditLog.service': { async writeAuditLog() {} },
      './billstackSync.service': { async scheduleStructuredSafely(type, value) { assert.equal(type, kind); assert.equal(value.clientId, actorId); events.push('scheduled'); } },
    });
    await service[kind === 'booking' ? 'activateBooking' : 'activateContract']({ companyId, bookingId: entityId, contractId: entityId, actingUser: { _id: actorId } });
    assert.equal(row.status, 'ACTIVE'); assert.equal(row.billstackSyncPending, true);
    assert.deepEqual(events, ['saved', 'scheduled']);
  }
});
test('identity database outage keeps the board bridge retry marker', async () => {
  let cleared = false;
  const row = { _id: entityId, companyId, updatedBy: actorId, version: 1, billingBridgePending: true, state: { cabins: [cabin()] } };
  const service = load('services/coworkingBoardIdentity.service.js', {
    '../models/CoworkingClient': { async findOne() { throw new Error('DB down'); } },
    '../models/CoworkingBoardState': { async findOneAndUpdate(filter, update) { apply(row, update); return row; }, async updateOne() { cleared = true; } },
  });
  await service.bridgeSavedBoard(row);
  assert.equal(cleared, false); assert.equal(row.billingBridgePending, true);
});
test('dry-run reports CLOSED and current BOOKED records with no write methods or remote calls', async () => {
  const { report } = require('../scripts/billstack-dry-run.cjs');
  const collections = {
    leads: [{ _id: entityId, companyId, status: 'CLOSED', name: 'Closed customer', phone: '9876543210', brokerageReceived: 1, brokerageClosedAt: new Date(), brokerageClosedBy: actorId }],
    coworkingboardstates: [{ companyId, state: { cabins: [cabin('A1'), cabin('A2', 'RESERVED')] } }],
    coworkingbookings: [], coworkingcontracts: [],
  };
  const db = { collection(name) { return {
    async *find(filter) { for (const row of collections[name] || []) if (matches(row, filter)) yield row; },
    async findOne(filter) { return (collections[name] || []).find(row => matches(row, filter)); },
    async countDocuments(filter) { return (collections[name] || []).filter(row => matches(row, filter)).length; },
  }; } };
  const result = await report(db, companyId);
  assert.equal(result.eligible.length, 1); assert.equal(result.ambiguous.length, 1);
  assert.ok(result.excluded.some(row => row.cabin === 'A2'));
  assert.equal(result.eligible[0].payload.phone, '***3210');
});
test('board version conflict exits before any identity bridge or external sync', async () => {
  let handler, bridged = false;
  load('routes/coworkingBoard.routes.js', {
    express: { Router: () => ({ get() {}, put(path, limiter, action) { handler = action; } }) },
    '../models/CoworkingBoardState': { findOne: () => q({ version: 5 }), async findOneAndUpdate() { assert.fail('Stale board persisted'); } },
    '../middleware/rateLimit.middleware': { writeLimiter() {} },
    '../services/coworkingBoardIdentity.service': { preserveBindings: require('../src/services/coworkingBoardIdentity.service').preserveBindings, async bridgeSafely() { bridged = true; } },
  });
  const res = response(); await handler({ user: { companyId }, body: { version: 4, state: { cabins: [cabin()] } } }, res);
  assert.equal(res.code, 409); assert.equal(bridged, false);
});
test('board save never trusts browser-supplied identity verification', async () => {
  let handler, persisted;
  load('routes/coworkingBoard.routes.js', {
    express: { Router: () => ({ get() {}, put(path, limiter, action) { handler = action; } }) },
    '../models/CoworkingBoardState': { findOne: () => q({ version: 5 }), async findOneAndUpdate(filter, update) { persisted = update.$set.state; return { version: 6, state: persisted }; } },
    '../middleware/rateLimit.middleware': { writeLimiter() {} },
    '../services/coworkingBoardIdentity.service': { preserveBindings: require('../src/services/coworkingBoardIdentity.service').preserveBindings, async bridgeSafely(saved) { assert.equal(saved.state.cabins[0].client.billingIdentityVerified, false); return saved; } },
  });
  const c = cabin(); c.client.billingIdentityVerified = true;
  const res = response(); await handler({ user: { companyId, _id: actorId }, body: { version: 5, state: { cabins: [c] } } }, res);
  assert.equal(res.code, 200); assert.equal(persisted.cabins[0].client.billingIdentityVerified, false);
});

test('legacy saves retain server binding when old browsers omit metadata; edits keep one identity', async () => {
  const c = cabin(); delete c.client.identityKey; c.client.id = 'customerco';
  const h = boardHarness([c]);
  await h.service.bridgeSavedBoard(h.row);
  const canonical = h.row.state.cabins[0].client.canonicalClientId;
  const incoming = structuredClone(c);
  incoming.client.phone = '9123456789'; incoming.client.email = 'new@example.test';
  incoming.client.gstin = '27AAPFU0939F1ZV'; incoming.client.address = { line1: 'New address', city: 'Pune' };
  h.row.state.cabins = h.service.preserveBindings([incoming], h.row.state.cabins, companyId);
  await h.service.bridgeSavedBoard(h.row);
  assert.equal(h.clients.size, 1);
  assert.equal(h.row.state.cabins[0].client.canonicalClientId, canonical);
  const client = h.clients.get(canonical);
  assert.equal(client.phone, '9123456789'); assert.equal(client.email, 'new@example.test');
  assert.equal(client.gstNumber, '27AAPFU0939F1ZV'); assert.equal(client.address.line1, 'New address');
  assert.equal(h.row.version, 3, 'integration metadata never advances the board version');
});

test('browser cannot replace a bound customer or certify the replacement', async () => {
  const h = boardHarness([cabin()]); await h.service.bridgeSavedBoard(h.row);
  const previous = structuredClone(h.row.state.cabins);
  const incoming = structuredClone(previous); incoming[0].client.canonicalClientId = actorId;
  incoming[0].client.billingIdentityVerified = true;
  h.row.state.cabins = h.service.preserveBindings(incoming, previous, companyId);
  await h.service.bridgeSavedBoard(h.row);
  assert.equal(h.row.state.cabins[0].client.canonicalClientId, previous[0].client.canonicalClientId);
  assert.equal(h.row.state.cabins[0].client.billingIdentityVerified, false);
});

test('unverified candidate can be corrected without trusting browser verification flags', () => {
  const h = boardHarness([cabin()]);
  const previous = structuredClone(h.row.state.cabins);
  previous[0].client.canonicalClientId = actorId;
  previous[0].client.billingIdentityVerified = false;
  previous[0].client.billingBindingEstablished = false;
  const incoming = structuredClone(previous);
  incoming[0].client.canonicalClientId = companyId;
  incoming[0].client.billingIdentityVerified = true;
  incoming[0].client.billingBindingEstablished = true;
  const [saved] = h.service.preserveBindings(incoming, previous, companyId);
  assert.equal(saved.client.canonicalClientId, companyId);
  assert.equal(saved.client.billingIdentityVerified, false);
  assert.equal(saved.client.billingBindingEstablished, false);
  assert.equal(saved.client.billingBindingConflict, false);
});

test('conflicting canonical contact edits do not mutate either customer', async () => {
  const h = boardHarness([cabin()]); await h.service.bridgeSavedBoard(h.row);
  const id = h.row.state.cabins[0].client.canonicalClientId;
  h.clients.set(actorId, { _id: actorId, companyId, companyName: 'Other', phone: '9123456789' });
  h.row.state.cabins[0].client.phone = '9123456789';
  await h.service.bridgeSavedBoard(h.row);
  assert.equal(h.clients.get(id).phone, '9876543210');
  assert.equal(h.row.state.cabins[0].client.canonicalClientId, id);
  assert.equal(h.row.state.cabins[0].client.billingIdentityVerified, false);
});

test('conflicting multi-cabin snapshots fail before creating or updating a customer', async () => {
  const first = cabin('A1'), second = cabin('A2'); second.client.email = 'different@example.test';
  const h = boardHarness([first, second]); await h.service.bridgeSavedBoard(h.row);
  assert.equal(h.clients.size, 0); assert.equal(h.scheduled.length, 0);
  assert.ok(h.row.state.cabins.every(c => c.client.billingIdentityError));
  await assert.rejects(h.service.resolveBookedCustomer(companyId, first.code, actorId), /Conflicting customer details/);
  assert.equal(h.clients.size, 0);
});

test('permanent provider errors stop automatic retry and allow an explicit retry', async () => {
  const h = queueHarness({ fail: Object.assign(new Error('Review customer identity'), { statusCode: 409, retryable: false }) });
  const job = await h.service.schedule(companyId, 'lead', entityId);
  await h.service.processJob(job._id);
  assert.equal(job.retryable, false); assert.equal(job.nextRetryAt, null);
  await h.service.schedule(companyId, 'lead', entityId);
  await h.service.processJob(job._id); assert.equal(h.calls(), 1);
  h.recover(); await h.service.schedule(companyId, 'lead', entityId, true);
  assert.equal(await h.service.processJob(job._id), true);
});

test('disabled configuration does not create jobs, scan customers or start a worker', async () => {
  const service = load('services/billstackSync.service.js', {
    '../config/billstack': { isBillstackEnabled: () => false, configuredCompany: () => null },
    '../models/BillstackSyncJob': { updateOne() { assert.fail('disabled job write'); }, find() { assert.fail('disabled scan'); } },
  });
  assert.equal((await service.scheduleSafely(companyId, 'lead', entityId)).skipped, true);
  await service.sweep(); assert.equal(service.startWorker(), null); await service.stopWorker();
});

test('worker startup is singleton, scopes all scans to configured company and drains', async () => {
  let scans = 0;
  const model = { find(filter) { scans++; assert.equal(filter.companyId, companyId); return q([]); } };
  const service = load('services/billstackSync.service.js', {
    '../models/BillstackSyncJob': model,
    '../models/CoworkingBooking': model, '../models/CoworkingContract': model,
    './billstackCustomer.service': { modelFor: () => model },
    './coworkingBoardIdentity.service': { async reconcilePendingBoards(id) { assert.equal(id, companyId); } },
  });
  const timer = service.startWorker(); assert.equal(service.startWorker(), timer);
  await service.stopWorker(); assert.equal(scans, 5);
});

test('an older bridge cannot overwrite newer canonical attributes', async () => {
  const h = boardHarness([cabin()]); await h.service.bridgeSavedBoard(h.row);
  const c = h.row.state.cabins[0], id = c.client.canonicalClientId;
  h.clients.get(id).billstack.boardVersion = 10;
  c.client.phone = '9123456789';
  await h.service.bridgeSavedBoard(h.row);
  assert.equal(h.clients.get(id).phone, '9876543210');
  assert.equal(c.client.canonicalClientId, id);
  assert.equal(h.row.state.cabins[0].client.billingIdentityVerified, false);
});

for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 503, undefined]) {
  test(`provider HTTP ${status || 'network'} retry classification`, async () => {
    const service = load('services/billstack.service.js', {
      axios: { async post() { throw { response: status ? { status, headers: { 'retry-after': '120' }, data: 'secret' } : undefined }; } },
      '../config/billstack': { getBillstackConfig: () => ({ baseUrl: 'https://api.example.test', apiKey: 'fake' }) },
    });
    await assert.rejects(service.upsertCustomer(companyId, {}), error => {
      assert.equal(error.retryable, !status || status === 429 || status >= 500);
      if (status === 429) assert.equal(error.retryAfterMs, 120000);
      assert.ok(!error.message.includes('secret')); return true;
    });
  });
}

test('explicit frontend origin permits separate API origin but rejects arbitrary redirects', async () => {
  let destination = 'https://app.example.test/integration/invoice-handoff?token=fake';
  const service = load('services/billstack.service.js', {
    axios: { post: async () => ({ data: { data: { handoffUrl: destination } } }) },
    '../config/billstack': { getBillstackConfig: () => ({ baseUrl: 'https://api.example.test', frontendOrigin: 'https://app.example.test', apiKey: 'fake' }) },
  });
  assert.equal(await service.createInvoiceHandoff(companyId, entityId), destination);
  destination = 'https://app.example.test.attacker.test/handoff';
  await assert.rejects(service.createInvoiceHandoff(companyId, entityId), /invalid handoff/);
});

test('configuration requires tenant binding and an explicit secure frontend origin', () => {
  const names = ['BILLSTACK_COMPANY_ID', 'BILLSTACK_BASE_URL', 'BILLSTACK_FRONTEND_URL', 'BILLSTACK_API_KEY', 'NODE_ENV'];
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const config = load('config/billstack.js');
  try {
    Object.assign(process.env, { NODE_ENV: 'production', BILLSTACK_BASE_URL: 'https://api.example.test', BILLSTACK_FRONTEND_URL: 'https://app.example.test', BILLSTACK_API_KEY: 'fake' });
    delete process.env.BILLSTACK_COMPANY_ID;
    assert.throws(() => config.getBillstackConfig(companyId), /binding/);
    process.env.BILLSTACK_COMPANY_ID = companyId.toUpperCase();
    assert.equal(config.getBillstackConfig(companyId).frontendOrigin, 'https://app.example.test');
    assert.equal(config.isBillstackEnabled(otherCompany), false);
    process.env.BILLSTACK_FRONTEND_URL = 'http://app.example.test';
    assert.equal(config.isBillstackEnabled(companyId), false);
  } finally { for (const name of names) if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; }
});

test('sparse Billing grant preserves role defaults, legacy behavior and unrelated overrides', async () => {
  const access = load('services/access.service.js', { '../models/RolePermission': { findOne: () => q(null) } });
  for (const override of [null, [{ pageKey: 'chat', actions: ['view'] }]]) {
    const user = { companyId, role: 'EXECUTIVE', pageAccessOverride: override };
    const before = await access.resolveAccessProfile(user);
    const after = await access.resolveAccessProfile({ ...user, pageActionOverrides: { billing: ['view', 'create_invoice'] } });
    assert.equal(after.enforcePageAccess, before.enforcePageAccess);
    assert.equal(JSON.stringify(after.pages.filter(p => p.pageKey !== 'billing')), JSON.stringify(before.pages));
    assert.ok(after.permissions.includes('page.billing.create_invoice'));
    const revoked = await access.resolveAccessProfile({ ...user, pageActionOverrides: { billing: [] } });
    assert.ok(!revoked.permissions.includes('page.billing.create_invoice'));
  }
});
