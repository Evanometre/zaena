import { useAuthStore } from "@/stores/authStore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { usePermissions } from "../../context/PermissionsContext";
import { supabase } from "../../lib/supabase";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type AuditEvent = {
  id: string;
  event_time: string;
  category: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  amount: string | null;
  description: string;
  reason: string | null;
  location_id: string | null;
  record_id: string;
  source_table: string;
  metadata: Record<string, any>;
  organization_id: string;
};

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const PAGE_SIZE = 30;

const CATEGORIES = [
  "All",
  "Sales",
  "Sales Orders",
  "Manufacturing",
  "Inventory",
  "Purchases",
  "Expenses",
  "Payments",
  "Drawings",
  "Payroll",
  "Financials",
  "Voids",
  "Tax",
  "Security",
];

const CATEGORY_CONFIG: Record<
  string,
  { color: string; bg: string; icon: string }
> = {
  Sales: { color: "#10B981", bg: "#D1FAE5", icon: "🛒" },
  "Sales Orders": { color: "#0891B2", bg: "#CFFAFE", icon: "📋" },
  Manufacturing: { color: "#D97706", bg: "#FEF3C7", icon: "🏭" },
  Inventory: { color: "#F59E0B", bg: "#FEF3C7", icon: "📦" },
  Purchases: { color: "#6366F1", bg: "#EDE9FE", icon: "🛍️" },
  Expenses: { color: "#EF4444", bg: "#FEE2E2", icon: "💸" },
  Payments: { color: "#3B82F6", bg: "#DBEAFE", icon: "💳" },
  Drawings: { color: "#EC4899", bg: "#FCE7F3", icon: "🏦" },
  Payroll: { color: "#8B5CF6", bg: "#EDE9FE", icon: "👥" },
  Financials: { color: "#0EA5E9", bg: "#E0F2FE", icon: "📊" },
  Voids: { color: "#DC2626", bg: "#FEE2E2", icon: "🚫" },
  Tax: { color: "#064E3B", bg: "#D1FAE5", icon: "🧾" },
  Security: { color: "#7C3AED", bg: "#EDE9FE", icon: "🔐" },
  Default: { color: "#6B7280", bg: "#F3F4F6", icon: "📋" },
};

