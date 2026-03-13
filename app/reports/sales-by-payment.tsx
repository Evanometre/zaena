import { getOrganization } from "@/onboarding/services/organizationService";
import { ALL_CURRENCIES } from "@/onboarding/utility/timezoneCurrencyMap";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface PaymentStats {
  method: string;
  count: number;
  totalRevenue: number;
}

const getDateRange = (period: "today" | "week" | "month" | "year") => {
  const now = new Date();
  const start = new Date();

  switch (period) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "week":
      start.setDate(now.getDate() - 7);
      break;
    case "month":
      start.setMonth(now.getMonth() - 1);
      break;
    case "year":
      start.setFullYear(now.getFullYear() - 1);
      break;
  }

  return {
    startDate: start.toISOString(),
    endDate: now.toISOString(),
  };
};

export default function SalesByPayment() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">(
    "today",
  );
  const [stats, setStats] = useState<PaymentStats[]>([]);
  const [currency, setCurrency] = useState({ symbol: "₦", code: "NGN" });

  useEffect(() => {
    async function loadOrgCurrency() {
      if (!organizationId) return;
      const org = await getOrganization(organizationId);
      if (org?.currency) {
        const match = ALL_CURRENCIES.find((c) => c.code === org.currency);
        setCurrency({
          code: org.currency,
          symbol: match?.symbol ?? org.currency,
        });
      }
    }
    loadOrgCurrency();
  }, [organizationId]);

  const methodLabels: Record<string, string> = {
    cash: "Cash Payment",
    bank: "Bank Transfer",
    pos: "POS Terminal",
    mobile: "Mobile Money",
  };

  const fetchPaymentSales = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange(period);

      // Now using your EXACT database Enums: 'in' and 'completed'
      const { data, error } = await supabase
        .from("payments")
        .select(`payment_method, amount, status, direction, occurred_at`)
        .eq("organization_id", organizationId)
        .eq("direction", "in") // MATCHED: from your 'in'/'out' enum
        .eq("status", "completed") // MATCHED: from your 'completed'/'reversed' enum
        .gte("occurred_at", startDate)
        .lte("occurred_at", endDate);

      if (error) throw error;

      const map: Record<string, PaymentStats> = {};

      data?.forEach((payment) => {
        const rawMethod = String(payment.payment_method || "Other");
        // Map 'bank' to 'Bank Transfer', 'pos' to 'POS Terminal' etc if you want,
        // or just uppercase them.
        const method = rawMethod.toUpperCase();
        const amt = Number(payment.amount || 0);

        if (!map[method]) {
          map[method] = { method, count: 0, totalRevenue: 0 };
        }
        map[method].count += 1;
        map[method].totalRevenue += amt;
      });

      setStats(
        Object.values(map).sort((a, b) => b.totalRevenue - a.totalRevenue),
      );
    } catch (err) {
      // This will no longer crash with 22P02!
      console.error("Payment Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  }, [period, organizationId]);

  useFocusEffect(
    useCallback(() => {
      fetchPaymentSales();
    }, [fetchPaymentSales]),
  );

  const renderItem = ({ item }: { item: PaymentStats }) => (
    <View style={styles.card}>
      <View style={styles.iconBox}>
        <Text style={styles.iconText}>
          {item.method.toLowerCase().includes("cash") ? "💵" : "💳"}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.methodName}>
          {methodLabels[item.method.toLowerCase()] || item.method}
        </Text>
        <Text style={styles.subtext}>{item.count} Transactions</Text>
      </View>
      <View style={styles.amountBox}>
        <Text style={styles.amountText}>
          {currency.symbol}
          {item.totalRevenue.toLocaleString()}
        </Text>
      </View>
    </View>
  );

  // Calculate daily average
  const getDaysInPeriod = () => {
    if (period === "today") return 1;
    if (period === "week") return 7;
    if (period === "month") return 30;
    return 365;
  };

  const totalRev = stats.reduce((sum, s) => sum + s.totalRevenue, 0);
  const dailyAvg = totalRev / getDaysInPeriod();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payment Methods</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.filterBar}>
        {["today", "week", "month", "year"].map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setPeriod(p as any)}
            style={[styles.pill, period === p && styles.pillActive]}
          >
            <Text
              style={[styles.pillText, period === p && styles.pillTextActive]}
            >
              {p.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: 50 }}
        />
      ) : (
        <>
          <FlatList
            data={stats}
            keyExtractor={(item) => item.method}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={
              <Text style={styles.empty}>No payments recorded.</Text>
            }
          />

          {/* Summary Section */}
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <Text style={styles.footerLabel}>Total Revenue</Text>
              <Text style={styles.footerValue}>
                {currency.symbol}
                {totalRev.toLocaleString()}
              </Text>
            </View>
            <View style={styles.footerRow}>
              <Text style={styles.footerLabel}>Daily Average ({period})</Text>
              <Text style={styles.footerValue}>
                {currency.symbol}
                {dailyAvg.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </Text>
            </View>
          </View>
        </>
      )}
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
  back: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  filterBar: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: COLORS.white,
    gap: 8,
  },
  footer: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: 34, // Extra padding for bottom notches
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  footerLabel: {
    fontSize: 14,
    color: COLORS.secondary,
  },
  footerValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  pill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  pillActive: { backgroundColor: COLORS.primary },
  pillText: { fontSize: 10, color: COLORS.secondary, fontWeight: "bold" },
  pillTextActive: { color: COLORS.white },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  iconText: { fontSize: 20 },
  info: { flex: 1 },
  methodName: { fontSize: 15, fontWeight: "bold", color: COLORS.primary },
  subtext: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  amountBox: { alignItems: "flex-end" },
  amountText: { fontSize: 16, fontWeight: "bold", color: COLORS.accent },
  empty: { textAlign: "center", marginTop: 40, color: COLORS.secondary },
});
