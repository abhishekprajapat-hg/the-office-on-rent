require("dotenv").config();
const mongoose = require("mongoose");
const Company = require("../models/Company");
const User = require("../models/User");
const { USER_ROLES } = require("../constants/role.constants");
const { ensureTenantRoleCatalog } = require("../services/roleCatalog.service");
const { assertSeedAllowed } = require("./seedSafetyGuard.cjs");

// Converts the hardcoded Commercial / Residential / Both role types into real
// database records, seeds one system Role per built-in USER_ROLES code, and
// points existing accounts at them by id.
//
// Additive only: it creates what is missing and fills in null references. It
// never writes User.role or User.roleType, never edits a Role Type or Role that
// already exists, and never deletes anything, so it is safe to re-run.
//
//   node src/seeder/migrateRoleTypes.cjs [--dry-run]

const isDryRun = process.argv.includes("--dry-run");

const resolveTenantIds = async () => {
  const [companies, adminCompanyIds] = await Promise.all([
    Company.find({}).select("_id name").lean(),
    // Older installs can carry a company id on users without a Company row.
    User.distinct("companyId", { companyId: { $ne: null } }),
  ]);

  const byId = new Map(companies.map((company) => [String(company._id), company.name]));
  adminCompanyIds.forEach((companyId) => {
    const key = String(companyId);
    if (!byId.has(key)) byId.set(key, "(company record missing)");
  });

  return [...byId.entries()].map(([id, name]) => ({
    companyId: new mongoose.Types.ObjectId(id),
    name,
  }));
};

async function run() {
  assertSeedAllowed({
    scriptName: "migrateRoleTypes",
    // Additive backfill: no existing document is overwritten or removed.
    destructive: false,
  });

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected. Scanning tenants...");

  const tenants = await resolveTenantIds();
  console.log(`Found ${tenants.length} tenant(s).`);

  const summary = {
    tenants: 0,
    createdRoleTypes: 0,
    createdRoles: 0,
    backfilledUsers: 0,
  };

  for (const tenant of tenants) {
    // eslint-disable-next-line no-await-in-loop
    const admin = await User.findOne({
      companyId: tenant.companyId,
      role: USER_ROLES.ADMIN,
    })
      .select("_id")
      .lean();

    if (isDryRun) {
      // eslint-disable-next-line no-await-in-loop
      const pendingUsers = await User.countDocuments({
        companyId: tenant.companyId,
        $or: [{ roleTypeId: null }, { roleTypeId: { $exists: false } }],
      });
      console.log(
        `[dry-run] ${tenant.name} (${tenant.companyId}): ${pendingUsers} user(s) would be mapped to role type ids`,
      );
      summary.tenants += 1;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const result = await ensureTenantRoleCatalog({
      companyId: tenant.companyId,
      actingUserId: admin?._id || null,
    });

    summary.tenants += 1;
    summary.createdRoleTypes += result.createdRoleTypes.length;
    summary.createdRoles += result.createdRoles.length;
    summary.backfilledUsers += result.backfilledUsers;

    console.log(
      `${tenant.name} (${tenant.companyId}): +${result.createdRoleTypes.length} role types, `
        + `+${result.createdRoles.length} roles, ${result.backfilledUsers} user(s) mapped`,
    );
  }

  console.log("\nMigration summary:", summary);
  await mongoose.disconnect();
}

run()
  .then(() => {
    console.log("Role type migration finished.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Role type migration failed:", error.message);
    process.exit(1);
  });
