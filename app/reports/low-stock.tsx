import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity_on_hand: number;
  unit: string;
}

interface StockHistory {
  id: string;
  created_at: string;
  source_type: string;
  quantity: number;
  direction: "in" | "out";
}

export default function LowStockReport() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [threshold, setThreshold] = useState(10);
  const [selectedProduct, setSelectedProduct] = useState<LowStockItem | null>(
    null,
  );
  const [history, setHistory] = useState<StockHistory[]>([]);
  const [fetchingHistory, setFetchingHistory] = useState(false); // Default threshold

  const fetchLowStock = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select(
          `
        id,
        name,
        sku,
        category,
        unit,
        inventory!inner (
          quantity_on_hand
        )
      `,
        )
        .eq("organization_id", organizationId)
        // Filter based on the 'inventory' table's column
        .lte("inventory.quantity_on_hand", threshold)
        .order("name");

      if (error) throw error;

      const flattened = data.map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        unit: p.unit,
        // Map 'inventory' to our state
        quantity_on_hand:
          p.inventory?.reduce(
            (acc: number, curr: any) => acc + Number(curr.quantity_on_hand),
            0,
          ) || 0,
      }));

      setItems(
        flattened.sort((a, b) => a.quantity_on_hand - b.quantity_on_hand),
      );
    } catch (err) {
      console.error("Low Stock Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, threshold]);

  const fetchProductHistory = async (product: LowStockItem) => {
    setSelectedProduct(product);
    setFetchingHistory(true);
    try {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select("id, created_at, source_type, quantity, direction")
        .eq("product_id", product.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setHistory((data as StockHistory[]) || []);
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setFetchingHistory(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchLowStock();
    }, [fetchLowStock]),
  );

  const renderItem = ({ item }: { item: LowStockItem }) => {
    const isOutOfStock = item.quantity_on_hand <= 0;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => fetchProductHistory(item)}
      >
        <View
          style={[
            styles.indicator,
            { backgroundColor: isOutOfStock ? COLORS.danger : COLORS.warning },
          ]}
        />
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.sku}>
            SKU: {item.sku || "N/A"} • {item.category}
          </Text>
        </View>
        <View style={styles.stockBox}>
          <Text
            style={[
              styles.stockValue,
              { color: isOutOfStock ? COLORS.danger : COLORS.warning },
            ]}
          >
            {item.quantity_on_hand}
          </Text>
          <Text style={styles.unit}>{item.unit || "units"}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Low Stock Alerts</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Threshold Selector */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Show items with stock less than:</Text>
        <View style={styles.pillContainer}>
          {[5, 10, 20, 50].map((val) => (
            <TouchableOpacity
              key={val}
              onPress={() => setThreshold(val)}
              style={[styles.pill, threshold === val && styles.pillActive]}
            >
              <Text
                style={[
                  styles.pillText,
                  threshold === val && styles.pillTextActive,
                ]}
              >
                {val}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                ✅ All items are well stocked!
              </Text>
            </View>
          }
        />
      )}
      <Modal
        visible={!!selectedProduct}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedProduct(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedProduct?.name}</Text>
              <TouchableOpacity onPress={() => setSelectedProduct(null)}>
                <Text style={styles.closeBtn}>Close</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.historyLabel}>Recent Activity</Text>

            {fetchingHistory ? (
              <ActivityIndicator
                color={COLORS.primary}
                style={{ margin: 20 }}
              />
            ) : (
              history.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <View>
                    <Text style={styles.historyType}>
                      {item.source_type.toUpperCase()}
                    </Text>
                    <Text style={styles.historyDate}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.historyQty,
                      {
                        color:
                          item.direction === "in"
                            ? COLORS.success
                            : COLORS.danger,
                      },
                    ]}
                  >
                    {item.direction === "in" ? "+" : "-"}
                    {Math.abs(item.quantity)}
                  </Text>
                </View>
              ))
            )}

            {history.length === 0 && !fetchingHistory && (
              <Text style={styles.noHistory}>
                No recent transactions found.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

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
  filterSection: {
    padding: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterLabel: {
    fontSize: 12,
    color: COLORS.secondary,
    marginBottom: 8,
    fontWeight: "600",
  },
  pillContainer: { flexDirection: "row", gap: 8 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 13, color: COLORS.secondary },
  pillTextActive: { color: COLORS.white, fontWeight: "bold" },
  card: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    elevation: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  closeBtn: { color: COLORS.accent, fontWeight: "600" },
  historyLabel: {
    fontSize: 14,
    color: COLORS.secondary,
    marginBottom: 12,
    fontWeight: "600",
  },
  historyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  historyType: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
  historyDate: { fontSize: 11, color: COLORS.secondary },
  historyQty: { fontSize: 14, fontWeight: "bold" },
  noHistory: { textAlign: "center", marginTop: 20, color: COLORS.secondary },
  indicator: { width: 6 },
  info: { flex: 1, padding: 16 },
  name: { fontSize: 16, fontWeight: "bold", color: COLORS.primary },
  sku: { fontSize: 12, color: COLORS.secondary, marginTop: 4 },
  stockBox: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  stockValue: { fontSize: 20, fontWeight: "bold" },
  unit: { fontSize: 10, color: COLORS.secondary, textTransform: "uppercase" },
  empty: { alignItems: "center", marginTop: 100 },
  emptyText: { fontSize: 16, color: COLORS.success, fontWeight: "600" },
});
