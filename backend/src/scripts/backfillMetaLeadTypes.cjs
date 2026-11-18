/*
 * One-off: a type for Meta leads that came in before lead types were read from the form (Nov 2026).
 *
 * Those leads have no type, which the CRM treats as commercial, so a lead for a flat went to the
 * commercial team. For each untyped Meta lead this works out the type from what was saved with it:
 * the owner's form-to-type setting (META_FORM_INVENTORY_TYPES / the company's
 * metadata.metaFormInventoryTypes) for its form, else the words of its project / campaign name
 * (services/leadType.service.js; coworking words count as commercial, COWORKING only by setting).
 * A lead whose words say nothing, or both, is left as it is.
 *
 * Who keeps the lead:
 *  - unassigned, or its owner handles that type (or BOTH): only the type is set;
 *  - its owner does not handle that type: listed, and left alone - unless --reassign, which gives it
 *    to an executive of the right type by the usual rules, for leads nobody has worked yet
 *    (NEW, NPC 1-3, Missing in action) only. When no executive of that type is free, it stays put.
 *
 *   node src/scripts/backfillMetaLeadTypes.cjs                     # dry run: prints the plan, changes nothing
 *   node src/scripts/backfillMetaLeadTypes.cjs --apply             # sets the types (no owner changes)
 *   node src/scripts/backfillMetaLeadTypes.cjs --apply --reassign  # and moves untouched mismatched leads
 *   add --company <id> to limit it to one company
 */
require("dotenv").config();

const mongoose = require("mongoose");
const Lead = require("../models/Lead");
const User = require("../models/User");
const Company = require("../models/Company");
const LeadActivity = require("../models/leadActivity.model");
const { parseFormTypes, typeFromText } = require("../services/leadType.service");
const { autoAssignLead, REBALANCE_MOVABLE_STATUSES } = require("../services/leadAssignment.service");

const APPLY = process.argv.includes("--apply");
const REASSIGN = process.argv.includes("--reassign");
const companyArg = process.argv.indexOf("--company");
const ONLY_COMPANY = companyArg > -1 ? String(process.argv[companyArg + 1] || "") : "";

const ROLE_TYPES = ["COMMERCIAL", "RESIDENTIAL", "COWORKING", "BOTH"];
const roleTypeOf = (user) => {
  const value = String(user?.roleType || "").trim().toUpperCase();
  return ROLE_TYPES.includes(value) ? value : "COMMERCIAL";
};

