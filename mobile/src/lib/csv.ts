/* CSV for exports: every cell quoted, CRLF rows, so Excel and Sheets open it as written. Pure; unit tested. */
const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export const toCsv = (rows: unknown[][]) => rows.map((row) => row.map(cell).join(",")).join("\r\n");

/* "leads-2026-10-15.csv" */
export const datedFileName = (base: string, date = new Date(), ext = "csv") =>
  `${base}-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.${ext}`;
