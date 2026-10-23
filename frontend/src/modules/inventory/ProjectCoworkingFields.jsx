import React, { useState } from "react";
import {
  Armchair, Building2, IndianRupee, LayoutGrid, Lock, Receipt, Users2,
} from "lucide-react";
import {
  ChoiceCards, FormCollapsible, FormField, FormGroup, FormInput, FormLabel, PickChips,
} from "../../components/ui/formKit";
import { humanizeKey } from "./projectKnowledgeFormat";
import { COWORKING_CONTACT_ROLES, RELATIONSHIP_META } from "./projectCoworkingFormat";

/*
 * The coworking parts of the project form (requirements 16 Oct 2026, 5.4).
 *
 * A workspace is described by the same knowledge record as any other project
 * (details.specs.COWORKING), so these sections write straight into the draft
 * the form already saves - nothing new is stored. What they add is shape: the
 * catalogue's flat field list laid out as identity, inventory, pricing,
 * services and contacts, in the step where each belongs, instead of a wall of
 * inputs in the details accordion.
 *
 * Every field is drawn from the catalogue the server sends, so labels and
 * options stay in step with it, and a field the user may not see (partner
 * terms, for one) is simply absent from their catalogue and never rendered.
 */

const byKey = (fields = []) => Object.fromEntries(fields.map((field) => [field.key, field]));


/* One set of renderers over the catalogue, shared by the sections below. */
const renderers = (fields, specs, setSpec) => {
  const defs = byKey(fields);
  const valueOf = (key) => specs?.[key] ?? "";

  const field = (key, props = {}) => {
    const def = defs[key];
    if (!def) return null;
    const numeric = ["number", "money"].includes(def.kind);
    return (
      <FormField key={key} label={props.label || def.label} hint={props.hint} wide={props.wide}>
        <FormInput
          type={numeric ? "number" : "text"}
          min={numeric ? "0" : undefined}
          step={numeric ? "any" : undefined}
          inputMode={numeric ? "decimal" : undefined}
          prefix={def.kind === "money" ? "₹" : props.prefix}
          suffix={props.suffix}
          placeholder={props.placeholder}
          maxLength={numeric ? undefined : 200}
          value={valueOf(key)}
          onChange={(event) => setSpec(key, event.target.value)}
        />
      </FormField>
    );
  };

  const longtext = (key, props = {}) => {
    const def = defs[key];
    if (!def) return null;
    return (
      <FormField key={key} label={props.label || def.label} hint={props.hint} wide>
        <textarea
          rows={props.rows || 2}
          value={valueOf(key)}
          onChange={(event) => setSpec(key, event.target.value)}
          placeholder={props.placeholder}
          className="gl-field w-full resize-none px-3.5 py-2.5 text-[14px] outline-none"
        />
      </FormField>
    );
  };

  const chips = (key, props = {}) => {
    const def = defs[key];
    if (!def) return null;
    return (
      <div key={key} className="flex flex-col gap-2">
        <FormLabel>{props.label || def.label}</FormLabel>
        <PickChips
          round
          allowClear
          options={(def.options || []).map((option) => ({ value: option, label: humanizeKey(option) }))}
          value={valueOf(key)}
          onChange={(next) => setSpec(key, next)}
        />
      </div>
    );
  };

  /* A price with the basis it is quoted on (per month, per hour...). */
  const rate = (rateKey, basisKey, props = {}) => {
    const def = defs[rateKey];
    if (!def) return null;
    const basis = defs[basisKey];
    return (
      <div key={rateKey} className="flex flex-col gap-2 rounded-2xl p-3" style={{ background: "var(--g-glassHi)", border: "1px solid var(--g-edge, var(--g-line))" }}>
        <FormLabel>{props.label || def.label.replace(/ rate$/i, "")}</FormLabel>
        <FormInput
          prefix="₹"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder={props.placeholder}
          value={valueOf(rateKey)}
          onChange={(event) => setSpec(rateKey, event.target.value)}
        />
        {basis ? (
          <PickChips
            round
            allowClear
            options={(basis.options || []).map((option) => ({ value: option, label: humanizeKey(option) }))}
            value={valueOf(basisKey)}
            onChange={(next) => setSpec(basisKey, next)}
          />
        ) : null}
      </div>
    );
  };

  return { has: (key) => Boolean(defs[key]), defs, field, longtext, chips, rate };
};

