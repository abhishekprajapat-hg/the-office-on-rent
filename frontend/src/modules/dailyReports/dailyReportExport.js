/*
 * PDF and Excel downloads of daily reports. Both are built from the same
 * /daily-reports/summary response the screen shows, so the files always match
 * what the person sees and only contain what the server let them read.
 *
 * Each employee keeps their own form's columns (roles are not forced into one
 * shape). Totals are plain sums; averages divide by days with a report; days
 * worked without a report are listed, never counted as zero.
 */

const ROLE_LABEL = (role) => String(role || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const SEGMENT_LABEL = (segment) => (segment ? segment.charAt(0) + segment.slice(1).toLowerCase() : "");

export const formatDateKey = (key) => {
  if (!key) return "";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
};

export const periodLabel = (from, to) => (from === to ? formatDateKey(from) : `${formatDateKey(from)} to ${formatDateKey(to)}`);

const formByKey = (forms = []) => new Map(forms.map((f) => [f.key, f]));

/* Column list for one employee: their form's fields, in form order. */
export const columnsFor = (employee, forms) => {
  const map = formByKey(forms);
  const keys = employee.formKeys?.length ? employee.formKeys : [employee.formKey];
  const seen = new Set();
  const counts = [];
  const texts = [];
  keys.forEach((k) => (map.get(k)?.fields || []).forEach((f) => {
    if (seen.has(f.key)) return;
    seen.add(f.key);
    (f.kind === "count" ? counts : texts).push(f);
  }));
  return { counts, texts, hasIssues: keys.some((k) => map.get(k)?.hasIssues) };
};

const issueLine = (i) => [i.category, i.description, i.location && `@ ${i.location}`, i.actionTaken && `- ${i.actionTaken}`, `[${i.status}/${i.priority}]`]
  .filter(Boolean).join(" ");

/* ----------------------------------------------------------- Excel -- */

export const downloadDailyReportsXlsx = async (summary, fileName) => {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const period = periodLabel(summary.from, summary.to);

  // Sheet 1: one row per employee per day - easy to sort and filter.
  const dailyRows = [];
  const allCountKeys = [];
  const labels = new Map();
  summary.employees.forEach((e) => columnsFor(e, summary.forms).counts.forEach((f) => {
    if (!labels.has(f.key)) { labels.set(f.key, f.label); allCountKeys.push(f.key); }
  }));
  summary.employees.forEach((e) => {
    const cols = columnsFor(e, summary.forms);
    e.days.forEach((d) => {
      const row = {
        Employee: e.user?.name || "",
        Role: ROLE_LABEL(e.user?.role),
        Segment: SEGMENT_LABEL(e.user?.roleType),
        Date: d.reportDate,
      };
      allCountKeys.forEach((k) => { row[labels.get(k)] = d.counts?.[k] ?? ""; });
      cols.texts.forEach((f) => { row[f.label] = d.notes?.[f.key] || ""; });
      if (cols.hasIssues) row.Issues = (d.issues || []).map(issueLine).join(" | ");
      row.Corrected = d.amended ? "Yes" : "";
      dailyRows.push(row);
    });
  });
  const daily = XLSX.utils.json_to_sheet(dailyRows.length ? dailyRows : [{ Note: "No reports in this period" }]);
  XLSX.utils.book_append_sheet(wb, daily, "Daily reports");

  // Sheet 2: period totals per employee.
  const totalRows = summary.employees.map((e) => {
    const row = {
      Employee: e.user?.name || "",
      Role: ROLE_LABEL(e.user?.role),
      Segment: SEGMENT_LABEL(e.user?.roleType),
      Period: period,
      "Days reported": e.daysSubmitted,
      "Days missing": e.missingDates.length,
    };
    allCountKeys.forEach((k) => { row[`${labels.get(k)} (total)`] = e.totals?.[k] ?? ""; });
    allCountKeys.forEach((k) => { row[`${labels.get(k)} (avg/day reported)`] = e.averages?.[k] ?? ""; });
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totalRows.length ? totalRows : [{ Note: "Nobody in scope" }]), "Totals");

  // Sheet 3: missing days.
  const missingRows = summary.employees.flatMap((e) => e.missingDates.map((d) => ({
    Employee: e.user?.name || "", Role: ROLE_LABEL(e.user?.role), Date: d, Note: "Checked in, no report",
  })));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(missingRows.length ? missingRows : [{ Note: "No missing reports" }]), "Missing");

  XLSX.writeFile(wb, fileName || `daily-reports-${summary.from}_${summary.to}.xlsx`);
};

