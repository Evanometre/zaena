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

interface ExpenseCategoryGroup {
  category: string;
  total: number;
  count: number;
}

export default function ExpensesSummaryReport() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ExpenseCategoryGroup[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [filter, setFilter] = useState<"all" | "operating" | "capital">("all");
  const [dateRange, setDateRange] = useState<"all" | "month" | "30days">("all");
  const [topCategories, setTopCategories] = useState<ExpenseCategoryGroup[]>(
    [],
  );

  // --- Currency State Logic ---
  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

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
  // ----------------------------

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("expenses")
        .select("category, amount, expense_type, occurred_at")
        .eq("organization_id", organizationId);

      if (filter !== "all") {
        query = query.eq("expense_type", filter);
      }

      const now = new Date();
      if (dateRange === "month") {
        const firstDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
        ).toISOString();
        query = query.gte("occurred_at", firstDay);
      } else if (dateRange === "30days") {
        const thirtyDaysAgo = new Date(
          now.setDate(now.getDate() - 30),
        ).toISOString();
        query = query.gte("occurred_at", thirtyDaysAgo);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        setSummary([]);
        setTotalAmount(0);
        setTopCategories([]);
        return;
      }

      const groups: { [key: string]: { total: number; count: number } } = {};
      let totalSum = 0;

      data.forEach((item) => {
        const cat = item.category || "Uncategorized";
        const amt = Number(item.amount) || 0;
        totalSum += amt;

        if (!groups[cat]) {
          groups[cat] = { total: 0, count: 0 };
        }
        groups[cat].total += amt;
        groups[cat].count += 1;
      });

      const formatted = Object.keys(groups)
        .map((key) => ({
          category: key,
          total: groups[key].total,
          count: groups[key].count,
        }))
        .sort((a, b) => b.total - a.total);

      setSummary(formatted);
      setTotalAmount(totalSum);
      setTopCategories(formatted.slice(0, 3));
    } catch (err) {
      console.error("Expenses Summary Error:", err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, filter, dateRange]);

  useFocusEffect(
    useCallback(() => {
      fetchExpenses();
    }, [fetchExpenses]),
  );

  return (
    <View style={styles.container}>
      {/* Header unchanged */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Expenses Summary</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Filter UI unchanged */}
      <View style={styles.filterRow}>
        {["all", "operating", "capital"].map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setFilter(t as any)}
            style={[styles.filterBtn, filter === t && styles.filterBtnActive]}
          >
            <Text
              style={[
                styles.filterBtnText,
                filter === t && styles.filterBtnTextActive,
              ]}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.dateFilterRow}>
        {(["all", "month", "30days"] as const).map((dr) => (
          <TouchableOpacity
            key={dr}
            onPress={() => setDateRange(dr)}
            style={dateRange === dr ? styles.dateActive : styles.dateInactive}
          >
            <Text
              style={dateRange === dr ? styles.textActive : styles.textInactive}
            >
              {dr === "all"
                ? "Lifetime"
                : dr === "month"
                  ? "This Month"
                  : "Last 30 Days"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Total Summary Card - UPDATED CURRENCY */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total Expenses</Text>
          <Text style={styles.totalValue}>
            {currency.symbol}
            {totalAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </Text>
          <Text style={styles.subtext}>
            Across {summary.reduce((acc, c) => acc + c.count, 0)} transactions
          </Text>
        </View>

        {/* Top 3 Spenders - UPDATED CURRENCY */}
        {topCategories.length > 0 && (
          <View style={styles.highlightsContainer}>
            <Text style={styles.sectionTitle}>Top 3 Spenders</Text>
            <View style={styles.highlightsRow}>
              {topCategories.map((item, index) => (
                <View key={item.category} style={styles.highlightPill}>
                  <Text style={styles.highlightRank}>#{index + 1}</Text>
                  <Text style={styles.highlightName} numberOfLines={1}>
                    {item.category}
                  </Text>
                  <Text style={styles.highlightAmount}>
                    {currency.symbol}
                    {item.total > 1000
                      ? (item.total / 1000).toFixed(1) + "k"
                      : item.total.toFixed(0)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Breakdown by Category</Text>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 20 }}
          />
        ) : (
          summary.map((item) => {
            const percentage = ((item.total / totalAmount) * 100).toFixed(1);
            return (
              <View key={item.category} style={styles.categoryCard}>
                <View style={styles.categoryInfo}>
                  <Text style={styles.categoryName}>{item.category}</Text>
                  <Text style={styles.categoryCount}>
                    {item.count} expenses
                  </Text>
                </View>
                <View style={styles.amountInfo}>
                  <Text style={styles.categoryTotal}>
                    {currency.symbol}
                    {item.total.toLocaleString()}
                  </Text>
                  <View style={styles.progressBg}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${percentage}%` as any },
                      ]}
                    />
                  </View>
                  <Text style={styles.percentageText}>
                    {percentage}% of total
                  </Text>
                </View>
              </View>
            );
          })
        )}

        {!loading && summary.length === 0 && (
          <Text style={styles.empty}>No expenses recorded yet.</Text>
        )}
      </ScrollView>
    </View>
  );
}
// Styles remain the same...

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    padding: 16,
    paddingTop: 48,
    backgroundColor: COLORS.white,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  back: { color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  content: { padding: 16 },
  totalCard: {
    backgroundColor: COLORS.primary,
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  filterBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterBtnText: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: "600",
  },
  filterBtnTextActive: {
    color: COLORS.white,
  },
  dateFilterRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
    backgroundColor: "#F0F2F5",
    borderRadius: 10,
    padding: 4,
  },
  dateActive: {
    backgroundColor: COLORS.white,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    elevation: 2,
  },
  dateInactive: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  highlightsContainer: {
    marginBottom: 24,
  },
  highlightsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  highlightPill: {
    flex: 1,
    backgroundColor: "#FFFBEB", // Light amber background
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FEF3C7",
    alignItems: "center",
  },
  highlightRank: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#D97706",
    marginBottom: 4,
  },
  highlightName: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
    textAlign: "center",
  },
  highlightAmount: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.primary,
    marginTop: 4,
  },
  textActive: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  textInactive: {
    fontSize: 12,
    color: COLORS.secondary,
  },
  totalLabel: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginBottom: 8 },
  totalValue: { color: COLORS.white, fontSize: 32, fontWeight: "bold" },
  subtext: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 8 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 16,
  },
  categoryCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryName: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  categoryCount: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  categoryInfo: {
    flex: 1, // This ensures the text has room to grow
  },
  amountInfo: { alignItems: "flex-end", width: "40%" },
  categoryTotal: { fontSize: 15, fontWeight: "bold", color: COLORS.primary },
  progressBg: {
    width: "100%",
    height: 4,
    backgroundColor: COLORS.background,
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: COLORS.accent },
  percentageText: { fontSize: 10, color: COLORS.secondary, marginTop: 4 },
  empty: { textAlign: "center", marginTop: 40, color: COLORS.secondary },
});
