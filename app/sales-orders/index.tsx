// FILE: app/sales-orders/index.tsx
import { getOrganization } from "@/onboarding/services/organizationService";
import {
    ALL_CURRENCIES,
    getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalesOrder {
  id: string;
  order_number: string;
  status: SalesOrderStatus;
  total_amount: number;
  order_date: string;
  expected_delivery_date: string | null;
  requires_production: boolean;
  customer: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
}

type SalesOrderStatus =
  | "draft"
  | "confirmed"
  | "in_fulfillment"
  | "fulfilled"
  | "invoiced"
  | "closed"
  | "cancelled";

type FilterChip = "all" | SalesOrderStatus;

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTER_CHIPS: { key: FilterChip; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "confirmed", label: "Confirmed" },
  { key: "in_fulfillment", label: "In Fulfillment" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "invoiced", label: "Invoiced" },
  { key: "closed", label: "Closed" },
  { key: "cancelled", label: "Cancelled" },
];

// Status badge colours — background / text
const STATUS_STYLE: Record<SalesOrderStatus, { bg: string; text: string }> = {
  draft: { bg: "#e2e8f0", text: "#475569" },
  confirmed: { bg: "#dbeafe", text: "#1d4ed8" },
  in_fulfillment: { bg: "#fef9c3", text: "#92400e" },
  fulfilled: { bg: "#dcfce7", text: "#15803d" },
  invoiced: { bg: "#ede9fe", text: "#6d28d9" },
  closed: { bg: "#d4edda", text: "#155724" },
  cancelled: { bg: "#fee2e2", text: "#991b1b" },
};

const STATUS_LABEL: Record<SalesOrderStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  in_fulfillment: "In Fulfillment",
  fulfilled: "Fulfilled",
  invoiced: "Invoiced",
  closed: "Closed",
  cancelled: "Cancelled",
};

