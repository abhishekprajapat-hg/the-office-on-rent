const { USER_ROLES } = require("./role.constants");

// Canonical list of granular permissions for the coworking module.
// Format: "<module>.<action>" — enforced on both the API (permission.middleware)
// and the frontend (navigation + route guards), per PERMISSION.md conventions.
const PERMISSIONS = Object.freeze([
  "dashboard.view",

  "properties.view",
  "properties.create",
  "properties.update",
  "properties.delete",

  "cabins.view",
  "cabins.create",
  "cabins.update",
  "cabins.delete",
  "cabins.block",

  "seats.view",
  "seats.assign",
  "seats.release",

  "clients.view",
  "clients.create",
  "clients.update",
  "clients.delete",

  "bookings.view",
  "bookings.create",
  "bookings.update",
  "bookings.cancel",

  "contracts.view",
  "contracts.create",
  "contracts.update",
  "contracts.renew",

  "billing.view",
  "billing.create",
  "billing.update",

  "payments.view",
  "payments.create",
  "payments.refund",

  "expenses.view",
  "expenses.create",
  "expenses.update",
  "expenses.delete",
  "expenses.approve",

  "meeting_rooms.view",
  "meeting_rooms.create",
  "meeting_rooms.update",
  "meeting_rooms.delete",

  "visitors.view",
  "visitors.create",
  "visitors.update",
  "visitors.delete",
  "visitors.checkout",

  "tickets.view",
  "tickets.create",
  "tickets.update",
  "tickets.delete",
  "tickets.resolve",
  "tickets.close",

  "assets.view",
  "assets.create",
  "assets.update",
  "assets.delete",
  "assets.retire",

  "reports.view",
  "reports.export",

  "notifications.view",
  "notifications.create",
  "notifications.update",
  "notifications.delete",
  "notifications.archive",

  "settings.view",
  "settings.update",

  "users.view",
  "users.create",
  "users.update",
  "users.delete",

  "roles.view",
  "roles.manage",

  "audit_logs.view",
]);

// Modules the permission list above belongs to, grouped for matrix-style UI.
const PERMISSION_GROUPS = Object.freeze({
  dashboard: ["dashboard.view"],
  properties: ["properties.view", "properties.create", "properties.update", "properties.delete"],
  cabins: ["cabins.view", "cabins.create", "cabins.update", "cabins.delete", "cabins.block"],
  seats: ["seats.view", "seats.assign", "seats.release"],
  clients: ["clients.view", "clients.create", "clients.update", "clients.delete"],
  bookings: ["bookings.view", "bookings.create", "bookings.update", "bookings.cancel"],
  contracts: ["contracts.view", "contracts.create", "contracts.update", "contracts.renew"],
  billing: ["billing.view", "billing.create", "billing.update"],
  payments: ["payments.view", "payments.create", "payments.refund"],
  expenses: ["expenses.view", "expenses.create", "expenses.update", "expenses.delete", "expenses.approve"],
  meeting_rooms: [
    "meeting_rooms.view",
    "meeting_rooms.create",
    "meeting_rooms.update",
    "meeting_rooms.delete",
  ],
  visitors: [
    "visitors.view",
    "visitors.create",
    "visitors.update",
    "visitors.delete",
    "visitors.checkout",
  ],
  tickets: [
    "tickets.view",
    "tickets.create",
    "tickets.update",
    "tickets.delete",
    "tickets.resolve",
    "tickets.close",
  ],
  assets: ["assets.view", "assets.create", "assets.update", "assets.delete", "assets.retire"],
  reports: ["reports.view", "reports.export"],
  notifications: [
    "notifications.view",
    "notifications.create",
    "notifications.update",
    "notifications.delete",
    "notifications.archive",
  ],
  settings: ["settings.view", "settings.update"],
  users: ["users.view", "users.create", "users.update", "users.delete"],
  roles: ["roles.view", "roles.manage"],
  audit_logs: ["audit_logs.view"],
});

const PERMISSION_SET = new Set(PERMISSIONS);
const isValidPermission = (permission) => PERMISSION_SET.has(permission);

// ADMIN is not listed here — it always bypasses permission checks entirely
// (mirrors the existing `canAccess` auto-grant convention on the frontend
// and the ADMIN-is-company-root convention on the backend).
const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  [USER_ROLES.COWORKING_ADMIN]: [...PERMISSIONS],
  [USER_ROLES.MANAGER]: [...PERMISSIONS],
});

const getDefaultPermissionsForRole = (role) => DEFAULT_ROLE_PERMISSIONS[role] || [];

module.exports = {
  PERMISSIONS,
  PERMISSION_GROUPS,
  DEFAULT_ROLE_PERMISSIONS,
  isValidPermission,
  getDefaultPermissionsForRole,
};
