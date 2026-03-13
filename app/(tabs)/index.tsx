import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PermissionGuard } from "@/context/PermissionGuard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { HamburgerButton } from "../../components/DrawerNavigator";
import { usePermissions } from "../../context/PermissionsContext";
import { useTheme } from "../../lib/theme/ThemeProvider";
import { useAuthStore } from "../../stores/authStore";

import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import supabase from "../../lib/supabase";

interface DashboardStats {
  todaySales: number;
  todayRevenue: number;
  lowStockCount: number;
  totalProducts: number;
  pendingSales: number;
}

interface WeekBar {
  day: string;
  value: number;
  isToday: boolean;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatCurrency(value: number, symbol: string): string {
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}K`;
  return `${symbol}${value.toLocaleString()}`;
}

// ─── BAR CHART ────────────────────────────────────────────────────────────────

function WeeklyBarChart({
  bars,
  currencySymbol,
}: {
  bars: WeekBar[];
  currencySymbol: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <View style={chartStyles.container}>
      {bars.map((bar, i) => {
        const heightPct = bar.value ? (bar.value / max) * 85 : 4;
        const isEmpty = bar.value === 0;
        return (
          <View key={i} style={chartStyles.group}>
            {bar.isToday && bar.value > 0 && (
              <Text
                style={[
                  chartStyles.barValue,
                  {
                    color: c.signal,
                    fontFamily: theme.typography.monoSm.fontFamily,
                  },
                ]}
              >
                {formatCurrency(bar.value, currencySymbol)}
              </Text>
            )}
            <View style={chartStyles.barTrack}>
              <View
                style={[
                  chartStyles.bar,
                  {
                    height: `${heightPct}%` as any,
                    backgroundColor: bar.isToday
                      ? c.signal
                      : isEmpty
                        ? c.borderSubtle
                        : c.brandInteractive,
                    opacity: isEmpty ? 0.3 : 1,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              />
            </View>
            <Text
              style={[
                chartStyles.dayLabel,
                {
                  color: bar.isToday ? c.textPrimary : c.textMuted,
                  fontFamily: theme.typography.labelSm.fontFamily,
                  fontWeight: bar.isToday ? "600" : "400",
                },
              ]}
            >
              {bar.day}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 100,
    gap: 6,
    paddingHorizontal: 4,
  },
  group: {
    flex: 1,
    alignItems: "center",
    height: "100%",
    justifyContent: "flex-end",
  },
  barTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    minHeight: 4,
  },
  dayLabel: {
    fontSize: 9,
    letterSpacing: 0.5,
    marginTop: 5,
    textTransform: "uppercase",
  },
  barValue: {
    fontSize: 9,
    marginBottom: 3,
  },
});

// ─── STAT CARD ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  subVariant = "neutral",
  onPress,
  isWarning = false,
}: {
  label: string;
  value: string;
  sub?: string;
  subVariant?: "up" | "down" | "neutral" | "warning";
  onPress?: () => void;
  isWarning?: boolean;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;

  const subColor =
    subVariant === "up"
      ? c.positive
      : subVariant === "down"
        ? c.negative
        : subVariant === "warning"
          ? c.warning
          : c.textMuted;

  return (
    <TouchableOpacity
      style={[
        statStyles.card,
        {
          backgroundColor: c.surfaceRaised,
          borderColor: isWarning ? c.signalDim : c.borderSubtle,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text
        style={[
          statStyles.label,
          { color: c.textMuted, fontFamily: t.labelSm.fontFamily },
        ]}
      >
        {label.toUpperCase()}
      </Text>
      <Text
        style={[
          statStyles.value,
          {
            color: isWarning ? c.signal : c.textPrimary,
            fontFamily: t.monoLg.fontFamily,
          },
        ]}
      >
        {value}
      </Text>
      {sub && (
        <Text
          style={[
            statStyles.sub,
            { color: subColor, fontFamily: t.monoSm.fontFamily },
          ]}
        >
          {sub}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  label: {
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 2,
  },
  value: {
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 10,
    marginTop: 2,
  },
});

// ─── MAIN SCREEN

export default function DashboardHome() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user, organizationId } = useAuthStore();
  const { hasPermission } = usePermissions();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState("");
  const [currency, setCurrency] = useState({
    symbol: "",
    code: "NGN",
    name: "Nigerian Naira",
  });
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    todayRevenue: 0,
    lowStockCount: 0,
    totalProducts: 0,
    pendingSales: 0,
  });
  const [weekBars, setWeekBars] = useState<WeekBar[]>([]);

  const c = theme.colors;
  const t = theme.typography;
  const sp = theme.spacing;

  // ── Currency load ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadOrgCurrency() {
      if (!organizationId) return;
      try {
        const org = await getOrganization(organizationId);
        if (org.currency) {
          const match = ALL_CURRENCIES.find((cu) => cu.code === org.currency);
          setCurrency({
            code: org.currency,
            symbol: match?.symbol ?? org.currency,
            name: match?.name ?? "",
          });
        } else if (org.timezone) {
          setCurrency(getCurrencyForTimezone(org.timezone));
        }
      } catch (err) {
        console.error("Failed to load org currency:", err);
      }
    }
    loadOrgCurrency();
  }, [organizationId]);

  // ── Data fetch ─────────────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      if (user && organizationId) fetchDashboardData();
    }, [user, organizationId]),
  );

  async function fetchDashboardData() {
    if (!organizationId) return;
    setLoading(true);
    try {
      const cacheKey = `dashboard_v2_${organizationId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { stats: cs, userName: cn, weekBars: cw } = JSON.parse(cached);
        setStats(cs);
        setUserName(cn);
        if (cw) setWeekBars(cw);
        setLoading(false);
      }

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", authUser.id)
        .single();