const ACTION_SENTIMENT: Record<string, "positive" | "negative" | "neutral"> = {
  // Sales
  "Sale Created": "positive",
  "Sale Created (Backdated)": "neutral",
  "Sale Voided": "negative",
  // Inventory
  "Stock Added": "positive",
  "Stock Removed": "negative",
  "Stock Adjusted": "neutral",
  // Drawings
  "Owner Withdrawal": "negative",
  // Purchases
  "Purchase Recorded": "neutral",
  "Purchase Recorded (Backdated)": "neutral",
  // Sales Orders
  "Order Created": "positive",
  "Order Confirmed": "positive",
  "Order Cancelled": "negative",
  "Delivery Dispatched": "positive",
  "Delivery Completed": "positive",
  "Invoice Created": "neutral",
  "Invoice Sent": "positive",
  "Invoice Payment Recorded": "positive",
  // Manufacturing
  "Production Order Created": "neutral",
  "Production Started": "positive",
  "Production Completed": "positive",
  "Production Closed": "neutral",
  "BOM Created": "neutral",
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFullTime(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAmount(amount: string | null): string | null {
  if (!amount) return null;
  const num = parseFloat(amount);
  if (isNaN(num)) return null;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.Default;
}

function getSentimentColor(action: string, category: string): string {
  const sentiment = ACTION_SENTIMENT[action];
  if (sentiment === "positive") return "#10B981";
  if (sentiment === "negative") return "#EF4444";
  if (category === "Voids") return "#EF4444";
  return "#6B7280";
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

function CategoryPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const cfg =
    label === "All"
      ? { color: "#111827", bg: "#F9FAFB" }
      : getCategoryConfig(label);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pill,
        active && { backgroundColor: cfg.color, borderColor: cfg.color },
        !active && { backgroundColor: "#F9FAFB", borderColor: "#E5E7EB" },
      ]}
      activeOpacity={0.7}
    >
      {label !== "All" && (
        <Text style={styles.pillIcon}>{getCategoryConfig(label).icon}</Text>
      )}
      <Text
        style={[
          styles.pillText,
          active && { color: "#fff" },
          !active && { color: "#374151" },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function DetailModal({
  event,
  visible,
  onClose,
}: {
  event: AuditEvent | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!event) return null;
  const cfg = getCategoryConfig(event.category);
  const formattedAmount = formatAmount(event.amount);

  const renderMetadata = () => {
    const skip = new Set(["receipt_number", "payment_status"]);
    return Object.entries(event.metadata || {})
      .filter(([k, v]) => v !== null && v !== undefined && !skip.has(k))
      .map(([k, v]) => {
        const label = k
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        let display =
          typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
        if (typeof v === "boolean") display = v ? "Yes" : "No";
        if (
          k.includes("amount") ||
          k.includes("cost") ||
          k.includes("salary") ||
          k.includes("gross") ||
          k.includes("net") ||
          k.includes("total") ||
          k.includes("outstanding")
        ) {
          const n = parseFloat(display);
          if (!isNaN(n)) display = formatAmount(display) ?? display;
        }
        return <MetadataRow key={k} label={label} value={display} />;
      });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          {/* Handle */}
          <View style={styles.modalHandle} />

          {/* Header */}
          <View style={[styles.modalHeader, { borderLeftColor: cfg.color }]}>
            <View
              style={[styles.modalCategoryBadge, { backgroundColor: cfg.bg }]}
            >
              <Text style={styles.modalCategoryIcon}>{cfg.icon}</Text>
              <Text style={[styles.modalCategoryText, { color: cfg.color }]}>
                {event.category}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            showsVerticalScrollIndicator={false}
          >
            {/* Action + amount */}
            <Text style={styles.modalAction}>{event.action}</Text>
            {formattedAmount && (
              <Text
                style={[
                  styles.modalAmount,
                  { color: getSentimentColor(event.action, event.category) },
                ]}
              >
                {formattedAmount}
              </Text>
            )}

            {/* Description */}
            <Text style={styles.modalDescription}>{event.description}</Text>

            {/* Reason */}
            {event.reason && (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>REASON</Text>
                <Text style={styles.reasonText}>{event.reason}</Text>
              </View>
            )}

            {/* Core fields */}
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>EVENT DETAILS</Text>
              <MetadataRow
                label="Time"
                value={formatFullTime(event.event_time)}
              />
              {event.actor_name && (
                <MetadataRow label="Actor" value={event.actor_name} />
              )}
              <MetadataRow
                label="Source"
                value={event.source_table.replace(/_/g, " ")}
              />
              <MetadataRow
                label="Record ID"
                value={event.record_id.slice(0, 8) + "..."}
              />
            </View>

            {/* Metadata */}
            {Object.keys(event.metadata || {}).length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>ADDITIONAL INFO</Text>
                {renderMetadata()}
              </View>
            )}

            {/* Old/New data for audit_trails */}
            {event.source_table === "audit_trails" &&
              event.metadata?.old_data && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>CHANGES</Text>
                  {Object.entries(event.metadata.new_data || {}).map(
                    ([k, newVal]) => {
                      const oldVal = event.metadata.old_data?.[k];
                      if (JSON.stringify(oldVal) === JSON.stringify(newVal))
                        return null;
                      return (
                        <View key={k} style={styles.diffRow}>
                          <Text style={styles.diffKey}>
                            {k.replace(/_/g, " ")}
                          </Text>
                          <Text style={styles.diffOld}>
                            {String(oldVal ?? "—")}
                          </Text>
                          <Text style={styles.diffArrow}>→</Text>
                          <Text style={styles.diffNew}>
                            {String(newVal ?? "—")}
                          </Text>
                        </View>
                      );
                    },
                  )}
                </View>
              )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AuditEventCard({
  event,
  onPress,
}: {
  event: AuditEvent;
  onPress: () => void;
}) {
  const cfg = getCategoryConfig(event.category);
  const formattedAmount = formatAmount(event.amount);
  const sentimentColor = getSentimentColor(event.action, event.category);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Left accent bar */}
      <View style={[styles.cardAccent, { backgroundColor: cfg.color }]} />

      <View style={styles.cardBody}>
        {/* Top row */}
        <View style={styles.cardTop}>
          <View style={[styles.cardIconWrap, { backgroundColor: cfg.bg }]}>
            <Text style={styles.cardIcon}>{cfg.icon}</Text>
          </View>
          <View style={styles.cardMeta}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardAction} numberOfLines={1}>
                {event.action}
              </Text>
              {formattedAmount && (
                <Text style={[styles.cardAmount, { color: sentimentColor }]}>
                  {formattedAmount}
                </Text>
              )}
            </View>
            <Text style={styles.cardDescription} numberOfLines={2}>
              {event.description}
            </Text>
          </View>
        </View>

        {/* Bottom row */}
        <View style={styles.cardBottom}>
          <View style={styles.cardActorRow}>
            {event.actor_name && (
              <View style={styles.cardActorBadge}>
                <Text style={styles.cardActorInitial}>
                  {event.actor_name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.cardActor} numberOfLines={1}>
              {event.actor_name ?? "System"}
            </Text>
          </View>
          <View style={styles.cardBottomRight}>
            {event.reason && (
              <View style={styles.reasonFlag}>
                <Text style={styles.reasonFlagText}>Has reason</Text>
              </View>
            )}
            <Text style={styles.cardTime}>{formatTime(event.event_time)}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function AuditTrailScreen() {
  const { organizationId } = useAuthStore();

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const { hasPermission, loading: permLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const [totalCount, setTotalCount] = useState<number | null>(null);

  // ── Fetch ──────────────────────────────────
  const fetchEvents = useCallback(
    async (pageNum: number, refresh = false) => {
      if (!organizationId) return;
      if (pageNum === 0) setLoading(true);
      else setLoadingMore(true);

      try {
        let query = supabase
          .from("unified_audit_feed")
          .select("*", { count: "exact" })
          .eq("organization_id", organizationId)
          .order("event_time", { ascending: false })
          .order("id", { ascending: false })
          .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

        if (selectedCategory !== "All") {
          query = query.eq("category", selectedCategory);
        }

        if (search.trim()) {
          query = query.or(
            `description.ilike.%${search}%,reason.ilike.%${search}%,actor_name.ilike.%${search}%,action.ilike.%${search}%`,
          );
        }

        const { data, error, count } = await query;
        if (error) throw error;

        const newEvents = (data as AuditEvent[]) ?? [];
        setEvents((prev) =>
          pageNum === 0 || refresh ? newEvents : [...prev, ...newEvents],
        );
        setHasMore(newEvents.length === PAGE_SIZE);
        if (count !== null) setTotalCount(count);
      } catch (err) {
        console.error("Audit feed error:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [organizationId, selectedCategory, search],
  );

  useEffect(() => {
    setPage(0);
    setHasMore(true);
    fetchEvents(0);
  }, [selectedCategory, search]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(0);
    setHasMore(true);
    fetchEvents(0, true);
  }, [fetchEvents]);

  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchEvents(nextPage);
    }
  }, [loadingMore, hasMore, loading, page, fetchEvents]);

  // Debounced search
  const handleSearchChange = (text: string) => {
    setSearchInput(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(text), 400);
  };

  const openEvent = (event: AuditEvent) => {
    setSelectedEvent(event);
    setModalVisible(true);
  };

  // ── Render ─────────────────────────────────
  const renderHeader = () => (
    <View>
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search events, actors, reasons..."
          placeholderTextColor="#9CA3AF"
          value={searchInput}
          onChangeText={handleSearchChange}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Category pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsRow}
      >
        {CATEGORIES.map((cat) => (
          <CategoryPill
            key={cat}
            label={cat}
            active={selectedCategory === cat}
            onPress={() => setSelectedCategory(cat)}
          />
        ))}
      </ScrollView>

      {/* Stats row */}
      {totalCount !== null && (
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>
            {totalCount.toLocaleString()} event{totalCount !== 1 ? "s" : ""}
            {selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}
            {search ? ` matching "${search}"` : ""}
          </Text>
        </View>
      )}
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#6366F1" />
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyIcon}>🔎</Text>
        <Text style={styles.emptyTitle}>No events found</Text>
        <Text style={styles.emptySubtitle}>
          {search
            ? `No results for "${search}"`
            : selectedCategory !== "All"
              ? `No ${selectedCategory} events yet`
              : "Your audit trail will appear here"}
        </Text>
      </View>
    );
  };

  if (permLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  if (!hasPermission("audit.read")) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyIcon}>🔐</Text>
        <Text style={styles.emptyTitle}>Access Restricted</Text>
        <Text style={styles.emptySubtitle}>
          You don&apos;t have permission to view the audit trail.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Audit Trail</Text>
          <Text style={styles.headerSubtitle}>
            Every action, every actor, every reason
          </Text>
        </View>
      </View>

      {/* Feed */}
      {loading && events.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Loading audit feed...</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) =>
            `${item.source_table}-${item.id}-${item.event_time}`
          }
          renderItem={({ item }) => (
            <AuditEventCard event={item} onPress={() => openEvent(item)} />
          )}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6366F1"
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Detail Modal */}
      <DetailModal
        event={selectedEvent}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },

  // Header
  header: {
    backgroundColor: "#FFFFFF",
    paddingTop:
      Platform.OS === "ios" ? 56 : (StatusBar.currentHeight ?? 0) + 12,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
    letterSpacing: 0.2,
  },

  // List
  listContent: {
    paddingBottom: 32,
  },

  // Search
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    height: 44,
  },

  // Pills
  pillsRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: "row",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  pillIcon: {
    fontSize: 12,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Stats
  statsRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  statsText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
  },

  // Card
  card: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardAccent: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  cardIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardIcon: {
    fontSize: 18,
  },
  cardMeta: {
    flex: 1,
    gap: 3,
  },
  cardTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardAction: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  cardAmount: {
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 0,
  },
  cardDescription: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardActorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  cardActorBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  cardActorInitial: {
    fontSize: 10,
    fontWeight: "700",
    color: "#374151",
  },
  cardActor: {
    fontSize: 12,
    color: "#9CA3AF",
    flex: 1,
  },
  cardBottomRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reasonFlag: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  reasonFlagText: {
    fontSize: 10,
    color: "#92400E",
    fontWeight: "500",
  },
  cardTime: {
    fontSize: 12,
    color: "#9CA3AF",
  },

  // Loading / Empty
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#374151",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderLeftWidth: 4,
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
  },
  modalCategoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modalCategoryIcon: {
    fontSize: 14,
  },
  modalCategoryText: {
    fontSize: 13,
    fontWeight: "600",
  },
  modalClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  modalBody: {
    paddingHorizontal: 20,
  },
  modalAction: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.4,
    marginTop: 8,
  },
  modalAmount: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 4,
    marginBottom: 4,
  },
  modalDescription: {
    fontSize: 15,
    color: "#6B7280",
    lineHeight: 22,
    marginTop: 6,
    marginBottom: 16,
  },
  reasonBox: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    gap: 4,
  },
  reasonLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#92400E",
    letterSpacing: 1,
  },
  reasonText: {
    fontSize: 14,
    color: "#78350F",
    lineHeight: 20,
  },
  detailSection: {
    marginBottom: 20,
    gap: 2,
  },
  detailSectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
    gap: 12,
  },
  metaLabel: {
    fontSize: 13,
    color: "#9CA3AF",
    flex: 1,
  },
  metaValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
    flex: 2,
    textAlign: "right",
  },

  // Diff view for audit_trails
  diffRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  diffKey: {
    fontSize: 12,
    color: "#6B7280",
    flex: 2,
    textTransform: "capitalize",
  },
  diffOld: {
    fontSize: 12,
    color: "#EF4444",
    flex: 2,
    textDecorationLine: "line-through",
  },
  diffArrow: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  diffNew: {
    fontSize: 12,
    color: "#10B981",
    fontWeight: "600",
    flex: 2,
  },
});
