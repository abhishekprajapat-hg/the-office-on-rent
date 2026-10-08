import { useEffect, useMemo, useState } from "react";
import { Building2, Loader2, MapPin, Plus, Save, Search, Trash2 } from "lucide-react";
import { getAttendanceOffices, updateAttendanceOffices } from "../../services/attendanceService";
import { toErrorMessage } from "../../utils/errorMessage";
import ToastNotice from "../../components/ui/ToastNotice";

const cardClass = "rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
const cardHeaderClass = "flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3.5";
const fieldClass = "h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const secondaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-blue-700 bg-blue-600 px-4 py-2 text-[15px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

let draftKey = 0;
const toDraft = (office = {}) => ({
  key: office._id || `new-${(draftKey += 1)}`,
  _id: office._id || "",
  name: office.name || "",
  latitude: office.latitude ?? "",
  longitude: office.longitude ?? "",
  radiusMeters: office.radiusMeters || 200,
  userIds: Array.isArray(office.userIds) ? office.userIds.map(String) : [],
});

/*
 * Offices other than the main one, each with its own geofence. Everyone may
 * check in at the main office; here an admin or manager adds another office
 * and ticks who may check in there. A manager is offered their own team only,
 * and the server leaves everyone else's access as it was.
 */
export default function AttendanceOfficesPanel({ requestLocation }) {
  const [offices, setOffices] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [searchByOffice, setSearchByOffice] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    getAttendanceOffices()
      .then((data) => {
        if (!active) return;
        setOffices(data.offices.map(toDraft));
        setAssignableUsers(data.assignableUsers);
      })
      .catch((loadError) => { if (active) setError(toErrorMessage(loadError, "Could not load offices")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 2500);
    return () => clearTimeout(timer);
  }, [success]);

  const assignableIds = useMemo(
    () => new Set(assignableUsers.map((user) => String(user._id))),
    [assignableUsers],
  );

  const updateOffice = (key, patch) =>
    setOffices((previous) => previous.map((office) => (office.key === key ? { ...office, ...patch } : office)));

  const toggleUser = (key, userId) =>
    setOffices((previous) => previous.map((office) => {
      if (office.key !== key) return office;
      const allowed = office.userIds.includes(userId);
      return { ...office, userIds: allowed ? office.userIds.filter((id) => id !== userId) : [...office.userIds, userId] };
    }));

  const fillCurrentLocation = async (key) => {
    try {
      setBusy(`locate:${key}`);
      setError("");
      const location = await requestLocation();
      updateOffice(key, {
        latitude: Number(location.latitude).toFixed(6),
        longitude: Number(location.longitude).toFixed(6),
      });
    } catch (locationError) {
      setError(toErrorMessage(locationError, "Failed to read current location"));
    } finally {
      setBusy("");
    }
  };

  const save = async (event) => {
    event.preventDefault();
    const incomplete = offices.find((office) =>
      !String(office.name).trim() || String(office.latitude).trim() === "" || String(office.longitude).trim() === "");
    if (incomplete) {
      setError(`${String(incomplete.name).trim() || "Each office"} needs a name, latitude and longitude`);
      return;
    }

    try {
      setBusy("save");
      setError("");
      const result = await updateAttendanceOffices(offices.map((office) => ({
        ...(office._id ? { _id: office._id } : {}),
        name: String(office.name).trim(),
        latitude: office.latitude,
        longitude: office.longitude,
        radiusMeters: Number(office.radiusMeters) || 200,
        userIds: office.userIds,
      })));
      setOffices(result.offices.map(toDraft));
      setAssignableUsers(result.assignableUsers);
      setSearchByOffice({});
      setSuccess(result.message);
    } catch (saveError) {
      setError(toErrorMessage(saveError, "Failed to save offices"));
    } finally {
      setBusy("");
    }
  };

  return (
    <section className={cardClass}>
      <form onSubmit={save}>
        <div className={cardHeaderClass}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
            <Building2 size={15} aria-hidden="true" />
          </span>
          <h4 className="flex-1 text-[14px] font-semibold text-slate-900">Other Offices</h4>
          <button type="button" onClick={() => setOffices((previous) => [...previous, toDraft()])} disabled={loading || Boolean(busy)} className={secondaryButtonClass}>
            <Plus size={14} />
            Add
          </button>
        </div>
        <div className="space-y-3 p-5">
          <ToastNotice message={error} type="error" />
          <ToastNotice message={success} type="success" />
          <p className="text-[12.5px] leading-relaxed text-slate-500">
            Everyone can check in at the main office. Add another office here, with its own radius,
            and tick who may check in there.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-slate-500">
              <Loader2 size={14} className="animate-spin" /> Loading offices...
            </div>
          ) : null}

          {offices.map((office, index) => {
            const query = String(searchByOffice[office.key] || "").trim().toLowerCase();
            const visibleUsers = assignableUsers.filter((user) =>
              !query || String(user.name || "").toLowerCase().includes(query));
            const outsideTeamCount = office.userIds.filter((id) => !assignableIds.has(id)).length;
            const teamCount = office.userIds.length - outsideTeamCount;

            return (
              <div key={office.key} className="space-y-2.5 rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={office.name}
                    onChange={(event) => updateOffice(office.key, { name: event.target.value })}
                    placeholder={`Office ${index + 1} name`}
                    maxLength={80}
                    className={fieldClass}
                    aria-label="Office name"
                  />
                  <button
                    type="button"
                    onClick={() => setOffices((previous) => previous.filter((row) => row.key !== office.key))}
                    disabled={Boolean(busy)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-500 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-60"
                    aria-label={`Remove ${office.name || "office"}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="any" value={office.latitude} onChange={(event) => updateOffice(office.key, { latitude: event.target.value })} placeholder="Latitude" className={fieldClass} aria-label="Office latitude" />
                  <input type="number" step="any" value={office.longitude} onChange={(event) => updateOffice(office.key, { longitude: event.target.value })} placeholder="Longitude" className={fieldClass} aria-label="Office longitude" />
                </div>
                <div className="flex gap-2">
                  <label className="flex-1">
                    <span className="mb-1 block text-[12px] text-slate-500">Radius (meters)</span>
                    <input type="number" min="10" max="5000" value={office.radiusMeters} onChange={(event) => updateOffice(office.key, { radiusMeters: event.target.value })} className={fieldClass} aria-label="Office radius" />
                  </label>
                  <button type="button" onClick={() => fillCurrentLocation(office.key)} disabled={Boolean(busy)} className={`${secondaryButtonClass} self-end`}>
                    {busy === `locate:${office.key}` ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                    Use current
                  </button>
                </div>

                <div>
                  <span className="mb-1 block text-[12px] text-slate-500">
                    Who can check in here ({teamCount}{outsideTeamCount ? ` + ${outsideTeamCount} from other teams` : ""})
                  </span>
                  {assignableUsers.length > 6 ? (
                    <div className="relative mb-1.5">
                      <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <input
                        value={searchByOffice[office.key] || ""}
                        onChange={(event) => setSearchByOffice((previous) => ({ ...previous, [office.key]: event.target.value }))}
                        placeholder="Search people"
                        className={`${fieldClass} pl-8`}
                        aria-label="Search people"
                      />
                    </div>
                  ) : null}
                  <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-slate-100 p-1.5">
                    {visibleUsers.length ? visibleUsers.map((user) => (
                      <label key={user._id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-slate-700 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={office.userIds.includes(String(user._id))}
                          onChange={() => toggleUser(office.key, String(user._id))}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="min-w-0 flex-1 truncate">{user.name || "Unnamed"}</span>
                        <span className="text-[11px] text-slate-400">{String(user.role || "").replaceAll("_", " ").toLowerCase()}</span>
                      </label>
                    )) : (
                      <p className="px-1.5 py-1 text-[12.5px] text-slate-400">No one matches.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {!loading ? (
            <button type="submit" disabled={Boolean(busy)} className={`${primaryButtonClass} w-full`}>
              {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save offices
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
