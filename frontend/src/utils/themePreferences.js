// Personal theme preferences for this device: light/dark mode and an accent
// colour theme. Kept apart from systemSettings on purpose - those go through the
// Settings page's draft/Save flow, while a theme applies the moment it is picked
// (the same way the header's sun/moon toggle always has).

export const THEME_MODE_STORAGE_KEY = "themeMode";
export const COLOR_THEME_STORAGE_KEY = "colorTheme";
// Resolved "light" | "dark". Older screens (calendar, alert toasts) still read
// this key directly, so the app keeps writing it.
export const LEGACY_THEME_STORAGE_KEY = "theme";

export const THEME_MODES = ["light", "dark", "system"];

// Public and sign-in pages always render the stock light/blue brand, whatever
// the signed-in user picked.
export const FORCE_DEFAULT_THEME_ROUTE_PREFIXES = [
  "/login",
  "/privacy-policy",
  "/terms-and-conditions",
  "/data-use-notice",
  "/service-terms",
  "/shared",
];

export const isForcedDefaultThemePath = (pathname = "") =>
  FORCE_DEFAULT_THEME_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
export const DEFAULT_COLOR_THEME = "classic";

const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

// Each scale replaces the brand accent (Tailwind's blue/indigo/sky/cyan, see
// tailwind.config.js) wherever the UI uses it. Classic carries no scale: it is
// the stock palette defined in index.css, so choosing it removes every override.
export const COLOR_THEMES = [
  {
    id: "classic",
    label: "Classic Blue",
    description: "The default Office on Rent look",
    swatch: ["#2549d6", "#5c87fb", "#2b7fbf"],
    scale: null,
  },
  {
    id: "emerald",
    label: "Emerald",
    description: "Calm green, easy on long days",
    swatch: ["#059669", "#34d399", "#047857"],
    scale: ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46", "#064e3b", "#022c22"],
  },
  {
    id: "violet",
    label: "Violet",
    description: "Rich purple accents",
    swatch: ["#7c3aed", "#a78bfa", "#6d28d9"],
    scale: ["#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#2e1065"],
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Fresh teal and aqua",
    swatch: ["#0d9488", "#2dd4bf", "#0f766e"],
    scale: ["#f0fdfa", "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#115e59", "#134e4a", "#042f2e"],
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm orange energy",
    swatch: ["#ea580c", "#fb923c", "#c2410c"],
    scale: ["#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12", "#431407"],
  },
  {
    id: "berry",
    label: "Berry",
    description: "Bold pink highlights",
    swatch: ["#db2777", "#f472b6", "#be185d"],
    scale: ["#fdf2f8", "#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777", "#be185d", "#9d174d", "#831843", "#500724"],
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Minimal, neutral monochrome",
    swatch: ["#3f3f46", "#a1a1aa", "#18181b"],
    scale: ["#fafafa", "#f4f4f5", "#e4e4e7", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46", "#27272a", "#18181b", "#09090b"],
  },
];

const COLOR_THEME_IDS = new Set(COLOR_THEMES.map((item) => item.id));
const BRAND_THEME_COLOR = "#2549d6";

const safeGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage: the choice still applies for this visit.
  }
};

export const readThemeMode = () => {
  const stored = safeGet(THEME_MODE_STORAGE_KEY);
  if (THEME_MODES.includes(stored)) return stored;
  // First run after this feature shipped: carry over the old toggle's value.
  return safeGet(LEGACY_THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
};

export const writeThemeMode = (mode) => {
  const next = THEME_MODES.includes(mode) ? mode : "light";
  safeSet(THEME_MODE_STORAGE_KEY, next);
  return next;
};

export const readColorTheme = () => {
  const stored = safeGet(COLOR_THEME_STORAGE_KEY);
  return COLOR_THEME_IDS.has(stored) ? stored : DEFAULT_COLOR_THEME;
};

export const writeColorTheme = (id) => {
  const next = COLOR_THEME_IDS.has(id) ? id : DEFAULT_COLOR_THEME;
  safeSet(COLOR_THEME_STORAGE_KEY, next);
  return next;
};

export const systemPrefersDark = () =>
  typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-color-scheme: dark)").matches;

export const resolveThemeMode = (mode, prefersDark = systemPrefersDark()) => {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode === "dark" ? "dark" : "light";
};

const hexToRgbTriplet = (hex) => {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16)).join(" ");
};

export const applyThemeModeToDocument = (resolvedMode) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark");
  root.classList.add(resolvedMode === "dark" ? "theme-dark" : "theme-light");
};

// Publishes the chosen scale as --accent-<shade> RGB triplets on <html>; the
// mapping onto blue/indigo/sky/cyan and the semantic --clay-accent tokens lives
// in index.css, keyed on data-color-theme.
export const applyColorThemeToDocument = (id) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = COLOR_THEMES.find((item) => item.id === id) || COLOR_THEMES[0];

  root.setAttribute("data-color-theme", theme.id);
  SHADES.forEach((shade, index) => {
    if (theme.scale) root.style.setProperty(`--accent-${shade}`, hexToRgbTriplet(theme.scale[index]));
    else root.style.removeProperty(`--accent-${shade}`);
  });

  // Browser chrome / installed-PWA title bar follows the accent too.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.scale ? theme.scale[6] : BRAND_THEME_COLOR);
};

// Runs once before React mounts so a dark or themed user never sees a flash of
// the default light/blue page on load.
export const applyStoredThemeToDocument = (pathname = "") => {
  const forced = isForcedDefaultThemePath(pathname);
  applyThemeModeToDocument(forced ? "light" : resolveThemeMode(readThemeMode()));
  applyColorThemeToDocument(forced ? DEFAULT_COLOR_THEME : readColorTheme());
};
