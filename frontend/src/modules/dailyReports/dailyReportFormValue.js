/* Value helpers for DailyReportForm (kept apart so the form file only exports a component). */

export const ISSUE_CATEGORY_OPTIONS = [
  { key: "MAINTENANCE", label: "Maintenance / facility" },
  { key: "HOUSEKEEPING", label: "Cleanliness / housekeeping" },
  { key: "CAFETERIA", label: "Cafeteria / pantry" },
  { key: "MEMBER_SUPPORT", label: "Member / customer support" },
  { key: "OTHER", label: "Other" },
];

export const emptyFormValue = (form) => ({
  counts: Object.fromEntries((form?.fields || []).filter((f) => f.kind === "count").map((f) => [f.key, ""])),
  notes: Object.fromEntries((form?.fields || []).filter((f) => f.kind === "text").map((f) => [f.key, ""])),
  issues: [],
});

export const valueFromReport = (form, report) => {
  const base = emptyFormValue(form);
  if (!report) return base;
  Object.keys(base.counts).forEach((k) => { base.counts[k] = report.counts?.[k] ?? ""; base.counts[k] = String(base.counts[k]); });
  Object.keys(base.notes).forEach((k) => { base.notes[k] = report.notes?.[k] || ""; });
  base.issues = (report.issues || []).map((i) => ({ ...i }));
  return base;
};

/* Client-side check before sending - the server checks again. */
export const findFormProblem = (form, value) => {
  for (const f of form.fields) {
    if (f.kind !== "count") continue;
    const raw = String(value.counts[f.key] ?? "").trim();
    if (raw === "") return { field: f.key, message: `${f.label}: enter a number (0 if none)` };
    if (f.max !== undefined && Number(raw) > f.max) return { field: f.key, message: `${f.label} must be between 0 and ${f.max}` };
  }
  const parents = [...new Set(form.fields.filter((f) => f.partOf).map((f) => f.partOf))];
  for (const parent of parents) {
    const parts = form.fields.filter((f) => f.partOf === parent);
    const sum = parts.reduce((a, f) => a + Number(value.counts[f.key] || 0), 0);
    if (sum > Number(value.counts[parent] || 0)) {
      const label = form.fields.find((f) => f.key === parent)?.label;
      return { field: parent, message: `${parts.map((f) => f.label).join(" + ")} can't be more than ${label}` };
    }
  }
  return null;
};

export const toPayload = (value) => ({
  counts: Object.fromEntries(Object.entries(value.counts).map(([k, v]) => [k, Number(v)])),
  notes: value.notes,
  issues: value.issues,
});
