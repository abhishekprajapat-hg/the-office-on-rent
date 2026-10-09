import React from "react";
import { ChevronDown, Search, UserRound, X } from "lucide-react";

const initialsOf = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.map((part) => part[0]).slice(0, 2).join("").toUpperCase() : "?";
};

const roleLabel = (role) => String(role || "Team member").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export const PipelineAssigneePicker = ({ lead, assignees = [], canAssignLead = false, onAssign, variant = "table" }) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedUser, setSelectedUser] = React.useState(null);
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const triggerRef = React.useRef(null);
  const [menuPosition, setMenuPosition] = React.useState(null);
  const assigned = lead?.assignedTo;
  const isMobile = variant === "mobile";
  const users = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return (Array.isArray(assignees) ? assignees : []).filter((user) => !term || [user?.name, user?.email, user?.role, user?.phone].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [assignees, query]);

  const choose = (user) => {
    if (!user?._id || String(user._id) === String(assigned?._id || "")) { setOpen(false); return; }
    setSelectedUser(user);
    setReason("");
    setOpen(false);
  };
  const submit = async () => {
    if (!selectedUser?._id || !reason.trim() || submitting) return;
    setSubmitting(true);
    const complete = await onAssign?.(lead, selectedUser._id, reason.trim());
    setSubmitting(false);
    if (complete) setSelectedUser(null);
  };
  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) return undefined;
    const placeMenu = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        top: rect.bottom + 7,
        left: Math.max(12, Math.min(rect.right - 288, window.innerWidth - 300)),
      });
    };
    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open]);

  return <>
    <div ref={triggerRef} className="relative inline-flex max-w-full" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <button type="button" disabled={!canAssignLead} onClick={() => { setQuery(""); setOpen((value) => !value); }} aria-expanded={open} className={`inline-flex min-w-0 items-center gap-2 text-left disabled:cursor-default ${isMobile ? "mt-1 text-[16px] font-medium text-slate-900 dark:text-slate-100" : "text-[12.5px] font-medium text-slate-700 dark:text-slate-300"}`}>
        {assigned?.name ? <><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">{initialsOf(assigned.name)}</span><span className="truncate">{assigned.name}</span></> : <><UserRound size={isMobile ? 21 : 16} /><span className="truncate text-amber-600 dark:text-amber-400">Unassigned</span></>}
        {canAssignLead ? <ChevronDown size={15} className="shrink-0 text-slate-400" /> : null}
      </button>
      {open && menuPosition ? <div style={menuPosition} className="fixed z-[95] w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 p-2 dark:border-slate-800"><div className="relative"><Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user, email or role..." className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-[12px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-950" /></div></div>
        <div className="max-h-64 overflow-y-auto p-1.5 custom-scrollbar">{users.length ? users.map((user) => <button key={user._id} type="button" onClick={() => choose(user)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${String(user._id) === String(assigned?._id || "") ? "bg-blue-50 dark:bg-blue-500/10" : ""}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">{initialsOf(user.name)}</span><span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100">{user.name}</span><span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">{roleLabel(user.role)}</span></span></button>) : <p className="px-2.5 py-3 text-[12px] text-slate-500">No matching users</p>}</div>
      </div> : null}
    </div>
    {selectedUser ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="pipeline-transfer-title" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Transfer lead</p><h2 id="pipeline-transfer-title" className="mt-1 text-[19px] font-bold text-slate-900 dark:text-slate-100">Assign to {selectedUser.name}</h2></div><button type="button" onClick={() => setSelectedUser(null)} aria-label="Close transfer dialog" className="rounded-lg p-1.5 text-slate-500"><X size={18} /></button></div><label className="mt-4 block"><span className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">Reason for transfer <span className="text-rose-500">*</span></span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this lead being reassigned?" className="min-h-[92px] w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-950" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setSelectedUser(null)} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-3.5 text-[13px] font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancel</button><button type="button" onClick={submit} disabled={!reason.trim() || submitting} className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Transferring..." : "Confirm transfer"}</button></div></div></div> : null}
  </>;
};

export default PipelineAssigneePicker;
