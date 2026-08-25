import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Bell, CheckCircle2, Mail, MailOpen, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  IconButton,
  Input,
  Modal,
  Pagination,
  SearchInput,
  Select,
} from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { DataTableShell, FilterBar, PageToolbar, StatusBadge } from "../../components/crm";
import {
  archiveNotification,
  createNotification,
  deleteNotification,
  getNotifications,
  markNotificationRead,
  markNotificationUnread,
  updateNotification,
} from "../../services/coworkingNotificationService";
import { usePermissions } from "../../context/usePermissions";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { formatDateTime } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "UNREAD", label: "Unread" },
  { value: "READ", label: "Read" },
  { value: "ARCHIVED", label: "Archived" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "BOOKING", label: "Booking" },
  { value: "INVOICE", label: "Invoice" },
  { value: "CONTRACT", label: "Contract" },
  { value: "PAYMENT", label: "Payment" },
  { value: "TICKET", label: "Ticket" },
  { value: "VISITOR", label: "Visitor" },
  { value: "ASSET", label: "Asset" },
  { value: "SYSTEM", label: "System" },
  { value: "OTHER", label: "Other" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const NOTIFICATION_TYPES = TYPE_OPTIONS.filter((option) => option.value !== "all").map((option) => option.value);
const NOTIFICATION_PRIORITIES = PRIORITY_OPTIONS.filter((option) => option.value !== "all").map((option) => option.value);
const NOTIFICATION_STATUSES = STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => option.value);

const DEFAULT_FORM = {
  title: "",
  message: "",
  type: "SYSTEM",
  priority: "NORMAL",
  status: "UNREAD",
  entityType: "",
  entityId: "",
  actionUrl: "",
  dueAt: "",
};

const priorityTone = {
  LOW: "slate",
  NORMAL: "blue",
  HIGH: "amber",
  URGENT: "rose",
};

const toDateTimeInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60000);
  return localDate.toISOString().slice(0, 16);
};

const toForm = (notification) => ({
  title: notification?.title || "",
  message: notification?.message || "",
  type: notification?.type || "SYSTEM",
  priority: notification?.priority || "NORMAL",
  status: notification?.status || "UNREAD",
  entityType: notification?.entityType || "",
  entityId: notification?.entityId || "",
  actionUrl: notification?.actionUrl || "",
  dueAt: toDateTimeInput(notification?.dueAt),
});

const toPayload = (formData) => ({
  title: formData.title.trim(),
  message: formData.message.trim(),
  type: formData.type,
  priority: formData.priority,
  status: formData.status,
  entityType: formData.entityType.trim(),
  entityId: formData.entityId.trim() || null,
  actionUrl: formData.actionUrl.trim(),
  dueAt: formData.dueAt || null,
});

