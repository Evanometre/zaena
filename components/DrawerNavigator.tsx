/**
 * ZAENA DESIGN SYSTEM — DrawerNavigator.tsx
 *
 * A slide-over drawer that reveals the full app navigation.
 * Triggered by the hamburger icon in every screen's header.
 *
 * Usage:
 *   1. Wrap your root layout content with <DrawerProvider>
 *   2. Call const { openDrawer } = useDrawer() in any screen header
 *   3. Render <AppDrawer /> once inside <DrawerProvider>
 *
 * Dependencies:
 *   - expo-router (useRouter, usePathname)
 *   - @expo/vector-icons (Feather)
 *   - react-native Animated
 */

import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePermissions } from "../context/PermissionsContext";
import { useTheme } from "../lib/theme/ThemeProvider";
import { useAuthStore } from "../stores/authStore";

const DRAWER_WIDTH = 300;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── TYPES ────────────────────────────────────────────────────────────────────

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

interface NavItem {
  icon: FeatherIconName;
  label: string;
  route: string;
  permission?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// ─── NAV STRUCTURE ────────────────────────────────────────────────────────────

// AFTER — function
function buildNavSections(isCompany: boolean): NavSection[] {
  return [
    {
      title: "Business Operations",
      items: [
        {
          icon: "package",
          label: "Products",
          route: "/products",
          permission: "products.read",
        },
        {
          icon: "shopping-bag",
          label: "Purchases",
          route: "/purchases",
          permission: "purchases.read",
        },
        {
          icon: "credit-card",
          label: "Expenses",
          route: "/expenses",
          permission: "expenses.read",
        },
        {
          icon: "bar-chart-2",
          label: "Reports",
          route: "/reports",
          permission: "reports.view",
        },
        {
          icon: "upload",
          label: "Export Data",
          route: "/exports/ExportScreen",
          permission: "reports.export",
        },
        {
          icon: "download",
          label: "Import Data",
          route: "/imports",
          permission: "products.create",
        },
        {
          icon: "rotate-ccw",
          label: "Refunds & Returns",
          route: "/refunds",
          permission: "refunds.read",
        },
        {
          icon: "shield",
          label: "Trust Dashboard",
          route: "/trust/TrustDashboard",
          permission: "trust.read",
        },
      ],
    },
    {
      title: "People",
      items: [
        {
          icon: "users",
          label: "Customers",
          route: "/customers",
          permission: "customers.read",
        },
        {
          icon: "truck",
          label: "Suppliers",
          route: "/suppliers",
          permission: "suppliers.read",
        },
        {
          icon: "user",
          label: "Employees",
          route: "/payroll/employees",
          permission: "employees.read",
        },
        {
          icon: "clock",
          label: "Audit Trail",
          route: "/auditTrail/auditTrailScreen",
          permission: "audit.read",
        },
      ],
    },
    {
      title: "Manufacturing",
      items: [
        {
          icon: "git-branch",
          label: "Bill of Materials",
          route: "/manufacturing/bom",
          permission: "manufacturing.read",
        },
        {
          icon: "bar-chart-2",
          label: "Production Reports",
          route: "/manufacturing/reports",
          permission: "manufacturing.read",
        },
        {
          icon: "layers",
          label: "Production Orders",
          route: "/manufacturing/production",
          permission: "manufacturing.read",
        },
        {
          icon: "clock",
          label: "AR Aging Report",
          route: "/sales-orders/aging",
          permission: "invoices.read",
        },
        {
          icon: "file-text",
          label: "Sales Orders",
          route: "/sales-orders",
          permission: "sales_orders.read",
        },
      ],
    },
    {
      title: "Finance & Tax",
      items: [
        {
          icon: "trending-up",
          label: "Finance Dashboard",
          route: "/finance/allocations",
          permission: "allocations.read",
        },
        ...(!isCompany
          ? [
              {
                icon: "briefcase" as FeatherIconName,
                label: "Owner's Drawings",
                route: "/finance/drawings",
                permission: "drawings.read",
              },
            ]
          : []),
        {
          icon: "calendar",
          label: "Payroll Runs",
          route: "/payroll/runs",
          permission: "payroll.read",
        },
        {
          icon: "percent",
          label: "Tax Dashboard",
          route: "/tax/dashboard",
          permission: "tax.read",
        },
      ],
    },
    {
      title: "Settings",
      items: [
        {
          icon: "lock",
          label: "Roles & Permissions",
          route: "/settingsg/roles",
          permission: "roles.read",
        },
        {
          icon: "user-plus",
          label: "Users & Roles",
          route: "/settingsg/users",
          permission: "invites.read",
        },
        {
          icon: "sliders",
          label: "Tax Settings",
          route: "/tax",
          permission: "tax.settings.read",
        },
        { icon: "settings", label: "App Settings", route: "/settings" },
      ],
    },
  ];
}

// ─── DRAWER CONTEXT ───────────────────────────────────────────────────────────

interface DrawerContextValue {
  openDrawer: () => void;
  closeDrawer: () => void;
  isOpen: boolean;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useDrawer must be used within a DrawerProvider");
  return ctx;
}

// ─── DRAWER PROVIDER ──────────────────────────────────────────────────────────

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const openDrawer = useCallback(() => {
    setIsOpen(true);
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateX, overlayOpacity]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: -DRAWER_WIDTH,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setIsOpen(false));
  }, [translateX, overlayOpacity]);

  return (
    <DrawerContext.Provider value={{ openDrawer, closeDrawer, isOpen }}>
      {children}
      {/* Overlay — rendered here so it sits above all content */}
      {isOpen && (
        <Animated.View
          style={[drawerStyles.overlay, { opacity: overlayOpacity }]}
          pointerEvents={isOpen ? "auto" : "none"}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
        </Animated.View>
      )}
      {/* Drawer panel */}
      <Animated.View
        style={[drawerStyles.drawerContainer, { transform: [{ translateX }] }]}
        pointerEvents={isOpen ? "auto" : "none"}
      >
        <AppDrawer onClose={closeDrawer} />
      </Animated.View>
    </DrawerContext.Provider>
  );
}

