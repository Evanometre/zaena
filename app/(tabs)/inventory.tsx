// FILE: app/(tabs)/inventory.tsx
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { AntDesign, Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { PermissionGuard } from "../../context/PermissionGuard";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface InventoryItem {
  product_id: string;
  location_id: string;
  quantity_on_hand: number;
  weighted_avg_cost: number;
  products: {
    name: string;
    sku: string;
    unit: string;
    category: string;
  };
  locations: {
    name: string;
  };
}

interface UnifiedInventory {
  product_id: string;
  product_name: string;
  sku: string;
  unit: string;
  category: string;
  total_quantity: number;
  avg_cost: number;
  total_value: number;
  locations: { location_name: string; quantity: number }[];
  low_stock_locations: string[];
}

export default function InventoryScreen() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"location" | "unified">("location");
  const params = useLocalSearchParams();
  const urlFilter = params.filter as string | undefined;
  const [showOnlyLowStock, setShowOnlyLowStock] = useState(
    urlFilter === "low_stock",
  );
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const router = useRouter();
  const { hasPermission } = usePermissions();

  useFocusEffect(
    useCallback(() => {
      fetchInventory();
    }, []),
  );

  useEffect(() => {
    if (urlFilter === "low_stock") {
      setShowOnlyLowStock(true);
    } else {
      setShowOnlyLowStock(false);
    }
  }, [urlFilter]);

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

  async function fetchInventory() {
    setLoading(true);
    try {
      const cacheKey = `inventory_${organizationId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setInventory(JSON.parse(cached));
        setLoading(false);
      }

      const { data, error } = await supabase
        .from("inventory")
        .select("*, products (name, sku, unit, category), locations (name)")
        .order("quantity_on_hand", { ascending: false });

      if (error) throw error;
      setInventory(data || []);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data || []));
    } catch (err) {
      console.error("Inventory fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchInventory();
  }

  // Calculate unified inventory view
  function getUnifiedInventory(): UnifiedInventory[] {
    const productMap = new Map<string, UnifiedInventory>();

    inventory.forEach((item) => {
      if (!productMap.has(item.product_id)) {
        productMap.set(item.product_id, {
          product_id: item.product_id,
          product_name: item.products.name,
          sku: item.products.sku,
          unit: item.products.unit,
          category: item.products.category,
          total_quantity: 0,
          avg_cost: 0,
          total_value: 0,
          locations: [],
          low_stock_locations: [],
        });
      }

      const unified = productMap.get(item.product_id)!;
      unified.total_quantity += item.quantity_on_hand;
      unified.total_value += item.quantity_on_hand * item.weighted_avg_cost;
      unified.locations.push({
        location_name: item.locations.name,
        quantity: item.quantity_on_hand,
      });

      if (item.quantity_on_hand < 10) {
        unified.low_stock_locations.push(item.locations.name);
      }
    });

    // Calculate weighted average cost
    productMap.forEach((product) => {
      if (product.total_quantity > 0) {
        product.avg_cost = product.total_value / product.total_quantity;
      }
    });

    return Array.from(productMap.values()).sort(
      (a, b) => b.total_quantity - a.total_quantity,
    );
  }

  const unifiedInventory = getUnifiedInventory();
  const filteredInventory = inventory.filter((item) => {
    const matchesSearch = item.products.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesLowStock = !showOnlyLowStock || item.quantity_on_hand < 10;
    return matchesSearch && matchesLowStock;
  });

  const filteredUnified = unifiedInventory.filter((item) => {
    const matchesSearch = item.product_name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesLowStock =
      !showOnlyLowStock || item.low_stock_locations.length > 0;
    return matchesSearch && matchesLowStock;
  });

  const totalValue = inventory.reduce(
    (sum, item) => sum + item.quantity_on_hand * item.weighted_avg_cost,
    0,
  );

  const lowStockCount = inventory.filter(
    (item) => item.quantity_on_hand < 10,
  ).length;

  const uniqueProducts = new Set(inventory.map((item) => item.product_id)).size;
  // Determine if card should be clickable
  const canAdjust = hasPermission("inventory.adjust");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>

        <TouchableOpacity
          onPress={() => router.push("/more" as any)}
          style={styles.moreButton}
        >
          <AntDesign name="menu" size={20} color={COLORS.gray[600]} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{uniqueProducts}</Text>
          <Text style={styles.statLabel}>Products</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: COLORS.secondary }]}>
            {lowStockCount}
          </Text>
          <Text style={styles.statLabel}>Low Stock</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {currency.symbol}
            {totalValue.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Total Value</Text>
        </View>
      </View>

      {/* View Mode Toggle */}
      <View style={styles.viewToggleContainer}>
        <TouchableOpacity
          style={[
            styles.viewToggleButton,
            viewMode === "location" && styles.viewToggleButtonActive,
          ]}
          onPress={() => setViewMode("location")}
        >
          <Text
            style={[
              styles.viewToggleText,
              viewMode === "location" && styles.viewToggleTextActive,
            ]}
          >
            📍 By Location
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.viewToggleButton,
            viewMode === "unified" && styles.viewToggleButtonActive,
          ]}
          onPress={() => setViewMode("unified")}
        >
          <Text
            style={[
              styles.viewToggleText,
              viewMode === "unified" && styles.viewToggleTextActive,
            ]}
          >
            📊 Unified View
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active Filter Banner */}
      {showOnlyLowStock && (
        <View style={styles.activeFilterBanner}>
          <Text style={styles.activeFilterText}>
            📍 Showing Low Stock Items Only
          </Text>
          <TouchableOpacity
            onPress={() => {
              setShowOnlyLowStock(false);
              router.replace("/inventory");
            }}
          >
            <Text style={styles.clearFilterText}>Clear ✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Action Buttons - Only show if user can adjust */}
      <PermissionGuard permission="inventory.adjust">
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push("/inventory/adjust")}
          >
            <Text style={styles.addButtonText}>+ Adjust Inventory</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bulkButton}
            onPress={() => router.push("/inventory/bulk-adjust")}
          >
            <Text style={styles.bulkButtonText}>Bulk Adjust</Text>
          </TouchableOpacity>
        </View>
      </PermissionGuard>

      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing && (
          <ActivityIndicator size="large" color={COLORS.primary} />
        )}

        {/* Location View */}
        {viewMode === "location" && (
          <>
            {filteredInventory.length === 0 && !loading && (
              <View style={styles.emptyState}>
                <Feather
                  name="box"
                  size={48}
                  color="#6b7280"
                  style={styles.emptyIcon}
                />
                <Text style={styles.emptyText}>No inventory records</Text>
                <Text style={styles.emptySubtext}>
                  {canAdjust
                    ? "Add products and adjust inventory to get started"
                    : "No inventory items found"}
                </Text>
              </View>
            )}

            {filteredInventory.map((item) => {
              const isLowStock = item.quantity_on_hand < 10;
              const stockValue = item.quantity_on_hand * item.weighted_avg_cost;

              return (
                <TouchableOpacity
                  key={`${item.product_id}-${item.location_id}`}
                  style={[
                    styles.inventoryCard,
                    !canAdjust && styles.inventoryCardReadOnly,
                  ]}
                  onPress={() => {
                    if (canAdjust) {
                      router.push({
                        pathname: "/inventory/adjust",
                        params: { productId: item.product_id },
                      });
                    }
                  }}
                  activeOpacity={canAdjust ? 0.7 : 1}
                >
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName}>
                        {item.products.name}
                      </Text>
                      <Text style={styles.location}>
                        📍 {item.locations.name}
                      </Text>
                    </View>
                    {isLowStock && (
                      <View style={styles.lowStockBadge}>
                        <Text style={styles.lowStockText}>Low Stock</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.cardBody}>
                    <View style={styles.quantityContainer}>
                      <Text style={styles.quantityNumber}>
                        {item.quantity_on_hand}
                      </Text>
                      <Text style={styles.quantityUnit}>
                        {item.products.unit}
                      </Text>
                    </View>

                    <View style={styles.infoContainer}>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Avg Cost:</Text>
                        <Text style={styles.infoValue}>
                          {currency.symbol}
                          {item.weighted_avg_cost.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Stock Value:</Text>
                        <Text style={styles.infoValue}>
                          {currency.symbol}
                          {stockValue.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Show hint if read-only */}
                  {!canAdjust && (
                    <View style={styles.readOnlyHint}>
                      <Text style={styles.readOnlyHintText}>👁️ View only</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Unified View */}
        {viewMode === "unified" && (
          <>
            {filteredUnified.length === 0 && !loading && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📦</Text>
                <Text style={styles.emptyText}>No inventory records</Text>
              </View>
            )}

            {filteredUnified.map((item) => {
              const hasLowStock = item.low_stock_locations.length > 0;

              return (
                <TouchableOpacity
                  key={item.product_id}
                  style={[
                    styles.inventoryCard,
                    !canAdjust && styles.inventoryCardReadOnly,
                  ]}
                  onPress={() => {
                    if (canAdjust) {
                      router.push({
                        pathname: "/inventory/adjust",
                        params: { productId: item.product_id },
                      });
                    }
                  }}
                  activeOpacity={canAdjust ? 0.7 : 1}
                >
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName}>
                        {item.product_name}
                      </Text>
                      <Text style={styles.unifiedLocations}>
                        📍 {item.locations.length} location(s)
                      </Text>
                    </View>
                    {hasLowStock && (
                      <View style={styles.lowStockBadge}>
                        <Text style={styles.lowStockText}>
                          Low at {item.low_stock_locations.length}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.cardBody}>
                    <View style={styles.quantityContainer}>
                      <Text style={styles.quantityNumber}>
                        {item.total_quantity}
                      </Text>
                      <Text style={styles.quantityUnit}>{item.unit}</Text>
                    </View>

                    <View style={styles.infoContainer}>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Avg Cost:</Text>
                        <Text style={styles.infoValue}>
                          {currency.symbol}
                          {item.avg_cost.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Total Value:</Text>
                        <Text style={styles.infoValue}>
                          {currency.symbol}
                          {item.total_value.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Location Breakdown */}
                  <View style={styles.locationBreakdown}>
                    {item.locations.map((loc, idx) => (
                      <View key={idx} style={styles.locationBreakdownItem}>
                        <Text style={styles.locationBreakdownName}>
                          {loc.location_name}:
                        </Text>
                        <Text style={styles.locationBreakdownQty}>
                          {loc.quantity} {item.unit}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Show hint if read-only */}
                  {!canAdjust && (
                    <View style={styles.readOnlyHint}>
                      <Text style={styles.readOnlyHintText}>👁️ View only</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}
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
  title: { fontSize: 24, fontWeight: "bold", color: COLORS.primary },
  statsRow: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  statLabel: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },

  viewToggleContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  moreButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  viewToggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  viewToggleButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  viewToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  viewToggleTextActive: {
    color: COLORS.white,
  },

  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  addButton: {
    backgroundColor: COLORS.accent,
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  bulkButton: {
    backgroundColor: COLORS.primary,
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  addButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
  bulkButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
  list: { flex: 1, paddingHorizontal: 16 },
  inventoryCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  inventoryCardReadOnly: {
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  productName: { fontSize: 16, fontWeight: "600", color: COLORS.gray[900] },
  location: { fontSize: 12, color: COLORS.gray[500], marginTop: 4 },
  unifiedLocations: {
    fontSize: 12,
    color: COLORS.accent,
    marginTop: 4,
    fontWeight: "500",
  },
  lowStockBadge: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  lowStockText: { fontSize: 10, fontWeight: "600", color: COLORS.white },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[200],
  },
  quantityContainer: {
    alignItems: "center",
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: COLORS.gray[200],
  },
  quantityNumber: { fontSize: 28, fontWeight: "bold", color: COLORS.primary },
  quantityUnit: { fontSize: 12, color: COLORS.gray[500], marginTop: 2 },
  infoContainer: { flex: 1, paddingLeft: 16 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  infoLabel: { fontSize: 13, color: COLORS.gray[600] },
  infoValue: { fontSize: 13, fontWeight: "600", color: COLORS.gray[900] },

  locationBreakdown: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[200],
  },
  locationBreakdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  locationBreakdownName: {
    fontSize: 12,
    color: COLORS.gray[600],
  },
  locationBreakdownQty: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
  },

  readOnlyHint: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[200],
    alignItems: "center",
  },
  readOnlyHintText: {
    fontSize: 11,
    color: COLORS.gray[500],
    fontStyle: "italic",
  },

  emptyState: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.gray[600],
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.gray[500],
    textAlign: "center",
  },
  activeFilterBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  activeFilterText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#92400E",
  },
  clearFilterText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
  },
});
