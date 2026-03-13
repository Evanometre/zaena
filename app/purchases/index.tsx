// ============================================
// FILE: app/purchases/index.tsx
// ============================================
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

type PaymentStatus = "unpaid" | "partial" | "paid";
type FilterTab = "all" | PaymentStatus;

interface Purchase {
  id: string;
  total_cost: number;
  total_items: number;
  total_units: number;
  acquisition_costs: number;
  notes: string;
  created_at: string;
  payment_status: PaymentStatus;
  amount_paid: number;
  suppliers: {
    name: string;
  } | null;
  locations: {
    name: string;
  };
}

const STATUS_CONFIG: Record<
  PaymentStatus,
  { label: string; color: string; bg: string }
> = {
  unpaid: { label: "Unpaid", color: "#DC2626", bg: "#FEE2E2" },
  partial: { label: "Partial", color: "#D97706", bg: "#FEF3C7" },
  paid: { label: "Paid", color: "#16A34A", bg: "#DCFCE7" },
};

export default function PurchasesScreen() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  useFocusEffect(
    useCallback(() => {
      fetchPurchases();
    }, []),
  );

  useEffect(() => {
    async function loadOrgCurrency() {
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
      } catch (err) {
        console.error("Failed to load org currency:", err);
      }
    }

    loadOrgCurrency();
  }, [organizationId]);

  async function fetchPurchases() {
    if (!organizationId) return;
    setLoading(true);
    try {
      // ── Show cache immediately ──────────────────────────
      const cacheKey = `purchases_${organizationId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setPurchases(JSON.parse(cached));
        setLoading(false);
      }

      // ── Fetch fresh ─────────────────────────────────────
      const { data, error } = await supabase
        .from("purchases")
        .select("*, suppliers (name), locations (name)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPurchases(data || []);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data || []));
    } catch (err: any) {
      console.error("Error fetching purchases:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchPurchases();
  }

  const filteredPurchases = purchases.filter((purchase) => {
    const supplierName = purchase.suppliers?.name || "No Supplier";
    const matchesSearch = supplierName
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesFilter =
      activeFilter === "all" || purchase.payment_status === activeFilter;
    return matchesSearch && matchesFilter;
  });

  const totalSpent = purchases.reduce((sum, p) => sum + p.total_cost, 0);
  const totalItems = purchases.reduce((sum, p) => sum + p.total_items, 0);
  const totalUnpaidBalance = purchases
    .filter((p) => p.payment_status !== "paid")
    .reduce((sum, p) => sum + (p.total_cost - p.amount_paid), 0);

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unpaid", label: "Unpaid" },
    { key: "partial", label: "Partial" },
    { key: "paid", label: "Paid" },
  ];

  if (permLoading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!hasPermission("purchases.read")) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Purchase History</Text>
          {hasPermission("purchases.create") && (
            <TouchableOpacity
              onPress={() => router.push("/purchases/new" as any)}
            >
              <Text style={styles.newButton}>+ New</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Purchase History</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔐</Text>
          <Text style={styles.emptyText}>Access Restricted</Text>
          <Text style={styles.emptySubtext}>
            You do not have permission to view purchases.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Purchases</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{purchases.length}</Text>
          <Text style={styles.statLabel}>Purchases</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalItems}</Text>
          <Text style={styles.statLabel}>Items</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { fontSize: 16 }]}>
            {currency.symbol}
            {totalSpent.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Total Spent</Text>
        </View>
        <View style={[styles.statCard, styles.statCardWarning]}>
          <Text style={[styles.statNumber, { fontSize: 14, color: "#D97706" }]}>
            {currency.symbol}
            {totalUnpaidBalance.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Owed</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by supplier..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {filterTabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.filterTab,
              activeFilter === tab.key && styles.filterTabActive,
            ]}
            onPress={() => setActiveFilter(tab.key)}
          >
            <Text
              style={[
                styles.filterTabText,
                activeFilter === tab.key && styles.filterTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing && (
          <ActivityIndicator size="large" color={COLORS.primary} />
        )}

        {filteredPurchases.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No purchases found</Text>
            <Text style={styles.emptySubtext}>
              {activeFilter === "all"
                ? "Add inventory to start tracking purchases"
                : `No ${activeFilter} purchases`}
            </Text>
          </View>
        )}

        {filteredPurchases.map((purchase) => {
          const statusConfig = STATUS_CONFIG[purchase.payment_status];
          const balance = purchase.total_cost - purchase.amount_paid;

          return (
            <TouchableOpacity
              key={purchase.id}
              style={styles.purchaseCard}
              onPress={() => router.push(`/purchases/${purchase.id}` as any)}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.supplierName}>
                    {purchase.suppliers?.name || "🏢 No Supplier"}
                  </Text>
                  <Text style={styles.location}>
                    📍 {purchase.locations.name}
                  </Text>
                </View>
                <View style={styles.cardHeaderRight}>
                  <View style={styles.costBadge}>
                    <Text style={styles.costText}>
                      {currency.symbol}
                      {purchase.total_cost.toLocaleString()}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: statusConfig.bg },
                    ]}
                  >
                    <Text
                      style={[styles.statusText, { color: statusConfig.color }]}
                    >
                      {statusConfig.label}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Items:</Text>
                  <Text style={styles.infoValue}>
                    {purchase.total_items} ({purchase.total_units} units)
                  </Text>
                </View>

                {purchase.payment_status !== "paid" && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Balance Due:</Text>
                    <Text style={[styles.infoValue, { color: "#DC2626" }]}>
                      {currency.symbol}
                      {balance.toLocaleString()}
                    </Text>
                  </View>
                )}

                {purchase.payment_status === "partial" && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Amount Paid:</Text>
                    <Text style={[styles.infoValue, { color: "#16A34A" }]}>
                      {currency.symbol}
                      {purchase.amount_paid.toLocaleString()}
                    </Text>
                  </View>
                )}

                {purchase.acquisition_costs > 0 && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Acquisition Costs:</Text>
                    <Text style={styles.infoValue}>
                      {currency.symbol}
                      {purchase.acquisition_costs.toFixed(2)}
                    </Text>
                  </View>
                )}
                {purchase.notes && (
                  <View style={styles.notesRow}>
                    <Text style={styles.notesText} numberOfLines={2}>
                      📝 {purchase.notes}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.dateText}>
                  {new Date(purchase.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
                <Text style={styles.viewButton}>View Details →</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between", // ← was flex-start with gap
    padding: 16,
    paddingTop: 48,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: 24, fontWeight: "bold", color: COLORS.primary },
  statsRow: {
    flexDirection: "row",
    padding: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 10,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statCardWarning: {
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
  },
  newButton: { fontSize: 16, fontWeight: "600", color: COLORS.accent },
  statNumber: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  statLabel: { fontSize: 10, color: COLORS.secondary, marginTop: 2 },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  filterTabTextActive: {
    color: COLORS.white,
  },
  list: { flex: 1, paddingHorizontal: 16 },
  purchaseCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardHeaderRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  supplierName: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  location: { fontSize: 13, color: COLORS.secondary, marginTop: 4 },
  costBadge: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  costText: { fontSize: 14, fontWeight: "bold", color: COLORS.white },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardBody: { marginBottom: 12 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  infoLabel: { fontSize: 14, color: COLORS.secondary },
  infoValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  notesRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  notesText: { fontSize: 13, color: COLORS.secondary, fontStyle: "italic" },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dateText: { fontSize: 12, color: COLORS.secondary },
  viewButton: { fontSize: 14, fontWeight: "600", color: COLORS.accent },
  emptyState: { padding: 48, alignItems: "center" },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
  },
  backButton: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: "600",
    marginRight: 12,
  },
});
