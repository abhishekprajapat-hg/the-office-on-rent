import React, { useMemo, useState } from "react";
import Modal from "../../../components/ui/Modal";
import ToastNotice from "../../../components/ui/ToastNotice";

// Create/edit surfaces for Role Types and for the Roles under them. Both render
// in the shared centered ui/Modal rather than a slide-over, so they match the
// rest of the app's dialogs.
//
// Neither panel hardcodes a role type, a role or a page: every option comes
// from what the caller loaded off the backend.

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

const VERTICAL_OPTIONS = [
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "BOTH", label: "Both" },
];

const EMPTY_ROLE_TYPE = {
  name: "",
  description: "",
  status: "ACTIVE",
  branch: "",
  department: "",
  division: "",
  legacyRoleType: "COMMERCIAL",
};

// Both panels are keyed by their target where they are used, so opening one on
// a different record remounts it. That keeps form state initialised from props
// once, instead of resynchronised by an effect on every open.
const toRoleTypeForm = (roleType) => (roleType
  ? {
    name: roleType.name || "",
    description: roleType.description || "",
    status: roleType.status || "ACTIVE",
    branch: roleType.branch || "",
    department: roleType.department || "",
    division: roleType.division || "",
    legacyRoleType: roleType.legacyRoleType || "COMMERCIAL",
  }
  : EMPTY_ROLE_TYPE);

const SubmitButton = ({ onClick, disabled, children }) => (
  <button
    type="button"
    className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 sm:w-auto"
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </button>
);

export const RoleTypeFormPanel = ({
  isOpen,
  roleType,
  onClose,
  onSubmit,
  submitting,
  error,
}) => {
  const [form, setForm] = useState(() => toRoleTypeForm(roleType));

  const setField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={roleType ? `Edit role type — ${roleType.name}` : "Add role type"}
      description={roleType?.isSystem
        ? "Protected system role type — only an Admin can change it."
        : "Role types group the roles a tenant can assign."}
      footer={(
        <SubmitButton disabled={submitting} onClick={() => onSubmit(form)}>
          {submitting ? "Saving..." : roleType ? "Save role type" : "Create role type"}
        </SubmitButton>
      )}
    >
      <div className="rt-form">
        <ToastNotice message={error} type="error" />

        <label>
          <span>Role type name</span>
          <input
            type="text"
            value={form.name}
            onChange={setField("name")}
            placeholder="Coworking, Finance, HR, Operations..."
          />
        </label>

        <label>
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={setField("description")} />
        </label>

        <div className="rt-form-grid">
          <label>
            <span>Status</span>
            <select value={form.status} onChange={setField("status")}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Branch</span>
            <input type="text" value={form.branch} onChange={setField("branch")} placeholder="Head office" />
          </label>
        </div>

        <div className="rt-form-grid">
          <label>
            <span>Department</span>
            <input type="text" value={form.department} onChange={setField("department")} placeholder="Sales" />
          </label>

          <label>
            <span>Business division</span>
            <input type="text" value={form.division} onChange={setField("division")} placeholder="Commercial" />
          </label>
        </div>

        <label>
          <span>Lead and inventory vertical</span>
          <select value={form.legacyRoleType} onChange={setField("legacyRoleType")}>
            {VERTICAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="rt-hint">
            Which property vertical users on this role type work in. Lead routing and
            inventory ownership have always keyed off this, so every role type carries one.
          </p>
        </label>
      </div>
    </Modal>
  );
};

const emptyRole = (roleTypeId) => ({
  name: "",
  description: "",
  roleTypeIds: roleTypeId ? [roleTypeId] : [],
  baseRole: "",
  pages: {},
  permissions: [],
  dataScope: "ASSIGNED",
  reportingRoleId: "",
  status: "ACTIVE",
  enforcePageAccess: true,
});

const pagesToMap = (pages = []) =>
  pages.reduce((map, entry) => {
    map[entry.pageKey] = [...(entry.actions || [])];
    return map;
  }, {});

