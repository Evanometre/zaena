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

interface SalesSummary {
  period: string;
  totalSales: number;
  totalRevenue: number;
  totalProfit: number;
  avgSaleValue: number;
  paidSales: number;
  unpaidSales: number;
  voidedSales: number;
}

export default function SalesSummaryReport() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">(
    "today",
  );
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [summary, setSummary] = useState<SalesSummary | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchSummary();
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

  async function fetchSummary() {
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

      // Fetch sales data
      const { data: salesData, error } = await supabase
        .from("export_sales_summary")
        .select(
          "total_amount, net_revenue, total_cogs, payment_status, sale_date",
        )
        .eq("organization_id", profile.organization_id)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);

      if (error) throw error;
      const activeSales = salesData || [];

      const paidSales = activeSales.filter((s) => s.payment_status === "paid");

      const unpaidSales = activeSales.filter(
        (s) => s.payment_status === "unpaid",
      );

      // Since the view excludes voided sales:
      const voidedSales = 0;

      const totalRevenue = paidSales.reduce(
        (sum, s) => sum + Number(s.net_revenue),
        0,
      );
      const totalProfit = paidSales.reduce(
        (sum, s) => sum + (Number(s.total_amount) - Number(s.total_cogs || 0)),
        0,
      );

      setSummary({
        period: getPeriodLabel(period),
        totalSales: activeSales.length,
        totalRevenue,
        totalProfit,
        avgSaleValue:
          paidSales.length > 0 ? totalRevenue / paidSales.length : 0,

        paidSales: paidSales.length,
        unpaidSales: unpaidSales.length,
        voidedSales: 0,
      });
    } catch (err: any) {
      console.error("Error fetching sales summary:", err);
    } finally {
      setLoading(false);
    }
  }

  function getDateRange(period: string) {
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case "today":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "week":
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    return {
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
    };
  }

  function getPeriodLabel(period: string) {
    switch (period) {
      case "today":
        return "Today";
      case "week":
        return "Last 7 Days";
      case "month":
        return "Last 30 Days";
      case "year":
        return "Last Year";
      default:
        return "";
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sales Summary</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Period Selector */}
      <View style={styles.periodContainer}>
        {(["today", "week", "month", "year"] as const).map((p) => (
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
        ) : summary ? (
          <>
            {/* Revenue Card */}
            <View style={styles.revenueCard}>
              <Text style={styles.revenueLabel}>Total Revenue</Text>
              <Text style={styles.revenueAmount}>
                {currency.symbol}
                {summary.totalRevenue.toLocaleString()}
              </Text>
              <Text style={styles.revenueSubtext}>
                {summary.totalSales} sales
              </Text>
            </View>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {currency.symbol}
                  {summary.totalProfit.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Total Profit</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {currency.symbol}
                  {Math.round(summary.avgSaleValue).toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Avg Sale Value</Text>
              </View>
            </View>

            {/* Breakdown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sales Breakdown</Text>

              <View style={styles.breakdownCard}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>✅ Paid Sales</Text>
                  <Text
                    style={[styles.breakdownValue, { color: COLORS.success }]}
                  >
                    {summary.paidSales}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>⏳ Unpaid Sales</Text>
                  <Text
                    style={[styles.breakdownValue, { color: COLORS.warning }]}
                  >
                    {summary.unpaidSales}
                  </Text>
                </View>
              </View>
            </View>

            {/* Profit Margin */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Profitability</Text>
              <View style={styles.profitCard}>
                <View style={styles.profitRow}>
                  <Text style={styles.profitLabel}>Revenue:</Text>
                  <Text style={styles.profitValue}>
                    {currency.symbol}
                    {summary.totalRevenue.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.profitRow}>
                  <Text style={styles.profitLabel}>Profit:</Text>
                  <Text style={[styles.profitValue, { color: COLORS.success }]}>
                    {currency.symbol}
                    {summary.totalProfit.toLocaleString()}
                  </Text>
                </View>
                <View style={[styles.profitRow, styles.marginRow]}>
                  <Text style={styles.marginLabel}>Profit Margin:</Text>
                  <Text style={styles.marginValue}>
                    {summary.totalRevenue > 0
                      ? (
                          (summary.totalProfit / summary.totalRevenue) *
                          100
                        ).toFixed(1)
                      : "0"}
                    %
                  </Text>
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

  revenueCard: {
    backgroundColor: COLORS.accent,
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  revenueLabel: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  revenueAmount: {
    fontSize: 36,
    fontWeight: "bold",
    color: COLORS.white,
    marginTop: 8,
  },
  revenueSubtext: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginTop: 8,
  },

  statsGrid: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  statLabel: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 4,
    textAlign: "center",
  },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },

  breakdownCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  breakdownLabel: { fontSize: 14, color: COLORS.primary },
  breakdownValue: { fontSize: 16, fontWeight: "bold" },

  profitCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  profitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  profitLabel: { fontSize: 14, color: COLORS.secondary },
  profitValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  marginRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  marginLabel: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  marginValue: { fontSize: 18, fontWeight: "bold", color: COLORS.success },
});
