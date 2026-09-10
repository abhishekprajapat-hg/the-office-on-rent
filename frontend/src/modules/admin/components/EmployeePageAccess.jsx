import { useEffect, useRef, useState } from "react";
import api from "../../../services/api";
import { toErrorMessage } from "../../../utils/errorMessage";

export default function EmployeePageAccess({ user, onClose }) {
  const dialog = useRef(null);
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState([]);
  const [defaults, setDefaults] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    api.get(`/access/users/${user._id}/pages`).then(({ data }) => {
      if (!active) return;
      setCatalog(data.pages);
      setSelected(data.pageKeys);
      setDefaults(data.usesRoleDefaults);
    }).catch((err) => { if (active) setError(toErrorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user._id]);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/access/users/${user._id}/pages`, { pageKeys: defaults ? null : selected });
      onClose();
    } catch (err) { setError(toErrorMessage(err)); }
    finally { setSaving(false); }
  };
  return (
    <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }} className="w-[min(640px,94vw)] max-h-[90dvh] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/40">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-semibold">Page access</h2><p className="text-sm text-slate-600">{user.name} · {user.email}</p></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close page access">✕</button>
        </div>
        <p className="my-4 text-sm text-slate-600">Choose the pages this employee can open. Action permissions and data scope still follow their role.</p>
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        {loading ? <p role="status">Loading page access…</p> : catalog.length > 0 && <>
          <label className="flex items-center gap-2 rounded-lg bg-slate-100 p-3 text-sm font-medium"><input type="checkbox" checked={defaults} disabled={saving} onChange={(event) => setDefaults(event.target.checked)} />Use role defaults</label>
          <div className="my-4 max-h-[45dvh] space-y-4 overflow-y-auto">
            {[...new Set(catalog.map((page) => page.group))].map((group) => <fieldset key={group}>
              <legend className="mb-2 text-xs font-semibold uppercase text-slate-500">{group}</legend>
              <div className="grid gap-2 sm:grid-cols-2">{catalog.filter((page) => page.group === group).map((page) => <label key={page.key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <input type="checkbox" disabled={defaults || saving || page.alwaysAccessible} checked={page.alwaysAccessible || selected.includes(page.key)} onChange={(event) => setSelected((keys) => event.target.checked ? [...keys, page.key] : keys.filter((key) => key !== page.key))} />
                {page.label}{page.alwaysAccessible && <span className="text-xs text-slate-500">Always available</span>}
              </label>)}</div>
            </fieldset>)}
          </div>
        </>}
        <div className="flex justify-end gap-3 border-t pt-4">
          <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          <button type="button" disabled={loading || saving || !catalog.length} onClick={save} className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "Saving…" : "Save access"}</button>
        </div>
      </div>
    </dialog>
  );
}
