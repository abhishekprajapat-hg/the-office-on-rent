import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, ExternalLink, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getAllLeads } from "../../services/leadService";

const ACTIVE_LEAD_STATUSES = new Set(["NEW", "CONTACTED", "INTERESTED", "SITE_VISIT"]);
const POLL_INTERVAL_MS = 60000;
const REMINDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const REMINDER_LOOKAHEAD_MS = 60 * 60 * 1000;
const REMINDER_STORAGE_KEY = "followUpReminderSeen:v1";
const MAX_SEEN_KEYS = 500;

const toIdString = (value) => String(value || "").trim();

/*
 * True while a form, modal or bottom sheet covers the page (4 Nov 2026): the
 * reminder steps aside so it never hides a dialog's Next / Save buttons, and
 * comes back when the dialog closes. Covers dialogs marked aria-modal and the
 * older full-screen overlays (fixed inset-0, z-index 50 or more).
 */
const isOverlayOpen = (doc = document, win = window) => {
  if (doc.querySelector('[aria-modal="true"], .mobile-bottom-sheet')) return true;
  const minW = win.innerWidth * 0.9;
  const minH = win.innerHeight * 0.8;
  for (const el of doc.querySelectorAll(".fixed.inset-0")) {
    if (el.closest(".follow-up-reminder-toast")) continue;
    const style = win.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") continue;
    if (!(Number.parseInt(style.zIndex, 10) >= 50)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width >= minW && rect.height >= minH) return true;
  }
  return false;
};

const useOverlayOpen = (enabled) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let frame = 0;
    const check = () => {
      frame = 0;
      setOpen(isOverlayOpen());
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(check); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    check();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);
  return open;
};

const readSeenReminderKeys = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(-MAX_SEEN_KEYS) : [];
  } catch {
    return [];
  }
};

const writeSeenReminderKeys = (keys) => {
  try {
    localStorage.setItem(
      REMINDER_STORAGE_KEY,
      JSON.stringify([...new Set(keys)].slice(-MAX_SEEN_KEYS)),
    );
  } catch {
    // Storage can be unavailable in private browsing.
  }
};

const getReminderBucket = (diffMs) => {
  if (diffMs <= -60 * 1000) return "overdue";
  if (diffMs <= 60 * 1000) return "due";
  if (diffMs <= 15 * 60 * 1000) return "15m";
  if (diffMs <= 30 * 60 * 1000) return "30m";
  if (diffMs <= 60 * 60 * 1000) return "60m";
  return "";
};

