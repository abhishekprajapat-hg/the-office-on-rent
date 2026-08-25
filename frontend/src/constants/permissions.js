// Mirrors backend/src/constants/permission.constants.js. Kept in sync by hand
// (this repo has no shared package between frontend/backend — see CLAUDE.md).
export const PERMISSIONS = [
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
];

export const PERMISSION_GROUPS = {
  Dashboard: ["dashboard.view"],
  Properties: ["properties.view", "properties.create", "properties.update", "properties.delete"],
  Cabins: ["cabins.view", "cabins.create", "cabins.update", "cabins.delete", "cabins.block"],
  Seats: ["seats.view", "seats.assign", "seats.release"],
  Clients: ["clients.view", "clients.create", "clients.update", "clients.delete"],
  Bookings: ["bookings.view", "bookings.create", "bookings.update", "bookings.cancel"],
  Contracts: ["contracts.view", "contracts.create", "contracts.update", "contracts.renew"],
  Billing: ["billing.view", "billing.create", "billing.update"],
  Payments: ["payments.view", "payments.create", "payments.refund"],
  Expenses: ["expenses.view", "expenses.create", "expenses.update", "expenses.delete", "expenses.approve"],
  "Meeting Rooms": ["meeting_rooms.view", "meeting_rooms.create", "meeting_rooms.update", "meeting_rooms.delete"],
  Visitors: ["visitors.view", "visitors.create", "visitors.update", "visitors.delete", "visitors.checkout"],
  Tickets: ["tickets.view", "tickets.create", "tickets.update", "tickets.delete", "tickets.resolve", "tickets.close"],
  Assets: ["assets.view", "assets.create", "assets.update", "assets.delete", "assets.retire"],
  Reports: ["reports.view", "reports.export"],
  Notifications: [
    "notifications.view",
    "notifications.create",
    "notifications.update",
    "notifications.delete",
    "notifications.archive",
  ],
  Settings: ["settings.view", "settings.update"],
  Users: ["users.view", "users.create", "users.update", "users.delete"],
  Roles: ["roles.view", "roles.manage"],
  "Audit Logs": ["audit_logs.view"],
};

export const PERMISSION_LABELS = PERMISSIONS.reduce((labels, permission) => {
  const [, action] = permission.split(".");
  labels[permission] = action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return labels;
}, {});
