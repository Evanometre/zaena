/**
 * ZAENA — Tab Layout
 * app/(tabs)/_layout.tsx
 *
 * Design system: ZAENA · Teal Gold
 * - Solid bottom bar, flush, no pill, no shadow
 * - surface background + borderSubtle top edge
 * - Active: brandInteractive icon + signal gold dot + signal label
 * - Inactive: textMuted icon + textMuted label
 * - "Menu" tab opens drawer directly, never navigates to a screen
 */

import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React, { useCallback } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDrawer } from "../../components/DrawerNavigator";
import { useTheme } from "../../lib/theme/ThemeProvider";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type FeatherName = React.ComponentProps<typeof Feather>["name"];

// ─── TAB BAR BUTTON ───────────────────────────────────────────────────────────
// Custom tab button so we can intercept the "Menu" tab press.

interface TabBarButtonProps {
  children: React.ReactNode;
  onPress?: (e: any) => void;
  accessibilityState?: { selected?: boolean };
}

// ─── CUSTOM TAB BAR ICON ──────────────────────────────────────────────────────

function TabIcon({
  icon,
  label,
  focused,
}: {
  icon: FeatherName;
  label: string;
  focused: boolean;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={tabIconStyles.wrapper}>
      <Feather
        name={icon}
        size={20}
        color={focused ? c.brandInteractive : c.textMuted}
        strokeWidth={focused ? 2.5 : 1.5}
      />
      {/* Active gold dot */}
      {focused && (
        <View style={[tabIconStyles.dot, { backgroundColor: c.signal }]} />
      )}
      <Text
        style={[
          tabIconStyles.label,
          {
            color: focused ? c.signal : c.textMuted,
            fontFamily: theme.typography.label.fontFamily,
          },
        ]}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingTop: 8,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    marginTop: 1,
  },
  label: {
    fontSize: 9,
    letterSpacing: 0.8,
    marginTop: 1,
  },
});

// ─── MENU TAB BUTTON ──────────────────────────────────────────────────────────
// Intercepts press to open drawer. Never navigates to the more screen.

function MenuTabButton({
  children,
  onPress,
  accessibilityState,
  ...rest
}: TabBarButtonProps & Record<string, any>) {
  const { openDrawer } = useDrawer();

  const handlePress = useCallback(() => {
    openDrawer();
    // Do not call onPress — prevents actual tab navigation
  }, [openDrawer]);

  return (
    <TouchableOpacity
      {...rest}
      onPress={handlePress}
      activeOpacity={0.7}
      style={tabButtonStyles.root}
      accessibilityRole="button"
    >
      {children}
    </TouchableOpacity>
  );
}

const tabButtonStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── TAB LAYOUT ───────────────────────────────────────────────────────────────

export default function TabLayout() {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const TAB_BAR_HEIGHT = 60;
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Colours — all managed per-tab via tabBarIcon
        tabBarActiveTintColor: c.signal,
        tabBarInactiveTintColor: c.textMuted,
        tabBarShowLabel: false, // We render our own label inside TabIcon
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.borderSubtle,
          height: TAB_BAR_HEIGHT + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 0,
          // Remove any default shadow
          elevation: 0,
          shadowOpacity: 0,
          position: "relative",
          bottom: 0,
          // Flush to screen edge
          ...Platform.select({
            ios: { shadowColor: "transparent" },
          }),
        },
        tabBarItemStyle: {
          paddingVertical: 0,
          height: TAB_BAR_HEIGHT,
        },
      }}
    >
      {/* ── Home ── */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="home" label="Home" focused={focused} />
          ),
        }}
      />

      {/* ── Inventory ── */}
      <Tabs.Screen
        name="inventory"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="box" label="Stock" focused={focused} />
          ),
        }}
      />

      {/* ── Sales ── */}
      <Tabs.Screen
        name="sales"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="credit-card" label="Sales" focused={focused} />
          ),
        }}
      />

      {/* ── Menu (drawer shortcut) ── */}
      <Tabs.Screen
        name="more"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="grid" label="Menu" focused={focused} />
          ),
          tabBarButton: (props) => <MenuTabButton {...props} />,
        }}
      />
    </Tabs>
  );
}
