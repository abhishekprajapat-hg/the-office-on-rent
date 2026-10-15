import type { Palette } from "./tokens";

/*
 * Colour themes and high contrast (web SystemSettings: "Colour theme",
 * "High contrast"). The scales are the web's (utils/themePreferences), so a
 * company's picked accent looks the same on both. Classic is the stock palette.
 */
export type AccentId = "classic" | "emerald" | "violet" | "ocean" | "sunset" | "berry" | "graphite";

/* 50 … 950, as on the web. */
const SCALES: Record<Exclude<AccentId, "classic">, string[]> = {
  emerald: ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46", "#064e3b", "#022c22"],
  violet: ["#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#2e1065"],
  ocean: ["#f0fdfa", "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#115e59", "#134e4a", "#042f2e"],
  sunset: ["#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12", "#431407"],
  berry: ["#fdf2f8", "#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777", "#be185d", "#9d174d", "#831843", "#500724"],
  graphite: ["#fafafa", "#f4f4f5", "#e4e4e7", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46", "#27272a", "#18181b", "#09090b"],
};

export const ACCENTS: { id: AccentId; label: string; description: string; swatch: string }[] = [
  { id: "classic", label: "Classic Blue", description: "The default Office on Rent look", swatch: "#2549d6" },
  { id: "emerald", label: "Emerald", description: "Calm green, easy on long days", swatch: "#059669" },
  { id: "violet", label: "Violet", description: "Rich purple accents", swatch: "#7c3aed" },
  { id: "ocean", label: "Ocean", description: "Fresh teal and aqua", swatch: "#0d9488" },
  { id: "sunset", label: "Sunset", description: "Warm orange energy", swatch: "#ea580c" },
  { id: "berry", label: "Berry", description: "Bold pink highlights", swatch: "#db2777" },
  { id: "graphite", label: "Graphite", description: "Minimal, neutral monochrome", swatch: "#3f3f46" },
];

export const isAccentId = (value: unknown): value is AccentId => ACCENTS.some((item) => item.id === value);

const accentPart = (scheme: "light" | "dark", accent: AccentId): Partial<Palette> => {
  if (accent === "classic") return {};
  const s = SCALES[accent];
  if (scheme === "light") {
    return { primary: s[6], primaryPressed: s[7], primarySoft: s[0], onPrimaryMuted: s[2], hero: s[6], info: s[6], infoSoft: s[0] };
  }
  return {
    primary: s[4],
    primaryPressed: s[5],
    primarySoft: s[10],
    onPrimaryMuted: s[2],
    hero: s[7],
    info: s[4],
    infoSoft: s[10],
    // Light grey buttons need dark text to stay readable.
    ...(accent === "graphite" ? { onPrimary: s[10] } : {}),
  } as Partial<Palette>;
};

/* Stronger secondary text and borders, for bright light or tired eyes. */
const contrastPart = (scheme: "light" | "dark"): Partial<Palette> =>
  scheme === "light"
    ? { textMuted: "#2f3752", textFaint: "#4f5875", border: "#aeb7cc", track: "#d5dbe8" }
    : { textMuted: "#d4d9ea", textFaint: "#a9b1c9", border: "#4c5779", track: "#38415f" };

/* base is the stock light or dark palette for the scheme. */
export const buildPalette = (base: Palette, scheme: "light" | "dark", accent: AccentId = "classic", highContrast = false): Palette => ({
  ...base,
  ...accentPart(scheme, accent),
  ...(highContrast ? contrastPart(scheme) : {}),
});
