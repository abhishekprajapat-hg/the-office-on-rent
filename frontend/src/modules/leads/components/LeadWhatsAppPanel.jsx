import React, { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";
import { getLeadWhatsApp, sendLeadWhatsApp, setLeadWhatsAppConsent } from "../../../services/leadService";
import { toErrorMessage } from "../../../utils/errorMessage";

const STATUS_LABEL = {
  pending: "waiting to go",
  scheduled: "scheduled",
  queued: "sending",
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  cancelled: "cancelled",
  skipped: "not sent",
};

const when = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

/*
 * The customer's WhatsApp, from the company's WhatsApp app: the last messages, whether they can be
 * written to freely (24 hours since they last wrote), the messages the CRM asked for (enquiry
 * acknowledgement, visit confirmation and reminders), their agreement, and a follow-up button.
 */
const LeadWhatsAppPanel = ({ leadId, isDark }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      setData(await getLeadWhatsApp(leadId));
    } catch (e) {
      setMessage(toErrorMessage(e, "Couldn't load WhatsApp"));
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    setData(null);
    setMessage("");
    load();
  }, [load]);

  if (!leadId || !data || !data.configured) return null;
  const chat = data.chat;
  const followUp = (data.purposes || []).find((row) => row.purpose === "follow_up");

  const send = async () => {
    setBusy("send");
    setMessage("");
    try {
      const out = await sendLeadWhatsApp(leadId, "follow_up");
      setMessage(out.message || "Sent");
      await load();
    } catch (e) {
      setMessage(toErrorMessage(e, "Couldn't send"));
    } finally {
      setBusy("");
    }
  };

  const consent = async (given) => {
    setBusy("consent");
    setMessage("");
    try {
      const out = await setLeadWhatsAppConsent(leadId, given);
      setData((current) => ({ ...current, consent: out.consent }));
    } catch (e) {
      setMessage(toErrorMessage(e, "Couldn't save"));
    } finally {
      setBusy("");
    }
  };

  const box = isDark ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const bubbleIn = isDark ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-800";
  const bubbleOut = isDark ? "bg-emerald-900/50 text-emerald-50" : "bg-emerald-50 text-emerald-900";

  return (
    <div className={`mt-3 rounded-xl border p-3 text-[12.5px] ${box}`}>
      <div className="flex flex-wrap items-center gap-2">
        <MessageCircle size={14} className="text-emerald-600" />
        <strong>WhatsApp</strong>
        {chat?.found ? (
          <span className={muted}>
            {chat.assignedTo ? `with ${chat.assignedTo.name}` : "not assigned"} · {chat.windowOpen ? "can reply freely (customer wrote in the last 24 h)" : "templates only (no message from the customer in 24 h)"}
          </span>
        ) : (
          <span className={muted}>{data.problem || "No chat with this number yet"}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {data.chatUrl ? (
            <a href={data.chatUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
              Open chat <ExternalLink size={11} />
            </a>
          ) : null}
          <button type="button" onClick={load} disabled={loading} aria-label="Refresh WhatsApp" className={muted}>
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
        </span>
      </div>

      {chat?.messages?.length ? (
        <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
          {chat.messages.slice(-8).map((row, index) => (
            <div key={index} className={`max-w-[85%] rounded-lg px-2 py-1 ${row.direction === "in" ? `self-start ${bubbleIn}` : `self-end ${bubbleOut}`}`}>
              <div className="whitespace-pre-wrap break-words">{row.text || "(no text)"}</div>
              <div className={`mt-0.5 text-[10.5px] ${muted}`}>
                {when(row.at)}
                {row.direction === "out" ? ` · ${row.automatic ? "automatic" : row.by || "team"} · ${row.status}` : ""}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {data.requested?.length ? (
        <div className="mt-2">
          <div className={`text-[11px] font-semibold uppercase tracking-wide ${muted}`}>Messages from the CRM</div>
          <ul className="mt-1 space-y-0.5">
            {data.requested.slice(0, 6).map((row) => (
              <li key={row.key}>
                {row.label} · <strong>{STATUS_LABEL[row.status] || row.status}</strong>
                {row.sendAt && row.status === "scheduled" ? ` for ${when(row.sendAt)}` : ""}
                {row.reason && ["failed", "skipped"].includes(row.status) ? <span className={muted}> · {row.reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={Boolean(data.consent?.given)} disabled={busy === "consent"} onChange={(event) => consent(event.target.checked)} />
          <span>Customer agreed to WhatsApp messages</span>
          {data.consent?.given && data.consent.source ? <span className={muted}>({data.consent.source})</span> : null}
        </label>
        {followUp ? (
          <button
            type="button"
            onClick={send}
            disabled={Boolean(busy) || !followUp.ready || !(data.consent?.given || data.linked)}
            title={!followUp.ready ? followUp.problem : !(data.consent?.given || data.linked) ? "Record the customer's agreement first" : "Sends the approved follow-up template from the company number"}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11.5px] font-semibold text-emerald-800 hover:border-emerald-400 disabled:opacity-50"
          >
            {busy === "send" ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
            Send follow-up
          </button>
        ) : null}
        {followUp && !followUp.ready ? <span className={muted}>{followUp.problem}</span> : null}
        {message ? <span className="text-[11.5px] font-semibold">{message}</span> : null}
      </div>
    </div>
  );
};

export default LeadWhatsAppPanel;