/* Step 1 - who runs the workspace, what it is and what is in it. */
export const CoworkingBasicsFields = ({ fields = [], specs = {}, setSpec }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const render = renderers(fields, specs, setSpec);
  const relationship = render.defs.relationshipType;

  return (
    <>
      {relationship ? (
        <div className="flex flex-col gap-2">
          <FormLabel>{relationship.label}</FormLabel>
          <ChoiceCards
            options={(relationship.options || []).map((option) => ({
              value: option,
              label: RELATIONSHIP_META[option]?.label || humanizeKey(option),
              sub: RELATIONSHIP_META[option]?.sub,
              icon: RELATIONSHIP_META[option]?.icon || Building2,
            }))}
            value={specs.relationshipType || ""}
            onChange={(next) => setSpec("relationshipType", next)}
            columns="minmax(190px,1fr)"
          />
        </div>
      ) : null}

      <FormGroup icon={Building2} title="Workspace identity">
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          {render.field("operatorBrand", { placeholder: "e.g. WorkNest" })}
          {render.field("building", { placeholder: "Building / tower" })}
          {render.field("floor", { placeholder: "e.g. 3rd & 4th" })}
          {render.field("seatCapacity", { suffix: "seats", placeholder: "120" })}
        </div>
        {render.longtext("operatingHours", { placeholder: "e.g. Mon–Sat 9am–9pm, 24x7 access for members" })}
        {render.chips("operationalStatus")}
      </FormGroup>

      <FormGroup icon={LayoutGrid} title="Cabins, desks & rooms">
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(165px,1fr))]">
          {render.field("cabinCount", { placeholder: "0" })}
          {render.field("cabinCapacityMin", { suffix: "seats", placeholder: "2" })}
          {render.field("cabinCapacityMax", { suffix: "seats", placeholder: "20" })}
          {render.field("dedicatedDeskCount", { placeholder: "0" })}
          {render.field("hotDeskCount", { placeholder: "0" })}
          {render.field("privateOfficeCount", { placeholder: "0" })}
          {render.field("meetingRoomCount", { placeholder: "0" })}
          {render.field("conferenceRoomCount", { placeholder: "0" })}
          {render.field("trainingRoomCount", { placeholder: "0" })}
        </div>
        {render.field("expansion", { wide: true, placeholder: "e.g. 20 more seats on the 5th floor from January" })}
      </FormGroup>

      <FormCollapsible
        icon={Armchair}
        title="More workspace detail"
        hint="Optional notes"
        open={moreOpen}
        onToggle={() => setMoreOpen((open) => !open)}
      >
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {render.field("cabins", { placeholder: "e.g. 4 of 2-seat, 6 of 6-seat" })}
          {render.field("desks", { placeholder: "e.g. 30 dedicated, 20 hot" })}
          {render.field("privateOffices", { placeholder: "e.g. 2 private offices of 12 seats" })}
          {render.field("meetingRooms", { placeholder: "e.g. 2 meeting, 1 conference, 1 training" })}
          {render.field("capacity", { placeholder: "Anything else about capacity" })}
        </div>
      </FormCollapsible>
    </>
  );
};

/* Step 2 - what the workspace is quoted at and on what terms. */
export const CoworkingPricingFields = ({ fields = [], specs = {}, setSpec }) => {
  const render = renderers(fields, specs, setSpec);
  return (
    <>
      <FormGroup icon={IndianRupee} title="Workspace pricing" aside="Leave blank whatever you don't quote">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(215px,1fr))]">
          {render.rate("cabinRate", "cabinRateBasis")}
          {render.rate("seatRate", "seatRateBasis")}
          {render.rate("dedicatedDeskRate", "dedicatedDeskRateBasis")}
          {render.rate("hotDeskRate", "hotDeskRateBasis")}
          {render.rate("meetingRoomRate", "meetingRoomRateBasis")}
          {render.rate("conferenceRoomRate", "conferenceRoomRateBasis")}
        </div>
        {render.longtext("seatPricing", { label: "Additional pricing details", placeholder: "Slabs, discounts for longer terms, day-pass rates…" })}
      </FormGroup>

      <FormGroup icon={Receipt} title="Deposit & terms">
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {render.field("securityDeposit", { placeholder: "75000" })}
          {render.field("deposit", { placeholder: "e.g. 2 months of rent" })}
          {render.field("lockIn", { placeholder: "e.g. 6 months" })}
          {render.field("noticePeriod", { placeholder: "e.g. 30 days" })}
        </div>
        {render.longtext("includedServices", { placeholder: "What the rent covers: internet, housekeeping, electricity, meeting-room credits…" })}
        {render.longtext("extraCharges", { placeholder: "Billed on top: extra hours, printing, parking, guest passes…" })}
        {render.longtext("taxes", { placeholder: "e.g. 18% GST on rent and services" })}
      </FormGroup>
    </>
  );
};

/*
 * Step 4 - the services list, each one included in the rent or chargeable.
 * Stored as the project's amenity statuses, the same record the Amenities tab
 * edits, so a service set here shows up there and in both PDFs.
 */
