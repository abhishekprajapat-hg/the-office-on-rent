import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Layers, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { usePermissions } from "../../context/usePermissions";
import { getRoleTypeDetail, getAccessCatalog, getRoleTypes, getRoleDetail, createRole, updateRole, setRoleStatus, deleteRole } from "../../services/accessService";
import { RoleFormPanel } from "./components/RoleTypePanels";
import { toErrorMessage } from "../../utils/errorMessage";
import "./role-types.css";

const tabs = [["roles", "Roles"], ["assignedUsers", "Assigned users"], ["availablePages", "Available pages"], ["reportingHierarchy", "Reporting hierarchy"], ["auditHistory", "Audit history"]];
export default function RoleTypeDetail() {
  const { roleTypeId } = useParams();
  const navigate = useNavigate();
  const { can, loading: checking } = usePermissions();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("roles");
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const allowed = can("role_types.view");
  useEffect(() => {
    if (checking || !allowed) return;
    let active = true;
    setData(null);
    getRoleTypeDetail(roleTypeId).then(value => { if (active) setData(value); }).catch(err => { if (active) setError(toErrorMessage(err, "Unable to load role type")); });
    return () => { active = false; };
  }, [roleTypeId, checking, allowed]);
  const reload = async () => setData(await getRoleTypeDetail(roleTypeId));
  const edit = async (role) => {
    try {
      const [catalog, roleTypes, detail] = await Promise.all([getAccessCatalog(), getRoleTypes(), role ? getRoleDetail(role._id) : null]);
      setEditor({ catalog, roleTypes, role: detail?.role || detail });
      setError("");
    } catch (err) { setError(toErrorMessage(err, "Unable to open role editor")); }
  };
  const mutate = async (action) => { try { await action(); await reload(); } catch (err) { setError(toErrorMessage(err, "Action failed")); } };
  const save = async (form) => {
    setSaving(true);
    try { if (editor.role) await updateRole(editor.role._id, form); else await createRole(form); await reload(); setEditor(null); }
    catch (err) { setError(toErrorMessage(err, "Unable to save role")); }
    finally { setSaving(false); }
  };
  const type = data?.roleType;
  return <div className="ui-page-shell custom-scrollbar rt-page">
    <button className="rt-back" onClick={() => navigate("/admin/role-types")}><ArrowLeft size={16} /> Role types</button>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {checking ? <p>Checking access...</p> : !allowed ? <p>Access denied.</p> : !type ? <p>Loading role type...</p> : <>
      <header className="rt-head"><div className="rt-head-main"><span className="rt-head-icon"><Layers size={24} /></span><div><div className="rt-title-row"><h1>{type.name}</h1><span className={`rt-chip ${type.status === "ACTIVE" ? "rt-chip-on" : "rt-chip-off"}`}>{type.status}</span></div><p className="rt-subtitle">{type.description || "Manage roles, assigned people and access for this role type."}</p></div></div></header>
      <div className="rt-stats">{[["Roles", data.roles.length], ["Assigned users", data.assignedUsers.length], ["Division", type.division || "Not set"], ["Branch", type.branch || "Not set"]].map(([label, value]) => <div className="rt-stat" key={label}><span>{label}</span><b>{value}</b></div>)}</div>
      <nav className="rt-tabs" aria-label="Role type sections">{tabs.map(([id, label]) => <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)} aria-pressed={tab === id}>{label}</button>)}</nav>
      <section className="rt-panel">
        <div className="rt-panel-head"><div><h2>{tabs.find(([id]) => id === tab)[1]}</h2><p>Manage {type.name.toLowerCase()} access and assignments.</p></div>{tab === "roles" && can("role_types.manage_roles") && <button className="rt-back" onClick={() => edit(null)}><Plus size={16} /> Add role</button>}</div>
        <div className="rt-list">{tab === "roles" ? data.roles.map(role => <article className="rt-row" key={role._id}><div className="rt-row-main"><h3 className="rt-row-title">{role.name}</h3><p className="rt-row-meta">{role.baseRoleLabel} · {role.dataScope} · {role.assignedUserCount} users</p></div><div className="rt-row-actions"><span className={`rt-chip ${role.status === "ACTIVE" ? "rt-chip-on" : "rt-chip-off"}`}>{role.status}</span>{can("role_types.manage_roles") && <button className="rt-iconbtn" aria-label={`Edit ${role.name}`} onClick={() => edit(role)}><Pencil size={16} /></button>}{can("role_types.manage_roles") && <button className="rt-iconbtn" aria-label={`Toggle ${role.name} status`} onClick={() => mutate(() => setRoleStatus(role._id, role.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"))}><Power size={16} /></button>}{can("role_types.manage_roles") && <button className="rt-iconbtn danger" aria-label={`Delete ${role.name}`} onClick={() => { if (window.confirm(`Delete ${role.name}?`)) mutate(() => deleteRole(role._id)); }}><Trash2 size={16} /></button>}</div></article>) : data[tab].map((row, index) => <article className="rt-row" key={row._id || row.id || index}><div className="rt-row-main"><h3 className="rt-row-title">{row.name || row.label || row.roleName || row.action || row.key}</h3><p className="rt-row-meta">{tab === "assignedUsers" ? `${row.email || ""} · ${row.roleId?.name || row.role}` : tab === "reportingHierarchy" ? `Reports to ${row.reportsTo || "Not set"}` : tab === "auditHistory" ? `${row.actorId?.name || "System"} · ${new Date(row.createdAt).toLocaleString()}` : row.path || row.description}</p></div></article>)}{!data[tab].length && <div className="rt-empty">No records in this section yet.</div>}</div>
      </section>
    </>}
    {editor && <RoleFormPanel key={editor.role?._id || "new"} isOpen role={editor.role} roleTypes={editor.roleTypes} catalog={editor.catalog} siblingRoles={data?.roles || []} defaultRoleTypeId={roleTypeId} onClose={() => setEditor(null)} onSubmit={save} submitting={saving} error={error} />}
  </div>;
}
