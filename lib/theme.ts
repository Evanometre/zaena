// lib/theme.ts
// Central theme constants. Import everywhere.

export const Colors = {
  foundation:   "#0E2931",  // deepest background
  midLayer:     "#12484C",  // cards, inputs
  teal:         "#2B7574",  // buttons, active states
  signal:       "#C9922A",  // amber accent, CTAs
  air:          "#E2E2E0",  // primary text, icons

  // Derived
  surfaceLight: "#163E43",  // slightly lighter than midLayer
  border:       "#1E5A5F",  // subtle borders
  muted:        "#7A9E9F",  // placeholder, secondary text
  error:        "#E05C5C",  // error states
  success:      "#4CAF7D",  // success states
  overlay:      "rgba(14, 41, 49, 0.85)",
  white:        "#FFFFFF",
  transparent:  "transparent",
};

export const Typography = {
  // Font sizes
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   20,
  xl:   24,
  xxl:  30,
  hero: 38,

  // Font weights (React Native uses strings)
  regular:    "400" as const,
  medium:     "500" as const,
  semibold:   "600" as const,
  bold:       "700" as const,
  extrabold:  "800" as const,
};

export const Spacing = {
  xs:   4,
  sm:   8,
  md:   16,
  lg:   24,
  xl:   32,
  xxl:  48,
  xxxl: 64,
};

export const Radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 999,
};

export const Shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  button: {
    shadowColor: "#2B7574",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  signal: {
    shadowColor: "#C9922A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
};