import { useCallback, useEffect, useState } from "react";
import { BellRing, CalendarClock, CreditCard, RotateCcw, Save, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorState, Input, Select } from "../../components/ui";
import ToastNotice from "../../components/ui/ToastNotice";
import { PageToolbar } from "../../components/crm";
import { usePermissions } from "../../context/usePermissions";
import { getCoworkingSettings, updateCoworkingSettings } from "../../services/coworkingSettingService";
import { formatDateTime } from "../../utils/format";
import { toErrorMessage } from "../../utils/errorMessage";

const DEFAULT_FORM = {
  timezone: "Asia/Kolkata",
  currency: "INR",
  invoicePrefix: "INV",
  paymentPrefix: "PAY",
  billingDueDay: "5",
  taxPercent: "18",
  bookingApprovalRequired: false,
  visitorPassRequired: true,
  defaultMeetingRoomBufferMinutes: "15",
  contractRenewalReminderDays: "30",
  maintenanceReminderDays: "7",
  autoCloseResolvedTicketsDays: "3",
  supportEmail: "",
  termsText: "",
};

const CURRENCY_OPTIONS = ["INR", "USD", "AED", "SGD", "GBP", "EUR"];
const TIMEZONE_OPTIONS = ["Asia/Kolkata", "UTC", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York"];

const toForm = (settings = {}) => ({
  timezone: settings.timezone || DEFAULT_FORM.timezone,
  currency: settings.currency || DEFAULT_FORM.currency,
  invoicePrefix: settings.invoicePrefix || DEFAULT_FORM.invoicePrefix,
  paymentPrefix: settings.paymentPrefix || DEFAULT_FORM.paymentPrefix,
  billingDueDay: String(settings.billingDueDay ?? DEFAULT_FORM.billingDueDay),
  taxPercent: String(settings.taxPercent ?? DEFAULT_FORM.taxPercent),
  bookingApprovalRequired: Boolean(settings.bookingApprovalRequired),
  visitorPassRequired: settings.visitorPassRequired !== false,
  defaultMeetingRoomBufferMinutes: String(settings.defaultMeetingRoomBufferMinutes ?? DEFAULT_FORM.defaultMeetingRoomBufferMinutes),
  contractRenewalReminderDays: String(settings.contractRenewalReminderDays ?? DEFAULT_FORM.contractRenewalReminderDays),
  maintenanceReminderDays: String(settings.maintenanceReminderDays ?? DEFAULT_FORM.maintenanceReminderDays),
  autoCloseResolvedTicketsDays: String(settings.autoCloseResolvedTicketsDays ?? DEFAULT_FORM.autoCloseResolvedTicketsDays),
  supportEmail: settings.supportEmail || "",
  termsText: settings.termsText || "",
});

const toPayload = (formData) => ({
  timezone: formData.timezone,
  currency: formData.currency,
  invoicePrefix: formData.invoicePrefix,
  paymentPrefix: formData.paymentPrefix,
  billingDueDay: Number(formData.billingDueDay),
  taxPercent: Number(formData.taxPercent),
  bookingApprovalRequired: formData.bookingApprovalRequired,
  visitorPassRequired: formData.visitorPassRequired,
  defaultMeetingRoomBufferMinutes: Number(formData.defaultMeetingRoomBufferMinutes),
  contractRenewalReminderDays: Number(formData.contractRenewalReminderDays),
  maintenanceReminderDays: Number(formData.maintenanceReminderDays),
  autoCloseResolvedTicketsDays: Number(formData.autoCloseResolvedTicketsDays),
  supportEmail: formData.supportEmail.trim(),
  termsText: formData.termsText.trim(),
});

const ToggleRow = ({ title, description, checked, onChange }) => (
  <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-100 px-3 py-3 dark:border-slate-800">
    <span>
      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
      <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>
    </span>
    <input
      type="checkbox"
      className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
);

const Settings = () => {
  const { can } = usePermissions();
  const canUpdate = can("settings.update");

  const [settings, setSettings] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCoworkingSettings();
      setSettings(data);
      setFormData(toForm(data));
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load coworking settings"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const saved = await updateCoworkingSettings(toPayload(formData));
      setSettings(saved);
      setFormData(toForm(saved));
      setToast({ type: "success", message: "Settings saved" });
    } catch (saveError) {
      setToast({ type: "error", message: toErrorMessage(saveError, "Failed to save settings") });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Could not load settings" description={error} actionLabel="Retry" onAction={load} />
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageToolbar
          eyebrow="Coworking"
          title="Coworking Settings"
          description="Workspace defaults for billing, booking rules, visitor policy and reminders."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" leftIcon={RotateCcw} onClick={load} disabled={loading || saving}>
                Reload
              </Button>
              {canUpdate ? (
                <Button leftIcon={Save} onClick={handleSave} disabled={loading || saving}>
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
              ) : null}
            </div>
          }
        />

        {toast ? <ToastNotice type={toast.type} message={toast.message} /> : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon aria-hidden="true" size={18} />
                Workspace Defaults
              </CardTitle>
              <CardDescription>Regional and document defaults for coworking operations.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Timezone</span>
                  <Select disabled={loading || !canUpdate} value={formData.timezone} onChange={(event) => updateField("timezone", event.target.value)}>
                    {TIMEZONE_OPTIONS.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {timezone}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Currency</span>
                  <Select disabled={loading || !canUpdate} value={formData.currency} onChange={(event) => updateField("currency", event.target.value)}>
                    {CURRENCY_OPTIONS.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Invoice prefix</span>
                  <Input disabled={loading || !canUpdate} value={formData.invoicePrefix} onChange={(event) => updateField("invoicePrefix", event.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Payment prefix</span>
                  <Input disabled={loading || !canUpdate} value={formData.paymentPrefix} onChange={(event) => updateField("paymentPrefix", event.target.value)} />
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard aria-hidden="true" size={18} />
                Billing Defaults
              </CardTitle>
              <CardDescription>Default due day and tax values used by the coworking billing flow.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Billing due day</span>
                  <Input
                    disabled={loading || !canUpdate}
                    type="number"
                    min={1}
                    max={28}
                    value={formData.billingDueDay}
                    onChange={(event) => updateField("billingDueDay", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Tax percent</span>
                  <Input
                    disabled={loading || !canUpdate}
                    type="number"
                    min={0}
                    max={100}
                    value={formData.taxPercent}
                    onChange={(event) => updateField("taxPercent", event.target.value)}
                  />
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" size={18} />
                Operational Rules
              </CardTitle>
              <CardDescription>Booking and visitor controls for front desk workflows.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <ToggleRow
                  title="Booking approval required"
                  description="New bookings stay pending until a manager approves them."
                  checked={formData.bookingApprovalRequired}
                  onChange={(value) => updateField("bookingApprovalRequired", value)}
                />
                <ToggleRow
                  title="Visitor pass required"
                  description="Visitor entries should include a pass or badge workflow."
                  checked={formData.visitorPassRequired}
                  onChange={(value) => updateField("visitorPassRequired", value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BellRing aria-hidden="true" size={18} />
                Reminders
              </CardTitle>
              <CardDescription>Reminder windows for contracts, maintenance and resolved tickets.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Room buffer minutes</span>
                  <Input
                    disabled={loading || !canUpdate}
                    type="number"
                    min={0}
                    max={240}
                    value={formData.defaultMeetingRoomBufferMinutes}
                    onChange={(event) => updateField("defaultMeetingRoomBufferMinutes", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Renewal reminder days</span>
                  <Input
                    disabled={loading || !canUpdate}
                    type="number"
                    min={0}
                    max={365}
                    value={formData.contractRenewalReminderDays}
                    onChange={(event) => updateField("contractRenewalReminderDays", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Maintenance reminder days</span>
                  <Input
                    disabled={loading || !canUpdate}
                    type="number"
                    min={0}
                    max={365}
                    value={formData.maintenanceReminderDays}
                    onChange={(event) => updateField("maintenanceReminderDays", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Auto-close tickets days</span>
                  <Input
                    disabled={loading || !canUpdate}
                    type="number"
                    min={0}
                    max={90}
                    value={formData.autoCloseResolvedTicketsDays}
                    onChange={(event) => updateField("autoCloseResolvedTicketsDays", event.target.value)}
                  />
                </label>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock aria-hidden="true" size={18} />
              Client Communication
            </CardTitle>
            <CardDescription>Support contact and default terms used in coworking documents.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500">Support email</span>
                <Input
                  disabled={loading || !canUpdate}
                  type="email"
                  value={formData.supportEmail}
                  onChange={(event) => updateField("supportEmail", event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500">Default terms</span>
                <textarea
                  disabled={loading || !canUpdate}
                  className="min-h-[120px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={formData.termsText}
                  onChange={(event) => updateField("termsText", event.target.value)}
                />
              </label>
              {settings?.updatedAt ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Last updated {formatDateTime(settings.updatedAt)}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
