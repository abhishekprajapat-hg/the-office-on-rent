import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionNotice, isServerDownStatus } from "../src/lib/connection.ts";
import { STATUS_COPY, statusKindOf } from "../src/lib/statusKind.ts";
import { pushProblem, pushStatusLabel } from "../src/lib/pushStatus.ts";

test("connection strip picks the worst problem", () => {
  assert.equal(connectionNotice({ online: true, slow: false, serverDown: false }), null);
  assert.equal(connectionNotice({ online: false, slow: true, serverDown: true })?.kind, "offline");
  assert.equal(connectionNotice({ online: true, slow: true, serverDown: true })?.kind, "server");
  assert.equal(connectionNotice({ online: true, slow: true, serverDown: false })?.kind, "slow");
  assert.ok([502, 503, 504].every(isServerDownStatus));
  assert.ok(![200, 400, 401, 404, 500].some(isServerDownStatus));
});

test("failures map to the right status page", () => {
  assert.equal(statusKindOf("Can't reach the server. Check your internet connection."), "offline");
  assert.equal(statusKindOf("The server took too long to respond. Check your connection and try again."), "slow");
  assert.equal(statusKindOf("You don't have access to this."), "noAccess");
  assert.equal(statusKindOf("This record no longer exists."), "notFound");
  assert.equal(statusKindOf("Lead name is required"), "error");
  assert.equal(statusKindOf("anything", 403), "noAccess");
  assert.equal(statusKindOf("anything", 503), "server");
  assert.equal(statusKindOf("anything", 401), "sessionExpired");
  assert.equal(statusKindOf(undefined), "error");
  for (const copy of Object.values(STATUS_COPY)) assert.ok(copy.title && copy.message);
});

test("push registration problems say what to fix", () => {
  assert.match(pushProblem("Default FirebaseApp is not initialized in this process com.theofficeonrent.crm"), /google-services\.json/);
  assert.match(pushProblem("Fetching the token failed: java.io.IOException: FIS_AUTH_ERROR FCM"), /Firebase/);
  assert.match(pushProblem("No 'projectId' found"), /project id/);
  assert.match(pushProblem("Network Error"), /reach the server/);
  assert.match(pushProblem("something odd"), /something odd/);
  assert.equal(pushStatusLabel({ state: "registered" }), "On for this phone");
  assert.equal(pushStatusLabel({ state: "error", detail: "x" }), "Not working");
});
