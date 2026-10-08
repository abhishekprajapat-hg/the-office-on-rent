/* Finds booked cabins whose billing customer is a different company.
 *
 *   node scripts/audit-billing-bindings.cjs --company <ObjectId>            (read-only report)
 *   node scripts/audit-billing-bindings.cjs --company <ObjectId> --repair   (clear the wrong links)
 *
 * A "wrong link" is a cabin bound to a CRM client that is the billing customer of
 * ANOTHER cabin's company (typically two companies sharing one contact phone).
 * --repair only removes the link; the correct customer is created the next time
 * Create Invoice is used on that client. Nothing else is modified or deleted.
 */
const mongoose = require('mongoose');

const key = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const sameParty = (a, b) => {
  const [x, y] = [key(a), key(b)];
  return Boolean(x && y) && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))));
};
const nameOf = (cabin) => cabin.client?.companyName || cabin.client?.name || '';

async function audit(db, companyId, repair) {
  const row = await db.collection('coworkingboardstates').findOne({ companyId });
  const cabins = row?.state?.cabins || [];
  const booked = cabins.filter((c) => c.status === 'BOOKED' && nameOf(c) && c.client?.canonicalClientId);
  const findings = [];
  for (const cabin of booked) {
    if (!/^[a-f\d]{24}$/i.test(String(cabin.client.canonicalClientId))) continue;
    const bound = await db.collection('coworkingclients').findOne({ _id: new mongoose.Types.ObjectId(cabin.client.canonicalClientId), companyId });
    if (!bound) { findings.push({ cabin: cabin.code, client: nameOf(cabin), problem: 'linked customer record is missing' }); continue; }
    if (sameParty(bound.companyName, nameOf(cabin))) continue;
    const owner = booked.find((o) => o !== cabin && o.client?.id !== cabin.client?.id && sameParty(nameOf(o), bound.companyName));
    findings.push({
      cabin: cabin.code, client: nameOf(cabin), billedAs: bound.companyName,
      problem: owner ? `linked to ${owner.code} (${nameOf(owner)})'s customer - WRONG` : 'linked customer has a different name (renamed, or wrong)',
      wrong: Boolean(owner),
    });
  }
  let repaired = 0;
  if (repair) {
    const next = JSON.parse(JSON.stringify(cabins));
    for (const f of findings.filter((x) => x.wrong)) {
      const cabin = next.find((c) => c.code === f.cabin);
      for (const field of ['canonicalClientId', 'billingIdentityVerified', 'billingBindingEstablished', 'billingBindingConflict', 'billingIdentityError']) delete cabin.client[field];
      repaired++;
    }
    if (repaired) await db.collection('coworkingboardstates').updateOne({ _id: row._id, version: row.version }, { $set: { 'state.cabins': next } });
  }
  return { bookedCabinsChecked: booked.length, problems: findings, repaired };
}

async function main() {
  require('dotenv').config({ quiet: true });
  const args = process.argv.slice(2);
  const company = args[args.indexOf('--company') + 1];
  if (!/^[a-f\d]{24}$/i.test(String(company))) throw new Error('Usage: node scripts/audit-billing-bindings.cjs --company <ObjectId> [--repair]');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false });
  try { console.log(JSON.stringify(await audit(mongoose.connection.db, new mongoose.Types.ObjectId(company), args.includes('--repair')), null, 2)); }
  finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch((e) => { console.error(e.message || 'Audit failed'); process.exitCode = 1; });
module.exports = { audit, sameParty };
