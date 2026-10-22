/*
 * Daily report forms (CRM requirements, 16 Oct 2026, section 01).
 *
 * Every employee who checks in fills one short report a day before checking
 * out. Which form they get follows their role and business segment
 * (User.role + User.roleType); nobody picks their own form.
 *
 * Field kinds:
 *   count - a whole number, 0 or more. Zero is a valid answer.
 *   text  - a short free-text description.
 *
 * `partOf` marks a count that is a breakdown of another one, so totals never
 * add a parent and its parts together (section 02).
 */

const FIELD = {
  count: (key, label, help = "", extra = {}) => ({ key, label, help, kind: "count", ...extra }),
  text: (key, label, help = "", extra = {}) => ({ key, label, help, kind: "text", ...extra }),
};

const OTHER_WORK = (help) => FIELD.text("otherWork", "Other work", help);

const DAILY_REPORT_FORMS = Object.freeze({
  COMMERCIAL_EXECUTIVE: {
    key: "COMMERCIAL_EXECUTIVE",
    label: "Commercial Executive / Telecaller",
    fields: [
      FIELD.count("newLeadCalls", "New lead calls", "Calls made to newly assigned leads."),
      FIELD.count("followUpCalls", "Follow-up calls", "Calls to existing leads in the pipeline."),
      FIELD.count("inventoryCalls", "Inventory calls", "Calls to owners/contacts to find or verify offices, availability, building, size and rent."),
      FIELD.count("siteVisitsScheduled", "Site visits scheduled", "Client visits arranged with field executives."),
      OTHER_WORK("Anything else you did today, in a line or two."),
    ],
  },
  COWORKING_EXECUTIVE: {
    key: "COWORKING_EXECUTIVE",
    label: "Coworking Executive",
    fields: [
      FIELD.count("newLeadCalls", "New lead calls", "Calls to new coworking enquiries."),
      FIELD.count("followUpCalls", "Follow-up calls", "Calls to existing prospects."),
      FIELD.count("siteVisitsScheduled", "Site visits scheduled", "Visits arranged."),
      FIELD.count("siteVisitsCompleted", "Site visits completed", "Visits that actually took place."),
      FIELD.count("cabinsClosed", "Cabins closed", "Cabins successfully closed today."),
      OTHER_WORK("Maintenance coordination, operational tasks, customer issues and other duties."),
    ],
  },
  COMMERCIAL_FIELD_EXECUTIVE: {
    key: "COMMERCIAL_FIELD_EXECUTIVE",
    label: "Commercial Field Executive",
    fields: [
      FIELD.count("totalCalls", "Total calls", "Every call you made today, of any kind."),
      FIELD.count("newLeadCalls", "New lead calls", "Calls to newly assigned leads (part of total calls).", { partOf: "totalCalls" }),
      FIELD.count("followUpCalls", "Follow-up calls", "Calls to existing prospects (part of total calls).", { partOf: "totalCalls" }),
      FIELD.count("siteVisitsScheduled", "Site visits scheduled", "Visits arranged."),
      FIELD.count("siteVisitsCompleted", "Site visits completed", "Visits actually conducted."),
      FIELD.count("newInventorySourced", "New inventory sourced", "New offices/properties found today (not calls to verify existing inventory)."),
      FIELD.count("dealsClosed", "Deals closed", "Deals closed today."),
      OTHER_WORK("Additional tasks and responsibilities."),
    ],
  },
  RESIDENTIAL_FIELD_EXECUTIVE: {
    key: "RESIDENTIAL_FIELD_EXECUTIVE",
    label: "Residential Field Executive",
    fields: [
      FIELD.count("totalCalls", "Total calls", "Every call you made today, of any kind."),
      FIELD.count("newLeadCalls", "New lead calls", "Calls to new residential enquiries (part of total calls).", { partOf: "totalCalls" }),
      FIELD.count("followUpCalls", "Follow-up calls", "Calls to existing prospects (part of total calls).", { partOf: "totalCalls" }),
      FIELD.count("siteVisitsScheduled", "Site visits scheduled", "Visits arranged."),
      FIELD.count("siteVisitsCompleted", "Site visits completed", "Visits actually conducted."),
      FIELD.count("newInventorySourced", "New inventory sourced", "Plots, colonies, projects or other properties found, including broker/owner options."),
      FIELD.count("dealsClosed", "Deals closed", "Deals closed today."),
      OTHER_WORK("Additional work and coordination."),
    ],
  },
  RESIDENTIAL_MANAGER: {
    key: "RESIDENTIAL_MANAGER",
    label: "Manager",
    fields: [
      FIELD.count("totalCalls", "Total calls", "Calls made today."),
      FIELD.count("followUpCalls", "Follow-up calls", "Follow-ups with clients, brokers or other contacts (part of total calls).", { partOf: "totalCalls" }),
      FIELD.count("siteVisitsScheduled", "Site visits scheduled", "Visits arranged through the team."),
      FIELD.count("dealsClosed", "Deals closed", "Deals closed today."),
      OTHER_WORK("Team management, coordination, meetings and other responsibilities."),
    ],
  },
  PRODUCTION: {
    key: "PRODUCTION",
    label: "Production Team",
    fields: [
      FIELD.count("postsPublished", "Posts published", "Instagram, LinkedIn, YouTube, Google Business Profile. One post on three platforms counts as 3."),
      FIELD.count("shootsCompleted", "Shoots completed", "Video/photo shoots completed."),
      FIELD.count("editsCompleted", "Edits completed", "Video edits completed."),
      FIELD.count("graphicsCompleted", "Graphics / carousels", "Graphics, creatives or carousel posts completed."),
      FIELD.count("meetings", "Meetings and reviews", "Meetings, editing reviews, planning or team discussions."),
      FIELD.text("meetingsDetails", "Meeting details", "Short note on the meetings above."),
      OTHER_WORK("Content strategy, campaign planning, ad decisions, analytics, CRM development and other work."),
    ],
  },
  COWORKING_ADMIN: {
    key: "COWORKING_ADMIN",
    label: "Coworking Admin",
    fields: [
      FIELD.count("cabinsCleaned", "Cabins cleaned", "Cabins cleaned and verified today (0-65). Not every cabin needs cleaning daily.", { max: 65 }),
      OTHER_WORK("Additional administrative and operational work."),
    ],
    // One report can list several issues (section 1.8).
    hasIssues: true,
  },
});

