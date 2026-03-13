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

interface CategoryStats {
  categoryId: string;
  name: string;
  unitsSold: number;
  revenue: number;
  profit: number;
  topProduct?: {
    name: string;
    revenue: number;
  };
}

type SortType = "units" | "revenue" | "profit";

export default function SalesByCategory() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">(
    "month",
  );
  const [sortBy, setSortBy] = useState<SortType>("revenue");
  const [categories, setCategories] = useState<CategoryStats[]>([]);
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

  const fetchCategorySales = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange(period);

      const { data, error } = await supabase
        .from("sale_items")
        .select(
          `
        quantity,
        unit_price,
        unit_cogs,
        products (
          name,
          category
        ),
        sales!inner (
          organization_id,
          created_at,
          voided_at
        )
      `,
        )
        .eq("sales.organization_id", organizationId)
        .is("sales.voided_at", null)
        .gte("sales.created_at", startDate)
        .lte("sales.created_at", endDate);

      if (error) throw error;

      const statsMap: Record<string, CategoryStats> = {};
      const productPerformance: Record<string, Record<string, number>> = {}; // { Category: { ProductName: Revenue } }

      data?.forEach((item: any) => {
        const categoryName = item.products?.category || "Uncategorized";
        const productName = item.products?.name || "Unknown Product";

        const qty = Number(item.quantity || 0);
        const rev = qty * Number(item.unit_price || 0);
        const cost = qty * Number(item.unit_cogs || 0);
        const profit = rev - cost;

        // 1. Update Category Totals
        if (!statsMap[categoryName]) {
          statsMap[categoryName] = {
            categoryId: categoryName,
            name: categoryName,
            unitsSold: 0,
            revenue: 0,
            profit: 0,
          };
          productPerformance[categoryName] = {};
        }

        statsMap[categoryName].unitsSold += qty;
        statsMap[categoryName].revenue += rev;
        statsMap[categoryName].profit += profit;

        // 2. Track Product Performance within this category
        productPerformance[categoryName][productName] =
          (productPerformance[categoryName][productName] || 0) + rev;
      });

      // 3. Determine the Top Product for each category
      const processed = Object.values(statsMap).map((cat) => {
        const productsInCategory = productPerformance[cat.name];
        const topProductName = Object.keys(productsInCategory).reduce((a, b) =>
          productsInCategory[a] > productsInCategory[b] ? a : b,
        );

        return {
          ...cat,
          topProduct: {
            name: topProductName,
            revenue: productsInCategory[topProductName],
          },
        };
      });

      // 4. Sort
      processed.sort((a, b) => {
        if (sortBy === "units") return b.unitsSold - a.unitsSold;
        if (sortBy === "revenue") return b.revenue - a.revenue;
        return b.profit - a.profit;
      });

      setCategories(processed);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [period, sortBy, organizationId]);

  useFocusEffect(
    useCallback(() => {
      fetchCategorySales();
    }, [fetchCategorySales]),
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
    item: CategoryStats;
    index: number;
  }) => {
    // Margin calculation: (Profit / Revenue) * 100
    const margin = item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0;

    return (
      <View style={styles.card}>
        <View style={styles.info}>
          <View style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.marginBadge}>
              <Text style={styles.marginText}>{margin.toFixed(0)}% Margin</Text>
            </View>
          </View>

          <Text style={styles.subtext}>
            {item.unitsSold} units • {currency.symbol}
            {item.profit.toLocaleString()} profit
          </Text>

          {item.topProduct && (
            <Text style={styles.topProductLabel}>
              Top Product:{" "}
              <Text style={{ fontWeight: "600" }}>{item.topProduct.name}</Text>
            </Text>
          )}
        </View>

        <View style={styles.valueBox}>
          <Text style={styles.mainValue}>
            {sortBy === "units"
              ? `${item.unitsSold}`
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
        <Text style={styles.title}>Sales by Category</Text>
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
          { key: "units", label: "By Units" },
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
          data={categories}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No category sales found.</Text>
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
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  marginBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  marginText: {
    color: "#2E7D32",
    fontSize: 10,
    fontWeight: "bold",
  },
  topProductLabel: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 6,
    fontStyle: "italic",
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
  rankText: { fontSize: 12, fontWeight: "bold", color: COLORS.primary },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  subtext: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  valueBox: { alignItems: "flex-end" },
  mainValue: { fontSize: 16, fontWeight: "bold", color: COLORS.accent },
  label: { fontSize: 9, color: COLORS.secondary, marginTop: 2 },
  empty: { textAlign: "center", marginTop: 40, color: COLORS.secondary },
});
