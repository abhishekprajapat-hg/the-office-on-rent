import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, Check as CheckIcon, Paperclip } from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import { uploadFile } from "../../services/uploadService";
import { addEnterpriseAttachment, markEnterpriseReminderDone } from "../../services/enterpriseService";
import { FNT, MUT } from "../inventory/components/contactGlassTokens";
import { Btn, Tag } from "../database/dbUi";
import { fmtDate, money } from "../database/dbHelpers";
import { SEVERITY_TONE } from "./enterpriseHelpers";

/*
 * Receipts / bills / proof (2.5, 2.8, 2.9) and reminders (2.10) for the
 * Enterprise screens. Files go to the protected enterprise-documents folder:
 * only the Admin or a user allowed to download client documents can open them.
 */

/* Pick a file and upload it; calls onUploaded({ url, name }). */
export const FilePickButton = ({ onUploaded, label = "Attach", onError, disabled }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadFile(file, "enterprise-documents");
      await onUploaded({ url: up.url, name: file.name });
    } catch (err) { onError?.(toErrorMessage(err, "Upload failed")); }
    finally { setBusy(false); }
  };
  return (
    <>
      <input ref={ref} type="file" className="hidden" accept="image/*,application/pdf" onChange={pick} />
      <Btn disabled={busy || disabled} onClick={() => ref.current?.click()}><Paperclip size={13} /> {busy ? "Uploading…" : label}</Btn>
    </>
  );
};

/* Files already on a record, with an Attach button that adds one more. */
export const Attachments = ({ files = [], canDownload, target, id, onChanged, onError, compact = false }) => (
  <span className="inline-flex flex-wrap items-center gap-1.5">
    {files.map((f, i) => (canDownload
      ? <a key={i} href={f.url} target="_blank" rel="noreferrer" className="text-[12px] font-semibold underline" style={{ color: "var(--g-b)" }}>{f.name || `File ${i + 1}`}</a>
      : <span key={i} className="text-[12px]" style={FNT}>{f.name || `File ${i + 1}`} (restricted)</span>))}
    {target && id ? (
      <FilePickButton label={compact ? "" : files.length ? "Add" : "Attach"} onError={onError} onUploaded={async (file) => { await addEnterpriseAttachment({ target, id, ...file }); onChanged?.(); }} />
    ) : null}
  </span>
);

/* Open reminders, each with Done. */
export const ReminderList = ({ reminders = [], onChanged, onError, showOffice = true, empty = "No open reminders" }) => {
  const done = async (r) => {
    try { await markEnterpriseReminderDone(r._id); onChanged?.(); } catch (e) { onError?.(toErrorMessage(e)); }
  };
  if (!reminders.length) return <div className="py-3 text-[13px]" style={FNT}>{empty}</div>;
  return (
    <ul className="flex max-h-[360px] flex-col overflow-y-auto">
      {reminders.map((r) => (
        <li key={r._id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]" style={{ borderTop: "1px solid var(--g-div)" }}>
          <BellRing size={14} style={{ color: r.severity === "high" ? "var(--g-bad)" : "var(--g-warn)" }} />
          <Tag tone={SEVERITY_TONE[r.severity] || "mute"}>{r.severity}</Tag>
          {showOffice ? <Link to={`/enterprise/offices/${r.officeId}`} className="font-semibold" style={{ color: "var(--g-b)" }}>{r.officeName}</Link> : null}
          <span className="min-w-0 flex-1">{r.message}</span>
          <span style={MUT}>{r.dueDate ? fmtDate(r.dueDate) : ""}{r.amount ? ` · ${money(r.amount)}` : ""}</span>
          <Btn onClick={() => done(r)}><CheckIcon size={13} /> Done</Btn>
        </li>
      ))}
    </ul>
  );
};