const ISSUE_CATEGORIES = Object.freeze([
  { key: "MAINTENANCE", label: "Maintenance / facility" },
  { key: "HOUSEKEEPING", label: "Cleanliness / housekeeping" },
  { key: "CAFETERIA", label: "Cafeteria / pantry" },
  { key: "MEMBER_SUPPORT", label: "Member / customer support" },
  { key: "OTHER", label: "Other" },
]);
const ISSUE_STATUSES = Object.freeze(["RESOLVED", "PENDING", "ESCALATED"]);
const ISSUE_PRIORITIES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);

const MAX_COUNT = 100000;
const MAX_TEXT = 1000;
const MAX_ISSUES = 50;

/*
 * Which form a person gets. Combinations the brief does not name are mapped to
 * the closest form and listed in the to-do doc for management to confirm:
 *   - Executives in Residential use the Residential Field Executive form.
 *   - Managers outside Residential use the Manager form.
 * Admins and Channel Partners have no daily report.
 */
const resolveDailyReportFormKey = (user = {}) => {
  const role = String(user.role || "").toUpperCase();
  const segment = String(user.roleType || "COMMERCIAL").toUpperCase();
  switch (role) {
    case "EXECUTIVE":
    case "INSIDE_EXECUTIVE":
      if (segment === "COWORKING") return "COWORKING_EXECUTIVE";
      if (segment === "RESIDENTIAL") return "RESIDENTIAL_FIELD_EXECUTIVE";
      return "COMMERCIAL_EXECUTIVE";
    case "FIELD_EXECUTIVE":
      if (segment === "COWORKING") return "COWORKING_EXECUTIVE";
      if (segment === "RESIDENTIAL") return "RESIDENTIAL_FIELD_EXECUTIVE";
      return "COMMERCIAL_FIELD_EXECUTIVE";
    case "MANAGER":
      return "RESIDENTIAL_MANAGER";
    case "PRODUCTION_EXECUTIVE":
    case "COMMUNITY_MANAGER":
      return "PRODUCTION";
    case "COWORKING_ADMIN":
      return "COWORKING_ADMIN";
    default:
      return null;
  }
};

const getDailyReportForm = (formKey) => DAILY_REPORT_FORMS[formKey] || null;

module.exports = {
  DAILY_REPORT_FORMS,
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  MAX_COUNT,
  MAX_TEXT,
  MAX_ISSUES,
  resolveDailyReportFormKey,
  getDailyReportForm,
};