// ─── HAMBURGER BUTTON ─────────────────────────────────────────────────────────
// Drop this into any screen header.

export function HamburgerButton() {
  const { openDrawer } = useDrawer();
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      onPress={openDrawer}
      style={[
        hamburgerStyles.button,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.borderSubtle,
        },
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.7}
    >
      <Feather name="menu" size={18} color={theme.colors.textSecondary} />
    </TouchableOpacity>
  );
}

// ─── DRAWER CONTENT ───────────────────────────────────────────────────────────

function AppDrawer({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const businessType = useAuthStore((s) => s.businessType);
  const isCompany = businessType === "registered_company";
  const { hasPermission } = usePermissions();

  // Derive initials from user display name or email
  const displayName =
    (user as any)?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "User";
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleNavPress = (route: string) => {
    onClose();
    // Small delay lets the drawer close animation start before navigating
    setTimeout(() => router.push(route as any), 120);
  };

  const c = theme.colors;
  const t = theme.typography;
  const s = theme.spacing;

  // Filter items by permission
  const visibleSections = buildNavSections(isCompany)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.permission ? hasPermission(item.permission) : true,
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <View
      style={[
        drawerStyles.drawer,
        {
          backgroundColor: c.surface,
          borderRightColor: c.borderSubtle,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* ── Header ── */}
      <View
        style={[
          drawerStyles.drawerHeader,
          { borderBottomColor: c.borderSubtle },
        ]}
      >
        <View>
          <Text
            style={[
              drawerStyles.logoWord,
              {
                color: c.textMuted,
                fontFamily: theme.typography.label.fontFamily,
              },
            ]}
          >
            by Toledah
          </Text>
          <Text
            style={[
              drawerStyles.logoName,
              { color: c.textPrimary, fontFamily: t.h1.fontFamily },
            ]}
          >
            Zaena
          </Text>
        </View>
        {/* Live badge */}
        <View
          style={[
            drawerStyles.liveBadge,
            { backgroundColor: c.signalSoft, borderColor: c.signalDim },
          ]}
        >
          <LiveDot />
          <Text
            style={[
              drawerStyles.liveText,
              { color: c.signal, fontFamily: t.labelSm.fontFamily },
            ]}
          >
            LIVE
          </Text>
        </View>
      </View>

      {/* ── Nav sections ── */}
      <ScrollView
        style={drawerStyles.navScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: s.xl }}
      >
        {visibleSections.map((section, si) => (
          <View key={si} style={{ marginTop: si === 0 ? s.md : s.xs }}>
            <Text
              style={[
                drawerStyles.sectionLabel,
                {
                  color: c.textMuted,
                  fontFamily: t.labelSm.fontFamily,
                  paddingHorizontal: s.lg,
                },
              ]}
            >
              {section.title.toUpperCase()}
            </Text>
            <View style={{ paddingHorizontal: s.md, marginTop: s.xs }}>
              {section.items.map((item, ii) => {
                const isActive = pathname === item.route;
                return (
                  <TouchableOpacity
                    key={ii}
                    style={[
                      drawerStyles.navItem,
                      {
                        backgroundColor: isActive
                          ? c.brandInteractive
                          : "transparent",
                        borderRadius: theme.radius.md,
                      },
                    ]}
                    onPress={() => handleNavPress(item.route)}
                    activeOpacity={0.7}
                  >
                    {/* Active indicator stripe */}
                    {isActive && (
                      <View
                        style={[
                          drawerStyles.activeStripe,
                          { backgroundColor: c.signal },
                        ]}
                      />
                    )}
                    <Feather
                      name={item.icon}
                      size={15}
                      color={isActive ? c.air : c.textSecondary}
                      style={{ width: 18 }}
                    />
                    <Text
                      style={[
                        drawerStyles.navLabel,
                        {
                          color: isActive ? c.air : c.textSecondary,
                          fontFamily: isActive
                            ? t.bodyMed.fontFamily
                            : t.body.fontFamily,
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* ── Footer — user pill + logout ── */}
      <View
        style={[drawerStyles.drawerFooter, { borderTopColor: c.borderSubtle }]}
      >
        <View
          style={[
            drawerStyles.userPill,
            {
              backgroundColor: theme.isDark
                ? "rgba(43,117,116,0.08)"
                : c.surfaceOverlay,
              borderColor: c.borderSubtle,
            },
          ]}
        >
          <View
            style={[
              drawerStyles.avatar,
              { backgroundColor: c.brandInteractive },
            ]}
          >
            <Text
              style={[
                drawerStyles.avatarText,
                { color: c.air, fontFamily: t.label.fontFamily },
              ]}
            >
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={[
                drawerStyles.userName,
                { color: c.textPrimary, fontFamily: t.bodyMed.fontFamily },
              ]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <Text
              style={[
                drawerStyles.userRole,
                { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
              ]}
            >
              Owner · Admin
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              onClose();
              setTimeout(() => router.push("/settings" as any), 120);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="settings" size={14} color={c.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── LIVE DOT ─────────────────────────────────────────────────────────────────

function LiveDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.2,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[drawerStyles.liveDot, { opacity, backgroundColor: "#C9922A" }]}
    />
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const drawerStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 100,
  },
  drawerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    zIndex: 101,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: { elevation: 16 },
    }),
  },
  drawer: {
    flex: 1,
    borderRightWidth: 1,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  logoWord: {
    fontSize: 9,
    letterSpacing: 0.25 * 16,
    textTransform: "uppercase",
    marginBottom: 2,
    opacity: 0.5,
  },
  logoName: {
    fontSize: 26,
    letterSpacing: 0.05 * 16,
    lineHeight: 30,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  liveText: {
    fontSize: 9,
    letterSpacing: 0.12 * 16,
  },
  navScroll: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 9,
    letterSpacing: 0.15 * 16,
    paddingVertical: 8,
    marginTop: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 1,
    position: "relative",
    overflow: "hidden",
  },
  activeStripe: {
    position: "absolute",
    left: 0,
    top: "20%",
    bottom: "20%",
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  navLabel: {
    fontSize: 13.5,
    flex: 1,
  },
  drawerFooter: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  userPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 11,
  },
  userName: {
    fontSize: 12,
  },
  userRole: {
    fontSize: 10,
    marginTop: 1,
  },
});

const hamburgerStyles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
