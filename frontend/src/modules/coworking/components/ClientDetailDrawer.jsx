import { useCallback, useEffect, useState } from "react";
import {
  Armchair,
  Ban,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileSignature,
  FileText,
  KeyRound,
  Plus,
  PowerOff,
  Receipt,
  RotateCcw,
  Ticket,
  UserCheck,
  Trash2,
} from "lucide-react";
import { Badge, Button, EmptyState, IconButton, Input, Select, Skeleton } from "../../../components/ui";
import { DetailDrawer, StatusBadge } from "../../../components/crm";
import {
  addClientContact,
  addClientDocument,
  createClientPortalUser,
  getClientActivity,
  getClientAssignments,
  getClientPortalUsers,
  removeClientContact,
  removeClientDocument,
  resetClientPortalUserPassword,
  setClientPortalUserActive,
} from "../../../services/coworkingClientService";
import { uploadFile } from "../../../services/uploadService";
import { usePermissions } from "../../../context/usePermissions";
import { formatDate, formatDateTime } from "../../../utils/format";
import { toErrorMessage } from "../../../utils/errorMessage";
import { DOCUMENT_CATEGORIES } from "../../../constants/coworkingClient";

const TABS = ["Overview", "Assignments", "Contacts", "Documents", "Portal Access", "Activity", "Modules"];

const PLACEHOLDER_MODULES = [
  { label: "Active Bookings", icon: CalendarCheck },
  { label: "Contracts", icon: FileSignature },
  { label: "Invoices", icon: Receipt },
  { label: "Payments", icon: CreditCard },
  { label: "Outstanding Amount", icon: Receipt },
  { label: "Visitors", icon: UserCheck },
  { label: "Tickets", icon: Ticket },
];