const pagesToArray = (pageMap = {}) =>
  Object.entries(pageMap)
    .filter(([, actions]) => actions.length > 0)
    .map(([pageKey, actions]) => ({ pageKey, actions }));

const toRoleForm = (role, defaultRoleTypeId) => (role
  ? {
    name: role.name || "",
    description: role.description || "",
    roleTypeIds: (role.roleTypeIds || []).map((value) => String(value?._id || value)),
    baseRole: role.baseRole || "",
    pages: pagesToMap(role.pages),
    // Page grants live in `permissions` too; the checkbox list below only owns
    // the module permissions, so filter the projected ones back out.
    permissions: (role.permissions || []).filter((value) => !String(value).startsWith("page.")),
    dataScope: role.dataScope || "ASSIGNED",
    reportingRoleId: role.reportingRoleId ? String(role.reportingRoleId?._id || role.reportingRoleId) : "",
    status: role.status || "ACTIVE",
    enforcePageAccess: role.enforcePageAccess !== false,
  }
  : emptyRole(defaultRoleTypeId));

export const RoleFormPanel = ({
  isOpen,
  role,
  roleTypes,
  catalog,
  siblingRoles,
  defaultRoleTypeId,
  onClose,
  onSubmit,
  submitting,
  error,
}) => {
  const [form, setForm] = useState(() => toRoleForm(role, defaultRoleTypeId));

  const permissionGroups = useMemo(
    () => Object.entries(catalog?.permissionGroups || {}),
    [catalog],
  );
  const protectedPermissions = useMemo(
    () => new Set(catalog?.protectedPermissions || []),
    [catalog],
  );
  const grantedPageCount = useMemo(
    () => Object.values(form.pages).filter((actions) => actions.length > 0).length,
    [form.pages],
  );

  const setField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const toggleRoleType = (roleTypeId) => {
    setForm((prev) => {
      const has = prev.roleTypeIds.includes(roleTypeId);
      return {
        ...prev,
        roleTypeIds: has
          ? prev.roleTypeIds.filter((value) => value !== roleTypeId)
          : [...prev.roleTypeIds, roleTypeId],
      };
    });
  };

  const togglePageAction = (pageKey, action) => {
    setForm((prev) => {
      const current = prev.pages[pageKey] || [];
      const has = current.includes(action);
      let next = has
        ? current.filter((value) => value !== action)
        : [...current, action];

      // Clearing "view" clears the page; granting any action implies view.
      if (action === "view" && has) next = [];
      if (action !== "view" && !has && !next.includes("view")) next = ["view", ...next];

      return { ...prev, pages: { ...prev.pages, [pageKey]: next } };
    });
  };

  const togglePermission = (permission) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((value) => value !== permission)
        : [...prev.permissions, permission],
    }));
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="xl"
      title={role ? `Edit role — ${role.name}` : "Add role"}
      description="A role belongs to at least one role type and layers page access on top of a built-in base role."
      footer={(
        <SubmitButton
          disabled={submitting}
          onClick={() => onSubmit({ ...form, pages: pagesToArray(form.pages) })}
        >
          {submitting ? "Saving..." : role ? "Save role" : "Create role"}
        </SubmitButton>
      )}
    >
      <div className="rt-form">
        <ToastNotice message={error} type="error" />

        <div className="rt-form-grid">
          <label>
            <span>Role name</span>
            <input type="text" value={form.name} onChange={setField("name")} placeholder="Front Desk Executive" />
          </label>

          <label>
            <span>Status</span>
            <select value={form.status} onChange={setField("status")}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span>Description</span>
          <textarea rows={2} value={form.description} onChange={setField("description")} />
        </label>

        <div className="rt-fieldset">
          <span>Associated role types</span>
          <div className="rt-actions-grid" style={{ paddingLeft: 0, marginTop: 0 }}>
            {roleTypes.map((roleType) => (
              <label key={roleType._id} className="rt-checkline">
                <input
                  type="checkbox"
                  checked={form.roleTypeIds.includes(String(roleType._id))}
                  onChange={() => toggleRoleType(String(roleType._id))}
                />
                {roleType.name}
              </label>
            ))}
          </div>
          <p className="rt-hint">
            Select more than one to let this role work across role types; a single
            selection keeps the usual one-role-type relationship.
          </p>
        </div>

        <div className="rt-form-grid">
          <label>
            <span>Base role</span>
            <select value={form.baseRole} onChange={setField("baseRole")} disabled={Boolean(role?.isSystem)}>
              <option value="">Select a base role</option>
              {(catalog?.baseRoles || []).map((baseRole) => (
                <option key={baseRole.value} value={baseRole.value}>{baseRole.label}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Data-access scope</span>
            <select value={form.dataScope} onChange={setField("dataScope")}>
              {(catalog?.dataScopes || []).map((scope) => (
                <option key={scope} value={scope}>{scope}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Reporting role</span>
            <select value={form.reportingRoleId} onChange={setField("reportingRoleId")}>
              <option value="">No reporting role</option>
              {siblingRoles
                .filter((sibling) => String(sibling._id) !== String(role?._id || ""))
                .map((sibling) => (
                  <option key={sibling._id} value={String(sibling._id)}>{sibling.name}</option>
                ))}
            </select>
          </label>
        </div>

        <p className="rt-hint" style={{ marginTop: -4 }}>
          The base role determines the built-in behaviour this role inherits — reporting
          hierarchy, lead routing and the existing route gates.
        </p>

        <div className="rt-fieldset">
          <span>
            Accessible pages and action permissions
            {grantedPageCount ? ` · ${grantedPageCount} selected` : ""}
          </span>
          <div className="rt-matrix">
            {(catalog?.pages || []).map((page) => {
              const selected = form.pages[page.key] || [];
              const isOn = selected.includes("view") || page.alwaysAccessible;
              return (
                <div className="rt-matrix-row" key={page.key}>
                  <header>
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => togglePageAction(page.key, "view")}
                      disabled={page.alwaysAccessible}
                    />
                    {page.label}
                    <small>{page.group}{page.alwaysAccessible ? " · always available" : ""}</small>
                  </header>
                  {isOn ? (
                    <div className="rt-actions-grid">
                      {page.actions.filter((action) => action !== "view").map((action) => (
                        <label key={action}>
                          <input
                            type="checkbox"
                            checked={selected.includes(action)}
                            onChange={() => togglePageAction(page.key, action)}
                          />
                          {action.replace(/_/g, " ")}
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rt-fieldset">
          <span>Module permissions</span>
          <div className="rt-matrix">
            {permissionGroups.map(([groupName, permissions]) => (
              <div className="rt-matrix-row" key={groupName}>
                <header>{groupName}</header>
                <div className="rt-actions-grid" style={{ paddingLeft: 0 }}>
                  {permissions.map((permission) => (
                    <label
                      key={permission}
                      title={protectedPermissions.has(permission) ? "Admin-only permission" : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(permission)}
                        onChange={() => togglePermission(permission)}
                      />
                      {permission.split(".")[1].replace(/_/g, " ")}
                      {protectedPermissions.has(permission) ? " *" : ""}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="rt-hint">* Admin-only. A Manager cannot grant these, even when they hold them.</p>
        </div>

        <div className="rt-fieldset">
          <label className="rt-checkline">
            <input
              type="checkbox"
              checked={form.enforcePageAccess}
              onChange={(event) => setForm((prev) => ({ ...prev, enforcePageAccess: event.target.checked }))}
            />
            Enforce this page access on the API
          </label>
          <p className="rt-hint">
            On by default. Roles migrated from the built-in catalogue start with this off so
            existing accounts keep the access they already had; editing their pages turns it on.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default RoleTypeFormPanel;
