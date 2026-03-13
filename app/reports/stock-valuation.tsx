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

interface StockItem {
  product_name: string;
  category: string;
  quantity: number;
  unit_cost: number;
  total_value: number;
}

interface StockData {
  totalItems: number;
  totalValue: number;
  lowStockCount: number;
  categoryBreakdown: {
    category: string;
    value: number;
    percentage: number;
  }[];
  items: StockItem[];
}

interface InventoryWithProduct {
  quantity_on_hand: number;
  unit_cost: number;
  products:
    | {
        name: string;
        category: string;
      }
    | {
        name: string;
        category: string;
      }[];
}

export default function StockValuationReport() {
  const router = useRouter();
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StockData | null>(null);
  const [sortBy, setSortBy] = useState<"value" | "quantity">("value");

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [sortBy]),
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

      // Get inventory with product details
      const { data: inventoryData } = await supabase
        .from("inventory")
        .select(
          `
        quantity_on_hand,
        unit_cost,
        products (
          name,
          category
        )
      `,
        )
        .eq("organization_id", profile.organization_id);

      if (!inventoryData) {
        setData({
          totalItems: 0,
          totalValue: 0,
          lowStockCount: 0,
          categoryBreakdown: [],
          items: [],
        });
        setLoading(false);
        return;
      }

      // Process inventory data - handle both array and single object responses
      const items: StockItem[] = inventoryData
        .filter((inv) => inv.quantity_on_hand > 0)
        .map((inv) => {
          // Supabase might return products as array or object, handle both
          const product = Array.isArray(inv.products)
            ? inv.products[0]
            : inv.products;

          return {
            product_name: product?.name || "Unknown",
            category: product?.category || "Uncategorized",
            quantity: inv.quantity_on_hand,
            unit_cost: inv.unit_cost || 0,
            total_value: inv.quantity_on_hand * (inv.unit_cost || 0),
          };
        });

      // Sort items
      if (sortBy === "value") {
        items.sort((a, b) => b.total_value - a.total_value);
      } else {
        items.sort((a, b) => b.quantity - a.quantity);
      }

      const totalValue = items.reduce((sum, item) => sum + item.total_value, 0);
      const lowStockCount = inventoryData.filter(
        (inv) => inv.quantity_on_hand < 10,
      ).length;

      // Category breakdown
      const categoryMap: { [key: string]: number } = {};
      items.forEach((item) => {
        if (!categoryMap[item.category]) {
          categoryMap[item.category] = 0;
        }
        categoryMap[item.category] += item.total_value;
      });

      const categoryBreakdown = Object.entries(categoryMap)
        .map(([category, value]) => ({
          category,
          value,
          percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);

      setData({
        totalItems: items.length,
        totalValue,
        lowStockCount,
        categoryBreakdown,
        items,
      });
    } catch (err: any) {
      console.error("Error fetching stock valuation:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Stock Valuation</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <TouchableOpacity
          style={[
            styles.sortButton,
            sortBy === "value" && styles.sortButtonActive,
          ]}
          onPress={() => setSortBy("value")}
        >
          <Text
            style={[
              styles.sortText,
              sortBy === "value" && styles.sortTextActive,
            ]}
          >
            Value
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sortButton,
            sortBy === "quantity" && styles.sortButtonActive,
          ]}
          onPress={() => setSortBy("quantity")}
        >
          <Text
            style={[
              styles.sortText,
              sortBy === "quantity" && styles.sortTextActive,
            ]}
          >
            Quantity
          </Text>
        </TouchableOpacity>
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
            {/* Total Valuation Card */}
            <View style={styles.valuationCard}>
              <Text style={styles.valuationLabel}>Total Stock Value</Text>
              <Text style={styles.valuationAmount}>
                {currency.symbol}
                {data.totalValue.toLocaleString()}
              </Text>
              <Text style={styles.valuationSubtext}>
                {data.totalItems} items • {data.lowStockCount} low stock
              </Text>
            </View>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{data.totalItems}</Text>
                <Text style={styles.statLabel}>Total Items</Text>
              </View>
              <View style={styles.statCard}>
                <View style={styles.statBadge}>
                  <Text style={styles.statBadgeText}>{data.lowStockCount}</Text>
                </View>
                <Text style={styles.statLabel}>Low Stock</Text>
              </View>
            </View>

            {/* Category Breakdown */}
            {data.categoryBreakdown.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Value by Category</Text>
                {data.categoryBreakdown.map((cat) => (
                  <View key={cat.category} style={styles.categoryCard}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryName}>{cat.category}</Text>
                      <Text style={styles.categoryValue}>
                        {currency.symbol}
                        {cat.value.toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${Math.min(cat.percentage, 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.categoryPercentage}>
                      {cat.percentage.toFixed(1)}% of total
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Items List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Stock Items ({data.items.length})
              </Text>
              {data.items.map((item, index) => (
                <View key={index} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName}>{item.product_name}</Text>
                    <Text style={styles.itemValue}>
                      {currency.symbol}
                      {item.total_value.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.itemDetails}>
                    <Text style={styles.itemCategory}>📁 {item.category}</Text>
                    <Text style={styles.itemQuantity}>
                      {item.quantity} units × {currency.symbol}
                      {item.unit_cost.toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))}

              {data.items.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>📦</Text>
                  <Text style={styles.emptyText}>No stock items found</Text>
                </View>
              )}
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

  sortContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  sortLabel: { fontSize: 14, color: COLORS.secondary, marginRight: 4 },
  sortButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.background,
  },
  sortButtonActive: { backgroundColor: COLORS.primary },
  sortText: { fontSize: 13, fontWeight: "600", color: COLORS.secondary },
  sortTextActive: { color: COLORS.white },

  content: { flex: 1, padding: 16 },

  valuationCard: {
    backgroundColor: COLORS.primary,
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  valuationLabel: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  valuationAmount: {
    fontSize: 36,
    fontWeight: "bold",
    color: COLORS.white,
    marginTop: 8,
  },
  valuationSubtext: {
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
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: "bold", color: COLORS.primary },
  statLabel: { fontSize: 12, color: COLORS.secondary, marginTop: 4 },
  statBadge: {
    backgroundColor: COLORS.warning,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 4,
  },
  statBadgeText: { fontSize: 20, fontWeight: "bold", color: COLORS.white },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },

  categoryCard: {
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  categoryName: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  categoryValue: { fontSize: 15, fontWeight: "bold", color: COLORS.accent },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.background,
    borderRadius: 3,
    marginBottom: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.accent,
    borderRadius: 3,
  },
  categoryPercentage: { fontSize: 12, color: COLORS.secondary },

  itemCard: {
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  itemName: { fontSize: 15, fontWeight: "600", color: COLORS.primary, flex: 1 },
  itemValue: { fontSize: 15, fontWeight: "bold", color: COLORS.accent },
  itemDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  itemCategory: { fontSize: 13, color: COLORS.secondary },
  itemQuantity: { fontSize: 13, color: COLORS.secondary },

  emptyState: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 16, color: COLORS.secondary },
});
