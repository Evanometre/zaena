// ============================================
// FILE: app/finance/allocations/allocate.tsx
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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { usePermissions } from "../../../context/PermissionsContext";
import { COLORS } from "../../../lib/colors";
import supabase from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

interface AllocationRule {
  id: string;
  category_name: string;
  allocation_percentage: number;
}

interface ProfitCalculation {
  gross_profit: number;
  operating_expenses: number;
  net_profit: number;
  distributable_amount: number;
}

// CIT tiers per Finance Act 2023 (effective 2026)
function calculateNigerianCIT(
  annualTurnover: number,
  annualProfit: number,
): {
  rate: number;
  amount: number;
  tier: string;
} {
  if (annualTurnover < 25_000_000) {
    return { rate: 0, amount: 0, tier: "Small Company (0%)" };
  }
  if (annualTurnover <= 100_000_000) {
    const tax = (annualProfit * 20) / 100;
    // Minimum tax: 0.5% of gross turnover if CIT liability is lower
    const minimumTax = annualTurnover * 0.005;
    const amount = Math.max(0, Math.max(tax, minimumTax));
    return {
      rate: 20,
      amount: Math.round(amount),
      tier: "Medium Company (20%)",
    };
  }
  const tax = (annualProfit * 30) / 100;
  const minimumTax = annualTurnover * 0.005;
  const amount = Math.max(0, Math.max(tax, minimumTax));
  return { rate: 30, amount: Math.round(amount), tier: "Large Company (30%)" };
}