const ClientDetailDrawer = ({ client, onClose, onChanged }) => {
  const { can } = usePermissions();
  const canUpdate = can("clients.update");

  const [tab, setTab] = useState("Overview");
  const [assignments, setAssignments] = useState(null);
  const [activity, setActivity] = useState(null);
  const [portalUsers, setPortalUsers] = useState(null);
  const [loadingTab, setLoadingTab] = useState(false);
  const [error, setError] = useState(null);

  const [contactForm, setContactForm] = useState({ name: "", designation: "", phone: "", email: "" });
  const [addingContact, setAddingContact] = useState(false);
  const [docCategory, setDocCategory] = useState("OTHER");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [busyId, setBusyId] = useState("");

  const [portalForm, setPortalForm] = useState({ name: "", email: "", password: "" });
  const [creatingPortalUser, setCreatingPortalUser] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  const loadTabData = useCallback(async () => {
    if (!client) return;
    if (tab === "Assignments" && assignments === null) {
      setLoadingTab(true);
      try {
        setAssignments(await getClientAssignments(client._id));
      } catch (fetchError) {
        setError(toErrorMessage(fetchError, "Failed to load assignments"));
      } finally {
        setLoadingTab(false);
      }
    } else if (tab === "Activity" && activity === null) {
      setLoadingTab(true);
      try {
        const data = await getClientActivity(client._id, { limit: 25 });
        setActivity(data.logs);
      } catch (fetchError) {
        setError(toErrorMessage(fetchError, "Failed to load activity"));
      } finally {
        setLoadingTab(false);
      }
    } else if (tab === "Portal Access" && portalUsers === null) {
      setLoadingTab(true);
      try {
        setPortalUsers(await getClientPortalUsers(client._id));
      } catch (fetchError) {
        setError(toErrorMessage(fetchError, "Failed to load portal users"));
      } finally {
        setLoadingTab(false);
      }
    }
  }, [client, tab, assignments, activity, portalUsers]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  useEffect(() => {
    setTab("Overview");
    setAssignments(null);
    setActivity(null);
    setPortalUsers(null);
    setError(null);
  }, [client?._id]);

  if (!client) return null;

  const handleAddContact = async () => {
    if (!contactForm.name.trim()) return;
    setAddingContact(true);
    setError(null);
    try {
      const updated = await addClientContact(client._id, contactForm);
      onChanged(updated);
      setContactForm({ name: "", designation: "", phone: "", email: "" });
    } catch (addError) {
      setError(toErrorMessage(addError, "Failed to add contact"));
    } finally {
      setAddingContact(false);
    }
  };

  const handleRemoveContact = async (contactId) => {
    setBusyId(contactId);
    try {
      const updated = await removeClientContact(client._id, contactId);
      onChanged(updated);
    } catch (removeError) {
      setError(toErrorMessage(removeError, "Failed to remove contact"));
    } finally {
      setBusyId("");
    }
  };

  const handleUploadDocument = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadingDoc(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file, "coworking-clients");
      const updated = await addClientDocument(client._id, {
        name: uploaded.fileName || file.name,
        fileUrl: uploaded.url,
        fileType: uploaded.mimeType || file.type,
        category: docCategory,
      });
      onChanged(updated);
    } catch (uploadError) {
      setError(toErrorMessage(uploadError, "Failed to upload document"));
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleRemoveDocument = async (documentId) => {
    setBusyId(documentId);
    try {
      const updated = await removeClientDocument(client._id, documentId);
      onChanged(updated);
    } catch (removeError) {
      setError(toErrorMessage(removeError, "Failed to remove document"));
    } finally {
      setBusyId("");
    }
  };

  const handleCreatePortalUser = async () => {
    if (!portalForm.name.trim() || !portalForm.email.trim() || portalForm.password.length < 6) return;
    setCreatingPortalUser(true);
    setError(null);
    try {
      await createClientPortalUser(client._id, portalForm);
      setPortalUsers(await getClientPortalUsers(client._id));
      setPortalForm({ name: "", email: "", password: "" });
    } catch (createError) {
      setError(toErrorMessage(createError, "Failed to create portal login"));
    } finally {
      setCreatingPortalUser(false);
    }
  };

  const handleTogglePortalUserActive = async (portalUser) => {
    setBusyId(portalUser._id);
    try {
      await setClientPortalUserActive(client._id, portalUser._id, !portalUser.isActive);
      setPortalUsers(await getClientPortalUsers(client._id));
    } catch (toggleError) {
      setError(toErrorMessage(toggleError, "Failed to update portal login"));
    } finally {
      setBusyId("");
    }
  };

  const handleResetPortalUserPassword = async () => {
    if (resetPasswordValue.length < 6) return;
    setResettingPassword(true);
    setError(null);
    try {
      await resetClientPortalUserPassword(client._id, resetPasswordTarget._id, resetPasswordValue);
      setResetPasswordTarget(null);
      setResetPasswordValue("");
    } catch (resetError) {
      setError(toErrorMessage(resetError, "Failed to reset password"));
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <DetailDrawer
      open={Boolean(client)}
      onClose={onClose}
      title={client.companyName}
      description={`${client.clientCode} · ${client.clientType}`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={client.status} />
          <Badge variant="slate">KYC: {client.kycStatus}</Badge>
          {client.industry ? <Badge variant="blue">{client.industry}</Badge> : null}
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1 border-b border-slate-100 pb-2 dark:border-slate-800">
          {TABS.map((tabName) => (
            <button
              key={tabName}
              type="button"
              onClick={() => setTab(tabName)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                tab === tabName
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200"
                  : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
              }`}
            >
              {tabName}
            </button>
          ))}
        </div>

        {tab === "Overview" ? (
          <div className="space-y-2 text-sm">
            <p><span className="font-semibold text-slate-500">Contact:</span> {client.contactPerson || "-"}</p>
            <p><span className="font-semibold text-slate-500">Phone:</span> {client.phone || "-"}</p>
            <p><span className="font-semibold text-slate-500">Alt. Phone:</span> {client.alternatePhone || "-"}</p>
            <p><span className="font-semibold text-slate-500">Email:</span> {client.email || "-"}</p>
            <p><span className="font-semibold text-slate-500">GSTIN:</span> {client.gstNumber || "-"}</p>
            <p><span className="font-semibold text-slate-500">PAN:</span> {client.panNumber || "-"}</p>
            <p>
              <span className="font-semibold text-slate-500">Address:</span>{" "}
              {[client.address?.line1, client.address?.city, client.address?.state, client.address?.pincode]
                .filter(Boolean)
                .join(", ") || "-"}
            </p>
            {client.notes ? <p className="text-slate-500">{client.notes}</p> : null}
          </div>
        ) : null}

        {tab === "Assignments" ? (
          loadingTab ? (
            <Skeleton className="h-24 w-full" />
          ) : assignments && assignments.length > 0 ? (
            <div className="space-y-2">
              {assignments.map((assignment) => (
                <div
                  key={`${assignment.cabinId}-${assignment.seatCode}`}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                >
                  <Armchair aria-hidden="true" size={14} className="text-slate-400" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{assignment.seatCode}</p>
                    <p className="text-xs text-slate-400">
                      {assignment.property?.name} · Floor {assignment.floor?.floorNumber} · {assignment.cabinCode} ·{" "}
                      since {formatDate(assignment.assignedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No seats assigned" description="This client has no active seat assignments." />
          )
        ) : null}

        {tab === "Contacts" ? (
          <div className="space-y-3">
            {client.contacts?.length ? (
              client.contacts.map((contact) => (
                <div
                  key={contact._id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{contact.name}</p>
                    <p className="text-xs text-slate-400">
                      {[contact.designation, contact.phone, contact.email].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {canUpdate ? (
                    <IconButton
                      icon={Trash2}
                      label="Remove contact"
                      size="sm"
                      disabled={busyId === contact._id}
                      onClick={() => handleRemoveContact(contact._id)}
                    />
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState title="No additional contacts" />
            )}

            {canUpdate ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                <Input placeholder="Name" value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} />
                <Input placeholder="Designation" value={contactForm.designation} onChange={(e) => setContactForm((f) => ({ ...f, designation: e.target.value }))} />
                <Input placeholder="Phone" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} />
                <Input placeholder="Email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} />
                <Button
                  size="sm"
                  className="col-span-2"
                  leftIcon={Plus}
                  disabled={addingContact || !contactForm.name.trim()}
                  onClick={handleAddContact}
                >
                  Add Contact
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "Documents" ? (
          <div className="space-y-3">
            {client.documents?.length ? (
              client.documents.map((doc) => (
                <div
                  key={doc._id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
                >
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2 text-sm text-blue-700 hover:underline dark:text-blue-300"
                  >
                    <FileText aria-hidden="true" size={14} className="shrink-0" />
                    <span className="truncate">{doc.name}</span>
                    <Badge variant="slate">{doc.category}</Badge>
                  </a>
                  {canUpdate ? (
                    <IconButton
                      icon={Trash2}
                      label="Remove document"
                      size="sm"
                      disabled={busyId === doc._id}
                      onClick={() => handleRemoveDocument(doc._id)}
                    />
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState title="No documents uploaded" />
            )}

            {canUpdate ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                <Select value={docCategory} onChange={(e) => setDocCategory(e.target.value)} className="w-40">
                  {DOCUMENT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
                <label className="flex-1">
                  <span className="sr-only">Upload document</span>
                  <input
                    type="file"
                    disabled={uploadingDoc}
                    onChange={handleUploadDocument}
                    className="w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-blue-700 dark:text-slate-400 dark:file:bg-blue-500/10 dark:file:text-blue-200"
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "Portal Access" ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Logins for this client's contacts to view their own invoices, bookings, contracts and documents at the
              client portal — a separate system from staff accounts.
            </p>

            {loadingTab ? (
              <Skeleton className="h-20 w-full" />
            ) : portalUsers?.length ? (
              portalUsers.map((portalUser) => (
                <div
                  key={portalUser._id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
                >
                  <div className="min-w-0 text-sm">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{portalUser.name}</p>
                      <Badge variant={portalUser.isActive ? "emerald" : "slate"}>
                        {portalUser.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-slate-400">
                      {portalUser.email}
                      {portalUser.lastLoginAt ? ` · last login ${formatDateTime(portalUser.lastLoginAt)}` : " · never logged in"}
                    </p>
                  </div>
                  {canUpdate ? (
                    <div className="flex shrink-0 gap-1.5">
                      <IconButton
                        icon={KeyRound}
                        label="Reset password"
                        size="sm"
                        onClick={() => {
                          setResetPasswordTarget(portalUser);
                          setResetPasswordValue("");
                        }}
                      />
                      <IconButton
                        icon={portalUser.isActive ? PowerOff : CheckCircle2}
                        label={portalUser.isActive ? "Deactivate" : "Reactivate"}
                        size="sm"
                        disabled={busyId === portalUser._id}
                        onClick={() => handleTogglePortalUserActive(portalUser)}
                      />
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState title="No portal logins yet" description="Create one below so this client can sign in to the portal." />
            )}

            {canUpdate ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                <Input placeholder="Name" value={portalForm.name} onChange={(e) => setPortalForm((f) => ({ ...f, name: e.target.value }))} />
                <Input type="email" placeholder="Email" value={portalForm.email} onChange={(e) => setPortalForm((f) => ({ ...f, email: e.target.value }))} />
                <Input
                  type="password"
                  placeholder="Password (min 6 chars)"
                  value={portalForm.password}
                  onChange={(e) => setPortalForm((f) => ({ ...f, password: e.target.value }))}
                  className="col-span-2"
                />
                <Button
                  size="sm"
                  className="col-span-2"
                  leftIcon={Plus}
                  disabled={creatingPortalUser || !portalForm.name.trim() || !portalForm.email.trim() || portalForm.password.length < 6}
                  onClick={handleCreatePortalUser}
                >
                  {creatingPortalUser ? "Creating..." : "Create Portal Login"}
                </Button>
              </div>
            ) : null}

            {resetPasswordTarget ? (
              <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
                  New password for {resetPasswordTarget.email}
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="New password (min 6 chars)"
                    value={resetPasswordValue}
                    onChange={(e) => setResetPasswordValue(e.target.value)}
                    className="flex-1"
                  />
                  <Button size="sm" leftIcon={RotateCcw} disabled={resettingPassword || resetPasswordValue.length < 6} onClick={handleResetPortalUserPassword}>
                    Reset
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setResetPasswordTarget(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "Activity" ? (
          loadingTab ? (
            <Skeleton className="h-24 w-full" />
          ) : activity && activity.length > 0 ? (
            <div className="space-y-2">
              {activity.map((log) => (
                <div key={log._id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <ClipboardList aria-hidden="true" size={13} className="text-slate-400" />
                    <Badge variant="blue">{log.action}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {log.actorId?.name || "Unknown"} · {formatDateTime(log.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No activity recorded yet" />
          )
        ) : null}

        {tab === "Modules" ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              These modules aren't implemented yet — they'll surface real data here in a later phase.
            </p>
            {PLACEHOLDER_MODULES.map((module) => {
              const Icon = module.icon;
              return (
                <div
                  key={module.label}
                  className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-400 dark:border-slate-700"
                >
                  <Icon aria-hidden="true" size={15} />
                  {module.label}
                  <Ban aria-hidden="true" size={12} className="ml-auto text-slate-300" />
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </DetailDrawer>
  );
};

export default ClientDetailDrawer;
