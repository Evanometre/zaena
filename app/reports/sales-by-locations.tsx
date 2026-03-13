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

interface LocationStats {
  locationId: string;
  name: string;
  orderCount: number;
  revenue: number;
  profit: number;
}

type SortType = "orders" | "revenue" | "profit";

export default function SalesByLocation() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">(
    "month",
  );
  const [sortBy, setSortBy] = useState<SortType>("revenue");
  const [locations, setLocations] = useState<LocationStats[]>([]);
  const [currency, setCurrency] = useState({ symbol: "₦", code: "NGN" });

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

  const fetchLocationSales = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange(period);

      // Fetch sales joined with location names
      const { data, error } = await supabase
        .from("sales")
        .select(
          `
                    id,
                    total_amount,
                    total_cogs,
                    location_id,
                    locations ( name )
                `,
        )
        .eq("organization_id", organizationId)
        .is("voided_at", null)
        .gte("created_at", startDate)
        .lte("created_at", endDate);

      if (error) throw error;

      const statsMap: Record<string, LocationStats> = {};

      data?.forEach((sale: any) => {
        const id = sale.location_id || "unknown";
        const name = sale.locations?.name || "Unassigned Location";

        const rev = Number(sale.total_amount || 0);
        const profit = rev - Number(sale.total_cogs || 0);

        if (!statsMap[id]) {
          statsMap[id] = {
            locationId: id,
            name,
            orderCount: 0,
            revenue: 0,
            profit: 0,
          };
        }

        statsMap[id].orderCount += 1;
        statsMap[id].revenue += rev;
        statsMap[id].profit += profit;
      });

      const processed = Object.values(statsMap).sort((a, b) => {
        if (sortBy === "orders") return b.orderCount - a.orderCount;
        if (sortBy === "revenue") return b.revenue - a.revenue;
        return b.profit - a.profit;
      });

      setLocations(processed);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [period, sortBy, organizationId]);

  useFocusEffect(
    useCallback(() => {
      fetchLocationSales();
    }, [fetchLocationSales]),
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

  const renderItem = ({
    item,
    index,
  }: {
    item: LocationStats;
    index: number;
  }) => (
    <View style={styles.card}>
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>{index + 1}</Text>
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.subtext}>
          {item.orderCount} sales • {currency.symbol}
          {item.profit.toLocaleString()} profit
        </Text>

        {/* New Drill-down Button */}
        <TouchableOpacity
          style={styles.detailBtn}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/sales", // Adjust to your actual sales list path
              params: {
                location_id: item.locationId,
                location_name: item.name,
                period: period,
              },
            })
          }
        >
          <Text style={styles.detailBtnText}>View Transactions ›</Text>
        </TouchableOpacity>
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sales by Location</Text>
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
          { key: "orders", label: "By Volume" },
          { key: "revenue", label: "By Revenue" },
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
          data={locations}
          keyExtractor={(item) => item.locationId}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No location data found.</Text>
          }
        />
      )}
    </View>
  );
}

// Reusing your consistent styling
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
  detailBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  detailBtnText: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: "600",
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
