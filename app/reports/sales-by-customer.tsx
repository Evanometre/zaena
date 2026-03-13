import { getOrganization } from "@/onboarding/services/organizationService";
import { ALL_CURRENCIES } from "@/onboarding/utility/timezoneCurrencyMap";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface CustomerStats {
  customerId: string;
  name: string;
  phone: string;
  orderCount: number; // Volume
  revenue: number;
  profit: number;
  lastSeen: string;
}

type SortType = "orders" | "revenue" | "profit";

export default function SalesByCustomer() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">(
    "month",
  );
  const [sortBy, setSortBy] = useState<SortType>("revenue");
  const [customers, setCustomers] = useState<CustomerStats[]>([]);
  const [currency, setCurrency] = useState({ symbol: "₦", code: "NGN" });

  // 1. Load Currency
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
          });
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadOrgCurrency();
  }, [organizationId]);

  // 2. Fetch and Aggregate Data
  const fetchCustomerSales = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange(period);

      const { data, error } = await supabase
        .from("sales")
        .select(
          `
    id,
    total_amount,
    total_cogs,
    customer_name,
    customer_id,
    customers ( name, phone ) 
  `,
        ) // Changed from 'contacts' to 'customers'
        .eq("organization_id", organizationId)
        .is("voided_at", null) // Using voided_at based on your view definition
        .gte("created_at", startDate)
        .lte("created_at", endDate);

      if (error) throw error;

      const statsMap: Record<string, CustomerStats> = {};

      data?.forEach((sale: any) => {
        // Use the ID from the customers join or the manual customer_id field
        const id = sale.customer_id || "walk-in";

        // Use the name from the joined customers table or the manual text field
        const name =
          sale.customers?.name || sale.customer_name || "Walk-in Customer";
        const phone = sale.customers?.phone || "";
        const saleDate = sale.created_at;

        const rev = Number(sale.total_amount || 0);
        const profit = rev - Number(sale.total_cogs || 0);

        if (!statsMap[id]) {
          statsMap[id] = {
            customerId: id,
            name,
            phone,
            orderCount: 0,
            revenue: 0,
            profit: 0,
            lastSeen: saleDate,
          };
        }

        statsMap[id].orderCount += 1;
        statsMap[id].revenue += rev;
        statsMap[id].profit += profit;

        // Keep the most recent date
        if (new Date(saleDate) > new Date(statsMap[id].lastSeen)) {
          statsMap[id].lastSeen = saleDate;
        }
      });

      const processed = Object.values(statsMap).sort((a, b) => {
        if (sortBy === "orders") return b.orderCount - a.orderCount;
        if (sortBy === "revenue") return b.revenue - a.revenue;
        return b.profit - a.profit;
      });

      setCustomers(processed);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [period, sortBy, organizationId]);

  useFocusEffect(
    useCallback(() => {
      fetchCustomerSales();
    }, [fetchCustomerSales]),
  );

  function getDateRange(p: string) {
    const now = new Date();
    let start = new Date();
    if (p === "today") start.setHours(0, 0, 0, 0);
    else if (p === "week") start.setDate(now.getDate() - 7);
    else if (p === "month") start.setMonth(now.getMonth() - 1);
    else start.setFullYear(now.getFullYear() - 1);
    return { startDate: start.toISOString(), endDate: now.toISOString() };
  }

  const handleWhatsApp = (phone: string, name: string) => {
    if (!phone) {
      Alert.alert("Error", "No phone number available for this customer.");
      return;
    }
    // Remove any non-numeric characters
    const cleanPhone = phone.replace(/\D/g, "");
    const message = `Hello ${name}, we noticed you haven't visited in a while. We have some new items we think you'd love!`;
    const url = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;

    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert("Error", "WhatsApp is not installed on this device.");
      }
    });
  };

  const handleCall = (phone: string) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const renderItem = ({
    item,
    index,
  }: {
    item: CustomerStats;
    index: number;
  }) => {
    const lastSeenDate = new Date(item.lastSeen);
    const today = new Date();
    const diffDays = Math.floor(
      (today.getTime() - lastSeenDate.getTime()) / (1000 * 3600 * 24),
    );
    const lastSeenText =
      diffDays === 0
        ? "Today"
        : diffDays === 1
          ? "Yesterday"
          : `${diffDays} days ago`;

    return (
      <View style={styles.card}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{index + 1}</Text>
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.subtext}>
            {item.orderCount} orders • {currency.symbol}
            {item.profit.toLocaleString()} profit
          </Text>
          <View style={styles.lastSeenRow}>
            <View style={styles.lastSeenBadge}>
              <Text style={styles.lastSeenText}>Last seen: {lastSeenText}</Text>
            </View>

            {/* Action Buttons */}
            {item.phone ? (
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  onPress={() => handleWhatsApp(item.phone, item.name)}
                  style={styles.iconBtn}
                >
                  <Text style={{ fontSize: 14 }}>💬</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleCall(item.phone)}
                  style={styles.iconBtn}
                >
                  <Text style={{ fontSize: 14 }}>📞</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.valueBox}>
          <Text style={styles.mainValue}>
            {sortBy === "orders"
              ? `${item.orderCount}`
              : `${currency.symbol}${item[sortBy].toLocaleString()}`}
          </Text>
          <Text style={styles.label}>{sortBy.toUpperCase()}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Customer Rankings</Text>
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

      <View style={styles.sortBar}>
        {[
          { key: "orders", label: "By Visits" },
          { key: "revenue", label: "By Spend" },
          { key: "profit", label: "By Profit" },
        ].map((s) => (
          <TouchableOpacity
            key={s.key}
            onPress={() => setSortBy(s.key as SortType)}
            style={[styles.tab, sortBy === s.key && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, sortBy === s.key && styles.tabTextActive]}
            >
              {s.label}
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
        <FlatList
          data={customers}
          keyExtractor={(item) => item.customerId}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No customer data found.</Text>
          }
        />
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
  lastSeenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  lastSeenBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: COLORS.background,
    borderRadius: 4,
  },
  lastSeenText: {
    fontSize: 10,
    color: COLORS.secondary,
    fontWeight: "500",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginRight: 8,
  },
  iconBtn: {
    padding: 4,
  },
  pill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  pillActive: { backgroundColor: COLORS.primary },
  pillText: { fontSize: 10, color: COLORS.secondary, fontWeight: "bold" },
  pillTextActive: { color: COLORS.white },
  sortBar: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: COLORS.accent },
  tabText: { fontSize: 13, color: COLORS.secondary },
  tabTextActive: { color: COLORS.accent, fontWeight: "bold" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 1,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rankText: { fontSize: 12, fontWeight: "bold", color: COLORS.primary },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  subtext: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  valueBox: { alignItems: "flex-end" },
  mainValue: { fontSize: 16, fontWeight: "bold", color: COLORS.accent },
  label: { fontSize: 9, color: COLORS.secondary, marginTop: 2 },
  empty: { textAlign: "center", marginTop: 40, color: COLORS.secondary },
});
