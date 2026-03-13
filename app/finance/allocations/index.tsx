// ============================================
// FILE: app/finance/allocations/index.tsx
// ============================================
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { PermissionButton } from "../../../context/PermisionButton";
import { usePermissions } from "../../../context/PermissionsContext";
import { COLORS } from "../../../lib/colors";
import supabase from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

interface AllocationRule {
  id: string;
  category_name: string;
  allocation_percentage: number;
  is_active: boolean;
  sort_order: number;
}

interface AllocationHistory {
  id: string;
  period_start: string;
  period_end: string;
  total_profit: number;
  allocated_amount: number;
  gross_profit: number;
  net_profit: number;
  distributable_amount: number;
  allocation_rule: {
    category_name: string;
  };
}

export default function ProfitAllocationsScreen() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);
  const { organizationId } = useAuthStore();
  const businessType = useAuthStore((s) => s.businessType);
  const company = businessType === "registered_company";

  const [currency, setCurrency] = useState({
    symbol: "",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [refreshing, setRefreshing] = useState(false);
  const [rules, setRules] = useState<AllocationRule[]>([]);
  const [history, setHistory] = useState<AllocationHistory[]>([]);
  const [activeTab, setActiveTab] = useState<"rules" | "history">("rules");

  useFocusEffect(
    useCallback(() => {
      fetchData();
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

  async function fetchData() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: rulesData, error: rulesError } = await supabase
        .from("profit_allocation_rules")
        .select("*")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true });

      if (rulesError) throw rulesError;
      setRules(rulesData || []);

      const { data: historyData, error: historyError } = await supabase
        .from("profit_allocations")
        .select(`*, allocation_rule:allocation_rule_id (category_name)`)
        .eq("organization_id", organizationId)
        .order("period_end", { ascending: false })
        .limit(20);

      if (historyError) throw historyError;
      setHistory(historyData || []);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchData();
  }

  async function toggleRuleStatus(ruleId: string, currentStatus: boolean) {
    if (!hasPermission("strategy.manage")) {
      Alert.alert("Permission Denied", "You cannot modify allocation rules");
      return;
    }
    try {
      const { error } = await supabase
        .from("profit_allocation_rules")
        .update({ is_active: !currentStatus })
        .eq("id", ruleId);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update rule");
    }
  }

  const totalPercentage = rules
    .filter((r) => r.is_active)
    .reduce((sum, r) => sum + r.allocation_percentage, 0);

  const percentageWarning = totalPercentage !== 100;

  // ── Mode-aware copy ────────────────────────────────────────────────────────
  const screenTitle = company ? "Profit Appropriation" : "Profit Distribution";
  const allocateButtonLabel = company
    ? "📋 Appropriate Profit"
    : "💰 Allocate Profit";
  const emptyRulesText = company
    ? "No appropriation rules yet"
    : "No allocation rules yet";
  const emptyRulesSubtext = company
    ? "Create rules to appropriate profit to retained earnings, dividends, and CIT"
    : "Create rules to distribute profit across categories";
  const rulePercentSuffix = company
    ? "of post-tax distributable profit"
    : "of distributable profit";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{screenTitle}</Text>
        <PermissionButton
          permission="strategy.manage"
          onPress={() => router.push("/finance/allocations/new-rule" as any)}
        >
          <Text style={styles.addButton}>+ Rule</Text>
        </PermissionButton>
      </View>

      {/* Company mode info banner */}
      {company && (
        <View style={styles.modeBanner}>
          <Text style={styles.modeBannerText}>
            🏢 Company Mode — profit is appropriated after CIT provision.
            Declare dividends separately from the Dividends screen.
          </Text>
        </View>
      )}

      {/* Percentage warning */}
      {percentageWarning && rules.length > 0 && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            ⚠️ Active rules total {totalPercentage.toFixed(1)}% (should be 100%)
          </Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "rules" && styles.tabActive]}
          onPress={() => setActiveTab("rules")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "rules" && styles.tabTextActive,
            ]}
          >
            Rules ({rules.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "history" && styles.tabActive]}
          onPress={() => setActiveTab("history")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "history" && styles.tabTextActive,
            ]}
          >
            History ({history.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing && (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 40 }}
          />
        )}

        {/* Rules Tab */}
        {activeTab === "rules" && !loading && (
          <>
            {rules.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📊</Text>
                <Text style={styles.emptyText}>{emptyRulesText}</Text>
                <Text style={styles.emptySubtext}>{emptyRulesSubtext}</Text>
                <PermissionButton
                  permission="strategy.manage"
                  style={styles.emptyButton}
                  onPress={() =>
                    router.push("/finance/allocations/new-rule" as any)
                  }
                >
                  <Text style={styles.emptyButtonText}>Create First Rule</Text>
                </PermissionButton>
              </View>
            ) : (
              <>
                <PermissionButton
                  permission="allocations.manage"
                  style={[
                    styles.allocateButton,
                    percentageWarning && styles.allocateButtonDisabled,
                  ]}
                  onPress={() =>
                    router.push("/finance/allocations/allocate" as any)
                  }
                  disabled={percentageWarning}
                >
                  <Text style={styles.allocateButtonText}>
                    {percentageWarning
                      ? "⚠️ Fix Rules First"
                      : allocateButtonLabel}
                  </Text>
                </PermissionButton>

                {/* Company mode: shortcut to dividends */}
                {company && (
                  <TouchableOpacity
                    style={styles.dividendButton}
                    onPress={() => router.push("/finance/dividends" as any)}
                  >
                    <Text style={styles.dividendButtonText}>
                      💸 Declare Dividend
                    </Text>
                  </TouchableOpacity>
                )}

                {rules.map((rule) => (
                  <View key={rule.id} style={styles.ruleCard}>
                    <View style={styles.ruleHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ruleCategory}>
                          {rule.category_name}
                        </Text>
                        <Text style={styles.rulePercentage}>
                          {rule.allocation_percentage}% of {rulePercentSuffix}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          toggleRuleStatus(rule.id, rule.is_active)
                        }
                      >
                        <View
                          style={[
                            styles.statusBadge,
                            rule.is_active
                              ? styles.statusActive
                              : styles.statusInactive,
                          ]}
                        >
                          <Text style={styles.statusText}>
                            {rule.is_active ? "Active" : "Inactive"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* History Tab */}
        {activeTab === "history" && !loading && (
          <>
            {history.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📅</Text>
                <Text style={styles.emptyText}>No history yet</Text>
                <Text style={styles.emptySubtext}>
                  {company
                    ? "Appropriations will appear here after you distribute profit"
                    : "Allocations will appear here after you distribute profit"}
                </Text>
              </View>
            ) : (
              history.map((item) => (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyCategory}>
                      {item.allocation_rule?.category_name ||
                        "Unknown Category"}
                    </Text>
                    <Text style={styles.historyAmount}>
                      {currency.symbol}
                      {item.allocated_amount.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={styles.historyLabel}>Period:</Text>
                    <Text style={styles.historyValue}>
                      {new Date(item.period_start).toLocaleDateString()} –{" "}
                      {new Date(item.period_end).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={styles.historyLabel}>Net Profit:</Text>
                    <Text style={styles.historyValue}>
                      {currency.symbol}
                      {item.net_profit?.toLocaleString() || "0"}
                    </Text>
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={styles.historyLabel}>Distributable:</Text>
                    <Text style={styles.historyValue}>
                      {currency.symbol}
                      {item.distributable_amount?.toLocaleString() || "0"}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
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
  addButton: { fontSize: 16, fontWeight: "600", color: COLORS.accent },
  modeBanner: {
    backgroundColor: "#EEF2FF",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#C7D2FE",
  },
  modeBannerText: { fontSize: 13, color: "#3730A3", lineHeight: 18 },
  warningBanner: {
    backgroundColor: "#FFF3CD",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#FFE69C",
  },
  warningText: { fontSize: 14, color: "#856404", textAlign: "center" },
  tabs: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: { flex: 1, padding: 16, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 14, fontWeight: "600", color: COLORS.secondary },
  tabTextActive: { color: COLORS.primary },
  content: { flex: 1, padding: 16 },
  allocateButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  allocateButtonDisabled: { opacity: 0.5 },
  allocateButtonText: { fontSize: 16, fontWeight: "600", color: COLORS.white },
  dividendButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  dividendButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.accent,
  },
  ruleCard: {
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
  ruleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ruleCategory: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  rulePercentage: { fontSize: 14, color: COLORS.secondary, marginTop: 4 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusActive: { backgroundColor: COLORS.success },
  statusInactive: { backgroundColor: COLORS.secondary },
  statusText: { fontSize: 12, fontWeight: "600", color: COLORS.white },
  historyCard: {
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
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  historyCategory: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  historyAmount: { fontSize: 18, fontWeight: "bold", color: COLORS.accent },
  historyDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  historyLabel: { fontSize: 13, color: COLORS.secondary },
  historyValue: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
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
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.white },
});
