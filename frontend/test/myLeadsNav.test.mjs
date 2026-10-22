// Leads menu: Admin and Manager get the Pipeline only; every other role gets
// My Leads only (21 Oct 2026).
import test from "node:test";
import assert from "node:assert/strict";
import { getVisibleSidebarGroups } from "../src/components/workbench/workbenchNavigation.js";

const paths = (role, permissions = ["page.leads.view", "page.my_leads.view", "page.dashboard.view"]) =>
  getVisibleSidebarGroups(role, { permissions }).flatMap((group) => group.items.map((item) => item.path));

test("Admin and Manager see the Pipeline and not My Leads", () => {
  for (const role of ["ADMIN", "MANAGER"]) {
    assert.ok(!paths(role).includes("/my-leads"), `${role} should not see My Leads`);
    assert.ok(paths(role).includes("/leads"), `${role} keeps the Pipeline`);
  }
});

test("every other role with lead access sees My Leads and not the Pipeline", () => {
  for (const role of ["EXECUTIVE", "INSIDE_EXECUTIVE", "FIELD_EXECUTIVE", "CHANNEL_PARTNER", "COWORKING_ADMIN"]) {
    assert.ok(paths(role).includes("/my-leads"), `${role} should see My Leads`);
    assert.ok(!paths(role).includes("/leads"), `${role} should not see the Pipeline`);
  }
});

test("a Channel Partner with only the Pipeline grant still gets My Leads", () => {
  assert.ok(paths("CHANNEL_PARTNER", ["page.leads.view"]).includes("/my-leads"));
});

test("roles without lead access see neither", () => {
  const p = paths("PRODUCTION_EXECUTIVE", ["page.dashboard.view"]);
  assert.ok(!p.includes("/my-leads") && !p.includes("/leads"));
});

test("a Channel Partner isn't shown pages the server refuses them", () => {
  const p = paths("CHANNEL_PARTNER", ["page.leads.view", "page.inventory.view", "page.daily_reports.view", "page.dashboard.view"]);
  for (const path of ["/inventory/owners", "/inventory/brokers", "/daily-reports"]) assert.ok(!p.includes(path), path);
  assert.ok(paths("EXECUTIVE", ["page.inventory.view", "page.daily_reports.view"]).includes("/inventory/brokers"));
});
