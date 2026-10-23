import { useEffect, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import api from "../../services/api";

/*
 * Monthly attendance violations, in the glass Attendance design.
 *
 *   variant="team"      one compact row per person: rejected-leave dots,
 *                       uninformed count and the level pill; reviewers can
 *                       open the occurrence history and record a review.
 *   variant="personal"  the signed-in person's two counters as tiles.
 *
 * Thresholds (server-side): rejected-leave absence - warning at 3, management
 * review at 5; uninformed absence - management review at 3.
 */

const LEVEL = {
  RECORDED: ["Recorded", "var(--g-mut)", "var(--g-track)"],
  WARNING: ["Warning", "var(--g-warn)", "var(--g-warns)"],
  MANAGEMENT_REVIEW: ["Management review", "var(--g-bad)", "var(--g-bads)"],
};
const LEVEL_RANK = { RECORDED: 0, WARNING: 1, MANAGEMENT_REVIEW: 2 };
const readable = (value) => String(value || "").replaceAll("_", " ").toLowerCase();
const initials = (name = "") => String(name).trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "-";
const monthLabel = (month) => {
  const [y, m] = String(month || "").split("-").map(Number);
  return y && m ? new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : month;
};
const worst = (row) => (LEVEL_RANK[row.rejectedLevel] || 0) >= (LEVEL_RANK[row.uninformedLevel] || 0) ? row.rejectedLevel : row.uninformedLevel;

const LevelPill = ({ level }) => {
  const [label, fg, bg] = LEVEL[level] || LEVEL.RECORDED;
  return <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={{ color: fg, background: bg }}>{label}</span>;
};

const dotColor = (index, count) => {
  if (index >= count) return "var(--g-track)";
  if (index >= 4) return "var(--g-bad)";
  if (index >= 2) return "var(--g-warn)";
  return "var(--g-fnt)";
};

const card = { background: "var(--g-glass)", border: "1px solid var(--g-line)", boxShadow: "var(--g-shadow)" };
const tile = { background: "var(--g-glassHi)", border: "1px solid var(--g-edge, var(--g-line))" };
const field = { background: "var(--g-glassHi)", border: "1px solid var(--g-edge, var(--g-line))", color: "var(--g-ink)" };

export default function AttendanceViolations({ month, canReview, variant = "team" }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState("MANAGEMENT_REVIEW");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let active = true;
    api.get("/attendance/violations", { params: { month } })
      .then(({ data: payload }) => { if (active) { setData(payload); setError(""); } })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || "Could not load violations"); });
    return () => { active = false; };
  }, [month, version]);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/attendance/violations/${selected._id}`, { action, note });
      setSelected(null);
      setNote("");
      setVersion((value) => value + 1);
    } catch (saveError) {
      setError(saveError.response?.data?.message || "Review failed");
    } finally {
      setBusy(false);
    }
  };

  const summaries = [...(data?.summaries || [])].sort((a, b) => (LEVEL_RANK[worst(b)] || 0) - (LEVEL_RANK[worst(a)] || 0) || (b.uninformed + b.rejectedLeave) - (a.uninformed + a.rejectedLeave));
  const reviewCount = summaries.filter((row) => worst(row) === "MANAGEMENT_REVIEW").length;

  /* ---------------------------------------------------------- personal */
  if (variant === "personal") {
    const mine = summaries[0];
    const level = mine ? worst(mine) : "RECORDED";
    return (
      <section className="flex flex-col gap-3 rounded-[22px] px-[18px] py-4" style={card}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[11px]" style={{ background: "var(--g-bads)", color: "var(--g-bad)" }}><ShieldCheck size={17} /></span>
          <div className="flex flex-1 flex-col">
            <span className="text-[15px] font-extrabold">My violations · {monthLabel(month)}</span>
            <span className="text-[12px]" style={{ color: "var(--g-mut)" }}>{level === "RECORDED" ? "Nothing that needs attention" : "Your manager has been notified"}</span>
          </div>
          {mine ? <LevelPill level={level} /> : null}
        </div>
        {error ? <p role="alert" className="text-[13px]" style={{ color: "var(--g-bad)" }}>{error}</p> : null}
        {!data ? <p className="text-[13px]" style={{ color: "var(--g-mut)" }}>Loading…</p> : (
          <div className="flex flex-wrap gap-2.5">
            <div className="flex flex-[1_1_220px] flex-col gap-2 rounded-[14px] px-3.5 py-3" style={tile}>
              <div className="flex justify-between"><span className="text-[12.5px] font-bold">Rejected-leave absence</span><span className="font-mono text-[13px] font-semibold">{mine?.rejectedLeave || 0} / 5</span></div>
              <div className="flex gap-1">{[0, 1, 2, 3, 4].map((i) => <i key={i} className="h-2 flex-1 rounded-[3px]" style={{ background: dotColor(i, mine?.rejectedLeave || 0) }} />)}</div>
              <span className="text-[11.5px]" style={{ color: "var(--g-mut)" }}>Warning at 3 · review at 5</span>
            </div>
            <div className="flex flex-[1_1_220px] flex-col gap-2 rounded-[14px] px-3.5 py-3" style={tile}>
              <div className="flex justify-between"><span className="text-[12.5px] font-bold">Uninformed absence</span><span className="font-mono text-[13px] font-semibold" style={{ color: (mine?.uninformed || 0) >= 3 ? "var(--g-bad)" : "var(--g-ink)" }}>{mine?.uninformed || 0}</span></div>
              <div className="h-2 overflow-hidden rounded" style={{ background: "var(--g-bads)" }}><div className="h-full rounded" style={{ width: `${Math.min(100, ((mine?.uninformed || 0) / 3) * 100)}%`, background: "var(--g-bad)" }} /></div>
              <span className="text-[11.5px]" style={{ color: "var(--g-mut)" }}>Review at 3 — tell your manager before missing a day</span>
            </div>
          </div>
        )}
      </section>
    );
  }

  /* -------------------------------------------------------------- team */
  return (
    <section className="overflow-hidden rounded-[22px]" style={card}>
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5" style={{ borderBottom: "1px solid var(--g-div)" }}>
        <span className="grid h-[34px] w-[34px] place-items-center rounded-[11px]" style={{ background: "var(--g-bads)", color: "var(--g-bad)" }}><ShieldCheck size={17} /></span>
        <div className="flex min-w-[180px] flex-1 flex-col">
          <span className="text-[15px] font-extrabold">Violations · {monthLabel(month)}</span>
          <span className="text-[12px]" style={{ color: "var(--g-mut)" }}>{reviewCount} need management review · warning at 3 rejected, review at 5 rejected or 3 uninformed</span>
        </div>
      </div>

      {error ? <p role="alert" className="px-4 py-3 text-[13px]" style={{ color: "var(--g-bad)" }}>{error}</p> : null}
      {!data ? <p className="px-4 py-4 text-[13px]" style={{ color: "var(--g-mut)" }}>Loading…</p> : summaries.length ? summaries.map((row, index) => (
        <div key={row.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-[11px]" style={{ borderTop: index ? "1px solid var(--g-div)" : 0 }}>
          <div className="flex min-w-0 flex-[1_1_180px] items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[11px] font-extrabold" style={{ background: "var(--g-bs)", color: "var(--g-b)" }}>{initials(row.name)}</span>
            <span className="truncate text-[13.5px] font-bold">{row.name}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Rejected-leave absences">
            <span className="text-[11px] font-bold" style={{ color: "var(--g-fnt)" }}>REJ</span>
            <div className="flex gap-[3px]">{[0, 1, 2, 3, 4].map((i) => <i key={i} className="h-2 w-3 rounded-[3px]" style={{ background: dotColor(i, row.rejectedLeave) }} />)}</div>
            <span className="font-mono text-[12px] font-semibold">{row.rejectedLeave}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Uninformed absences">
            <span className="text-[11px] font-bold" style={{ color: "var(--g-fnt)" }}>UNINF</span>
            <span className="font-mono text-[12.5px] font-semibold" style={{ color: row.uninformed >= 3 ? "var(--g-bad)" : "var(--g-mut)" }}>{row.uninformed}</span>
          </div>
          <LevelPill level={worst(row)} />
        </div>
      )) : <p className="px-4 py-5 text-[13px] font-bold" style={{ color: "var(--g-ok)" }}>No violations this month.</p>}

      {data?.violations?.length ? (
        <div style={{ borderTop: "1px solid var(--g-div)" }}>
          <button type="button" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-bold">
            <span className="flex-1">Occurrences &amp; audit history ({data.violations.length})</span>
            <ChevronDown size={16} style={{ transform: showHistory ? "rotate(180deg)" : "none", transition: "transform .25s" }} />
          </button>
          {showHistory ? (
            <div className="flex flex-col gap-2 px-4 pb-4">
              {data.violations.map((row) => (
                <article key={row._id} className="rounded-[12px] px-3 py-2.5 text-[12.5px]" style={tile}>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{row.userName}</strong>
                    <span className="font-mono" style={{ color: "var(--g-mut)" }}>{row.date}</span>
                    <span className="capitalize" style={{ color: "var(--g-mut)" }}>{readable(row.kind)} #{row.ordinal}</span>
                    {row.active ? <LevelPill level={row.level} /> : <span style={{ color: "var(--g-mut)" }}>Resolved / excused</span>}
                  </div>
                  {row.history.map((event, index) => (
                    <p key={index} className="mt-1" style={{ color: "var(--g-mut)" }}>
                      {new Date(event.at).toLocaleString()}: <span className="capitalize">{readable(event.action)}</span> — {event.note}
                    </p>
                  ))}
                  {canReview && row.active ? (
                    <button
                      type="button"
                      className="mt-1.5 font-bold hover:underline"
                      style={{ color: "var(--g-b)" }}
                      onClick={() => {
                        setSelected(row);
                        setNote("");
                        setAction(row.level === "WARNING" ? "WARNING_ISSUED" : row.level === "MANAGEMENT_REVIEW" ? "MANAGEMENT_REVIEW" : "EXCUSED");
                      }}
                    >
                      Record review / excuse absence
                    </button>
                  ) : null}
                </article>
              ))}
              {data.policyNote ? <p className="text-[12px]" style={{ color: "var(--g-mut)" }}>{data.policyNote}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {selected ? (
        <form onSubmit={save} className="flex flex-col gap-2 px-4 pb-4 pt-3" style={{ borderTop: "1px solid var(--g-div)" }}>
          <h5 className="text-[14px] font-extrabold">Review {selected.userName} — {selected.date}</h5>
          <select aria-label="Review action" value={action} onChange={(event) => setAction(event.target.value)} className="h-10 rounded-[11px] px-3 text-[13px] outline-none" style={field}>
            {selected.level !== "RECORDED" ? <option value="WARNING_ISSUED">Warning issued</option> : null}
            <option value="MANAGEMENT_REVIEW">Management review</option>
            <option value="EXCUSED">Excuse absence</option>
          </select>
          <textarea aria-label="Review note" required maxLength={1000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="resize-y rounded-[11px] p-2.5 text-[13px] outline-none" style={field} placeholder="Approved wording, action taken, or reason for exemption" />
          <div className="flex gap-2">
            <button disabled={busy} className="h-10 rounded-[11px] px-4 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: "var(--g-bfill)" }}>{busy ? "Saving…" : "Save review"}</button>
            <button type="button" onClick={() => setSelected(null)} className="h-10 rounded-[11px] px-4 text-[13px] font-bold" style={tile}>Cancel</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
