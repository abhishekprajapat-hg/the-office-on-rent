import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  createRoleType,
  deleteRoleType,
  duplicateRoleType,
  getRoleTypes,
  setRoleTypeStatus,
  updateRoleType,
} from "../../services/accessService";
import { usePermissions } from "../../context/usePermissions";
import { toErrorMessage } from "../../utils/errorMessage";
import ToastNotice from "../../components/ui/ToastNotice";
import { RoleTypeFormPanel } from "./components/RoleTypePanels";
import "./role-types.css";

// The tenant's role types. Selecting one opens its own route
// (/admin/role-types/:roleTypeId) rather than a slide-over, so a role type is
// linkable, back-button friendly and has room to breathe.
//
// Every action here is permission-checked on the API as well; hiding a control
// the account cannot use is a courtesy, not the protection.

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const actorName = (value) => value?.name || value?.email || "—";

const RoleTypesManager = () => {
  const navigate = useNavigate();
  const { can, loading: permissionsLoading } = usePermissions();

  const [roleTypes, setRoleTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [openMenuId, setOpenMenuId] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingRoleType, setEditingRoleType] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const canView = can("role_types.view");
  const canCreate = can("role_types.create");
  const canUpdate = can("role_types.update");
  const canToggleStatus = can("role_types.status");
  const canDelete = can("role_types.delete");

  const loadRoleTypes = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setRoleTypes(await getRoleTypes());
    } catch (err) {
      setError(toErrorMessage(err, "Failed to load role types"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permissionsLoading || !canView) {
      setLoading(false);
      return;
    }
    loadRoleTypes();
  }, [permissionsLoading, canView, loadRoleTypes]);

  const filteredRoleTypes = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return roleTypes.filter((roleType) => {
      if (statusFilter !== "ALL" && roleType.status !== statusFilter) return false;
      if (!term) return true;
      return [
        roleType.name,
        roleType.description,
        roleType.branch,
        roleType.department,
        roleType.division,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ")
        .includes(term);
    });
  }, [roleTypes, searchQuery, statusFilter]);

  const runAction = async (action, successMessage) => {
    try {
      setError("");
      setNotice("");
      await action();
      if (successMessage) setNotice(successMessage);
      await loadRoleTypes();
    } catch (err) {
      setError(toErrorMessage(err, "Action failed"));
    }
  };

  const handleSubmit = async (form) => {
    try {
      setSubmitting(true);
      setFormError("");
      if (editingRoleType) {
        await updateRoleType(editingRoleType._id, form);
      } else {
        await createRoleType(form);
      }
      setFormOpen(false);
      setEditingRoleType(null);
      await loadRoleTypes();
      setNotice(editingRoleType ? "Role type updated." : "Role type created.");
    } catch (err) {
      setFormError(toErrorMessage(err, "Failed to save role type"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (roleType) => {
    if (!window.confirm(`Delete role type "${roleType.name}"?`)) return;
    runAction(() => deleteRoleType(roleType._id), "Role type deleted.");
  };

  const openRoleType = (roleTypeId) => navigate(`/admin/role-types/${roleTypeId}`);

  if (permissionsLoading) {
    return (
      <div className="ui-page-shell custom-scrollbar">
        <div className="rt-empty">Checking your access...</div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="ui-page-shell custom-scrollbar">
        <div className="rt-empty">
          <b>Access denied</b>
          Managing role types needs the &ldquo;View Role Types&rdquo; permission. An Admin can
          grant it from the role permissions matrix.
        </div>
      </div>
    );
  }

  return (
    <div className="ui-page-shell team-doc-screen custom-scrollbar">
      <ToastNotice message={error} type="error" />
      <ToastNotice message={notice} type="success" />

      <div className="team-toolbar">
        <div className="team-seg">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={statusFilter === option.value ? "on" : ""}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
              <span className="team-muted">
                {option.value === "ALL"
                  ? roleTypes.length
                  : roleTypes.filter((roleType) => roleType.status === option.value).length}
              </span>
            </button>
          ))}
        </div>

        <label className="team-search">
          <Search size={14} />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search name, description, branch..."
          />
        </label>

        {searchQuery || statusFilter !== "ALL" ? (
          <button
            type="button"
            className="team-btn team-btn-sec team-btn-sm"
            onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); }}
          >
            <X size={13} />
            Clear
          </button>
        ) : null}

        {canCreate ? (
          <button
            type="button"
            className="team-btn team-btn-pri team-btn-sm team-push"
            onClick={() => { setEditingRoleType(null); setFormError(""); setFormOpen(true); }}
          >
            <Plus size={13} />
            Add Role Type
          </button>
        ) : null}
      </div>

      <div className="team-card">
        <div className="team-table-wrap">
          <table className="team-tbl">
            <thead>
              <tr>
                <th>Role type</th>
                <th>Description</th>
                <th>Roles</th>
                <th>Users</th>
                <th>Status</th>
                <th>Created by</th>
                <th>Last updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="team-empty-row">Loading role types...</td></tr>
              ) : filteredRoleTypes.length === 0 ? (
                <tr><td colSpan={8} className="team-empty-row">No role types match these filters.</td></tr>
              ) : (
                filteredRoleTypes.map((roleType) => (
                  <tr
                    key={roleType._id}
                    className="is-clickable"
                    onClick={() => openRoleType(roleType._id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openRoleType(roleType._id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    title="Open role type"
                  >
                    <td>
                      <div className="team-cellname">
                        <div className="team-avatar"><Layers size={13} /></div>
                        <div>
                          <b>{roleType.name}</b>
                          <small>
                            {[roleType.branch, roleType.department, roleType.division]
                              .filter(Boolean)
                              .join(" · ") || roleType.code}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td className="team-muted">{roleType.description || "—"}</td>
                    <td className="team-num">{roleType.roleCount}</td>
                    <td className="team-num">{roleType.userCount}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        <span className={`rt-chip ${roleType.status === "ACTIVE" ? "rt-chip-on" : "rt-chip-off"}`}>
                          {roleType.status === "ACTIVE" ? "Active" : "Inactive"}
                        </span>
                        {roleType.isSystem ? (
                          <span className="rt-chip rt-chip-sys">
                            <ShieldCheck size={11} />
                            System
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="team-muted">{actorName(roleType.createdBy)}</td>
                    <td className="team-muted">{formatDate(roleType.updatedAt)}</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="rt-actions">
                        <button
                          type="button"
                          className="rt-iconbtn"
                          title="Actions"
                          onClick={() => setOpenMenuId(openMenuId === roleType._id ? "" : roleType._id)}
                        >
                          <MoreHorizontal size={13} />
                        </button>

                        {openMenuId === roleType._id ? (
                          <>
                            {/* Click-away target, so the menu closes like a real menu. */}
                            <div
                              className="rt-menu-scrim"
                              role="presentation"
                              onClick={() => setOpenMenuId("")}
                            />
                            <div className="rt-menu">
                              <button type="button" onClick={() => openRoleType(roleType._id)}>
                                <Layers size={13} /> Open
                              </button>
                              <button
                                type="button"
                                disabled={!canUpdate}
                                onClick={() => {
                                  setOpenMenuId("");
                                  setEditingRoleType(roleType);
                                  setFormError("");
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil size={13} /> Edit
                              </button>
                              <button
                                type="button"
                                disabled={!canToggleStatus}
                                onClick={() => {
                                  setOpenMenuId("");
                                  runAction(
                                    () => setRoleTypeStatus(
                                      roleType._id,
                                      roleType.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                                    ),
                                    roleType.status === "ACTIVE"
                                      ? "Role type deactivated."
                                      : "Role type activated.",
                                  );
                                }}
                              >
                                <Power size={13} />
                                {roleType.status === "ACTIVE" ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                type="button"
                                disabled={!canCreate}
                                onClick={() => {
                                  setOpenMenuId("");
                                  runAction(
                                    () => duplicateRoleType(roleType._id),
                                    "Role type duplicated.",
                                  );
                                }}
                              >
                                <Copy size={13} /> Duplicate
                              </button>
                              <button
                                type="button"
                                className="danger"
                                disabled={!canDelete || roleType.isSystem}
                                title={roleType.isSystem ? "Protected system role type" : undefined}
                                onClick={() => { setOpenMenuId(""); handleDelete(roleType); }}
                              >
                                <Trash2 size={13} /> Delete
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="team-notebox">
        <b>How role types work:</b>
        <span>
          Roles live under a role type and every user is assigned one of each. A role type
          cannot be deleted while roles or users still point at it, and renaming one is safe —
          roles and users reference it by id, never by name.
        </span>
      </div>

      <RoleTypeFormPanel
        key={`role-type-${editingRoleType?._id || "new"}-${formOpen}`}
        isOpen={formOpen}
        roleType={editingRoleType}
        onClose={() => { setFormOpen(false); setEditingRoleType(null); }}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={formError}
      />
    </div>
  );
};

export default RoleTypesManager;
