// FILE: app/(tabs)/sales.tsx

import { PermissionButton } from "@/context/PermisionButton";
import { useOnAppForeground } from "@/lib/hooks/useOnAppForeground";
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import supabase from "../../lib/supabase";
import { useTheme } from "../../lib/theme/ThemeProvider";
import { useAuthStore } from "../../stores/authStore";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Sale {
  id: string;
  receipt_number: string;
  total_amount: number;
  total_cogs: number;
  payment_status: string;
  created_at: string;
  voided_at: string | null;
  customer_name?: string;
  occurred_at?: string;
  is_backdated?: boolean;
  entry_method?: string;
  needs_review?: boolean;
  review_reason?: string;
  sale_items: {
    quantity: number;
    unit_price: number;
    product_id: string;
    location_id?: string;
    products: { name: string };
  }[];
}

interface ReviewSale {
  id: string;
  receipt_number: string;
  review_reason: string;
  created_at: string;
  total_amount: number;
  location_id: string;
  sale_items: { product_id: string; products: { name: string }[] }[];
}

type FilterStatus = "all" | "paid" | "unpaid" | "partial" | "voided";
type FilterPeriod = "today" | "week" | "month" | "all";

// ─── PAYMENT STATUS ICON ──────────────────────────────────────────────────────

function PaymentStatusIcon({
  status,
  size = 14,
}: {
  status: string;
  size?: number;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  if (status === "paid")
    return <Feather name="check-circle" size={size} color={c.positive} />;
  if (status === "partial")
    return <Feather name="clock" size={size} color={c.warning} />;
  return <Feather name="circle" size={size} color={c.negative} />;
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────

function StatCard({
  value,
  label,
  sub,
  alert = false,
  onPress,
}: {
  value: string;
  label: string;
  sub?: string;
  alert?: boolean;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;

  return (
    <TouchableOpacity
      style={[
        statStyles.card,
        {
          backgroundColor: alert ? c.negativeSoft : c.surfaceRaised,
          borderColor: alert ? c.negative : c.borderSubtle,
        },
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
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
            color: alert ? c.negative : c.textPrimary,
            fontFamily: t.monoLg.fontFamily,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? (
        <Text
          style={[
            statStyles.sub,
            { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
          ]}
          numberOfLines={1}
        >
          {sub}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  label: { fontSize: 11, letterSpacing: 0.6 },
  value: { fontSize: 20, letterSpacing: -0.5, lineHeight: 25 },
  sub: { fontSize: 11, letterSpacing: 0.1, marginTop: 1 },
});

// ─── FILTER CHIP ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;

  return (
    <TouchableOpacity
      style={[
        chipStyles.chip,
        {
          backgroundColor: active ? c.brandInteractive : c.surfaceRaised,
          borderColor: active ? c.brandInteractive : c.borderSubtle,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          chipStyles.label,
          {
            color: active ? c.air : c.textMuted,
            fontFamily: active ? t.label.fontFamily : t.bodySm.fontFamily,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { fontSize: 13, letterSpacing: 0.2 },
});

// ─── SALE ROW ─────────────────────────────────────────────────────────────────

function SaleRow({
  sale,
  currency,
  onPress,
}: {
  sale: Sale;
  currency: { symbol: string };
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;

  const date = new Date(sale.created_at);
  const isToday = date.toDateString() === new Date().toDateString();
  const firstItem = sale.sale_items[0]?.products?.name || "—";
  const moreItems =
    sale.sale_items.length > 1 ? `  +${sale.sale_items.length - 1}` : "";

  return (
    <TouchableOpacity
      style={[
        rowStyles.row,
        {
          backgroundColor: c.surfaceRaised,
          borderColor: sale.needs_review ? c.signalDim : c.borderSubtle,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Left: receipt + items */}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={[
              rowStyles.receipt,
              { color: c.textPrimary, fontFamily: t.monoSm.fontFamily },
            ]}
            numberOfLines={1}
          >
            {sale.receipt_number}
          </Text>
          {sale.needs_review && (
            <View
              style={[
                rowStyles.reviewBadge,
                { backgroundColor: c.warningSoft, borderColor: c.signalDim },
              ]}
            >
              <Feather name="alert-triangle" size={9} color={c.signal} />
              <Text
                style={[
                  rowStyles.reviewBadgeText,
                  { color: c.signal, fontFamily: t.labelSm.fontFamily },
                ]}
              >
                REVIEW
              </Text>
            </View>
          )}
          {sale.voided_at && (
            <View
              style={[
                rowStyles.reviewBadge,
                {
                  backgroundColor: c.negativeSoft,
                  borderColor: c.borderDefault,
                },
              ]}
            >
              <Text
                style={[
                  rowStyles.reviewBadgeText,
                  { color: c.negative, fontFamily: t.labelSm.fontFamily },
                ]}
              >
                VOIDED
              </Text>
            </View>
          )}
        </View>
        {sale.customer_name ? (
          <Text
            style={[
              rowStyles.customer,
              { color: c.textSecondary, fontFamily: t.bodySm.fontFamily },
            ]}
          >
            {sale.customer_name}
          </Text>
        ) : null}
        <Text
          style={[
            rowStyles.items,
            { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
          ]}
          numberOfLines={1}
        >
          {firstItem}
          {moreItems}
        </Text>
      </View>

      {/* Right: amount + status + time */}
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text
          style={[
            rowStyles.amount,
            { color: c.signal, fontFamily: t.mono.fontFamily },
          ]}
        >
          {currency.symbol}
          {sale.total_amount.toLocaleString()}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <PaymentStatusIcon status={sale.payment_status} size={12} />
          <Text
            style={[
              rowStyles.time,
              { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
            ]}
          >
            {isToday
              ? date.toLocaleTimeString("en-NG", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : date.toLocaleDateString("en-NG", {
                  month: "short",
                  day: "numeric",
                })}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  receipt: { fontSize: 13, letterSpacing: 0.1 },
  customer: { fontSize: 13 },
  items: { fontSize: 12, letterSpacing: 0.1 },
  amount: { fontSize: 17, letterSpacing: -0.3 },
  time: { fontSize: 12 },
  reviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  reviewBadgeText: { fontSize: 10, letterSpacing: 0.4 },
});

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────

export default function SalesScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;
  const sp = theme.spacing;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const params = useLocalSearchParams();

  const locationId = params.location_id as string | undefined;
  const locationName = params.location_name as string | undefined;
  const urlStatus = params.status as FilterStatus | undefined;
  const urlPeriod = params.period as FilterPeriod | undefined;

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(
    urlStatus || "all",
  );
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>(
    urlPeriod || "today",
  );
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [currency, setCurrency] = useState({
    symbol: " ",
    code: "NGN",
    name: "Nigerian Naira",
  });
  const [unpaidCn, setUnpaidCn] = useState(0);
  const [todayActualRevenue, setTodayActualRevenue] = useState(0);
  const [todayActualProfit, setTodayActualProfit] = useState(0);
  const [todayCollected, setTodayCollected] = useState(0);

  const [reviewSales, setReviewSales] = useState<ReviewSale[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [showReviewPanel, setShowReviewPanel] = useState(false);

  const ITEMS_PER_PAGE = 20;

  // ── Currency ───────────────────────────────────────────────────────────────

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
      } catch {}
    }
    loadOrgCurrency();
  }, [organizationId]);

  useEffect(() => {
    if (urlStatus) setFilterStatus(urlStatus as FilterStatus);
  }, [urlStatus]);

  useFocusEffect(
    useCallback(() => {
      setPage(1);
      fetchSales(1, true);
      fetchTodayRevenue();
      fetchUnpaidStats();
      fetchReviewSales();
    }, [filterStatus, filterPeriod]),
  );

  useOnAppForeground(() => {
    setPage(1);
    fetchSales(1, true);
    fetchTodayRevenue();
    fetchUnpaidStats();
    fetchReviewSales();
  });

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchReviewSales() {
    try {
      const cacheKey = `review_sales_${organizationId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setReviewSales(parsed);
        setReviewCount(parsed.length);
      }
      const { data, error } = await supabase
        .from("sales")
        .select(
          `id, receipt_number, review_reason, created_at, total_amount, location_id, sale_items ( product_id, products ( name ) )`,
        )
        .eq("needs_review", true)
        .is("voided_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReviewSales(data || []);
      setReviewCount(data?.length || 0);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data || []));
    } catch (err) {
      console.error("fetchReviewSales error:", err);
    }
  }

  async function dismissReview(saleId: string) {
    try {
      const { error } = await supabase
        .from("sales")
        .update({ needs_review: false })
        .eq("id", saleId);
      if (error) throw error;
      const updated = reviewSales.filter((s) => s.id !== saleId);
      setReviewSales(updated);
      setReviewCount(updated.length);
      await AsyncStorage.setItem(
        `review_sales_${organizationId}`,
        JSON.stringify(updated),
      );
      if (updated.length === 0) setShowReviewPanel(false);
    } catch {
      Alert.alert("Error", "Could not dismiss this flag. Please try again.");
    }
  }

  async function dismissAllReviews() {
    Alert.alert(
      "Mark All as Reviewed",
      "This will clear all sync conflict flags.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark All Reviewed",
          style: "destructive",
          onPress: async () => {
            try {
              const ids = reviewSales.map((s) => s.id);
              const { error } = await supabase
                .from("sales")
                .update({ needs_review: false })
                .in("id", ids);
              if (error) throw error;
              setReviewSales([]);
              setReviewCount(0);
              setShowReviewPanel(false);
              await AsyncStorage.setItem(
                `review_sales_${organizationId}`,
                JSON.stringify([]),
              );
            } catch {
              Alert.alert("Error", "Could not dismiss all flags.");
            }
          },
        },
      ],
    );
  }

  async function fetchSales(pageNum: number = 1, reset: boolean = false) {
    if (!reset && !hasMore) return;
    setLoading(reset);
    try {
      if (reset && pageNum === 1) {
        const cacheKey = `sales_${filterStatus}_${filterPeriod}_page1`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          setSales(JSON.parse(cached));
          setLoading(false);
        }
      }
      let dateFilter = null;
      const now = new Date();
      if (filterPeriod === "today")
        dateFilter = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).toISOString();
      else if (filterPeriod === "week") {
        const w = new Date(now);
        w.setDate(now.getDate() - 7);
        dateFilter = w.toISOString();
      } else if (filterPeriod === "month")
        dateFilter = new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
        ).toISOString();

      let query = supabase
        .from("sales")
        .select(
          `*, sale_items ( quantity, unit_price, product_id, products ( name ) )`,
        )
        .order("created_at", { ascending: false })
        .range((pageNum - 1) * ITEMS_PER_PAGE, pageNum * ITEMS_PER_PAGE - 1);

      if (dateFilter) query = query.gte("created_at", dateFilter);
      if (filterStatus !== "all") {
        if (filterStatus === "voided")
          query = query.not("voided_at", "is", null);
        else {
          query = query.eq("payment_status", filterStatus);
          query = query.is("voided_at", null);
        }
      }
      if (locationId) query = query.eq("location_id", locationId);

      const { data, error } = await query;
      if (error) {
        console.error("Sales fetch error:", error);
        return;
      }

      if (reset) {
        setSales(data || []);
        if (pageNum === 1 && data)
          await AsyncStorage.setItem(
            `sales_${filterStatus}_${filterPeriod}_page1`,
            JSON.stringify(data),
          );
      } else {
        setSales((prev) => [...prev, ...(data || [])]);
      }
      setHasMore((data?.length || 0) === ITEMS_PER_PAGE);
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fetchUnpaidStats() {
    try {
      const cacheKey = `unpaid_stats_${organizationId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) setUnpaidCn(JSON.parse(cached));
      const { count, error } = await supabase
        .from("sales")
        .select("id", { count: "exact", head: true })
        .in("payment_status", ["unpaid", "partial"])
        .is("voided_at", null);
      if (error) throw error;
      setUnpaidCn(count || 0);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(count || 0));
    } catch {}
  }

  async function fetchTodayRevenue() {
    try {
      const cacheKey = `today_revenue_${organizationId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { revenue, profit, collected } = JSON.parse(cached);
        setTodayActualRevenue(revenue);
        setTodayActualProfit(profit);
        setTodayCollected(collected);
      }
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: salesData } = await supabase
        .from("export_sales_summary")
        .select("total_amount, net_revenue, profit")
        .gte("sale_date", todayStart.toISOString());
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("amount")
        .gte("created_at", todayStart.toISOString());
      const revenue =
        salesData?.reduce((sum, s) => sum + Number(s.net_revenue), 0) || 0;
      const profit =
        salesData?.reduce((sum, s) => sum + Number(s.profit), 0) || 0;
      const collected =
        paymentsData?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      setTodayActualRevenue(revenue);
      setTodayActualProfit(profit);
      setTodayCollected(collected);
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({ revenue, profit, collected }),
      );
    } catch {}
  }

  function onRefresh() {
    setRefreshing(true);
    setPage(1);
    fetchSales(1, true);
    fetchReviewSales();
  }

  function loadMore() {
    if (!loading && hasMore) {
      const next = page + 1;
      setPage(next);
      fetchSales(next, false);
    }
  }

  const todaySales = sales.filter(
    (s) =>
      new Date(s.created_at).toDateString() === new Date().toDateString() &&
      s.voided_at === null,
  );
  const unpaidSales = sales.filter(
    (s) =>
      (s.payment_status === "unpaid" || s.payment_status === "partial") &&
      s.voided_at === null,
  );
  const unpaidAmount = unpaidSales.reduce((sum, s) => sum + s.total_amount, 0);
  const oldDebts = unpaidSales.filter(
    (s) =>
      Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000) >
      7,
  ).length;
  const profitMargin =
    todayActualRevenue > 0
      ? ((todayActualProfit / todayActualRevenue) * 100).toFixed(1)
      : "0";

  // ─── Format helpers ────────────────────────────────────────────────────────
  function fmt(n: number) {
    if (n >= 1_000_000)
      return `${currency.symbol}${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${currency.symbol}${(n / 1_000).toFixed(1)}K`;
    return `${currency.symbol}${n.toLocaleString()}`;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

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
        <Text
          style={[
            styles.title,
            { color: c.textPrimary, fontFamily: t.h1.fontFamily },
          ]}
        >
          Sales
        </Text>
        <PermissionButton
          permission="sales.create"
          style={[styles.newBtn, { backgroundColor: c.brandInteractive }]}
          onPress={() => router.push("/sales/new")}
        >
          <Feather name="plus" size={14} color={c.air} />
          <Text
            style={[
              styles.newBtnText,
              { color: c.air, fontFamily: t.bodyMed.fontFamily },
            ]}
          >
            New Sale
          </Text>
        </PermissionButton>
      </View>

      {/* ── Review banner ── */}
      {reviewCount > 0 && (
        <TouchableOpacity
          style={[
            styles.reviewBanner,
            { backgroundColor: c.warningSoft, borderColor: c.signalDim },
          ]}
          onPress={() => setShowReviewPanel(true)}
          activeOpacity={0.8}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: sp.sm,
              flex: 1,
            }}
          >
            <View
              style={[
                styles.reviewBannerIcon,
                { backgroundColor: c.signal + "22" },
              ]}
            >
              <Feather name="alert-triangle" size={14} color={c.signal} />
            </View>
            <View>
              <Text
                style={[
                  styles.reviewBannerTitle,
                  { color: c.signal, fontFamily: t.bodyMed.fontFamily },
                ]}
              >
                {reviewCount} sale{reviewCount > 1 ? "s" : ""} need review
              </Text>
              <Text
                style={[
                  styles.reviewBannerSub,
                  { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
                ]}
              >
                Stock discrepancies found during sync
              </Text>
            </View>
          </View>
          <Feather name="chevron-right" size={16} color={c.signal} />
        </TouchableOpacity>
      )}

      {/* ── Location filter notice ── */}
      {locationId && (
        <View
          style={[
            styles.locationNotice,
            { backgroundColor: c.warningSoft, borderColor: c.signalDim },
          ]}
        >
          <Text
            style={[
              styles.locationNoticeText,
              { color: c.textSecondary, fontFamily: t.bodySm.fontFamily },
            ]}
          >
            Showing:{" "}
            <Text
              style={{ fontFamily: t.bodyMed.fontFamily, color: c.textPrimary }}
            >
              {locationName || "Selected Location"}
            </Text>
          </Text>
          <TouchableOpacity
            onPress={() =>
              router.setParams({
                location_id: undefined,
                location_name: undefined,
              })
            }
          >
            <Feather name="x" size={16} color={c.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.signal}
            colors={[c.signal]}
            onRefresh={onRefresh}
          />
        }
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (
            layoutMeasurement.height + contentOffset.y >=
            contentSize.height - 20
          )
            loadMore();
        }}
        scrollEventThrottle={400}
        contentContainerStyle={{ paddingBottom: insets.bottom + sp.huge }}
      >
        {/* ── Stats row ── */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: sp.lg,
            paddingTop: sp.lg,
            gap: sp.sm,
          }}
        >
          <StatCard
            label="Today"
            value={String(todaySales.length)}
            sub={`${fmt(todayCollected)} collected`}
          />
          <StatCard
            label="Revenue"
            value={fmt(todayActualRevenue)}
            sub={`${profitMargin}% margin`}
          />
          <StatCard
            label="Profit"
            value={fmt(todayActualProfit)}
            sub={`${fmt(todayActualRevenue)} revenue`}
          />
          <StatCard
            label="Unpaid"
            value={String(unpaidCn)}
            sub={unpaidAmount > 0 ? fmt(unpaidAmount) : undefined}
            alert={unpaidCn > 0}
            onPress={unpaidCn > 0 ? () => setFilterStatus("unpaid") : undefined}
          />
        </View>

        {/* ── Period filters ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: sp.lg,
            paddingTop: sp.lg,
            gap: sp.sm,
          }}
        >
          {(["today", "week", "month", "all"] as FilterPeriod[]).map((p) => (
            <FilterChip
              key={p}
              label={
                p === "today"
                  ? "Today"
                  : p === "week"
                    ? "This Week"
                    : p === "month"
                      ? "This Month"
                      : "All Time"
              }
              active={filterPeriod === p}
              onPress={() => setFilterPeriod(p)}
            />
          ))}
        </ScrollView>

        {/* ── Status filters ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: sp.lg,
            paddingTop: sp.sm,
            paddingBottom: sp.lg,
            gap: sp.sm,
          }}
        >
          {(
            ["all", "unpaid", "partial", "paid", "voided"] as FilterStatus[]
          ).map((s) => (
            <FilterChip
              key={s}
              label={
                s === "all"
                  ? "All"
                  : s === "unpaid"
                    ? "Unpaid"
                    : s === "partial"
                      ? "Partial"
                      : s === "paid"
                        ? "Paid"
                        : "Voided"
              }
              active={filterStatus === s}
              onPress={() => setFilterStatus(s)}
            />
          ))}
        </ScrollView>

        {/* ── Sales list ── */}
        <View style={{ paddingHorizontal: sp.lg }}>
          {loading && sales.length === 0 && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={c.brandInteractive} />
            </View>
          )}

          {sales.length === 0 && !loading && (
            <View style={styles.empty}>
              <Feather name="credit-card" size={40} color={c.textMuted} />
              <Text
                style={[
                  styles.emptyTitle,
                  { color: c.textSecondary, fontFamily: t.h3.fontFamily },
                ]}
              >
                No sales found
              </Text>
              <Text
                style={[
                  styles.emptySub,
                  { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
                ]}
              >
                {filterStatus !== "all" || filterPeriod !== "today"
                  ? "Try adjusting your filters"
                  : "Create your first sale to get started"}
              </Text>
            </View>
          )}

          {sales.map((sale) => (
            <SaleRow
              key={sale.id}
              sale={sale}
              currency={currency}
              onPress={() => router.push(`/sales/${sale.id}`)}
            />
          ))}

          {hasMore && !loading && sales.length > 0 && (
            <TouchableOpacity
              style={[
                styles.loadMore,
                {
                  backgroundColor: c.surfaceRaised,
                  borderColor: c.borderSubtle,
                },
              ]}
              onPress={loadMore}
            >
              <Text
                style={[
                  styles.loadMoreText,
                  { color: c.textSecondary, fontFamily: t.bodyMed.fontFamily },
                ]}
              >
                Load more
              </Text>
            </TouchableOpacity>
          )}

          {loading && sales.length > 0 && (
            <View style={styles.centered}>
              <ActivityIndicator size="small" color={c.brandInteractive} />
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Review Panel Modal ── */}
      <Modal
        visible={showReviewPanel}
        animationType="slide"
        transparent
        onRequestClose={() => setShowReviewPanel(false)}
      >
        <View style={[styles.modalOverlay]}>
          <View
            style={[styles.reviewPanel, { backgroundColor: c.surfaceRaised }]}
          >
            {/* Panel header */}
            <View
              style={[
                styles.reviewPanelHeader,
                { borderBottomColor: c.borderSubtle },
              ]}
            >
              <View>
                <Text
                  style={[
                    styles.reviewPanelTitle,
                    { color: c.textPrimary, fontFamily: t.h2.fontFamily },
                  ]}
                >
                  Sales Needing Review
                </Text>
                <Text
                  style={[
                    styles.reviewPanelSub,
                    { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
                  ]}
                >
                  {reviewCount} sale{reviewCount !== 1 ? "s" : ""} with stock
                  discrepancies
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowReviewPanel(false)}>
                <Feather name="x" size={20} color={c.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Explainer */}
            <View
              style={[
                styles.reviewExplainer,
                { backgroundColor: c.surface, borderColor: c.borderSubtle },
              ]}
            >
              <Text
                style={[
                  styles.reviewExplainerText,
                  { color: c.textSecondary, fontFamily: t.bodySm.fontFamily },
                ]}
              >
                These sales were recorded offline and synced successfully, but
                inventory was insufficient at sync time. Stock needs manual
                reconciliation.
              </Text>
            </View>

            {/* Dismiss all */}
            {reviewCount > 1 && (
              <TouchableOpacity
                style={[styles.dismissAll, { borderColor: c.borderDefault }]}
                onPress={dismissAllReviews}
              >
                <Text
                  style={[
                    styles.dismissAllText,
                    { color: c.negative, fontFamily: t.bodyMed.fontFamily },
                  ]}
                >
                  Mark all as reviewed
                </Text>
              </TouchableOpacity>
            )}

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
            >
              {reviewSales.map((sale) => (
                <View
                  key={sale.id}
                  style={[
                    styles.reviewItem,
                    { backgroundColor: c.surface, borderColor: c.signalDim },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginBottom: sp.xs,
                    }}
                  >
                    <Text
                      style={[
                        styles.reviewReceipt,
                        { color: c.textPrimary, fontFamily: t.mono.fontFamily },
                      ]}
                    >
                      {sale.receipt_number}
                    </Text>
                    <Text
                      style={[
                        styles.reviewDate,
                        { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
                      ]}
                    >
                      {new Date(sale.created_at).toLocaleDateString("en-NG", {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.reviewReason,
                      {
                        color: c.textSecondary,
                        fontFamily: t.bodySm.fontFamily,
                      },
                    ]}
                    numberOfLines={3}
                  >
                    {sale.review_reason}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: sp.sm,
                      marginTop: sp.md,
                    }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.reviewAction,
                        {
                          backgroundColor: c.surfaceRaised,
                          borderColor: c.borderSubtle,
                        },
                      ]}
                      onPress={() => {
                        setShowReviewPanel(false);
                        router.push(`/sales/${sale.id}`);
                      }}
                    >
                      <Feather name="eye" size={13} color={c.textSecondary} />
                      <Text
                        style={[
                          styles.reviewActionText,
                          {
                            color: c.textSecondary,
                            fontFamily: t.bodySm.fontFamily,
                          },
                        ]}
                      >
                        View
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.reviewAction,
                        {
                          backgroundColor: c.surfaceRaised,
                          borderColor: c.borderSubtle,
                        },
                      ]}
                      onPress={() => {
                        setShowReviewPanel(false);
                        router.push({
                          pathname: "/inventory/adjust",
                          params: {
                            productId: sale.sale_items[0]?.product_id,
                            locationId: sale.location_id,
                          },
                        });
                      }}
                    >
                      <Feather
                        name="package"
                        size={13}
                        color={c.textSecondary}
                      />
                      <Text
                        style={[
                          styles.reviewActionText,
                          {
                            color: c.textSecondary,
                            fontFamily: t.bodySm.fontFamily,
                          },
                        ]}
                      >
                        Adjust Stock
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.reviewAction,
                        {
                          backgroundColor: c.positiveSoft,
                          borderColor: c.positive + "44",
                          flex: 1.5,
                        },
                      ]}
                      onPress={() =>
                        Alert.alert(
                          "Mark as Reviewed",
                          `Clear the review flag for ${sale.receipt_number}?`,
                          [
                            { text: "Not Yet", style: "cancel" },
                            {
                              text: "Yes, Mark Reviewed",
                              onPress: () => dismissReview(sale.id),
                            },
                          ],
                        )
                      }
                    >
                      <Feather name="check" size={13} color={c.positive} />
                      <Text
                        style={[
                          styles.reviewActionText,
                          {
                            color: c.positive,
                            fontFamily: t.bodyMed.fontFamily,
                          },
                        ]}
                      >
                        Reviewed
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 26, letterSpacing: 0.01 * 26, lineHeight: 32 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  newBtnText: { fontSize: 14 },
  reviewBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  reviewBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewBannerTitle: { fontSize: 14 },
  reviewBannerSub: { fontSize: 12, marginTop: 2 },
  locationNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  locationNoticeText: { fontSize: 13, flex: 1 },
  centered: { padding: 40, alignItems: "center" },
  empty: { paddingVertical: 60, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 18, marginTop: 8 },
  emptySub: { fontSize: 13, letterSpacing: 0.1, textAlign: "center" },
  loadMore: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    marginVertical: 8,
  },
  loadMoreText: { fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  reviewPanel: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: "85%",
  },
  reviewPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
  },
  reviewPanelTitle: { fontSize: 20, lineHeight: 26 },
  reviewPanelSub: { fontSize: 12, letterSpacing: 0.1, marginTop: 3 },
  reviewExplainer: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  reviewExplainerText: { fontSize: 13, lineHeight: 19 },
  dismissAll: {
    alignSelf: "flex-end",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  dismissAllText: { fontSize: 13 },
  reviewItem: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  reviewReceipt: { fontSize: 14, letterSpacing: 0.1 },
  reviewDate: { fontSize: 12 },
  reviewReason: { fontSize: 13, lineHeight: 18 },
  reviewAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  reviewActionText: { fontSize: 13 },
});
