import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  LayoutGrid,
  Monitor,
  MonitorCog,
  Moon,
  Palette,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Sun,
} from "lucide-react";
import {
  DEFAULT_SYSTEM_SETTINGS,
  applySystemSettingsToDocument,
  normalizeSystemSettings,
  readSystemSettings,
  writeSystemSettings,
} from "../../utils/systemSettings";
import { COLOR_THEMES } from "../../utils/themePreferences";

const Toggle = ({ value, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    aria-pressed={value}
    className={`relative h-7 w-12 rounded-full border transition-colors ${
      value ? "border-cyan-500 bg-cyan-500" : "border-slate-300 bg-slate-300"
    }`}
  >
    <span
      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
        value ? "left-6" : "left-1"
      }`}
    />
  </button>
);

const Section = ({ icon, title, subtitle, children }) => (
  <section className="ui-soft-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{subtitle}</p>
      </div>
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-cyan-700">
        {React.createElement(icon, { size: 15 })}
      </div>
    </div>
    {children}
  </section>
);

const MODE_OPTIONS = [
  { id: "light", label: "Light", hint: "Bright and clear", icon: Sun },
  { id: "dark", label: "Dark", hint: "Easy on the eyes", icon: Moon },
  { id: "system", label: "System", hint: "Follow this device", icon: Monitor },
];

// A miniature of the workspace in a given mode, painted with the live accent so
// the preview matches whichever colour theme is picked below it.
const ModePreview = ({ mode }) => {
  const pane = (bg, panel, line) => (
    <span className="flex h-full flex-1 gap-1.5 p-2" style={{ background: bg }}>
      <span className="w-3 rounded-sm" style={{ background: panel }} />
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="h-2 w-2/3 rounded-sm bg-blue-600" />
        <span className="flex-1 rounded-sm" style={{ background: panel, boxShadow: `inset 0 0 0 1px ${line}` }} />
      </span>
    </span>
  );
  const light = pane("#f5f7fa", "#ffffff", "#e0e5ed");
  const dark = pane("#0d1219", "#1b222b", "#2a323d");
  return (
    <span className="flex h-20 overflow-hidden rounded-lg border border-slate-200">
      {mode === "light" ? light : null}
      {mode === "dark" ? dark : null}
      {mode === "system" ? <>{light}{dark}</> : null}
    </span>
  );
};

const ThemeSection = ({ themeMode, resolvedTheme, onThemeModeChange, colorTheme, onColorThemeChange }) => (
  <section className="ui-soft-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Theme</h2>
        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
          Applies instantly on this device &middot; no save needed
        </p>
      </div>
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-cyan-700">
        <Palette size={15} />
      </div>
    </div>

    <h3 className="text-sm font-semibold text-slate-800">Mode</h3>
    <div role="radiogroup" aria-label="Theme mode" className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {MODE_OPTIONS.map((option) => {
        const active = themeMode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onThemeModeChange(option.id)}
            className={`flex flex-col gap-3 rounded-xl border p-3 text-left transition ${
              active
                ? "border-blue-600 ring-2 ring-blue-500/30"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <ModePreview mode={option.id} />
            <span className="flex items-center gap-2">
              {React.createElement(option.icon, { size: 16, className: active ? "text-blue-600" : "text-slate-500" })}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                <span className="block text-xs text-slate-500">
                  {option.id === "system" ? `${option.hint} (now ${resolvedTheme})` : option.hint}
                </span>
              </span>
              {active ? <Check size={16} className="text-blue-600" /> : null}
            </span>
          </button>
        );
      })}
    </div>

    <h3 className="mt-6 text-sm font-semibold text-slate-800">Colour theme</h3>
    <p className="mt-0.5 text-xs text-slate-500">
      Recolours buttons, links, highlights and charts&apos; accent across the CRM.
    </p>
    <div role="radiogroup" aria-label="Colour theme" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
      {COLOR_THEMES.map((item) => {
        const active = colorTheme === item.id;
        const [main, light, deep] = item.swatch;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onColorThemeChange(item.id)}
            className={`flex flex-col gap-2.5 rounded-xl border p-3 text-left transition ${
              active
                ? "border-blue-600 ring-2 ring-blue-500/30"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <span className="relative flex h-14 overflow-hidden rounded-lg border border-slate-200">
              <span className="w-1/4" style={{ background: deep }} />
              <span className="flex flex-1 flex-col justify-between p-2">
                <span className="h-1.5 w-3/4 rounded-full" style={{ background: light, opacity: 0.55 }} />
                <span className="h-4 w-12 rounded" style={{ background: main }} />
              </span>
              {active ? (
                <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-white" style={{ background: main }}>
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : null}
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
              <span className="block text-xs leading-snug text-slate-500">{item.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  </section>
);

const SystemSettings = ({
  themeMode = "light",
  resolvedTheme = "light",
  onThemeModeChange = () => {},
  colorTheme = "classic",
  onColorThemeChange = () => {},
}) => {
  const initial = useMemo(() => readSystemSettings(), []);
  const [settings, setSettings] = useState(initial);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initial));
  const [saveStatus, setSaveStatus] = useState("idle");
  const [activeSection, setActiveSection] = useState("ALL");

  const isDirty = useMemo(
    () => JSON.stringify(settings) !== savedSnapshot,
    [settings, savedSnapshot],
  );

  useEffect(() => {
    if (saveStatus !== "saved") return undefined;
    const timer = setTimeout(() => setSaveStatus("idle"), 1800);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  useEffect(() => {
    applySystemSettingsToDocument(settings);
    return () => {
      applySystemSettingsToDocument(readSystemSettings());
    };
  }, [settings]);

  const updateGroup = (group, key, value) => {
    setSettings((prev) => ({
      ...prev,
      [group]: {
        ...prev[group],
        [key]: value,
      },
    }));
  };

  const handleSave = () => {
    const saved = writeSystemSettings(settings);
    setSettings(saved);
    setSavedSnapshot(JSON.stringify(saved));
    setSaveStatus("saved");
  };

  const handleRestoreSaved = () => {
    const saved = readSystemSettings();
    setSettings(saved);
    setSavedSnapshot(JSON.stringify(saved));
    setSaveStatus("idle");
  };

  const handleFactoryReset = () => {
    const confirmed = window.confirm(
      "Reset system settings to defaults? This will overwrite saved values.",
    );
    if (!confirmed) return;

    const reset = writeSystemSettings(normalizeSystemSettings(DEFAULT_SYSTEM_SETTINGS));
    setSettings(reset);
    setSavedSnapshot(JSON.stringify(reset));
    setSaveStatus("saved");
  };

  return (
    <div className="ui-page-shell custom-scrollbar pb-10">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                isDirty
                  ? "border-amber-300 bg-amber-100 text-amber-700"
                  : "border-emerald-300 bg-emerald-100 text-emerald-700"
              }`}
            >
              {isDirty ? "Unsaved" : "Saved"}
            </span>
            <button
              type="button"
              onClick={handleRestoreSaved}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700"
            >
              <RefreshCw size={14} />
              Restore
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={14} />
              Save Changes
            </button>
        </div>

        {saveStatus === "saved" ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-cyan-300 bg-cyan-100 px-3 py-2 text-xs font-semibold text-cyan-700">
            <CheckCircle2 size={14} />
            Settings saved
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/80 p-2">
          {[
            { id: "ALL", label: "All", icon: LayoutGrid },
            { id: "APPEARANCE", label: "Appearance", icon: MonitorCog },
            { id: "SECURITY", label: "Security", icon: ShieldCheck },
            { id: "MAINTENANCE", label: "Maintenance", icon: Settings2 },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold uppercase tracking-[0.12em] transition ${
                activeSection === tab.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {React.createElement(tab.icon, { size: 14 })}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {(activeSection === "ALL" || activeSection === "APPEARANCE") && (
          <ThemeSection
            themeMode={themeMode}
            resolvedTheme={resolvedTheme}
            onThemeModeChange={onThemeModeChange}
            colorTheme={colorTheme}
            onColorThemeChange={onColorThemeChange}
          />
        )}

        {(activeSection === "ALL" || activeSection === "APPEARANCE") && (
        <Section
          icon={MonitorCog}
          title="Accessibility and UI"
          subtitle="Applies globally after save"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Compact Tables</p>
                <p className="text-xs text-slate-500">Reduces table row spacing across modules</p>
              </div>
              <Toggle
                value={settings.appearance.compactTables}
                onChange={(value) => updateGroup("appearance", "compactTables", value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Reduce Motion</p>
                <p className="text-xs text-slate-500">Minimizes animation and transition effects</p>
              </div>
              <Toggle
                value={settings.appearance.reduceMotion}
                onChange={(value) => updateGroup("appearance", "reduceMotion", value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">High Contrast</p>
                <p className="text-xs text-slate-500">Improves readability and visual contrast</p>
              </div>
              <Toggle
                value={settings.appearance.highContrast}
                onChange={(value) => updateGroup("appearance", "highContrast", value)}
              />
            </div>
          </div>
        </Section>
        )}

        {(activeSection === "ALL" || activeSection === "SECURITY") && (
        <Section
          icon={ShieldCheck}
          title="Session Security"
          subtitle="Automatically logs out inactive sessions"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              Session Timeout
              <select
                value={settings.security.sessionTimeoutMinutes}
                onChange={(event) =>
                  updateGroup("security", "sessionTimeoutMinutes", event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="240">4 hours</option>
              </select>
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
              Inactivity timeout is enforced in the running app. Any mouse, keyboard, touch, or
              scroll activity resets the timer.
            </div>
          </div>
        </Section>
        )}

        {(activeSection === "ALL" || activeSection === "MAINTENANCE") && (
        <Section
          icon={Settings2}
          title="Maintenance"
          subtitle="Reset only if configuration is corrupted"
        >
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
              <AlertTriangle size={15} />
              Factory Reset
            </div>
            <p className="mt-2 text-xs text-rose-700">
              Resets all saved system settings to default values for this device.
            </p>
            <button
              type="button"
              onClick={handleFactoryReset}
              className="mt-3 inline-flex h-10 items-center rounded-lg border border-rose-300 px-4 text-xs font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-100"
            >
              Reset To Defaults
            </button>
          </div>
        </Section>
        )}
      </div>
    </div>
  );
};

export default SystemSettings;
