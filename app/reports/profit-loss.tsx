import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface ProfitLossData {
  // Revenue
  totalRevenue: number;

  // Costs
  cogs: number;
  grossProfit: number;

  // Operating Expenses
  operatingExpenses: number;
  payrollCosts: number;

  // Net Profit
  netProfit: number;

  // Margins
  grossMargin: number;
  netMargin: number;
}

export default function ProfitLossReport() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const [data, setData] = useState<ProfitLossData | null>(null);
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [period]),
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

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { startDate, endDate } = getDateRange(period);
      const orgId = profile.organization_id;

      // Run queries in parallel for performance
      const [salesResponse, expensesResponse, payrollResponse] =
        await Promise.all([
          // 1. REVENUE & COGS (From Sales Table)
          supabase
            .from("sales")
            .select("total_amount, total_cogs")
            .eq("organization_id", orgId)
            .eq("payment_status", "paid") // Only count paid sales for cash-basis P&L
            .eq("is_voided", false) // Exclude voided sales
            .gte("occurred_at", startDate)
            .lte("occurred_at", endDate),

          // 2. OPERATING EXPENSES
          // Note: Assuming 'expenses' table has 'amount' and 'occurred_at'
          supabase
            .from("expenses")
            .select("amount")
            .eq("organization_id", orgId)
            .eq("expense_type", "operating")
            .gte("occurred_at", startDate)
            .lte("occurred_at", endDate),

          // 3. PAYROLL COSTS
          // Note: Assuming 'payroll_runs' has 'total_net' (or 'total_amount') and 'occurred_at'
          supabase
            .from("payroll_runs")
            .select("total_net") // Change to 'total_amount' if that is your column name
            .eq("organization_id", orgId)
            .gte("occurred_at", startDate) // Verify if this uses 'occurred_at' or 'created_at'
            .lte("occurred_at", endDate)
            .eq("status", "paid"),
        ]);

      if (salesResponse.error) throw salesResponse.error;
      if (expensesResponse.error)
        console.log("Expense fetch warning:", expensesResponse.error);

      // --- CALCULATIONS ---

      // 1. Revenue
      const salesData = salesResponse.data || [];
      const totalRevenue = salesData.reduce(
        (sum, s) => sum + Number(s.total_amount),
        0,
      );

      // 2. COGS (Use the total_cogs column from sales for accuracy)
      const cogs = salesData.reduce(
        (sum, s) => sum + Number(s.total_cogs || 0),
        0,
      );

      // 3. Operating Expenses
      const expensesData = expensesResponse.data || [];
      const operatingExpenses = expensesData.reduce(
        (sum, e) => sum + Number(e.amount),
        0,
      );

      // 4. Payroll
      const payrollData = payrollResponse.data || [];
      const payrollCosts = payrollData.reduce(
        (sum, p) => sum + Number(p.total_net || 0),
        0,
      );

      // 5. Final Metrics
      const grossProfit = totalRevenue - cogs;
      const netProfit = grossProfit - operatingExpenses - payrollCosts;

      const grossMargin =
        totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      setData({
        totalRevenue,
        cogs,
        grossProfit,
        operatingExpenses,
        payrollCosts,
        netProfit,
        grossMargin,
        netMargin,
      });
    } catch (err: any) {
      console.error("Error fetching P&L data:", err);
    } finally {
      setLoading(false);
    }
  }

  function getDateRange(period: string) {
    const now = new Date();
    // End date is effectively "now"
    const endDate = now.toISOString();

    let startDate = new Date();

    switch (period) {
      case "month":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "quarter":
        startDate.setMonth(now.getMonth() - 3);
        break;
      case "year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    // Set start date to beginning of that day
    startDate.setHours(0, 0, 0, 0);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate,
    };
  }

  function getPeriodLabel(period: string) {
    switch (period) {
      case "month":
        return "Last 30 Days";
      case "quarter":
        return "Last 90 Days";
      case "year":
        return "Last Year";
      default:
        return "";
    }
  }

  // ... (Keep the exact same Return/JSX as your original code)
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profit & Loss</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Period Selector */}
      <View style={styles.periodContainer}>
        {(["month", "quarter", "year"] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[
              styles.periodButton,
              period === p && styles.periodButtonActive,
            ]}
            onPress={() => setPeriod(p)}
          >
            <Text
              style={[
                styles.periodText,
                period === p && styles.periodTextActive,
              ]}
            >
              {getPeriodLabel(p)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 40 }}
          />
        ) : data ? (
          <>
            {/* Net Profit Card */}
            <View
              style={[
                styles.netProfitCard,
                data.netProfit < 0 && styles.lossCard,
              ]}
            >
              <Text style={styles.netProfitLabel}>
                {data.netProfit >= 0 ? "Net Profit" : "Net Loss"}
              </Text>
              <Text style={styles.netProfitAmount}>
                {currency.symbol}
                {Math.abs(data.netProfit).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </Text>
              <Text style={styles.netProfitMargin}>
                {data.netMargin.toFixed(1)}% margin
              </Text>
            </View>

            {/* P&L Statement */}
            <View style={styles.statementCard}>
              <Text style={styles.statementTitle}>Income Statement</Text>

              {/* Revenue */}
              <View style={styles.statementSection}>
                <Text style={styles.sectionLabel}>REVENUE</Text>
                <View style={styles.statementRow}>
                  <Text style={styles.rowLabel}>Total Sales (Paid)</Text>
                  <Text style={styles.rowValue}>
                    {currency.symbol}
                    {data.totalRevenue.toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* COGS */}
              <View style={styles.statementSection}>
                <Text style={styles.sectionLabel}>COST OF GOODS SOLD</Text>
                <View style={styles.statementRow}>
                  <Text style={styles.rowLabel}>COGS</Text>
                  <Text style={[styles.rowValue, { color: COLORS.danger }]}>
                    -{currency.symbol}
                    {data.cogs.toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* Gross Profit */}
              <View style={[styles.statementRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Gross Profit</Text>
                <Text style={styles.totalValue}>
                  {currency.symbol}
                  {data.grossProfit.toLocaleString()}
                </Text>
              </View>
              <View style={styles.marginRow}>
                <Text style={styles.marginText}>
                  Gross Margin: {data.grossMargin.toFixed(1)}%
                </Text>
              </View>

              {/* Operating Expenses */}
              <View style={styles.statementSection}>
                <Text style={styles.sectionLabel}>OPERATING EXPENSES</Text>
                <View style={styles.statementRow}>
                  <Text style={styles.rowLabel}>General Expenses</Text>
                  <Text style={[styles.rowValue, { color: COLORS.danger }]}>
                    -{currency.symbol}
                    {data.operatingExpenses.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.statementRow}>
                  <Text style={styles.rowLabel}>Payroll Costs</Text>
                  <Text style={[styles.rowValue, { color: COLORS.danger }]}>
                    -{currency.symbol}
                    {data.payrollCosts.toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* Net Profit */}
              <View style={[styles.statementRow, styles.netRow]}>
                <Text style={styles.netLabel}>Net Profit</Text>
                <Text
                  style={[
                    styles.netValue,
                    data.netProfit < 0 && { color: COLORS.danger },
                  ]}
                >
                  {data.netProfit >= 0
                    ? currency.symbol
                    : `-${currency.symbol}`}
                  {Math.abs(data.netProfit).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </Text>
              </View>
            </View>

            {/* Key Metrics */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Key Metrics</Text>
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>
                    {data.grossMargin.toFixed(1)}%
                  </Text>
                  <Text style={styles.metricLabel}>Gross Margin</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>
                    {data.netMargin.toFixed(1)}%
                  </Text>
                  <Text style={styles.metricLabel}>Net Margin</Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        <View style={{ height: 40 }} />
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
  backButton: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },

  periodContainer: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  periodButtonActive: { backgroundColor: COLORS.primary },
  periodText: { fontSize: 13, fontWeight: "600", color: COLORS.secondary },
  periodTextActive: { color: COLORS.white },

  content: { flex: 1, padding: 16 },

  netProfitCard: {
    backgroundColor: COLORS.success,
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  lossCard: { backgroundColor: COLORS.danger },
  netProfitLabel: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  netProfitAmount: {
    fontSize: 36,
    fontWeight: "bold",
    color: COLORS.white,
    marginTop: 8,
  },
  netProfitMargin: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginTop: 8,
  },

  statementCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statementTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 16,
  },

  statementSection: { marginBottom: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.secondary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  statementRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  rowLabel: { fontSize: 14, color: COLORS.primary },
  rowValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },

  totalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalLabel: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  totalValue: { fontSize: 16, fontWeight: "bold", color: COLORS.primary },

  marginRow: { marginBottom: 16 },
  marginText: { fontSize: 12, color: COLORS.secondary, fontStyle: "italic" },

  netRow: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: COLORS.primary,
  },
  netLabel: { fontSize: 16, fontWeight: "bold", color: COLORS.primary },
  netValue: { fontSize: 20, fontWeight: "bold", color: COLORS.success },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },

  metricsGrid: { flexDirection: "row", gap: 12 },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  metricValue: { fontSize: 24, fontWeight: "bold", color: COLORS.accent },
  metricLabel: { fontSize: 12, color: COLORS.secondary, marginTop: 4 },
});
