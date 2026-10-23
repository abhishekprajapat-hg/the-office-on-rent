import React, { useEffect, useRef } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";

/*
 * Step-by-step form shell (CRM Web Glass "New Project Form" design).
 *
 *   header    icon tile, title, "Step n of N · name", % chip, close
 *   progress  bar + clickable step chips (done ✓ / needs attention ! / todo)
 *   body      the current step, sliding in from the side it came from
 *   footer    Back / Cancel, inline error, optional Skip, primary action
 *
 * The parent owns the data and decides what a step's errors are; this only
 * draws the frame. Colours come from the glass tokens (theme-aware).
 *
 * Props
 *   steps        [{ key, label, hint }]
 *   step         current index
 *   stepState    (i) => "done" | "bad" | "todo"   (current step is drawn active)
 *   canOpenStep  (i) => boolean                    (clicking a chip)
 *   onStep       (i) => void
 *   onClose, onBack, onNext, onSkip
 *   primaryLabel, primaryIcon ("next" | "save"), busy, error
 *   skipLabel    text of the secondary action (default "Skip for now")
 *   persistent   true when the parent keeps every step mounted and only hides
 *                the inactive ones (it then animates its own active step)
 */
const FormWizard = ({
  icon: Icon,
  title,
  steps,
  step,
  dir = 1,
  stepState = () => "todo",
  canOpenStep = (i) => i <= step,
  onStep,
  onClose,
  onBack,
  onNext,
  onSkip,
  skipLabel = "Skip for now",
  persistent = false,
  primaryLabel,
  primaryIcon = "next",
  busy = false,
  error = "",
  width = 860,
  children,
}) => {
  const bodyRef = useRef(null);
  const total = steps.length;
  const pct = total > 1 ? Math.round((step / (total - 1)) * 100) : 100;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="gl-wizard-backdrop fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="gl-wizard flex max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-3xl sm:max-h-[calc(100dvh-48px)]"
        style={{ maxWidth: width }}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-[22px] pb-3.5 pt-[18px]">
          {Icon ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px]" style={{ background: "var(--g-bs)", color: "var(--g-b)" }}><Icon size={19} /></span> : null}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[18px] font-semibold">{title}</span>
            <span className="truncate text-[12.5px]" style={{ color: "var(--g-mut)" }}>Step {step + 1} of {total} · {steps[step]?.label}</span>
          </div>
          <span className="rounded-full px-2.5 py-1 font-mono text-[12px] font-medium" style={{ background: "var(--g-bs)", color: "var(--g-b)" }}>{pct}%</span>
          <button type="button" onClick={onClose} aria-label="Close" className="gl-wizard-ghost grid h-9 w-9 place-items-center rounded-[11px]"><X size={18} /></button>
        </div>

        {/* progress */}
        <div className="flex flex-col gap-3 px-[22px] pb-4" style={{ borderBottom: "1px solid var(--g-div)" }}>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--g-track)" }}>
            <div className="h-full rounded-full transition-[width] duration-500 [transition-timing-function:cubic-bezier(.3,1,.4,1)]" style={{ width: `${Math.max(4, pct)}%`, background: "linear-gradient(90deg, rgb(var(--blue-500)), rgb(var(--blue-700)))" }} />
          </div>
          <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
            {steps.map((s, i) => {
              const current = i === step;
              const state = current ? "current" : stepState(i);
              const clickable = !current && canOpenStep(i);
              const circle = {
                current: { background: "var(--g-bfill, var(--g-b))", color: "#fff", boxShadow: "0 0 0 4px var(--g-bs)" },
                done: { background: "var(--g-bs)", color: "var(--g-b)" },
                bad: { background: "var(--g-bads)", color: "var(--g-bad)" },
                todo: { background: "var(--g-glassHi)", color: "var(--g-fnt)", border: "1px solid var(--g-edge, var(--g-line))" },
              }[state];
              return (
                <li key={s.key} className="min-w-0">
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && onStep?.(i)}
                    aria-current={current ? "step" : undefined}
                    className="flex w-full min-w-0 items-center gap-2 px-0.5 py-1 text-left disabled:cursor-default"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold transition-all duration-300" style={circle}>
                      {state === "done" ? <Check size={14} strokeWidth={3} /> : state === "bad" ? <AlertCircle size={14} /> : i + 1}
                    </span>
                    <span className="hidden min-w-0 flex-col leading-tight sm:flex">
                      <span className="truncate text-[12.5px]" style={{ fontWeight: current ? 600 : 500, color: current || state === "done" ? "var(--g-ink)" : "var(--g-mut)" }}>{s.label}</span>
                      <span className="truncate text-[10.5px]" style={{ color: state === "bad" ? "var(--g-bad)" : "var(--g-fnt)" }}>{state === "bad" ? "Needs attention" : s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* body */}
        <div ref={bodyRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-[22px] pb-6 pt-5">
          {persistent ? children : (
            <div key={step} className={`flex flex-col gap-[18px] ${dir < 0 ? "gl-step-back" : "gl-step-in"}`}>
              {children}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center gap-2.5 px-[22px] py-3.5" style={{ borderTop: "1px solid var(--g-div)" }}>
          <button type="button" onClick={step ? onBack : onClose} className="gl-wizard-ghost flex h-[46px] items-center gap-1.5 rounded-[13px] px-4 text-[14px] font-medium">
            {step ? <ArrowLeft size={16} /> : <X size={16} />}{step ? "Back" : "Cancel"}
          </button>
          <span role={error ? "alert" : undefined} className="min-w-[120px] flex-1 text-[12.5px]" style={{ color: "var(--g-bad)" }}>{error}</span>
          {onSkip ? <button type="button" onClick={onSkip} className="h-[46px] px-3.5 text-[13.5px] font-medium" style={{ color: "var(--g-mut)" }}>{skipLabel}</button> : null}
          <button
            type="button"
            onClick={onNext}
            disabled={busy}
            className="flex h-[46px] items-center gap-2 rounded-[13px] px-[22px] text-[14px] font-semibold text-white transition active:scale-[.98] disabled:opacity-60"
            style={{ background: "var(--g-bfill, var(--g-b))", boxShadow: "0 8px 20px var(--g-bglow, rgba(37,73,214,.3))" }}
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : null}
            {primaryLabel}
            {!busy ? (primaryIcon === "save" ? <Check size={17} /> : <ArrowRight size={17} />) : null}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FormWizard;
