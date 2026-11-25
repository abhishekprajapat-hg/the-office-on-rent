/**
 * Adds a small, clearly labelled Enterprise demo portfolio to the local CRM DB.
 * Safe to rerun: records use stable demo codes and natural keys.
 * Usage: npm run seed:enterprise-demo
 */
require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");
const EnterpriseOwner = require("../models/EnterpriseOwner");
const Office = require("../models/EnterpriseOffice");
const Tenant = require("../models/EnterpriseTenant");
const Agreement = require("../models/EnterpriseAgreement");
const Obligation = require("../models/EnterpriseObligation");
const Document = require("../models/EnterpriseDocument");
const Ledger = require("../models/EnterpriseLedgerEntry");
const Enterprise = require("../services/enterprise.service");
const { assertSeedAllowed } = require("./seedSafetyGuard.cjs");

const isLoopback = (host) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(String(host || "").toLowerCase());
const localMongoTarget = () => {
  const raw = String(process.env.MONGO_URI || "");
  const parsed = new URL(raw.replace("mongodb+srv://", "http://").replace("mongodb://", "http://"));
  const port = parsed.port || "27017";
  return { host: parsed.hostname, port, database: decodeURIComponent(parsed.pathname.slice(1).split("/")[0] || "") };
};

const upsert = async (Model, filter, data) => {
  const existing = await Model.findOne(filter);
  if (existing) {
    existing.set(data);
    await existing.save();
    return existing;
  }
  return Model.create({ ...filter, ...data });
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing.");
  const target = localMongoTarget();
  if (!isLoopback(target.host) || target.port === "27018") {
    throw new Error(`Refusing demo writes outside a local MongoDB instance (${target.host}:${target.port}/${target.database}).`);
  }
  assertSeedAllowed({ scriptName: "seed:enterprise-demo", destructive: false });
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const admin = await User.findOne({ email: "admin@test.com" }).select("_id name companyId");
    if (!admin?.companyId) throw new Error("Local demo admin admin@test.com was not found; seed the local demo workspace first.");
    const user = { _id: admin._id, name: admin.name || "Demo Admin", role: "ADMIN", companyId: admin.companyId };
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
    const dueDay = Math.min(28, Math.max(5, day.getUTCDate() + 4));
    const endDate = new Date(Date.UTC(day.getUTCFullYear() + 2, day.getUTCMonth() + 1, 0));

    // Keep demo landlords in Enterprise's own directory, never in CRM's Owner Database.
    const landlords = [];
    for (const [index, city] of ["Gurugram", "Noida", "Pune"].entries()) {
      const ownerData = {
        name: `DEMO LANDLORD ${index + 1} — ${city}`,
        entityName: `Demo Property Holdings ${index + 1}`,
        phone: `99999000${String(index + 11).padStart(2, "0")}`,
        address: `Demo owner address, ${city}`,
        notes: "Sample Enterprise data. Replace with verified owner details before use.",
        createdBy: admin._id,
      };
      const oldOwner = await EnterpriseOwner.findOne({ companyId: admin.companyId, name: ownerData.name });
      if (oldOwner) { oldOwner.set({ ...ownerData, ownerCode: `DEMO-EOW-${index + 1}` }); await oldOwner.save(); landlords.push(oldOwner); }
      else landlords.push(await upsert(EnterpriseOwner, { companyId: admin.companyId, ownerCode: `DEMO-EOW-${index + 1}` }, ownerData));
    }

    const tenants = [];
    const tenantRows = [
      { code: "DEMO-TEN-01", legalName: "DEMO NORTHSTAR ANALYTICS PRIVATE LIMITED", tradeName: "Northstar Demo", city: "Gurugram", type: "COMPANY", contact: "Demo Contact One", phone: "9999900101", email: "tenant1@example.com" },
      { code: "DEMO-TEN-02", legalName: "DEMO MAPLE DESIGN LLP", tradeName: "Maple Demo Studio", city: "Noida", type: "LLP", contact: "Demo Contact Two", phone: "9999900102", email: "tenant2@example.com" },
    ];
    for (const row of tenantRows) {
      tenants.push(await upsert(Tenant, { companyId: admin.companyId, tenantCode: row.code }, {
        legalName: row.legalName,
        tradeName: row.tradeName,
        entityType: row.type,
        businessAddress: `Demo business address, ${row.city}`,
        registeredAddress: `Demo registered address, ${row.city}`,
        notes: "Sample Enterprise data. Replace with verified tenant details before use.",
        contacts: [{ role: "PRIMARY", name: row.contact, designation: "Admin contact", phone: row.phone, email: row.email, active: true }],
        createdBy: admin._id,
      }));
    }

    const officeRows = [
      { code: "DEMO-ENT-01", name: "DEMO — Cyber City Office", city: "Gurugram", address: "Demo address, Cyber City, Gurugram, Haryana", floor: "4", unit: "401", area: 2200, status: "OCCUPIED", fitOut: "COMPLETED", budget: 650000, ownerRent: 125000, tenantRent: 168000, tenant: 0, landlord: 0, deposit: 375000 },
      { code: "DEMO-ENT-02", name: "DEMO — Sector 62 Office", city: "Noida", address: "Demo address, Sector 62, Noida, Uttar Pradesh", floor: "7", unit: "702", area: 1450, status: "OCCUPIED", fitOut: "COMPLETED", budget: 420000, ownerRent: 82000, tenantRent: 112000, tenant: 1, landlord: 1, deposit: 246000 },
      { code: "DEMO-ENT-03", name: "DEMO — Business Bay Office", city: "Pune", address: "Demo address, Business Bay, Pune, Maharashtra", floor: "2", unit: "218", area: 980, status: "READY_VACANT", fitOut: "NOT_STARTED", budget: 0, ownerRent: 54000, tenantRent: 0, tenant: null, landlord: 2, deposit: 162000 },
    ];

    let agreementCount = 0;
    let obligationCount = 0;
    let documentCount = 0;
    for (const row of officeRows) {
      const office = await upsert(Office, { companyId: admin.companyId, officeCode: row.code }, {
        name: row.name,
        address: row.address,
        floor: row.floor,
        unit: row.unit,
        area: row.area,
        areaBasis: "CARPET",
        operationalStatus: row.status,
        fitOutStatus: row.fitOut,
        fitOutBudget: row.budget,
        assignedTo: admin._id,
        createdBy: admin._id,
        notes: "SAMPLE DATA ONLY — replace or remove before operational use.",
      });

      const ownerAgreement = await upsert(Agreement, { companyId: admin.companyId, agreementCode: `DEMO-MLA-${row.code.slice(-2)}` }, {
        side: "OWNER",
        officeId: office._id,
        agreementType: "Demo commercial lease",
        status: "ACTIVE",
        enterpriseOwnerId: landlords[row.landlord]._id,
        signingDate: monthStart,
        possessionDate: monthStart,
        commencementDate: monthStart,
        rentCommencementDate: monthStart,
        endDate,
        billingEndDate: endDate,
        rentDueDay: dueDay,
        baseRent: row.ownerRent,
        maintenance: { method: "INCLUDED", amount: null, note: "Demo lease terms", passThroughAllowed: false },
        depositRequired: row.deposit,
        depositConditions: "Sample data only.",
        notes: "DEMO AGREEMENT — not a real lease or legal document.",
        createdBy: admin._id,
      });
      await Agreement.collection.updateOne({ _id: ownerAgreement._id }, { $unset: { landlordContactId: "" } });
      agreementCount += 1;
      office.ownerAgreementId = ownerAgreement._id;

      let tenantAgreement = null;
      if (row.tenant !== null) {
        tenantAgreement = await upsert(Agreement, { companyId: admin.companyId, agreementCode: `DEMO-TNA-${row.code.slice(-2)}` }, {
          side: "TENANT",
          officeId: office._id,
          agreementType: "Demo office tenancy agreement",
          status: "ACTIVE",
          tenantId: tenants[row.tenant]._id,
          signingDate: monthStart,
          possessionDate: monthStart,
          commencementDate: monthStart,
          rentCommencementDate: monthStart,
          endDate,
          billingEndDate: endDate,
          rentDueDay: dueDay,
          baseRent: row.tenantRent,
          maintenance: { method: "INCLUDED", amount: null, note: "Demo lease terms", passThroughAllowed: false },
          depositRequired: Math.round(row.tenantRent * 3),
          depositConditions: "Sample data only.",
          notes: "DEMO AGREEMENT — not a real lease or legal document.",
          createdBy: admin._id,
        });
        agreementCount += 1;
        office.tenantAgreementId = tenantAgreement._id;
      } else {
        office.tenantAgreementId = null;
      }
      await office.save();

      for (const agreement of [ownerAgreement, tenantAgreement].filter(Boolean)) {
        const schedule = await Enterprise.regenerateSchedule({ user, agreement });
        obligationCount += schedule.created;
      }

      const agreements = [{ side: "OWNER", agreement: ownerAgreement }, ...(tenantAgreement ? [{ side: "TENANT", agreement: tenantAgreement }] : [])];
      for (const { side, agreement } of agreements) {
        await upsert(Ledger, { companyId: admin.companyId, officeId: office._id, kind: "DEPOSIT", side, agreementId: agreement._id, entryType: "REQUIRED" }, {
          date: day,
          amount: agreement.depositRequired,
          reference: `DEMO-DEPOSIT-${agreement.agreementCode}`,
          notes: "Sample requirement only; no payment or collection has been recorded.",
          enteredBy: admin._id,
          enteredByName: user.name,
        });
      }

      const documents = [
        { scope: "AGREEMENT", agreementId: ownerAgreement._id, label: `DEMO — Owner lease deed (${row.code})`, category: "LEASE_DEED" },
        ...(tenantAgreement ? [{ scope: "AGREEMENT", agreementId: tenantAgreement._id, tenantId: tenants[row.tenant]._id, label: `DEMO — Tenant agreement (${row.code})`, category: "LEASE_DEED" }] : []),
      ];
      for (const doc of documents) {
        const saved = await upsert(Document, { companyId: admin.companyId, officeId: office._id, agreementId: doc.agreementId, label: doc.label }, {
          ...doc,
          officeId: office._id,
          status: "PENDING",
          notes: "Sample register row only. No document file is attached.",
        });
        if (saved.isNew) documentCount += 1;
      }
    }

    const currentOffices = await Office.countDocuments({ companyId: admin.companyId });
    const currentTenants = await Tenant.countDocuments({ companyId: admin.companyId });
    const currentAgreements = await Agreement.countDocuments({ companyId: admin.companyId });
    const currentObligations = await Obligation.countDocuments({ companyId: admin.companyId });
    const currentDocuments = await Document.countDocuments({ companyId: admin.companyId });
    console.log(JSON.stringify({
      result: "Enterprise demo data is ready",
      createdAgreementRows: agreementCount,
      newlyGeneratedObligations: obligationCount,
      offices: currentOffices,
      tenants: currentTenants,
      agreements: currentAgreements,
      obligations: currentObligations,
      documents: currentDocuments,
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(`Enterprise demo seed failed: ${error.message}`);
  mongoose.disconnect().finally(() => { process.exitCode = 1; });
});
