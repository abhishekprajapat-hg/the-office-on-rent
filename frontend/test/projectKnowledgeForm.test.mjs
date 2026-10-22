// Project details edited in the project form (21 Oct 2026).
import test from "node:test";
import assert from "node:assert/strict";
import { emptyKnowledgeDraft, knowledgePatchFromDraft } from "../src/modules/inventory/projectKnowledgeFormat.js";

test("blank contact and amenity rows are not sent", () => {
  const draft = { ...emptyKnowledgeDraft(), contacts: [{ name: " " }, { name: "Site office" }], amenityStatuses: [{ name: "" }, { name: "Clubhouse", status: "PLANNED" }] };
  const patch = knowledgePatchFromDraft(draft, {});
  assert.deepEqual(patch.contacts.map((c) => c.name), ["Site office"]);
  assert.deepEqual(patch.amenityStatuses.map((a) => a.name), ["Clubhouse"]);
});

test("publishing and internal notes are only sent for Admin/Manager", () => {
  const draft = { ...emptyKnowledgeDraft(), pricingPublished: true, internalNotes: "x" };
  assert.equal("pricingPublished" in knowledgePatchFromDraft(draft, { isManagement: false }), false);
  assert.equal(knowledgePatchFromDraft(draft, { isManagement: true }).pricingPublished, true);
});

test("documents uploaded in the form go along as new documents", () => {
  const docs = [{ name: "Brochure", category: "BROCHURE", url: "/x.pdf" }];
  assert.deepEqual(knowledgePatchFromDraft(emptyKnowledgeDraft(), { pendingDocuments: docs }).addDocuments, docs);
  assert.equal("addDocuments" in knowledgePatchFromDraft(emptyKnowledgeDraft(), {}), false);
});
