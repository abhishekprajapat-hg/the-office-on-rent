/*
 * The whole visual language in one place. Screens read colours through
 * useTheme() and everything else (spacing, radii, type) straight from here,
 * so a palette change never means hunting through screens.
 *
 * v3 design (Claude Design, Oct 2026): white + #2549d6, Plus Jakarta Sans,
 * JetBrains Mono for times and money, rounded-square tiles, pill tab bar.
 */

export type Palette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  /* Unfilled bars, rings and segmented-control tracks. */
  track: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  /* Light text on a primary/hero background. */
  onPrimaryMuted: string;
  /* The big coloured header band on Home, Salary, Finance, More. */
  hero: string;
  /* Near-black "selected" chips and banners. */
  ink: string;
  onInk: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  success: string;
  successSoft: string;
  violet: string;
  violetSoft: string;
  overlay: string;
};

export const light: Palette = {
  bg: "#f5f7fb",
  surface: "#ffffff",
  surfaceAlt: "#eef1f6",
  track: "#e9edf6",
  border: "#e4e8f1",
  text: "#0e1630",
  textMuted: "#5a6380",
  textFaint: "#98a0b8",
  primary: "#2549d6",
  primaryPressed: "#1b37a6",
  primarySoft: "#eaeefc",
  onPrimary: "#ffffff",
  onPrimaryMuted: "#c9d4fb",
  hero: "#2549d6",
  ink: "#0e1630",
  onInk: "#ffffff",
  danger: "#d0392b",
  dangerSoft: "#fdecea",
  warning: "#b86e00",
  warningSoft: "#fdf2de",
  info: "#2549d6",
  infoSoft: "#eaeefc",
  success: "#12925f",
  successSoft: "#e3f5ec",
  violet: "#7a4fd8",
  violetSoft: "#f1ebfd",
  overlay: "rgba(14, 22, 48, 0.45)",
};

export const dark: Palette = {
  bg: "#0b1020",
  surface: "#141a2e",
  surfaceAlt: "#1b2238",
  track: "#232b45",
  border: "#262e48",
  text: "#e9edf8",
  textMuted: "#a3abc4",
  textFaint: "#6c7593",
  primary: "#5b7cfa",
  primaryPressed: "#4766e6",
  primarySoft: "#1a2450",
  onPrimary: "#ffffff",
  onPrimaryMuted: "#c9d4fb",
  hero: "#2440b8",
  ink: "#e9edf8",
  onInk: "#0b1020",
  danger: "#f06b5e",
  dangerSoft: "#3a1916",
  warning: "#f0b13c",
  warningSoft: "#3a2c10",
  info: "#5b7cfa",
  infoSoft: "#1a2450",
  success: "#2fc48a",
  successSoft: "#12321f",
  violet: "#a585f0",
  violetSoft: "#2a1f48",
  overlay: "rgba(0, 0, 0, 0.6)",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

/* Gutter used by every screen in the design (14px). */
export const gutter = 14;

export const radius = { sm: 10, md: 14, lg: 18, xl: 22, sheet: 26, pill: 999 } as const;

export const font = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
  mono: "JetBrainsMono_500Medium",
} as const;

export const type = {
  /* Tab-root titles: "Leads", "Tasks", "My day". */
  display: { fontSize: 26, lineHeight: 32, fontFamily: font.extrabold, letterSpacing: -0.5 },
  title: { fontSize: 18, lineHeight: 24, fontFamily: font.extrabold },
  heading: { fontSize: 15, lineHeight: 20, fontFamily: font.extrabold },
  body: { fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontFamily: font.bold },
  small: { fontSize: 12, lineHeight: 16, fontFamily: font.regular },
  smallStrong: { fontSize: 12, lineHeight: 16, fontFamily: font.bold },
  tiny: { fontSize: 10.5, lineHeight: 14, fontFamily: font.bold },
  /* Uppercase group labels: "TODAY", "MY REQUESTS". */
  label: { fontSize: 11, lineHeight: 14, fontFamily: font.bold, letterSpacing: 0.66, textTransform: "uppercase" as const },
  /* Big numbers on stat tiles. */
  stat: { fontSize: 22, lineHeight: 28, fontFamily: font.extrabold, letterSpacing: -0.4 },
  mono: { fontSize: 13, lineHeight: 18, fontFamily: font.mono },
  monoLarge: { fontSize: 30, lineHeight: 36, fontFamily: font.mono },
} as const;

export type TypeVariant = keyof typeof type;

/* The tone set shared by badges, stat tiles and status pills. */
export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "violet";

export const toneColors = (c: Palette, tone: Tone) => {
  switch (tone) {
    case "primary":
      return { fg: c.primary, bg: c.primarySoft };
    case "success":
      return { fg: c.success, bg: c.successSoft };
    case "warning":
      return { fg: c.warning, bg: c.warningSoft };
    case "danger":
      return { fg: c.danger, bg: c.dangerSoft };
    case "info":
      return { fg: c.info, bg: c.infoSoft };
    case "violet":
      return { fg: c.violet, bg: c.violetSoft };
    default:
      return { fg: c.textMuted, bg: c.surfaceAlt };
  }
};
