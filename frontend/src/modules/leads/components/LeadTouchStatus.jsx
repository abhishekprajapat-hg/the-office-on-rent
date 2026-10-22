import React, { useState } from "react";
import { Clock, Loader2, PhoneCall } from "lucide-react";
import { logLeadTouch } from "../../../services/leadService";
import { toErrorMessage } from "../../../utils/errorMessage";

const formatTouch = (minutes) => {
  if (minutes === null || minutes === undefined) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ""}`;
};
const SOURCE_LABEL = { MANUAL: "logged by hand", CRM_ACTION: "from the CRM button", SYSTEM: "verified" };

/*
 * Untouched / touched and how long the first touch took (requirements 16 Oct
 * 2026, section 08). A touch is a logged call or a message sent - opening the
 * lead does not count.
 */
const LeadTouchStatus = ({ lead, isDark, onLogged }) => {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  if (!lead?._id) return null;
  const touched = Boolean(lead.firstTouchAt);
  const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 60000));

  const log = async (channel) => {
    setBusy(channel); setMessage("");
    try {
      const out = await logLeadTouch(lead._id, { channel, source: "MANUAL" });
      setMessage(out.message || "Touch logged");
      onLogged?.(out.touch);
    } catch (e) {
      setMessage(toErrorMessage(e, "Couldn't log"));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className={`mt-3 rounded-xl border p-3 text-[12.5px] ${touched ? (isDark ? "border-emerald-500/30 bg-emerald-500/5" : "border-emerald-200 bg-emerald-50/60") : (isDark ? "border-amber-500/30 bg-amber-500/5" : "border-amber-200 bg-amber-50/70")}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Clock size={14} className={touched ? "text-emerald-600" : "text-amber-600"} />
        {touched ? (
          <span><strong>Touched</strong> · first touch {formatTouch(lead.touchMinutes)} after the lead arrived ({String(lead.firstTouchChannel || "").toLowerCase()}, {SOURCE_LABEL[lead.firstTouchSource] || "logged"}){lead.touchCount > 1 ? ` · ${lead.touchCount} touches` : ""}</span>
        ) : (
          <span><strong>Untouched</strong> · waiting {formatTouch(ageMinutes)} since it arrived</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {["CALL", "WHATSAPP", "SMS", "EMAIL"].map((channel) => (
          <button key={channel} type="button" disabled={Boolean(busy)} onClick={() => log(channel)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-blue-300 disabled:opacity-60">
            {busy === channel ? <Loader2 size={11} className="animate-spin" /> : channel === "CALL" ? <PhoneCall size={11} /> : null}
            Log {channel === "WHATSAPP" ? "WhatsApp" : channel.toLowerCase()}
          </button>
        ))}
        {message ? <span className="text-[11.5px] font-semibold">{message}</span> : null}
      </div>
    </div>
  );
};

export default LeadTouchStatus;
