// FILE: app/refunds/index.tsx (NEW - Refunds List)
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
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

interface Refund {
  id: string;
  original_sale_id: string;
  refund_amount: number;
  refund_type: "full" | "partial";
  reason: string | null;
  payment_method: "cash" | "bank" | "pos" | "mobile";
  created_at: string;
  location: {
    name: string;
  };
  processed_by_user: {
    full_name: string;
  } | null;
  original_sale: {
    receipt_number: string;
    total_amount: number;
  };
}

export default function RefundsListScreen() {
  const router = useRouter();
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  useFocusEffect(
    useCallback(() => {
      fetchRefunds();
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

  async function fetchRefunds() {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("refunds")
        .select(
          `
        *,
        location:locations!location_id (name),
        processed_by_user:user_profiles!processed_by (full_name),
        original_sale:sales!original_sale_id (receipt_number, total_amount)
      `,
        )
        .eq("organization_id", organizationId) // ← was missing
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRefunds(data || []);
    } catch (err: any) {
      console.error("Error fetching refunds:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchRefunds();
  }

  const filteredRefunds = refunds.filter((refund) => {
    const searchLower = searchQuery.toLowerCase();
    const receiptNumber = refund.original_sale?.receipt_number || "";
    const reason = refund.reason || "";

    return (
      receiptNumber.toLowerCase().includes(searchLower) ||
      reason.toLowerCase().includes(searchLower)
    );
  });

  const totalRefunded = refunds.reduce((sum, r) => sum + r.refund_amount, 0);
  const fullRefunds = refunds.filter((r) => r.refund_type === "full").length;
  const partialRefunds = refunds.filter(
    (r) => r.refund_type === "partial",
  ).length;

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

  if (!hasPermission("refunds.read")) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Refunds</Text>
          <View style={{ width: 80 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔐</Text>
          <Text style={styles.emptyText}>Access Restricted</Text>
          <Text style={styles.emptySubtext}>
            You don&apos;t have permission to view refunds.
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
        <Text style={styles.title}>Refunds</Text>
        {hasPermission("refunds.create") ? (
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => router.push("/refunds/new")}
          >
            <Text style={styles.newButtonText}>+ New</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{refunds.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{fullRefunds}</Text>
          <Text style={styles.statLabel}>Full</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{partialRefunds}</Text>
          <Text style={styles.statLabel}>Partial</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { fontSize: 14 }]}>
            {currency.symbol}
            {totalRefunded.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Refunded</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by receipt or reason..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* List */}
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing && (
          <ActivityIndicator size="large" color={COLORS.primary} />
        )}

        {filteredRefunds.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>↩️</Text>
            <Text style={styles.emptyText}>No refunds yet</Text>
            <Text style={styles.emptySubtext}>
              Process refunds for returned items
            </Text>
          </View>
        )}

        {filteredRefunds.map((refund) => (
          <TouchableOpacity
            key={refund.id}
            style={styles.refundCard}
            onPress={() => router.push(`/refunds/${refund.id}` as any)}
          >
            {/* Header */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.receiptNumber}>
                  {refund.original_sale?.receipt_number || "Unknown Sale"}
                </Text>
                <View style={styles.typeRow}>
                  <View
                    style={[
                      styles.typeBadge,
                      refund.refund_type === "full"
                        ? styles.typeFull
                        : styles.typePartial,
                    ]}
                  >
                    <Text style={styles.typeText}>
                      {refund.refund_type === "full" ? "FULL" : "PARTIAL"}
                    </Text>
                  </View>
                  <Text style={styles.paymentMethod}>
                    💳 {refund.payment_method.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.amountBadge}>
                <Text style={styles.amountText}>
                  {currency.symbol}
                  {refund.refund_amount.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Body */}
            <View style={styles.cardBody}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Original Sale:</Text>
                <Text style={styles.infoValue}>
                  {currency.symbol}
                  {refund.original_sale?.total_amount.toFixed(2) || "0.00"}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Location:</Text>
                <Text style={styles.infoValue}>
                  📍 {refund.location?.name || "N/A"}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Processed By:</Text>
                <Text style={styles.infoValue}>
                  {refund.processed_by_user?.full_name || "Unknown"}
                </Text>
              </View>

              {refund.reason && (
                <View style={styles.reasonRow}>
                  <Text style={styles.reasonLabel}>Reason:</Text>
                  <Text style={styles.reasonText} numberOfLines={2}>
                    {refund.reason}
                  </Text>
                </View>
              )}
            </View>

            {/* Footer */}
            <View style={styles.cardFooter}>
              <Text style={styles.dateText}>
                {new Date(refund.created_at).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </Text>
              <Text style={styles.viewButton}>View Details →</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
  title: { fontSize: 24, fontWeight: "bold", color: COLORS.primary },
  newButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newButtonText: { color: COLORS.white, fontSize: 14, fontWeight: "600" },

  statsRow: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  backButton: { fontSize: 16, color: COLORS.primary, fontWeight: "600" },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  statLabel: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },

  searchContainer: { paddingHorizontal: 16, marginBottom: 12 },
  searchInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },

  list: { flex: 1, paddingHorizontal: 16 },

  refundCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  receiptNumber: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  typeFull: { backgroundColor: "#fee2e2" },
  typePartial: { backgroundColor: "#fef3c7" },
  typeText: { fontSize: 10, fontWeight: "700", color: COLORS.primary },
  paymentMethod: { fontSize: 11, color: COLORS.secondary },
  amountBadge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  amountText: { fontSize: 14, fontWeight: "bold", color: COLORS.warning },

  cardBody: { marginBottom: 12 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  infoLabel: { fontSize: 13, color: COLORS.secondary },
  infoValue: { fontSize: 13, fontWeight: "600", color: COLORS.primary },

  reasonRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  reasonLabel: { fontSize: 11, color: COLORS.secondary, marginBottom: 4 },
  reasonText: { fontSize: 13, color: COLORS.primary, fontStyle: "italic" },

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
  emptyIcon: { fontSize: 64, marginBottom: 16 },
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
});
