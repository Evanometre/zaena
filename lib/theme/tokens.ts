/**
 * ZAENA DESIGN SYSTEM — tokens.ts
 * Raw values. Do not consume these directly in components.
 * Import from theme.ts instead.
 */

// ─── BRAND PALETTE ────────────────────────────────────────────────────────────

export const PALETTE = {
  // Core brand tones
  brandDeep: "#0E2931",
  brandDeepDarker: "#0a1f26",
  brandMid: "#12484C",
  brandInteractive: "#2B7574",
  brandInteractiveHover: "#357978",
  brandInteractiveDim: "rgba(43,117,116,0.10)",

  // Signal / accent
  signal: "#C9922A",
  signalSoft: "rgba(201,146,42,0.12)",
  signalDim: "rgba(201,146,42,0.30)",

  // Air / neutral light
  air: "#E2E2E0",
  airDim: "#D4D4D2",

  // Warm parchment (light theme surfaces)
  parchment100: "#F5F0E8",
  parchment200: "#EDE8DF",
  parchment300: "#E4DDD3",
  parchment400: "#D9D0C4",

  // Pure
  white: "#FFFFFF",
  black: "#000000",

  // Semantic
  positive: "#2B7574",
  positiveSoft: "rgba(43,117,116,0.12)",
  warning: "#C9922A",
  warningSoft: "rgba(201,146,42,0.12)",
  negative: "#C0392B",
  negativeSoft: "rgba(192,57,43,0.12)",
  info: "#2B7574",
  infoSoft: "rgba(43,117,116,0.12)",
} as const;

// ─── DARK THEME SURFACE LAYERS ─────────────────────────────────────────────────
// Depth is created by going darker (deeper into the teal well), not lighter.
// canvas → surface (drawer/sidebar) → surfaceRaised (cards) → surfaceOverlay (hover)

export const DARK_SURFACES = {
  canvas: PALETTE.brandDeep,           // #0E2931 — main background
  surface: PALETTE.brandDeepDarker,    // #0a1f26 — drawer, sidebar
  surfaceRaised: PALETTE.brandMid,     // #12484C — cards, panels
  surfaceOverlay: "#1a5c60",           // hover states, selected rows
} as const;

// ─── LIGHT THEME SURFACE LAYERS ───────────────────────────────────────────────

export const LIGHT_SURFACES = {
  canvas: PALETTE.parchment100,        // #F5F0E8 — main background
  surface: PALETTE.parchment200,       // #EDE8DF — drawer, sidebar
  surfaceRaised: PALETTE.white,        // #FFFFFF — cards, panels
  surfaceOverlay: PALETTE.parchment300,// #E4DDD3 — hover, selected
} as const;

// ─── TEXT ──────────────────────────────────────────────────────────────────────

export const DARK_TEXT = {
  textPrimary: PALETTE.air,                        // #E2E2E0
  textSecondary: "rgba(226,226,224,0.55)",
  textMuted: "rgba(226,226,224,0.30)",
  textDisabled: "rgba(226,226,224,0.18)",
  textInverse: PALETTE.brandDeep,
  textSignal: PALETTE.signal,
} as const;

export const LIGHT_TEXT = {
  textPrimary: PALETTE.brandDeep,                  // #0E2931
  textSecondary: "rgba(14,41,49,0.60)",
  textMuted: "rgba(14,41,49,0.35)",
  textDisabled: "rgba(14,41,49,0.20)",
  textInverse: PALETTE.air,
  textSignal: PALETTE.signal,
} as const;

// ─── BORDERS ──────────────────────────────────────────────────────────────────

export const DARK_BORDERS = {
  borderSubtle: "rgba(43,117,116,0.12)",
  borderDefault: "rgba(43,117,116,0.22)",
  borderStrong: "rgba(43,117,116,0.40)",
} as const;

export const LIGHT_BORDERS = {
  borderSubtle: "rgba(14,41,49,0.08)",
  borderDefault: "rgba(14,41,49,0.15)",
  borderStrong: "rgba(14,41,49,0.30)",
} as const;

// ─── SPACING ──────────────────────────────────────────────────────────────────

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

// ─── RADIUS ───────────────────────────────────────────────────────────────────

export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  round: 999,
} as const;

// ─── TYPOGRAPHY SCALE ─────────────────────────────────────────────────────────
// fontFamily strings are resolved in ThemeProvider after fonts load.
// These are the size/weight/tracking values only.

export const TYPE_SCALE = {
  // Display — Cormorant Garamond
  display: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: 0.02,
    fontWeight: "500" as const,
  },
  displaySm: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 0.02,
    fontWeight: "500" as const,
  },
  // Heading — Cormorant Garamond
  h1: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: 0.02,
    fontWeight: "600" as const,
  },
  h2: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 0.01,
    fontWeight: "600" as const,
  },
  h3: {
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.01,
    fontWeight: "500" as const,
  },
  // Body — DM Sans
  body: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
    fontWeight: "400" as const,
  },
  bodySm: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
    fontWeight: "400" as const,
  },
  bodyMed: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
    fontWeight: "500" as const,
  },
  // Label — DM Sans
  label: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.06,
    fontWeight: "600" as const,
  },
  labelSm: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.12,
    fontWeight: "600" as const,
  },
  // Mono — DM Mono (financial figures, codes, refs)
  mono: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
    fontWeight: "400" as const,
  },
  monoSm: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
    fontWeight: "400" as const,
  },
  monoLg: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    fontWeight: "500" as const,
  },
} as const;

// ─── SHADOWS ──────────────────────────────────────────────────────────────────
// Only used for modals and floating overlays — never for standard cards.

export const SHADOWS = {
  float: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modal: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.20,
    shadowRadius: 24,
    elevation: 16,
  },
} as const;