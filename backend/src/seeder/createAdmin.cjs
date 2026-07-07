require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User.js");
const Company = require("../models/Company.js");
const { USER_ROLES } = require("../constants/role.constants");

const sanitizeSubdomain = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);

async function createAdmin() {
  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ role: USER_ROLES.ADMIN });
  if (existing) {
    console.log("Admin already exists");
    process.exit(0);
  }

  const adminEmail = String(process.env.ADMIN_EMAIL || "admin@test.com").trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "123456");
  const adminName = String(process.env.ADMIN_NAME || "Client Admin").trim();
  const adminPhone = String(process.env.ADMIN_PHONE || "9999999999").trim();
  const companyName = String(process.env.CLIENT_COMPANY_NAME || "Client Company").trim();

  const admin = new User({
    name: adminName,
    email: adminEmail,
    phone: adminPhone,
    password: adminPassword,
    role: USER_ROLES.ADMIN,
    companyId: new mongoose.Types.ObjectId(),
  });
  admin.companyId = admin._id;
  await admin.save();

  const subdomain = sanitizeSubdomain(process.env.CLIENT_COMPANY_SLUG || companyName)
    || sanitizeSubdomain(admin.email.split("@")[0])
    || "client";

  await Company.create({
    _id: admin.companyId,
    name: companyName,
    subdomain,
    ownerUserId: admin._id,
    status: "ACTIVE",
  });

  console.log(`Single-client admin created successfully: ${admin.email}`);
  process.exit(0);
}

createAdmin().catch((error) => {
  console.error(`createAdmin failed: ${error.message}`);
  process.exit(1);
});

