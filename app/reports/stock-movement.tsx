import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
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

interface Transaction {
  id: string;
  created_at: string;
  type: string;
  quantity: number;
  products: {
    name: string;
    unit: string;
  } | null; // No array here, just the object or null
}

export default function StockMovementReport() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<Transaction[]>([]);
  // 'all' shows everything, otherwise we filter by source_type
  const [activeFilter, setActiveFilter] = useState("all");

  const fetchMovement = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("inventory_transactions")
        .select(
          `
          id,
          created_at,
          source_type,
          direction,
          quantity,
          products (name, unit)
        `,
        )
        .eq("organization_id", organizationId);

      // Apply filter only if it's not 'all'
      if (activeFilter !== "all") {
        query = query.eq("source_type", activeFilter);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const formattedData = (data || []).map((item: any) => ({
        ...item,
        type: item.source_type,
        products: Array.isArray(item.products)
          ? item.products[0]
          : item.products,
      })) as Transaction[];

      setLogs(formattedData);
    } catch (err) {
      console.error("Movement Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeFilter]); // Refetch whenever activeFilter changes

  useFocusEffect(
    useCallback(() => {
      fetchMovement();
    }, [fetchMovement]),
  );

  const renderItem = ({ item }: { item: any }) => {
    // Use the database direction if available, otherwise fallback to quantity
    const isInbound =
      item.direction === "in" ||
      (item.direction !== "out" && item.quantity > 0);

    const date = new Date(item.created_at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <View style={styles.card}>
        <View style={styles.dateBox}>
          <Text style={styles.dateText}>{date}</Text>
        </View>
        <View style={styles.mainInfo}>
          <Text style={styles.productName}>
            {item.products?.name || "Unknown Product"}
          </Text>
          {/* source_type tells us the context (SALE, ADJUSTMENT, etc) */}
          <Text style={styles.typeText}>
            {(item.source_type || "MOVE").toUpperCase()}
          </Text>
        </View>
        <View style={styles.quantityBox}>
          <Text
            style={[
              styles.quantityText,
              { color: isInbound ? COLORS.success : COLORS.danger },
            ]}
          >
            {isInbound ? "+" : "-"}
            {Math.abs(item.quantity)}
          </Text>
          <Text style={styles.unitText}>{item.products?.unit || "units"}</Text>
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
        <Text style={styles.title}>Stock Movement</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Horizontal Filter Bar */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={["all", "sale", "purchase", "adjustment", "transfer"]}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setActiveFilter(item)}
              style={[
                styles.filterTab,
                activeFilter === item && styles.filterTabActive,
              ]}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeFilter === item && styles.filterTabTextActive,
                ]}
              >
                {item.toUpperCase()}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={logs}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No recent movement found.</Text>
          }
        />
      )}
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
  card: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  dateBox: { width: 70 },
  dateText: { fontSize: 11, color: COLORS.secondary, textAlign: "left" },
  mainInfo: { flex: 1, paddingHorizontal: 8 },
  productName: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  typeText: {
    fontSize: 10,
    color: COLORS.secondary,
    marginTop: 2,
    letterSpacing: 1,
  },
  filterContainer: {
    backgroundColor: COLORS.white,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  filterTabTextActive: {
    color: COLORS.white,
  },
  quantityBox: { alignItems: "flex-end", width: 60 },
  quantityText: { fontSize: 16, fontWeight: "bold" },
  unitText: { fontSize: 10, color: COLORS.secondary },
  empty: { textAlign: "center", marginTop: 50, color: COLORS.secondary },
});
