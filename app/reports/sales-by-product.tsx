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

interface ProductSale {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
}

type SortType = "volume" | "revenue" | "profit";

export default function SalesByProduct() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">(
    "today",
  );
  const [sortBy, setSortBy] = useState<SortType>("volume");
  const [products, setProducts] = useState<ProductSale[]>([]);
  const [currency, setCurrency] = useState({ symbol: "₦", code: "NGN" });

  // 1. Load Currency (Consistent with your reference page)
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
        console.error("Currency load error:", err);
      }
    }
    loadOrgCurrency();
  }, [organizationId]);

  // 2. Fetch and Aggregate Data
  const fetchProductSales = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange(period);

      // We join with 'sales' to filter by date/org and 'products' to get the name
      const { data, error } = await supabase
        .from("sale_items")
        .select(
          `
    quantity,
    unit_price,
    unit_cogs,
    products ( name ),
    sales!inner ( created_at, organization_id ) 
  `,
        ) // Changed sale_date to created_at
        .eq("sales.organization_id", organizationId)
        .gte("sales.created_at", startDate) // Changed here too
        .lte("sales.created_at", endDate); // And here

      if (error) throw error;

      // Aggregate data by product name
      const statsMap: Record<string, ProductSale> = {};

      data?.forEach((item: any) => {
        // Use a fallback for the name just in case
        const name = item.products?.name || "Unknown Product";

        // Ensure we are parsing numbers correctly
        const qty = Number(item.quantity || 0);
        const price = Number(item.unit_price || 0);
        const cogs = Number(item.unit_cogs || 0);

        const rev = qty * price;
        const profit = rev - qty * cogs;

        if (!statsMap[name]) {
          statsMap[name] = {
            productId: name,
            name,
            quantity: 0,
            revenue: 0,
            profit: 0,
          };
        }

        statsMap[name].quantity += qty;
        statsMap[name].revenue += rev;
        statsMap[name].profit += profit;
      });

      const processed = Object.values(statsMap).sort((a, b) => {
        if (sortBy === "volume") return b.quantity - a.quantity;
        if (sortBy === "revenue") return b.revenue - a.revenue;
        return b.profit - a.profit;
      });

      setProducts(processed);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [period, sortBy, organizationId]);

  useFocusEffect(
    useCallback(() => {
      fetchProductSales();
    }, [fetchProductSales]),
  );

  // Helper: Date Logic
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
    item: ProductSale;
    index: number;
  }) => {
    // 1. Calculate the margin percentage safely
    const margin =
      item.revenue > 0 ? ((item.profit / item.revenue) * 100).toFixed(1) : "0";

    return (
      <View style={styles.productCard}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{index + 1}</Text>
        </View>

        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.productSubtext}>
            {item.quantity} units sold • {currency.symbol}
            {item.profit.toLocaleString()} profit
          </Text>

          {/* 2. Added Margin Badge/Text */}
          <Text
            style={[
              styles.marginText,
              { color: Number(margin) > 25 ? COLORS.success : COLORS.warning },
            ]}
          >
            {margin}% margin
          </Text>
        </View>

        <View style={styles.valueContainer}>
          <Text style={styles.mainValue}>
            {sortBy === "volume"
              ? `${item.quantity}`
              : `${currency.symbol}${item[sortBy].toLocaleString()}`}
          </Text>
          <Text style={styles.valueLabel}>{sortBy.toUpperCase()}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Top Products</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Period Selector */}
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
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sort Selector */}
      <View style={styles.sortContainer}>
        {(["volume", "revenue", "profit"] as SortType[]).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setSortBy(s)}
            style={[styles.sortTab, sortBy === s && styles.sortTabActive]}
          >
            <Text
              style={[
                styles.sortTabText,
                sortBy === s && styles.sortTabTextActive,
              ]}
            >
              By {s.charAt(0).toUpperCase() + s.slice(1)}
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
          data={products}
          keyExtractor={(item) => item.productId}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No sales data for this period.</Text>
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
  backButton: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },

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
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 12, color: COLORS.secondary, fontWeight: "600" },
  pillTextActive: { color: COLORS.white },

  sortContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  // Add this inside your styles object
  marginText: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    textTransform: "uppercase",
  },
  sortTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  sortTabActive: { borderBottomColor: COLORS.accent },
  sortTabText: { fontSize: 13, color: COLORS.secondary, fontWeight: "500" },
  sortTabTextActive: { color: COLORS.accent, fontWeight: "bold" },

  listContent: { padding: 16 },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rankText: { fontSize: 12, fontWeight: "bold", color: COLORS.primary },
  productInfo: { flex: 1 },
  productName: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  productSubtext: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  valueContainer: { alignItems: "flex-end" },
  mainValue: { fontSize: 16, fontWeight: "bold", color: COLORS.accent },
  valueLabel: { fontSize: 10, color: COLORS.secondary, marginTop: 2 },
  emptyText: { textAlign: "center", marginTop: 40, color: COLORS.secondary },
});
