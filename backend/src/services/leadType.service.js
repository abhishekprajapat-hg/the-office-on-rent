// Whether a lead is COMMERCIAL or RESIDENTIAL, worked out from what came with it. The CRM treats a
// lead without a type as commercial (who it is assigned to and who can see it), so a Meta form lead
// for a flat used to go to the commercial team. Order: the owner's own form-to-type setting, the
// form's answers, then the ad / ad set / campaign names; nothing is guessed when the words disagree.
// COWORKING (its own team) is used only when set on purpose - a form's setting or the default type -
// never guessed from words: a coworking lead goes only to coworking (or BOTH) executives, so a guess
// could leave it unassigned where there are none. Coworking words count as commercial.

const INVENTORY_TYPES = Object.freeze(["COMMERCIAL", "RESIDENTIAL", "COWORKING"]);

const RESIDENTIAL_WORDS = [
  /\bresidential\b/,
  /\bresidence\b/,
  /\bflats?\b/,
  /\bapartments?\b/,
  /\b\d\s?bhk\b/,
  /\bbhk\b/,
  /\b\d\s?rk\b/,
  /\bvillas?\b/,
  /\bbungalows?\b/,
  /\bpenthouses?\b/,
  /\bduplex\b/,
  /\brow\s?houses?\b/,
  /\bindependent\s+house\b/,
  /\bhomes?\b/,
  /\bpg\b/,
];

const COMMERCIAL_WORDS = [
  /\bcommercial\b/,
  /\boffices?\b/,
  /\bshops?\b/,
  /\bshowrooms?\b/,
  /\bretail\b/,
  /\bco-?working\b/,
  /\bwarehouses?\b/,
  /\bgodowns?\b/,
  /\bindustrial\b/,
  /\bworkspaces?\b/,
  /\bcabins?\b/,
  /\bseats?\b/,
  /\bdesks?\b/,
  /\bshed\b/,
];

// The company's own name says "office", and appears in campaign and form names; it is not a signal.
const BRAND = /\b(the\s*)?office\s*on\s*rent\b|\btheofficeonrent\b|\boor\b/g;
// Field names that ask what the customer is looking for.
const TYPE_QUESTION = /(property|inventory|space|requirement|looking|category|type|purpose|interest)/;

const normalizeType = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return INVENTORY_TYPES.includes(normalized) ? normalized : "";
};

/** COMMERCIAL / RESIDENTIAL when the words point one way only, else "". */
const typeFromText = (value) => {
  const text = String(value || "").toLowerCase().replace(/[_]+/g, " ").replace(BRAND, " ");
  if (!text.trim()) return "";
  const residential = RESIDENTIAL_WORDS.some((pattern) => pattern.test(text));
  const commercial = COMMERCIAL_WORDS.some((pattern) => pattern.test(text));
  if (residential === commercial) return "";
  return residential ? "RESIDENTIAL" : "COMMERCIAL";
};

/**
 * "formId:TYPE" pairs, from META_FORM_INVENTORY_TYPES ("123:RESIDENTIAL,456:COMMERCIAL") or a company's
 * metadata.metaFormInventoryTypes ({ "123": "RESIDENTIAL" } or the same text).
 */
const parseFormTypes = (...sources) => {
  const map = new Map();
  sources.forEach((source) => {
    if (!source) return;
    if (typeof source === "object" && !Array.isArray(source)) {
      Object.entries(source).forEach(([formId, type]) => {
        if (normalizeType(type)) map.set(String(formId).trim(), normalizeType(type));
      });
      return;
    }
    String(source)
      .split(/[,;\n]/)
      .forEach((pair) => {
        const [formId, type] = pair.split(":").map((part) => String(part || "").trim());
        if (formId && normalizeType(type)) map.set(formId, normalizeType(type));
      });
  });
  return map;
};

/**
 * The type of a Meta lead-form lead. `fieldRows`: Meta's field_data ([{ name, values }]); `names`:
 * { ad, adset, campaign }. Returns { type, from } - type "" when nothing says, and then
 * META_DEFAULT_INVENTORY_TYPE (if set) is used.
 */
const detectMetaLeadType = ({ formId = "", fieldRows = [], names = {}, formTypes = new Map(), defaultType = process.env.META_DEFAULT_INVENTORY_TYPE } = {}) => {
  const fromForm = formTypes.get(String(formId || "").trim());
  if (fromForm) return { type: fromForm, from: "form setting" };

  const answers = (Array.isArray(fieldRows) ? fieldRows : []).map((row) => ({
    name: String(row?.name || "").toLowerCase(),
    value: (Array.isArray(row?.values) ? row.values : [row?.values]).filter(Boolean).join(" "),
  }));
  for (const answer of answers.filter((row) => TYPE_QUESTION.test(row.name))) {
    const type = typeFromText(answer.value);
    if (type) return { type, from: `form answer "${answer.name}"` };
  }
  const allAnswers = typeFromText(answers.map((row) => row.value).join(" "));
  if (allAnswers) return { type: allAnswers, from: "form answers" };

  for (const [level, name] of [["ad", names.ad], ["ad set", names.adset], ["campaign", names.campaign]]) {
    const type = typeFromText(name);
    if (type) return { type, from: `${level} name "${String(name).slice(0, 80)}"` };
  }

  const fallback = normalizeType(defaultType);
  return fallback ? { type: fallback, from: "default (META_DEFAULT_INVENTORY_TYPE)" } : { type: "", from: "" };
};

module.exports = {
  INVENTORY_TYPES,
  normalizeType,
  typeFromText,
  parseFormTypes,
  detectMetaLeadType,
};