/** The type of a saved Meta lead, from the form setting or its saved project / campaign name. */
const typeOfSavedLead = (lead, formTypes) => {
  const fromForm = formTypes.get(String(lead.metaFormId || "").trim());
  if (fromForm) return { type: fromForm, from: `form setting (form ${lead.metaFormId})` };
  const type = typeFromText(lead.projectInterested);
  return type ? { type, from: `project / campaign "${String(lead.projectInterested).slice(0, 80)}"` } : { type: "", from: "" };
};

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing.");
  if (REASSIGN && !APPLY) console.log("--reassign only acts with --apply; this is a dry run.\n");
  if (ONLY_COMPANY && !mongoose.isValidObjectId(ONLY_COMPANY)) throw new Error("--company needs a company id.");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  const filter = {
    source: "META",
    $or: [{ "requirements.inventoryType": "" }, { "requirements.inventoryType": { $exists: false } }, { "requirements.inventoryType": null }],
  };
  if (ONLY_COMPANY) filter.companyId = ONLY_COMPANY;
  const leads = await Lead.find(filter).sort({ createdAt: 1 });

  const formTypesByCompany = new Map();
  const formTypesFor = async (companyId) => {
    const key = String(companyId || "");
    if (!formTypesByCompany.has(key)) {
      const company = key ? await Company.findById(key).select("metadata").lean().catch(() => null) : null;
      formTypesByCompany.set(key, parseFormTypes(process.env.META_FORM_INVENTORY_TYPES, company?.metadata?.metaFormInventoryTypes, company?.metadata?.meta?.formInventoryTypes));
    }
    return formTypesByCompany.get(key);
  };

  const ownerIds = [...new Set(leads.map((lead) => String(lead.assignedTo || "")).filter(Boolean))];
  const owners = new Map((await User.find({ _id: { $in: ownerIds } }).select("_id name roleType isActive").lean()).map((user) => [String(user._id), user]));

  const counts = { untyped: leads.length, unknown: 0, typed: 0, mismatched: 0, moved: 0, notMoved: 0, worked: 0 };
  const byType = {};
  const mismatched = [];

  for (const lead of leads) {
    const detected = typeOfSavedLead(lead, await formTypesFor(lead.companyId));
    if (!detected.type) {
      counts.unknown += 1;
      continue;
    }
    byType[detected.type] = (byType[detected.type] || 0) + 1;
    const owner = lead.assignedTo ? owners.get(String(lead.assignedTo)) : null;
    const fits = !owner || [detected.type, "BOTH"].includes(roleTypeOf(owner));

    if (fits) {
      counts.typed += 1;
      if (APPLY) {
        await Lead.updateOne({ _id: lead._id }, { $set: { "requirements.inventoryType": detected.type } });
        await LeadActivity.create({ lead: lead._id, action: `Lead type ${detected.type.toLowerCase()} (from ${detected.from}; set for an older lead)`, performedBy: null });
      }
      continue;
    }

    counts.mismatched += 1;
    const row = { id: String(lead._id), name: lead.name, status: lead.status, type: detected.type, owner: `${owner.name} (${roleTypeOf(owner).toLowerCase()})`, from: detected.from };
    mismatched.push(row);
    if (!APPLY || !REASSIGN) continue;
    if (!REBALANCE_MOVABLE_STATUSES.includes(String(lead.status || ""))) {
      counts.worked += 1;
      row.result = "kept: already being worked";
      continue;
    }
    // Saved only when someone of the right type takes it (autoAssignLead saves the lead then).
    lead.set("requirements.inventoryType", detected.type);
    const assignment = await autoAssignLead({ lead, requester: { companyId: lead.companyId } });
    if (assignment.assigned) {
      counts.moved += 1;
      row.result = `moved to ${assignment.executive.name}`;
      await LeadActivity.create({ lead: lead._id, action: `Lead type ${detected.type.toLowerCase()} (from ${detected.from}; set for an older lead) - moved from ${owner.name} to ${assignment.executive.name}`, performedBy: null });
    } else {
      counts.notMoved += 1;
      row.result = `kept: no ${detected.type.toLowerCase()} executive free (${assignment.reason || "none"})`;
    }
  }

  console.log(APPLY ? "APPLIED" : "DRY RUN (nothing changed; add --apply to write)");
  console.log(`Untyped Meta leads: ${counts.untyped}`);
  console.log(`  type found: ${counts.untyped - counts.unknown} ${JSON.stringify(byType)}`);
  console.log(`  nothing in the form setting or name says (left as they are, treated as commercial): ${counts.unknown}`);
  console.log(`  ${APPLY ? "typed" : "to type"} (unassigned, or the owner handles that type): ${counts.typed}`);
  console.log(`  owner does not handle the type: ${counts.mismatched}`);
  if (APPLY && REASSIGN) console.log(`    moved: ${counts.moved}; kept, already being worked: ${counts.worked}; kept, nobody of that type free: ${counts.notMoved}`);
  else if (counts.mismatched) console.log("    left alone (their owner keeps them, still untyped). --apply --reassign moves the ones nobody has worked yet.");
  for (const row of mismatched.slice(0, 200)) {
    console.log(`    ${row.id}  ${row.name}  [${row.status}]  ${row.type.toLowerCase()} - with ${row.owner} - ${row.from}${row.result ? `  => ${row.result}` : ""}`);
  }
  if (mismatched.length > 200) console.log(`    … and ${mismatched.length - 200} more`);
};

run()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
