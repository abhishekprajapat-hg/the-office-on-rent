/*
 * Reading an owner or broker list off a spreadsheet somebody already keeps
 * (web modules/inventory/contactBulkImport). Headers are matched by meaning,
 * not position - "Mobile No.", "Contact Number" and "phone" are one column -
 * and anything unrecognised is ignored rather than guessed at. Pure; unit tested.
 */

export const CONTACT_COLUMNS = ["name", "phone", "email", "company", "city", "propertyDetails", "notes"] as const;
export type ContactRow = Record<(typeof CONTACT_COLUMNS)[number], string>;

const HEADER_ALIASES: Record<(typeof CONTACT_COLUMNS)[number], string[]> = {
  name: ["name", "fullname", "contactname", "ownername", "brokername", "contactperson", "person"],
  phone: ["phone", "phoneno", "phonenumber", "mobile", "mobileno", "mobilenumber", "contact", "contactno", "contactnumber", "number", "whatsapp"],
  email: ["email", "emailid", "emailaddress", "mail"],
  company: ["company", "companyname", "firm", "firmname", "agency", "organisation", "organization", "brokerage"],
  city: ["city", "town", "location", "area"],
  propertyDetails: ["propertydetails", "property", "properties", "propertyinfo", "inventory", "inventorydetails", "unit", "units"],
  notes: ["notes", "note", "remarks", "remark", "comment", "comments", "description"],
};

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const columnMap = (header: unknown[]) => {
  const map = new Map<string, number>();
  header.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    if (!normalized) return;
    const field = CONTACT_COLUMNS.find((column) => HEADER_ALIASES[column].includes(normalized));
    // First matching column wins, so a stray duplicate later cannot overwrite the real one.
    if (field && !map.has(field)) map.set(field, index);
  });
  return map;
};

/* The rows to POST to /contacts/bulk; throws when the sheet has no name and phone columns. */
export const contactRowsFromMatrix = (matrix: unknown[][]): ContactRow[] => {
  const headerIndex = matrix.findIndex((row) => columnMap(row).size > 0);
  if (headerIndex === -1) throw new Error("No recognisable columns. The sheet needs at least a name and a phone column.");
  const columns = columnMap(matrix[headerIndex]!);
  if (!columns.has("name") || !columns.has("phone")) throw new Error("The sheet needs both a name column and a phone column.");
  const read = (row: unknown[], field: string) => {
    const index = columns.get(field);
    return index === undefined ? "" : String(row[index] ?? "").trim();
  };
  return matrix
    .slice(headerIndex + 1)
    .map((row) => Object.fromEntries(CONTACT_COLUMNS.map((field) => [field, read(row, field)])) as ContactRow)
    .filter((row) => row.name || row.phone);
};

export const CONTACT_TEMPLATE_CSV = `${CONTACT_COLUMNS.join(",")}\nRavi Sharma,9876543210,ravi@example.com,Sharma Realty,Indore,"2 shops on MG Road",Prefers calls after 6pm\n`;