export default function AllocateProfitScreen() {
  const router = useRouter();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rules, setRules] = useState<AllocationRule[]>([]);
  const [profitCalc, setProfitCalc] = useState<ProfitCalculation | null>(null);
  // REPLACE WITH:
  const { organizationId } = useAuthStore();
  const businessType = useAuthStore((s) => s.businessType);
  const company = businessType === "registered_company";

  const [currency, setCurrency] = useState({
    symbol: " ",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Company mode: CIT override (user can adjust the auto-calculated figure)
  const [annualTurnover, setAnnualTurnover] = useState("");
  const [citOverride, setCitOverride] = useState("");
  const [citCalc, setCitCalc] = useState<{
    rate: number;
    amount: number;
    tier: string;
  } | null>(null);

  useEffect(() => {
    if (!permissionsLoading && !hasPermission("allocations.manage")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to allocate profits",
        [{ text: "OK", onPress: () => router.back() }],
      );
    }
  }, [permissionsLoading, hasPermission]);

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

  useFocusEffect(
    useCallback(() => {
      if (hasPermission("allocations.manage")) {
        fetchData();
      }
    }, [hasPermission]),
  );

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
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (rulesError) throw rulesError;
      setRules(rulesData || []);

      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(firstDay.toISOString().split("T")[0]);
      setEndDate(lastDay.toISOString().split("T")[0]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function calculateProfit() {
    if (!startDate || !endDate) {
      Alert.alert("Error", "Please select start and end dates");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc(
        "calculate_distributable_profit",
        {
          p_organization_id: organizationId,
          p_location_id: null,
          p_start_date: startDate,
          p_end_date: endDate,
        },
      );

      if (error) throw error;

      if (data && data.length > 0) {
        const calc = data[0] as ProfitCalculation;
        setProfitCalc(calc);

        // Auto-calculate CIT for company mode
        if (company && calc.net_profit > 0) {
          // Use provided turnover or fall back to gross_profit as proxy
          const turnover = annualTurnover
            ? parseFloat(annualTurnover)
            : calc.gross_profit;
          const cit = calculateNigerianCIT(turnover, calc.net_profit);
          setCitCalc(cit);
          setCitOverride(cit.amount.toString());
        }
      } else {
        Alert.alert("No Data", "No profit data found for this period");
        setProfitCalc(null);
        setCitCalc(null);
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to calculate profit");
      setProfitCalc(null);
    } finally {
      setLoading(false);
    }
  }

  // Effective distributable amount after CIT deduction (company mode)
  const effectiveDistributable = (() => {
    if (!profitCalc) return 0;
    if (!company) return profitCalc.distributable_amount;
    const cit = citOverride ? parseFloat(citOverride) : 0;
    return Math.max(0, profitCalc.distributable_amount - cit);
  })();

  async function handleAllocate() {
    if (!hasPermission("allocations.manage")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to allocate profits",
      );
      return;
    }
    if (!profitCalc) {
      Alert.alert("Error", "Please calculate profit first");
      return;
    }
    if (effectiveDistributable <= 0) {
      Alert.alert(
        "Cannot Allocate",
        company
          ? "Distributable profit after CIT must be greater than zero"
          : "Distributable profit must be greater than zero",
      );
      return;
    }
    if (rules.length === 0) {
      Alert.alert("Error", "No active allocation rules found");
      return;
    }

    const totalPercentage = rules.reduce(
      (sum, r) => sum + r.allocation_percentage,
      0,
    );
    if (totalPercentage !== 100) {
      Alert.alert(
        "Warning",
        `Active rules total ${totalPercentage}% (should be 100%). Continue anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => performAllocation() },
        ],
      );
      return;
    }

    performAllocation();
  }

  async function performAllocation() {
    if (!profitCalc) return;
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const allocations = rules.map((rule) => ({
        organization_id: organizationId,
        location_id: null,
        allocation_rule_id: rule.id,
        period_start: startDate,
        period_end: endDate,
        total_profit: effectiveDistributable,
        allocated_amount:
          (effectiveDistributable * rule.allocation_percentage) / 100,
        gross_profit: profitCalc.gross_profit,
        net_profit: profitCalc.net_profit,
        distributable_amount: effectiveDistributable,
      }));

      const { error } = await supabase
        .from("profit_allocations")
        .insert(allocations);
      if (error) throw error;

      const successMsg = company
        ? `Profit appropriated across ${rules.length} categories (after CIT provision of ${currency.symbol}${parseFloat(citOverride || "0").toLocaleString()})`
        : `Profit allocated across ${rules.length} categories`;

      Alert.alert("Success", successMsg, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to allocate profit");
    } finally {
      setSubmitting(false);
    }
  }

  if (permissionsLoading) {
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

  if (!hasPermission("allocations.manage")) return null;

  const totalPercentage = rules.reduce(
    (sum, r) => sum + r.allocation_percentage,
    0,
  );
  const screenTitle = company ? "Appropriate Profit" : "Allocate Profit";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{screenTitle}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Period Selection */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📅 Select Period</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Start Date</Text>
              <TextInput
                style={styles.input}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.secondary}
              />
            </View>
            <View style={{ width: 16 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>End Date</Text>
              <TextInput
                style={styles.input}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.secondary}
              />
            </View>
          </View>

          {/* Company mode: annual turnover for CIT tier calculation */}
          {company && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Annual Turnover (for CIT tier)</Text>
              <TextInput
                style={styles.input}
                value={annualTurnover}
                onChangeText={setAnnualTurnover}
                placeholder="e.g. 50000000 — leave blank to use gross profit"
                keyboardType="decimal-pad"
                placeholderTextColor={COLORS.secondary}
              />
              <Text style={styles.hint}>
                Used to determine your CIT rate (0% / 20% / 30%). If left blank,
                gross profit is used as a proxy.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.calculateButton}
            onPress={calculateProfit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.calculateButtonText}>Calculate Profit</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Profit Breakdown */}
        {profitCalc && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>💰 Profit Breakdown</Text>

            <View style={styles.profitRow}>
              <Text style={styles.profitLabel}>Gross Profit:</Text>
              <Text style={styles.profitValue}>
                {currency.symbol}
                {profitCalc.gross_profit.toLocaleString()}
              </Text>
            </View>
            <View style={styles.profitRow}>
              <Text style={styles.profitLabel}>Operating Expenses:</Text>
              <Text style={[styles.profitValue, { color: COLORS.danger }]}>
                -{currency.symbol}
                {profitCalc.operating_expenses.toLocaleString()}
              </Text>
            </View>
            <View style={[styles.profitRow, styles.profitRowTotal]}>
              <Text style={styles.profitLabelBold}>Net Profit:</Text>
              <Text style={styles.profitValueBold}>
                {currency.symbol}
                {profitCalc.net_profit.toLocaleString()}
              </Text>
            </View>

            {/* Company mode: CIT deduction step */}
            {company && citCalc && (
              <>
                <View style={[styles.profitRow, { marginTop: 8 }]}>
                  <Text style={styles.profitLabel}>
                    CIT Provision ({citCalc.tier}):
                  </Text>
                  <Text style={[styles.profitValue, { color: COLORS.danger }]}>
                    -{currency.symbol}
                    {parseFloat(citOverride || "0").toLocaleString()}
                  </Text>
                </View>
                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.hint}>Adjust CIT if needed:</Text>
                  <TextInput
                    style={[styles.input, { marginTop: 4 }]}
                    value={citOverride}
                    onChangeText={setCitOverride}
                    keyboardType="decimal-pad"
                    placeholder="Auto-calculated CIT"
                    placeholderTextColor={COLORS.secondary}
                  />
                </View>
              </>
            )}

            <View style={[styles.profitRow, styles.distributableRow]}>
              <Text style={styles.profitLabelBold}>
                {company ? "Post-Tax Distributable:" : "Distributable:"}
              </Text>
              <Text style={[styles.profitValueBold, { color: COLORS.accent }]}>
                {currency.symbol}
                {effectiveDistributable.toLocaleString()}
              </Text>
            </View>

            {effectiveDistributable <= 0 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ No profit available for distribution
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Allocation Preview */}
        {profitCalc && effectiveDistributable > 0 && rules.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {company ? "📊 Appropriation Preview" : "📊 Allocation Preview"}
              </Text>
              <View
                style={[
                  styles.totalBadge,
                  totalPercentage === 100
                    ? styles.totalBadgeGood
                    : styles.totalBadgeWarn,
                ]}
              >
                <Text style={styles.totalBadgeText}>{totalPercentage}%</Text>
              </View>
            </View>

            {rules.map((rule) => {
              const amount =
                (effectiveDistributable * rule.allocation_percentage) / 100;
              return (
                <View key={rule.id} style={styles.allocationRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.allocationCategory}>
                      {rule.category_name}
                    </Text>
                    <Text style={styles.allocationPercent}>
                      {rule.allocation_percentage}%
                    </Text>
                  </View>
                  <Text style={styles.allocationAmount}>
                    {currency.symbol}
                    {amount.toLocaleString()}
                  </Text>
                </View>
              );
            })}

            {totalPercentage !== 100 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ Total percentage should equal 100%
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {profitCalc && effectiveDistributable > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.allocateButton,
              (submitting || loading) && styles.allocateButtonDisabled,
            ]}
            onPress={handleAllocate}
            disabled={submitting || loading}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.allocateButtonText}>
                {company ? "Confirm Appropriation" : "Confirm Allocation"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
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
  backButton: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  content: { flex: 1, padding: 16 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  row: { flexDirection: "row" },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 6,
  },
  hint: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: COLORS.primary,
  },
  calculateButton: {
    backgroundColor: COLORS.primary,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  calculateButtonText: { fontSize: 15, fontWeight: "600", color: COLORS.white },
  profitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  profitRowTotal: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 8,
    paddingTop: 12,
  },
  distributableRow: {
    backgroundColor: "#F0F9FF",
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
  profitLabel: { fontSize: 14, color: COLORS.secondary },
  profitValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  profitLabelBold: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  profitValueBold: { fontSize: 16, fontWeight: "bold", color: COLORS.primary },
  totalBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  totalBadgeGood: { backgroundColor: COLORS.success },
  totalBadgeWarn: { backgroundColor: "#FFA726" },
  totalBadgeText: { fontSize: 13, fontWeight: "700", color: COLORS.white },
  allocationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  allocationCategory: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  allocationPercent: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  allocationAmount: { fontSize: 15, fontWeight: "bold", color: COLORS.accent },
  warningBox: {
    backgroundColor: "#FFF3CD",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  warningText: { fontSize: 13, color: "#856404", textAlign: "center" },
  footer: {
    padding: 16,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  allocateButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  allocateButtonDisabled: { opacity: 0.6 },
  allocateButtonText: { fontSize: 16, fontWeight: "600", color: COLORS.white },
});