// Statuses that count toward the "active" summary bar
const ACTIVE_STATUSES: SalesOrderStatus[] = [
  "confirmed",
  "in_fulfillment",
  "fulfilled",
  "invoiced",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SalesOrdersScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterChip>("all");

  // ── Currency ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadCurrency() {
      if (!organizationId) return;
      try {
        const org = await getOrganization(organizationId);
        if (org.currency) {
          const match = ALL_CURRENCIES.find((c) => c.code === org.currency);
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
    loadCurrency();
  }, [organizationId]);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [organizationId]),
  );

  async function fetchOrders() {
    if (!organizationId) return;
    try {
      setLoading(true);

      // Show cache immediately
      const cacheKey = `sales_orders_${organizationId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setOrders(JSON.parse(cached));
        setLoading(false);
      }

      const { data, error } = await supabase
        .from("sales_orders")
        .select(
          `
          id,
          order_number,
          status,
          total_amount,
          order_date,
          expected_delivery_date,
          requires_production,
          customer:customers (
            id,
            name,
            phone
          )
        `,
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const freshOrders: SalesOrder[] = (data ?? []).map((row: any) => ({
        ...row,
        customer: Array.isArray(row.customer)
          ? (row.customer[0] ?? null)
          : row.customer,
      }));

      setOrders(freshOrders);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(freshOrders));
    } catch (err) {
      console.error("Error fetching sales orders:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchOrders();
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const visibleOrders = orders.filter((o) => {
    // Hide cancelled by default unless that filter is explicitly selected
    if (o.status === "cancelled" && activeFilter !== "cancelled") return false;
    if (activeFilter !== "all" && o.status !== activeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        o.order_number.toLowerCase().includes(q) ||
        (o.customer?.name ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Summary bar: count + total value of active (non-draft, non-closed, non-cancelled) orders
  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const activeCount = activeOrders.length;
  const activeValue = activeOrders.reduce((sum, o) => sum + o.total_amount, 0);

  // Draft count badge
  const draftCount = orders.filter((o) => o.status === "draft").length;

  function fmt(amount: number) {
    return (
      currency.symbol +
      amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (loading && orders.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!permissionsLoading && !hasPermission("sales_orders.read")) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center", padding: 32 },
        ]}
      >
        <Text style={styles.permissionText}>
          You do not have permission to view sales orders.
        </Text>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>{"<"} Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sales Orders</Text>
        {hasPermission("sales_orders.create") ? (
          <TouchableOpacity
            onPress={() => router.push("/sales-orders/add" as any)}
          >
            <Text style={styles.addButton}>+ New</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{activeCount}</Text>
          <Text style={styles.summaryLabel}>Active Orders</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{fmt(activeValue)}</Text>
          <Text style={styles.summaryLabel}>Outstanding Value</Text>
        </View>
        {draftCount > 0 && (
          <>
            <View style={styles.summaryDivider} />
            <TouchableOpacity
              style={styles.summaryItem}
              onPress={() => setActiveFilter("draft")}
            >
              <View style={styles.draftBadgeRow}>
                <Text style={styles.summaryValue}>{draftCount}</Text>
                <View style={styles.draftDot} />
              </View>
              <Text style={styles.summaryLabel}>Drafts</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by order number or customer…"
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9CA3AF"
        />
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {FILTER_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.key}
            style={[
              styles.chip,
              activeFilter === chip.key && styles.chipActive,
            ]}
            onPress={() => setActiveFilter(chip.key)}
          >
            <Text
              style={[
                styles.chipText,
                activeFilter === chip.key && styles.chipTextActive,
              ]}
            >
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {visibleOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>
              {searchQuery
                ? "No orders match your search"
                : activeFilter === "all"
                  ? "No sales orders yet"
                  : `No ${STATUS_LABEL[activeFilter as SalesOrderStatus] ?? activeFilter} orders`}
            </Text>
            <Text style={styles.emptyText}>
              {!searchQuery &&
              activeFilter === "all" &&
              hasPermission("sales_orders.create")
                ? "Create your first sales order to get started"
                : "Try a different filter or search term"}
            </Text>
            {!searchQuery &&
              activeFilter === "all" &&
              hasPermission("sales_orders.create") && (
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => router.push("/sales-orders/add" as any)}
                >
                  <Text style={styles.emptyButtonText}>New Sales Order</Text>
                </TouchableOpacity>
              )}
          </View>
        ) : (
          visibleOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              fmt={fmt}
              onPress={() =>
                router.push({
                  pathname: "/sales-orders/[id]" as any,
                  params: { id: order.id },
                })
              }
            />
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({
  order,
  fmt,
  onPress,
}: {
  order: SalesOrder;
  fmt: (n: number) => string;
  onPress: () => void;
}) {
  const statusStyle = STATUS_STYLE[order.status] ?? {
    bg: "#eee",
    text: "#333",
  };
  const isOverdue =
    order.expected_delivery_date &&
    new Date(order.expected_delivery_date) < new Date() &&
    !["closed", "cancelled", "fulfilled"].includes(order.status);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Top row: order number + status badge */}
      <View style={styles.cardTopRow}>
        <View style={styles.cardLeft}>
          <Text style={styles.orderNumber}>{order.order_number}</Text>
          {order.requires_production && (
            <View style={styles.mtoBadge}>
              <Text style={styles.mtoBadgeText}>MTO</Text>
            </View>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {STATUS_LABEL[order.status]}
          </Text>
        </View>
      </View>

      {/* Customer name */}
      {order.customer && (
        <Text style={styles.customerName} numberOfLines={1}>
          {order.customer.name}
        </Text>
      )}

      {/* Bottom row: amount + dates */}
      <View style={styles.cardBottomRow}>
        <Text style={styles.amount}>{fmt(order.total_amount)}</Text>
        <View style={styles.dateGroup}>
          <Text style={styles.dateText}>
            {new Date(order.order_date).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </Text>
          {order.expected_delivery_date && (
            <Text
              style={[
                styles.deliveryDate,
                isOverdue && styles.deliveryDateOverdue,
              ]}
            >
              {isOverdue ? "⚠ " : ""}
              Due{" "}
              {new Date(order.expected_delivery_date).toLocaleDateString(
                "en-NG",
                {
                  day: "numeric",
                  month: "short",
                },
              )}
            </Text>
          )}
        </View>
      </View>

      {/* Chevron */}
      <View style={styles.chevronContainer}>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 48,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { fontSize: 16, color: COLORS.primary, minWidth: 48 },
  title: { fontSize: 22, fontWeight: "700", color: COLORS.primary },
  addButton: {
    fontSize: 16,
    color: COLORS.accent,
    fontWeight: "600",
    minWidth: 48,
    textAlign: "right",
  },
  permissionText: {
    fontSize: 15,
    color: COLORS.secondary,
    textAlign: "center",
  },

  // Summary bar
  summaryBar: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "space-around",
  },
  summaryItem: { alignItems: "center", flex: 1 },
  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.white,
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.3,
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  draftBadgeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  draftDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#fbbf24",
    marginBottom: 2,
  },

  // Search
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.primary,
  },

  // Chips
  chipsScroll: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    maxHeight: 48,
  },
  chipsContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: { fontSize: 13, fontWeight: "500", color: COLORS.secondary },
  chipTextActive: { color: COLORS.white, fontWeight: "600" },

  // List
  list: { flex: 1 },
  listContent: { padding: 16, gap: 12 },

  // Empty
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: { color: COLORS.white, fontSize: 15, fontWeight: "600" },

  // Card
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  orderNumber: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primary,
    letterSpacing: 0.2,
  },
  mtoBadge: {
    backgroundColor: "#0E2931",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mtoBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#C9922A",
    letterSpacing: 0.5,
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  customerName: {
    fontSize: 14,
    color: COLORS.secondary,
    marginBottom: 10,
    marginTop: 2,
  },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  amount: { fontSize: 17, fontWeight: "700", color: COLORS.primary },
  dateGroup: { alignItems: "flex-end" },
  dateText: { fontSize: 12, color: COLORS.secondary },
  deliveryDate: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  deliveryDateOverdue: { color: "#dc2626", fontWeight: "600" },
  chevronContainer: { position: "absolute", right: 14, top: 14 },
  chevron: { fontSize: 22, color: COLORS.secondary },
});