      const name =
        profile?.full_name || authUser.email?.split("@")[0] || "User";
      setUserName(name);

      // Today boundaries
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      // Week boundaries (Mon–Sun)
      const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1; // 0=Mon
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - dayOfWeek);

      const [summaryData, productsData, inventoryData, pendingData, weekData] =
        await Promise.all([
          supabase
            .from("export_sales_summary")
            .select("net_revenue, payment_status")
            .eq("organization_id", organizationId)
            .gte("sale_date", todayStr),
          supabase
            .from("products")
            .select("id", { count: "exact" })
            .eq("organization_id", organizationId)
            .eq("is_active", true),
          supabase
            .from("inventory")
            .select("product_id", { count: "exact" })
            .eq("organization_id", organizationId)
            .lt("quantity_on_hand", 10),
          supabase
            .from("sales")
            .select("id", { count: "exact" })
            .eq("organization_id", organizationId)
            .in("payment_status", ["unpaid", "partial"])
            .is("voided_at", null),
          supabase
            .from("export_sales_summary")
            .select("net_revenue, sale_date")
            .eq("organization_id", organizationId)
            .gte("sale_date", weekStart.toISOString()),
        ]);

      const sales = summaryData.data || [];
      const freshStats: DashboardStats = {
        todaySales: sales.length,
        todayRevenue: sales.reduce(
          (sum, s) => sum + Number(s.net_revenue ?? 0),
          0,
        ),
        lowStockCount: inventoryData.count || 0,
        totalProducts: productsData.count || 0,
        pendingSales: pendingData.count || 0,
      };

      // Build week bars
      const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const barMap: Record<number, number> = {};
      (weekData.data || []).forEach((row) => {
        const d = new Date(row.sale_date);
        const di = d.getDay() === 0 ? 6 : d.getDay() - 1;
        barMap[di] = (barMap[di] || 0) + Number(row.net_revenue ?? 0);
      });
      const freshBars: WeekBar[] = DAY_LABELS.map((day, i) => ({
        day,
        value: barMap[i] || 0,
        isToday: i === dayOfWeek,
      }));

      setStats(freshStats);
      setWeekBars(freshBars);

      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          stats: freshStats,
          userName: name,
          weekBars: freshBars,
        }),
      );
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }
  // ── Quick actions visibility ───────────────────────────────────────────────

  const canSell = hasPermission("sales.create");
  const canStock = hasPermission("inventory.adjust");
  const canAddProduct = hasPermission("products.create");

  // ── Render ─────────────────────────────────────────────────────────────────

  const firstName = userName.split(" ")[0];
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + sp.md,
            backgroundColor: c.canvas,
            borderBottomColor: c.borderSubtle,
          },
        ]}
      >
        <HamburgerButton />
        <View style={styles.headerCenter}>
          <Text
            style={[
              styles.greeting,
              { color: c.textSecondary, fontFamily: t.bodySm.fontFamily },
            ]}
          >
            {getGreeting()},
          </Text>
          <Text
            style={[
              styles.userName,
              { color: c.textPrimary, fontFamily: t.h1.fontFamily },
            ]}
          >
            {firstName || "—"}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.iconBtn,
            { backgroundColor: c.surfaceRaised, borderColor: c.borderSubtle },
          ]}
          onPress={() => router.push("/notifications" as any)}
          activeOpacity={0.7}
        >
          <Feather name="bell" size={16} color={c.textSecondary} />
          {/* Unread dot */}
          <View style={[styles.notifDot, { backgroundColor: c.signal }]} />
        </TouchableOpacity>
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.signal}
            colors={[c.signal]}
            onRefresh={() => {
              setRefreshing(true);
              fetchDashboardData();
            }}
          />
        }
        contentContainerStyle={{
          paddingBottom: insets.bottom + sp.huge,
        }}
      >
        {/* ── Date + branch subheader ── */}
        <View
          style={[
            styles.subheader,
            { paddingHorizontal: sp.lg, paddingTop: sp.xl },
          ]}
        >
          <Text
            style={[
              styles.pageTitle,
              { color: c.textPrimary, fontFamily: t.h1.fontFamily },
            ]}
          >
            Overview
          </Text>
          <Text
            style={[
              styles.dateLabel,
              { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
            ]}
          >
            {dateLabel}
          </Text>
        </View>

        {/* ── Revenue hero card ── */}
        <PermissionGuard permission="sales.read">
          <View style={{ paddingHorizontal: sp.lg, marginTop: sp.lg }}>
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: c.surfaceRaised,
                  borderColor: c.borderSubtle,
                },
              ]}
            >
              {/* Card top row */}
              <View style={styles.heroTop}>
                <View>
                  <Text
                    style={[
                      styles.heroLabel,
                      { color: c.textMuted, fontFamily: t.labelSm.fontFamily },
                    ]}
                  >
                    TODAY&apos;S REVENUE
                  </Text>
                  <Text
                    style={[
                      styles.heroAmount,
                      { color: c.signal, fontFamily: t.monoLg.fontFamily },
                    ]}
                  >
                    {formatCurrency(stats.todayRevenue, currency.symbol)}
                  </Text>
                  <Text
                    style={[
                      styles.heroSub,
                      {
                        color: c.textSecondary,
                        fontFamily: t.monoSm.fontFamily,
                      },
                    ]}
                  >
                    {stats.todaySales} sales
                    {stats.pendingSales > 0
                      ? `  ·  ${stats.pendingSales} unpaid`
                      : ""}
                  </Text>
                </View>
                {/* New Sale CTA */}
                <PermissionGuard permission="sales.create">
                  <TouchableOpacity
                    style={[
                      styles.heroBtn,
                      { backgroundColor: c.brandInteractive },
                    ]}
                    onPress={() => router.push("/sales/new" as any)}
                    activeOpacity={0.8}
                  >
                    <Feather name="plus" size={14} color={c.air} />
                    <Text
                      style={[
                        styles.heroBtnText,
                        { color: c.air, fontFamily: t.bodyMed.fontFamily },
                      ]}
                    >
                      New Sale
                    </Text>
                  </TouchableOpacity>
                </PermissionGuard>
              </View>

              {/* Divider */}
              <View
                style={[
                  styles.heroDivider,
                  { backgroundColor: c.borderSubtle },
                ]}
              />

              {/* Weekly bar chart */}
              <View>
                <Text
                  style={[
                    styles.chartLabel,
                    { color: c.textMuted, fontFamily: t.labelSm.fontFamily },
                  ]}
                >
                  WEEKLY REVENUE
                </Text>
                <WeeklyBarChart
                  bars={
                    weekBars.length > 0
                      ? weekBars
                      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                          (day, i) => ({
                            day,
                            value: 0,
                            isToday:
                              i ===
                              (new Date().getDay() === 0
                                ? 6
                                : new Date().getDay() - 1),
                          }),
                        )
                  }
                  currencySymbol={currency.symbol}
                />
              </View>
            </View>
          </View>
        </PermissionGuard>

        {/* ── Stat cards row ── */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: sp.lg,
            marginTop: sp.md,
            gap: sp.md,
          }}
        >
          <StatCard
            label="Products"
            value={String(stats.totalProducts)}
            onPress={() => router.push("/products" as any)}
          />
          <StatCard
            label="Low Stock"
            value={String(stats.lowStockCount)}
            sub={stats.lowStockCount > 0 ? "needs reorder" : "all clear"}
            subVariant={stats.lowStockCount > 0 ? "warning" : "up"}
            isWarning={stats.lowStockCount > 0}
            onPress={() => router.push("/inventory?filter=low_stock" as any)}
          />
          <StatCard
            label="Pending"
            value={String(stats.pendingSales)}
            sub={stats.pendingSales > 0 ? "unpaid sales" : "all paid"}
            subVariant={stats.pendingSales > 0 ? "warning" : "up"}
            onPress={() => router.push("/sales?status=unpaid" as any)}
          />
        </View>

        {/* ── Quick actions ── */}
        {(canSell || canStock || canAddProduct) && (
          <View style={{ paddingHorizontal: sp.lg, marginTop: sp.xl }}>
            <Text
              style={[
                styles.sectionTitle,
                { color: c.textMuted, fontFamily: t.labelSm.fontFamily },
              ]}
            >
              QUICK ACTIONS
            </Text>
            <View
              style={{ flexDirection: "row", gap: sp.md, marginTop: sp.sm }}
            >
              {canSell && (
                <TouchableOpacity
                  style={[
                    styles.quickBtn,
                    {
                      backgroundColor: c.brandInteractive,
                      borderColor: "transparent",
                    },
                  ]}
                  onPress={() => router.push("/sales/new" as any)}
                  activeOpacity={0.8}
                >
                  <Feather name="shopping-cart" size={18} color={c.air} />
                  <Text
                    style={[
                      styles.quickBtnText,
                      { color: c.air, fontFamily: t.label.fontFamily },
                    ]}
                  >
                    New Sale
                  </Text>
                </TouchableOpacity>
              )}
              {canStock && (
                <TouchableOpacity
                  style={[
                    styles.quickBtn,
                    {
                      backgroundColor: c.surfaceRaised,
                      borderColor: c.borderDefault,
                    },
                  ]}
                  onPress={() => router.push("/inventory/adjust" as any)}
                  activeOpacity={0.8}
                >
                  <Feather name="package" size={18} color={c.textSecondary} />
                  <Text
                    style={[
                      styles.quickBtnText,
                      {
                        color: c.textSecondary,
                        fontFamily: t.label.fontFamily,
                      },
                    ]}
                  >
                    Add Stock
                  </Text>
                </TouchableOpacity>
              )}
              {canAddProduct && (
                <TouchableOpacity
                  style={[
                    styles.quickBtn,
                    {
                      backgroundColor: c.surfaceRaised,
                      borderColor: c.borderDefault,
                    },
                  ]}
                  onPress={() => router.push("/products/add" as any)}
                  activeOpacity={0.8}
                >
                  <Feather
                    name="plus-circle"
                    size={18}
                    color={c.textSecondary}
                  />
                  <Text
                    style={[
                      styles.quickBtnText,
                      {
                        color: c.textSecondary,
                        fontFamily: t.label.fontFamily,
                      },
                    ]}
                  >
                    Add Product
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Alerts ── */}
        {(stats.lowStockCount > 0 || stats.pendingSales > 0) && (
          <View style={{ paddingHorizontal: sp.lg, marginTop: sp.xl }}>
            <Text
              style={[
                styles.sectionTitle,
                { color: c.textMuted, fontFamily: t.labelSm.fontFamily },
              ]}
            >
              ALERTS
            </Text>
            <View style={{ marginTop: sp.sm, gap: sp.sm }}>
              {stats.lowStockCount > 0 && (
                <TouchableOpacity
                  style={[
                    styles.alertRow,
                    {
                      backgroundColor: c.surfaceRaised,
                      borderColor: c.signalDim,
                    },
                  ]}
                  onPress={() =>
                    router.push("/inventory?filter=low_stock" as any)
                  }
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.alertIconWrap,
                      { backgroundColor: c.warningSoft },
                    ]}
                  >
                    <Feather
                      name="alert-triangle"
                      size={16}
                      color={c.warning}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.alertTitle,
                        {
                          color: c.textPrimary,
                          fontFamily: t.bodyMed.fontFamily,
                        },
                      ]}
                    >
                      Low Stock
                    </Text>
                    <Text
                      style={[
                        styles.alertSub,
                        { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
                      ]}
                    >
                      {stats.lowStockCount} items need restocking
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={c.textMuted} />
                </TouchableOpacity>
              )}
              {stats.pendingSales > 0 && (
                <TouchableOpacity
                  style={[
                    styles.alertRow,
                    {
                      backgroundColor: c.surfaceRaised,
                      borderColor: c.borderSubtle,
                    },
                  ]}
                  onPress={() => router.push("/sales?status=unpaid" as any)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.alertIconWrap,
                      { backgroundColor: c.negativeSoft },
                    ]}
                  >
                    <Feather name="clock" size={16} color={c.negative} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.alertTitle,
                        {
                          color: c.textPrimary,
                          fontFamily: t.bodyMed.fontFamily,
                        },
                      ]}
                    >
                      Unpaid Sales
                    </Text>
                    <Text
                      style={[
                        styles.alertSub,
                        { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
                      ]}
                    >
                      {stats.pendingSales} pending collection
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={c.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerCenter: {
    flex: 1,
  },
  greeting: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  userName: {
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: 0.02 * 20,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  notifDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  subheader: {
    gap: 4,
  },
  pageTitle: {
    fontSize: 22,
    letterSpacing: 0.02 * 22,
    lineHeight: 28,
  },
  dateLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  heroCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  heroLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroAmount: {
    fontSize: 34,
    letterSpacing: -1,
    lineHeight: 38,
  },
  heroSub: {
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  heroBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    marginTop: 4,
  },
  heroBtnText: {
    fontSize: 13,
  },
  heroDivider: {
    height: 1,
  },
  chartLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  quickBtn: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  quickBtnText: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  alertTitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  alertSub: {
    fontSize: 10,
    marginTop: 1,
    letterSpacing: 0.2,
  },
});