/* ------------------------------------------------------------- PDF -- */

export const downloadDailyReportsPdf = async (summary, fileName) => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;
  let y = margin;
  const period = periodLabel(summary.from, summary.to);

  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 145);
    doc.text(`Daily reports - ${period} - generated ${new Date().toLocaleString("en-IN")}`, margin, pageH - 16);
    doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageW - margin, pageH - 16, { align: "right" });
  };
  const newPage = () => { footer(); doc.addPage(); y = margin; };
  const ensure = (h) => { if (y + h > pageH - 36) newPage(); };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text("THE OFFICE ON RENT - DAILY REPORTS", margin, y + 6);
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Period: ${period}    Employees: ${summary.employees.length}`, margin, y);
  y += 12;
  doc.text("Totals are plain sums. Averages are per day with a submitted report. Missing reports are listed, not counted as zero.", margin, y);
  y += 18;

  const drawTable = (headers, rows, widths, { boldLastRow = false } = {}) => {
    const rowH = 16;
    const drawHeader = () => {
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, widths.reduce((a, b) => a + b, 0), rowH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      let x = margin;
      headers.forEach((h, i) => { doc.text(doc.splitTextToSize(String(h), widths[i] - 6)[0], x + 3, y + 11); x += widths[i]; });
      y += rowH;
    };
    ensure(rowH * 2);
    drawHeader();
    rows.forEach((row, r) => {
      const wrapped = row.map((cell, i) => doc.splitTextToSize(String(cell ?? ""), widths[i] - 6));
      const h = Math.max(rowH, ...wrapped.map((w) => w.length * 10 + 6));
      if (y + h > pageH - 36) { newPage(); drawHeader(); }
      const bold = boldLastRow && r === rows.length - 1;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      let x = margin;
      wrapped.forEach((lines, i) => { doc.text(lines, x + 3, y + 11); x += widths[i]; });
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + h, margin + widths.reduce((a, b) => a + b, 0), y + h);
      y += h;
    });
    y += 10;
  };

  summary.employees.forEach((e) => {
    const cols = columnsFor(e, summary.forms);
    ensure(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(`${e.user?.name || "Employee"}`, margin, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`${ROLE_LABEL(e.user?.role)}  -  ${SEGMENT_LABEL(e.user?.roleType)}  -  ${e.daysSubmitted} day(s) reported, ${e.missingDates.length} missing`, margin, y + 17);
    y += 26;

    const usable = pageW - margin * 2;
    const dateW = 62;
    const textCols = [...cols.texts.map((f) => f.label), ...(cols.hasIssues ? ["Issues"] : [])];
    const countW = Math.min(70, (usable - dateW - textCols.length * 150) / Math.max(1, cols.counts.length));
    const textW = textCols.length ? (usable - dateW - countW * cols.counts.length) / textCols.length : 0;
    const headers = ["Date", ...cols.counts.map((f) => f.label), ...textCols];
    const widths = [dateW, ...cols.counts.map(() => countW), ...textCols.map(() => textW)];
    const rows = e.days.map((d) => [
      formatDateKey(d.reportDate) + (d.amended ? " *" : ""),
      ...cols.counts.map((f) => d.counts?.[f.key] ?? ""),
      ...cols.texts.map((f) => d.notes?.[f.key] || ""),
      ...(cols.hasIssues ? [(d.issues || []).map(issueLine).join("\n")] : []),
    ]);
    if (rows.length) {
      rows.push(["Total", ...cols.counts.map((f) => e.totals?.[f.key] ?? 0), ...textCols.map(() => "")]);
      rows.push(["Avg/day", ...cols.counts.map((f) => e.averages?.[f.key] ?? "-"), ...textCols.map(() => "")]);
      drawTable(headers, rows, widths, { boldLastRow: false });
    } else {
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("No reports submitted in this period.", margin, y);
      y += 14;
    }
    if (e.missingDates.length) {
      ensure(20);
      doc.setFontSize(9);
      doc.setTextColor(190, 18, 60);
      const line = doc.splitTextToSize(`Missing reports (checked in, no report): ${e.missingDates.map(formatDateKey).join(", ")}`, usable);
      doc.text(line, margin, y);
      y += line.length * 11 + 8;
    }
    if (e.days.some((d) => d.amended)) {
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("* corrected after submission", margin, y);
      y += 12;
    }
    y += 8;
  });

  footer();
  doc.save(fileName || `daily-reports-${summary.from}_${summary.to}.pdf`);
};
