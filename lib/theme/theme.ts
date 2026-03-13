/**
 * ZAENA DESIGN SYSTEM — theme.ts
 * Assembles full theme objects from tokens.
 * Import { lightTheme, darkTheme, Theme } from here.
 */

import {
    DARK_BORDERS,
    DARK_SURFACES,
    DARK_TEXT,
    LIGHT_BORDERS,
    LIGHT_SURFACES,
    LIGHT_TEXT,
    PALETTE,
    RADIUS,
    SHADOWS,
    SPACING,
    TYPE_SCALE,
} from "./tokens";

// ─── FONT FAMILIES ────────────────────────────────────────────────────────────
// These strings must match the font family names loaded by expo-google-fonts.
// Load in your root layout: useFonts({ CormorantGaramond_500Medium, ... })

export const FONTS = {
  display: "CormorantGaramond_500Medium",
  displaySemiBold: "CormorantGaramond_600SemiBold",
  sans: "DMSans_400Regular",
  sansMedium: "DMSans_500Medium",
  sansSemiBold: "DMSans_600SemiBold",
  mono: "DMMono_400Regular",
  monoMedium: "DMMono_500Medium",
} as const;

// ─── TYPOGRAPHY HELPERS ───────────────────────────────────────────────────────
// Pre-assembled style objects combining TYPE_SCALE + FONTS.

const typography = {
  display: { ...TYPE_SCALE.display, fontFamily: FONTS.display },
  displaySm: { ...TYPE_SCALE.displaySm, fontFamily: FONTS.display },
  h1: { ...TYPE_SCALE.h1, fontFamily: FONTS.displaySemiBold },
  h2: { ...TYPE_SCALE.h2, fontFamily: FONTS.displaySemiBold },
  h3: { ...TYPE_SCALE.h3, fontFamily: FONTS.displaySemiBold },
  body: { ...TYPE_SCALE.body, fontFamily: FONTS.sans },
  bodySm: { ...TYPE_SCALE.bodySm, fontFamily: FONTS.sans },
  bodyMed: { ...TYPE_SCALE.bodyMed, fontFamily: FONTS.sansMedium },
  label: { ...TYPE_SCALE.label, fontFamily: FONTS.sansSemiBold },
  labelSm: { ...TYPE_SCALE.labelSm, fontFamily: FONTS.sansSemiBold },
  mono: { ...TYPE_SCALE.mono, fontFamily: FONTS.mono },
  monoSm: { ...TYPE_SCALE.monoSm, fontFamily: FONTS.mono },
  monoLg: { ...TYPE_SCALE.monoLg, fontFamily: FONTS.monoMedium },
} as const;

// ─── THEME TYPE ────────────────────────────────────────────────────────────────

export interface Theme {
  isDark: boolean;
  colors: {
    // Surfaces
    canvas: string;
    surface: string;
    surfaceRaised: string;
    surfaceOverlay: string;
    // Text
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textDisabled: string;
    textInverse: string;
    textSignal: string;
    // Brand (theme-invariant, always available)
    brandDeep: string;
    brandMid: string;
    brandInteractive: string;
    brandInteractiveHover: string;
    brandInteractiveDim: string;
    signal: string;
    signalSoft: string;
    signalDim: string;
    air: string;
    // Borders
    borderSubtle: string;
    borderDefault: string;
    borderStrong: string;
    // Semantic
    positive: string;
    positiveSoft: string;
    warning: string;
    warningSoft: string;
    negative: string;
    negativeSoft: string;
  };
  typography: typeof typography;
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  shadows: typeof SHADOWS;
}

// ─── DARK THEME ───────────────────────────────────────────────────────────────

export const darkTheme: Theme = {
  isDark: true,
  colors: {
    ...DARK_SURFACES,
    ...DARK_TEXT,
    ...DARK_BORDERS,
    // Brand (invariant)
    brandDeep: PALETTE.brandDeep,
    brandMid: PALETTE.brandMid,
    brandInteractive: PALETTE.brandInteractive,
    brandInteractiveHover: PALETTE.brandInteractiveHover,
    brandInteractiveDim: PALETTE.brandInteractiveDim,
    signal: PALETTE.signal,
    signalSoft: PALETTE.signalSoft,
    signalDim: PALETTE.signalDim,
    air: PALETTE.air,
    // Semantic
    positive: PALETTE.positive,
    positiveSoft: PALETTE.positiveSoft,
    warning: PALETTE.warning,
    warningSoft: PALETTE.warningSoft,
    negative: PALETTE.negative,
    negativeSoft: PALETTE.negativeSoft,
  },
  typography,
  spacing: SPACING,
  radius: RADIUS,
  shadows: SHADOWS,
};

// ─── LIGHT THEME ──────────────────────────────────────────────────────────────

export const lightTheme: Theme = {
  isDark: false,
  colors: {
    ...LIGHT_SURFACES,
    ...LIGHT_TEXT,
    ...LIGHT_BORDERS,
    // Brand (invariant)
    brandDeep: PALETTE.brandDeep,
    brandMid: PALETTE.brandMid,
    brandInteractive: PALETTE.brandInteractive,
    brandInteractiveHover: PALETTE.brandInteractiveHover,
    brandInteractiveDim: PALETTE.brandInteractiveDim,
    signal: PALETTE.signal,
    signalSoft: PALETTE.signalSoft,
    signalDim: PALETTE.signalDim,
    air: PALETTE.air,
    // Semantic
    positive: PALETTE.positive,
    positiveSoft: PALETTE.positiveSoft,
    warning: PALETTE.warning,
    warningSoft: PALETTE.warningSoft,
    negative: PALETTE.negative,
    negativeSoft: PALETTE.negativeSoft,
  },
  typography,
  spacing: SPACING,
  radius: RADIUS,
  shadows: SHADOWS,
};