const SERVICE_STATES = [
  { value: "INCLUDED", label: "Included" },
  { value: "CHARGEABLE", label: "Chargeable" },
  { value: "NOT_AVAILABLE", label: "Not available" },
];
const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export const CoworkingServicesEditor = ({ presets = [], amenities = [], onChange }) => {
  const stateOf = (name) => {
    const row = amenities.find((amenity) => sameName(amenity.name, name));
    if (!row) return "";
    if (String(row.status || "").toUpperCase() === "NOT_AVAILABLE") return "NOT_AVAILABLE";
    return row.chargeable ? "CHARGEABLE" : "INCLUDED";
  };

  const setState = (name, next) => {
    const index = amenities.findIndex((amenity) => sameName(amenity.name, name));
    if (!next) {
      onChange(amenities.filter((_, position) => position !== index));
      return;
    }
    const row = {
      ...(index === -1 ? {} : amenities[index]),
      name,
      status: next === "NOT_AVAILABLE" ? "NOT_AVAILABLE" : "AVAILABLE",
      chargeable: next === "CHARGEABLE",
    };
    // Replacing in place keeps the Amenities tab's order steady while toggling.
    onChange(index === -1 ? [...amenities, row] : amenities.map((old, position) => (position === index ? row : old)));
  };

  const counts = presets.reduce((total, name) => {
    const state = stateOf(name);
    return state ? { ...total, [state]: (total[state] || 0) + 1 } : total;
  }, {});

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px]" style={{ color: "var(--g-mut)" }}>Mark each service included in the rent or charged on top.</span>
        {counts.INCLUDED ? <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-medium" style={{ background: "var(--g-oks)", color: "var(--g-ok)" }}>{counts.INCLUDED} included</span> : null}
        {counts.CHARGEABLE ? <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-medium" style={{ background: "var(--g-warns)", color: "var(--g-warn)" }}>{counts.CHARGEABLE} chargeable</span> : null}
      </div>
      {presets.map((name) => (
        <div key={name} className="flex flex-wrap items-center gap-2 rounded-[14px] px-3.5 py-2.5" style={{ background: "var(--g-glassHi)", border: "1px solid var(--g-edge, var(--g-line))" }}>
          <span className="min-w-[130px] flex-1 text-[13.5px] font-medium">{name}</span>
          <PickChips round allowClear options={SERVICE_STATES} value={stateOf(name)} onChange={(next) => setState(name, next)} />
        </div>
      ))}
    </div>
  );
};

/*
 * Step 3 - the people a colleague calls about this workspace. These are the
 * project's contacts, filtered to the roles a workspace always has; anyone
 * else (a developer, a lawyer) is added in the Contacts tab as before.
 */
export const CoworkingContactsFields = ({ contacts = [], onChange }) => {
  const rowFor = (role) => contacts.find((contact) => String(contact.role || "").toUpperCase() === role) || {};

  const patch = (role, change) => {
    const index = contacts.findIndex((contact) => String(contact.role || "").toUpperCase() === role);
    const next = { ...(index === -1 ? { role } : contacts[index]), ...change };
    const isEmpty = !["name", "phone", "email"].some((key) => String(next[key] || "").trim());
    if (index === -1) {
      // A contact with nothing in it is not worth keeping on the project.
      onChange(isEmpty ? contacts : [...contacts, next]);
      return;
    }
    onChange(isEmpty
      ? contacts.filter((_, position) => position !== index)
      : contacts.map((old, position) => (position === index ? next : old)));
  };

  return (
    <FormGroup icon={Users2} title="Workspace contacts" aside="Name is enough to keep one">
      <div className="flex flex-col gap-2.5">
        {COWORKING_CONTACT_ROLES.map(([role, label]) => {
          const row = rowFor(role);
          return (
            <div key={role} className="flex flex-col gap-1.5">
              <FormLabel>{label}</FormLabel>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(165px,1fr))]">
                <FormInput placeholder="Name" value={row.name || ""} onChange={(event) => patch(role, { name: event.target.value })} />
                <FormInput type="tel" inputMode="numeric" maxLength={15} placeholder="Phone" value={row.phone || ""} onChange={(event) => patch(role, { phone: event.target.value })} />
                <FormInput type="email" placeholder="Email (optional)" value={row.email || ""} onChange={(event) => patch(role, { email: event.target.value })} />
              </div>
            </div>
          );
        })}
      </div>
    </FormGroup>
  );
};

/* Step 3, Admin / Manager only - the catalogue leaves this field out for everyone else. */
export const CoworkingPartnerTerms = ({ fields = [], specs = {}, setSpec }) => {
  const def = byKey(fields).partnerTerms;
  if (!def) return null;
  return (
    <FormGroup icon={Lock} title={def.label} aside="Admin & Manager only · never in the client brochure">
      <textarea
        rows={3}
        value={specs.partnerTerms || ""}
        onChange={(event) => setSpec("partnerTerms", event.target.value)}
        placeholder="Brokerage %, referral split, payout terms, who the agreement is with…"
        className="gl-field w-full resize-none px-3.5 py-2.5 text-[14px] outline-none"
      />
    </FormGroup>
  );
};