const getTimeLeftText = (diffMs) => {
  const absMs = Math.abs(diffMs);
  const totalMinutes = Math.max(1, Math.round(absMs / 60000));

  if (diffMs <= -60 * 1000) {
    if (totalMinutes < 60) return `${totalMinutes} min overdue`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m overdue` : `${hours}h overdue`;
  }

  if (diffMs <= 60 * 1000) return "Due now";
  if (totalMinutes < 60) return `${totalMinutes} min left`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m left` : `${hours}h left`;
};

const formatFollowUpTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildReminderKey = (lead, bucket) =>
  `${toIdString(lead?._id)}:${new Date(lead?.nextFollowUp).getTime()}:${bucket}`;

const normalizeReminderLead = (lead, nowMs) => {
  const leadId = toIdString(lead?._id);
  const followUpMs = new Date(lead?.nextFollowUp).getTime();
  const status = String(lead?.status || "").trim().toUpperCase();
  if (!leadId || !Number.isFinite(followUpMs) || !ACTIVE_LEAD_STATUSES.has(status)) {
    return null;
  }

  const diffMs = followUpMs - nowMs;
  if (diffMs < -REMINDER_LOOKBACK_MS || diffMs > REMINDER_LOOKAHEAD_MS) {
    return null;
  }

  const bucket = getReminderBucket(diffMs);
  if (!bucket) return null;

  return {
    ...lead,
    _reminderBucket: bucket,
    _reminderKey: buildReminderKey(lead, bucket),
    _reminderDiffMs: diffMs,
  };
};

const FollowUpReminderToast = ({ enabled = true }) => {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const [dismissedKeys, setDismissedKeys] = useState(() => readSeenReminderKeys());
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("theme-dark"),
  );
  const loadingRef = useRef(false);
  const overlayOpen = useOverlayOpen(enabled);

  const loadReminderLeads = useCallback(async () => {
    if (!enabled || loadingRef.current) return;
    loadingRef.current = true;

    const now = new Date();
    const from = new Date(now.getTime() - REMINDER_LOOKBACK_MS);
    const to = new Date(now.getTime() + REMINDER_LOOKAHEAD_MS);

    try {
      const rows = await getAllLeads({
        page: 1,
        limit: 200,
        fields: "_id,name,phone,city,projectInterested,status,nextFollowUp,assignedTo",
        followUpFrom: from.toISOString(),
        followUpTo: to.toISOString(),
      });
      setLeads(Array.isArray(rows) ? rows : []);
    } catch {
      setLeads([]);
    } finally {
      loadingRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLeads([]);
      return undefined;
    }

    loadReminderLeads();
    const pollId = window.setInterval(loadReminderLeads, POLL_INTERVAL_MS);
    const tickId = window.setInterval(() => setNowMs(Date.now()), 30000);

    return () => {
      window.clearInterval(pollId);
      window.clearInterval(tickId);
    };
  }, [enabled, loadReminderLeads]);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("theme-dark"));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const activeReminder = useMemo(() => {
    const rows = leads
      .map((lead) => normalizeReminderLead(lead, nowMs))
      .filter(Boolean)
      .filter((lead) => !dismissedKeys.includes(lead._reminderKey));

    rows.sort((a, b) => {
      const aOverdue = a._reminderDiffMs <= 0;
      const bOverdue = b._reminderDiffMs <= 0;
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return a._reminderDiffMs - b._reminderDiffMs;
    });

    return rows[0] || null;
  }, [dismissedKeys, leads, nowMs]);

  const rememberReminder = useCallback((key) => {
    if (!key) return;
    setDismissedKeys((prev) => {
      const next = [...new Set([...prev, key])].slice(-MAX_SEEN_KEYS);
      writeSeenReminderKeys(next);
      return next;
    });
  }, []);

  const handleDismiss = useCallback(() => {
    rememberReminder(activeReminder?._reminderKey);
  }, [activeReminder?._reminderKey, rememberReminder]);

  const handleOpen = useCallback(() => {
    const leadId = toIdString(activeReminder?._id);
    if (!leadId) return;
    rememberReminder(activeReminder?._reminderKey);
    navigate(`/leads/${leadId}`);
  }, [activeReminder, navigate, rememberReminder]);

  if (!enabled || !activeReminder || overlayOpen) return null;

  const timeLeftText = getTimeLeftText(activeReminder._reminderDiffMs);
  const isOverdue = activeReminder._reminderDiffMs < -60 * 1000;

  return (
    // Phones: a one-line strip under the header, so it never covers a page's
    // bottom buttons. Larger screens: the full card, bottom left.
    <div className="follow-up-reminder-toast pointer-events-none fixed left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+72px)] z-[113] sm:bottom-4 sm:left-4 sm:right-auto sm:top-auto sm:w-[min(92vw,25rem)] md:left-16">
      <div
        className={`pointer-events-auto rounded-2xl border px-3 py-2 shadow-2xl sm:p-3 ${
          isDark
            ? "border-amber-400/25 bg-slate-900/95 text-slate-100"
            : "border-amber-200 bg-white text-slate-900"
        }`}
      >
        <div className="flex items-center gap-2.5 sm:items-start sm:gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:mt-0.5 sm:h-10 sm:w-10 sm:rounded-xl ${
              isOverdue
                ? isDark ? "bg-rose-500/15 text-rose-200" : "bg-rose-50 text-rose-700"
                : isDark ? "bg-amber-500/15 text-amber-200" : "bg-amber-50 text-amber-700"
            }`}
          >
            <AlarmClock size={18} />
          </span>

          <div className="min-w-0 flex-1">
            <p
              className={`hidden text-[10px] font-bold uppercase tracking-[0.14em] sm:block ${
                isOverdue
                  ? isDark ? "text-rose-200" : "text-rose-700"
                  : isDark ? "text-amber-200" : "text-amber-700"
              }`}
            >
              Follow-up reminder
            </p>
            <p className="truncate text-[13px] font-semibold sm:mt-0.5 sm:text-sm">
              {activeReminder.name || "Lead follow-up"} | {timeLeftText}
            </p>
            <p className={`mt-0.5 hidden text-xs sm:block ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              {activeReminder.projectInterested || activeReminder.city || activeReminder.phone || "Follow up scheduled"}
            </p>
            <p className={`mt-1 hidden text-[11px] sm:block ${isDark ? "text-slate-500" : "text-slate-500"}`}>
              Scheduled: {formatFollowUpTime(activeReminder.nextFollowUp)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleOpen}
              className={`rounded-lg border p-1.5 ${
                isDark
                  ? "border-slate-700 text-slate-300 hover:border-amber-300 hover:text-amber-200"
                  : "border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-700"
              }`}
              aria-label="Open follow-up lead"
              title="Open lead"
            >
              <ExternalLink size={14} />
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className={`rounded-lg border p-1.5 ${
                isDark
                  ? "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800"
              }`}
              aria-label="Dismiss follow-up reminder"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FollowUpReminderToast;
