import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChatNotifications } from "../../context/useChatNotifications";

const MAX_TRACKED_MESSAGE_ALERT_IDS = 120;
const CHAT_TONE_COOLDOWN_MS = 1200;

const toIdString = (value) => String(value || "").trim();

const formatTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const playChatTone = () => {
  if (typeof window === "undefined") return;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;

  try {
    const audioContext = new AudioContextCtor();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const startAt = audioContext.currentTime;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(740, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(980, startAt + 0.12);

    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.2);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.22);
    oscillator.onended = () => {
      audioContext.close().catch(() => null);
    };
  } catch {
    // Browser autoplay rules can block sound until the user interacts.
  }
};

const ChatMessageAlertToast = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { recentNotifications } = useChatNotifications();
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("theme-dark"),
  );
  const [dismissedIds, setDismissedIds] = useState([]);
  const lastToneAtRef = useRef(0);
  const lastToneAlertIdRef = useRef("");

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("theme-dark"));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const activeAlert = useMemo(() => {
    if (location.pathname === "/chat") return null;

    return (
      recentNotifications.find((notification) => {
        const id = toIdString(notification?.id);
        if (!id) return false;
        return !dismissedIds.includes(id);
      }) || null
    );
  }, [dismissedIds, location.pathname, recentNotifications]);

  useEffect(() => {
    const alertId = toIdString(activeAlert?.id);
    if (!alertId || lastToneAlertIdRef.current === alertId) return;

    const now = Date.now();
    if (now - lastToneAtRef.current >= CHAT_TONE_COOLDOWN_MS) {
      lastToneAtRef.current = now;
      lastToneAlertIdRef.current = alertId;
      playChatTone();
    }
  }, [activeAlert?.id]);

  const rememberId = useCallback((id) => {
    if (!id) return;
    setDismissedIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      if (next.length > MAX_TRACKED_MESSAGE_ALERT_IDS) {
        return next.slice(next.length - MAX_TRACKED_MESSAGE_ALERT_IDS);
      }
      return next;
    });
  }, []);

  const dismissActiveAlert = useCallback(() => {
    rememberId(toIdString(activeAlert?.id));
  }, [activeAlert?.id, rememberId]);

  const handleOpenChat = useCallback(() => {
    if (!activeAlert) return;
    dismissActiveAlert();
    navigate("/chat", {
      state: { openConversationId: activeAlert.conversationId },
    });
  }, [activeAlert, dismissActiveAlert, navigate]);

  if (!activeAlert) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[112] w-[min(92vw,24rem)]">
      <div
        className={`pointer-events-auto rounded-2xl border p-3 shadow-2xl ${
          isDark
            ? "border-slate-700 bg-slate-900/95 text-slate-100"
            : "border-slate-200 bg-white text-slate-900"
        }`}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={handleOpenChat}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              <MessageSquare size={17} />
            </span>
            <span className="min-w-0">
              <span
                className={`block text-[10px] font-bold uppercase tracking-[0.14em] ${
                  isDark ? "text-cyan-300" : "text-cyan-700"
                }`}
              >
                New chat message
              </span>
              <span className="mt-0.5 block truncate text-sm font-semibold">
                {activeAlert.senderName || "New message"}
              </span>
              <span className={`mt-0.5 block line-clamp-2 text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                {activeAlert.preview || "Open chat to view message"}
              </span>
              <span className={`mt-1 block text-[11px] ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                {formatTime(activeAlert.createdAt)}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={dismissActiveAlert}
            className={`rounded-lg border p-1.5 ${
              isDark
                ? "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
            aria-label="Dismiss chat notification"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatMessageAlertToast;