const Notifications = () => {
  const { can } = usePermissions();
  const canCreate = can("notifications.create");
  const canUpdate = can("notifications.update");
  const canDelete = can("notifications.delete");
  const canArchive = can("notifications.archive");

  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [priority, setPriority] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingNotification, setEditingNotification] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNotifications({
        page,
        limit: 15,
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
        type: type === "all" ? undefined : type,
        priority: priority === "all" ? undefined : priority,
      });
      setNotifications(data.notifications);
      setPagination(data.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load notifications"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status, type, priority]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, type, priority]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.status === "UNREAD").length,
    [notifications],
  );

  const openCreateModal = () => {
    setEditingNotification(null);
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  };

  const openEditModal = (notification) => {
    setEditingNotification(notification);
    setFormData(toForm(notification));
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const payload = toPayload(formData);
      if (editingNotification) {
        await updateNotification(editingNotification._id, payload);
        setToast({ type: "success", message: "Notification updated" });
      } else {
        await createNotification(payload);
        setToast({ type: "success", message: "Notification created" });
      }
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to save notification") });
    } finally {
      setSaving(false);
    }
  };

  const runNotificationAction = async (notification, action, successMessage) => {
    setBusyId(notification._id);
    setToast(null);
    try {
      await action(notification._id);
      setToast({ type: "success", message: successMessage });
      await load();
    } catch (actionError) {
      setToast({ type: "error", message: toErrorMessage(actionError, "Notification action failed") });
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget._id);
    setToast(null);
    try {
      await deleteNotification(deleteTarget._id);
      setToast({ type: "success", message: "Notification deleted" });
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      setToast({ type: "error", message: toErrorMessage(deleteError, "Failed to delete notification") });
    } finally {
      setBusyId("");
    }
  };

  const canSubmit = formData.title.trim();

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load notifications" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Notifications"
          description="Operational alerts for bookings, invoices, contracts, tickets and workspace events."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={unreadCount ? "amber" : "slate"}>{unreadCount} unread</Badge>
              {canCreate ? (
                <Button leftIcon={Plus} onClick={openCreateModal}>
                  New Notification
                </Button>
              ) : null}
            </div>
          }
          filters={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search notifications..." className="max-w-xs" />
              <FilterBar
                filters={[
                  { name: "status", label: "Status", value: status, onChange: setStatus, options: STATUS_OPTIONS },
                  { name: "type", label: "Type", value: type, onChange: setType, options: TYPE_OPTIONS },
                  { name: "priority", label: "Priority", value: priority, onChange: setPriority, options: PRIORITY_OPTIONS },
                ]}
                onClear={() => {
                  setStatus("all");
                  setType("all");
                  setPriority("all");
                }}
              />
            </>
          }
        />

        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <DataTableShell loading={loading} empty={!loading && notifications.length === 0} emptyTitle="No notifications yet">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5">Notification</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Priority</th>
                <th className="px-4 py-2.5">Due</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Created</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((notification) => (
                <tr
                  key={notification._id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-start gap-2">
                      <Bell aria-hidden="true" size={15} className="mt-1 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{notification.title}</p>
                        <p className="text-xs text-slate-400">{notification.notificationCode}</p>
                        {notification.message ? (
                          <p className="mt-1 max-w-md truncate text-xs text-slate-500 dark:text-slate-400">{notification.message}</p>
                        ) : null}
                        {notification.entityType ? (
                          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                            {notification.entityType}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{notification.type}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={priorityTone[notification.priority] || "slate"}>{notification.priority}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatDateTime(notification.dueAt)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={notification.status} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{formatDateTime(notification.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {canUpdate && notification.status !== "READ" ? (
                        <IconButton
                          icon={MailOpen}
                          label="Mark read"
                          size="sm"
                          disabled={busyId === notification._id}
                          onClick={() => runNotificationAction(notification, markNotificationRead, "Notification marked read")}
                        />
                      ) : null}
                      {canUpdate && notification.status !== "UNREAD" ? (
                        <IconButton
                          icon={Mail}
                          label="Mark unread"
                          size="sm"
                          disabled={busyId === notification._id}
                          onClick={() => runNotificationAction(notification, markNotificationUnread, "Notification marked unread")}
                        />
                      ) : null}
                      {canArchive && notification.status !== "ARCHIVED" ? (
                        <IconButton
                          icon={Archive}
                          label="Archive"
                          size="sm"
                          disabled={busyId === notification._id}
                          onClick={() => runNotificationAction(notification, archiveNotification, "Notification archived")}
                        />
                      ) : null}
                      {canUpdate ? (
                        <IconButton
                          icon={Pencil}
                          label="Edit"
                          size="sm"
                          disabled={busyId === notification._id}
                          onClick={() => openEditModal(notification)}
                        />
                      ) : null}
                      {canDelete ? (
                        <IconButton
                          icon={Trash2}
                          label="Delete"
                          size="sm"
                          disabled={busyId === notification._id}
                          className="hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => setDeleteTarget(notification)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>

        {pagination ? (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages || 1}
            totalItems={pagination.totalCount}
            pageSize={pagination.limit}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingNotification ? "Edit Notification" : "New Notification"}
        description="Create an operational notification for the coworking team."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSubmit}>
              {saving ? "Saving..." : editingNotification ? "Save Changes" : "Create Notification"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Title *</span>
            <Input value={formData.title} onChange={(event) => setFormData((form) => ({ ...form, title: event.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Type</span>
            <Select value={formData.type} onChange={(event) => setFormData((form) => ({ ...form, type: event.target.value }))}>
              {NOTIFICATION_TYPES.map((notificationType) => (
                <option key={notificationType} value={notificationType}>
                  {notificationType}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Priority</span>
            <Select value={formData.priority} onChange={(event) => setFormData((form) => ({ ...form, priority: event.target.value }))}>
              {NOTIFICATION_PRIORITIES.map((notificationPriority) => (
                <option key={notificationPriority} value={notificationPriority}>
                  {notificationPriority}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Status</span>
            <Select value={formData.status} onChange={(event) => setFormData((form) => ({ ...form, status: event.target.value }))}>
              {NOTIFICATION_STATUSES.map((notificationStatus) => (
                <option key={notificationStatus} value={notificationStatus}>
                  {notificationStatus}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Due at</span>
            <Input type="datetime-local" value={formData.dueAt} onChange={(event) => setFormData((form) => ({ ...form, dueAt: event.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Entity type</span>
            <Input value={formData.entityType} onChange={(event) => setFormData((form) => ({ ...form, entityType: event.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Entity id</span>
            <Input value={formData.entityId} onChange={(event) => setFormData((form) => ({ ...form, entityId: event.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Action URL</span>
            <Input value={formData.actionUrl} onChange={(event) => setFormData((form) => ({ ...form, actionUrl: event.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Message</span>
            <textarea
              className="min-h-[88px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={formData.message}
              onChange={(event) => setFormData((form) => ({ ...form, message: event.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.notificationCode || "notification"}?`}
        description="This removes the notification from the coworking notification center."
        confirmLabel="Delete"
        loading={busyId === deleteTarget?._id}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Notifications;
