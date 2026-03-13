/**
 * ZAENA DESIGN SYSTEM — ThemeProvider.tsx
 *
 * Usage:
 *   Wrap your root layout with <ThemeProvider>.
 *   Access theme anywhere with: const { theme, toggleTheme, isDark } = useTheme();
 *
 * Font loading:
 *   This provider does NOT load fonts — do that in your root _layout.tsx:
 *
 *   import {
 *     useFonts,
 *     CormorantGaramond_500Medium,
 *     CormorantGaramond_600SemiBold,
 *   } from "@expo-google-fonts/cormorant-garamond";
 *   import {
 *     DMSans_400Regular,
 *     DMSans_500Medium,
 *     DMSans_600SemiBold,
 *   } from "@expo-google-fonts/dm-sans";
 *   import {
 *     DMMono_400Regular,
 *     DMMono_500Medium,
 *   } from "@expo-google-fonts/dm-mono";
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { useColorScheme } from "react-native";
import { Theme, darkTheme, lightTheme } from "./theme";

const THEME_STORAGE_KEY = "zaena_theme_preference";

// ─── CONTEXT ──────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: "light" | "dark" | "system") => void;
  themeMode: "light" | "dark" | "system";
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ─── PROVIDER ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<"light" | "dark" | "system">(
    "dark", // Default to dark — Zaena's primary experience
  );

  // Load persisted preference on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeModeState(stored);
      }
    });
  }, []);

  const resolvedIsDark =
    themeMode === "system" ? systemScheme === "dark" : themeMode === "dark";

  const theme = resolvedIsDark ? darkTheme : lightTheme;

  const setTheme = useCallback(async (mode: "light" | "dark" | "system") => {
    setThemeModeState(mode);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedIsDark ? "light" : "dark");
  }, [resolvedIsDark, setTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: resolvedIsDark,
        toggleTheme,
        setTheme,
        themeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
