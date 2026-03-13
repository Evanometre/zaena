import { AntDesign } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { usePermissions } from "../../../context/PermissionsContext";
import { COLORS } from "../../../lib/colors";
import supabase from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

const STATUS_COLORS: Record<string, string> = {
  draft: "#e2e8f0",
  confirmed: "#dbeafe",
  in_progress: "#fef9c3",
  completed: "#d4edda",
  closed: "#d4edda",
  cancelled: "#f8d7da",
};

const STATUS_TEXT: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
};

export default function ProductionOrderListScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const canCreate = hasPermission("manufacturing.manage");

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [organizationId]),
  );

  async function fetchOrders() {
    if (!organizationId) return;
    setLoading(true);

    let query = supabase
      .from("production_orders")
      .select(
        `
        id, order_number, status, quantity_to_produce,
        started_at, completed_at, created_at,
        bom:bom_id (
          product:product_id (name, unit)
        ),
        location:location_id (name)
      `,
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (filterStatus) query = query.eq("status", filterStatus);

    const { data, error } = await query;
    if (!error) setOrders(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchOrders();
  }

  const statuses = ["draft", "confirmed", "in_progress", "closed", "cancelled"];

  if (permLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!hasPermission("manufacturing.read")) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🔐</Text>
        <Text style={styles.restrictedText}>Access Restricted</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrow-left" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Production Orders</Text>
        {canCreate ? (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push("/manufacturing/production/add" as any)}
          >
            <Text style={styles.addButtonText}>＋</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Status filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        <TouchableOpacity
          style={[styles.chip, !filterStatus && styles.chipActive]}
          onPress={() => {
            setFilterStatus(null);
            fetchOrders();
          }}
        >
          <Text
            style={[styles.chipText, !filterStatus && styles.chipTextActive]}
          >
            All
          </Text>
        </TouchableOpacity>
        {statuses.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, filterStatus === s && styles.chipActive]}
            onPress={() => {
              setFilterStatus(s);
              fetchOrders();
            }}
          >
            <Text
              style={[
                styles.chipText,
                filterStatus === s && styles.chipTextActive,
              ]}
            >
              {STATUS_TEXT[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing && (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 40 }}
          />
        )}

        {!loading && orders.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏭</Text>
            <Text style={styles.emptyTitle}>No production orders yet</Text>
            <Text style={styles.emptySubtitle}>
              Create a production order to start a manufacturing run. A
              production order records what you made, what raw materials you
              used, and what it cost you to make it.
            </Text>
            {canCreate && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() =>
                  router.push("/manufacturing/production/add" as any)
                }
              >
                <Text style={styles.emptyButtonText}>
                  Create Production Order
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {orders.map((order) => (
          <TouchableOpacity
            key={order.id}
            style={styles.orderCard}
            onPress={() =>
              router.push({
                pathname: "/manufacturing/production/[id]" as any,
                params: { id: order.id },
              })
            }
          >
            <View style={styles.orderCardHeader}>
              <Text style={styles.orderNumber}>
                {order.order_number ?? order.id.slice(0, 8).toUpperCase()}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: STATUS_COLORS[order.status] ?? "#eee" },
                ]}
              >
                <Text style={styles.statusText}>
                  {STATUS_TEXT[order.status] ?? order.status}
                </Text>
              </View>
            </View>

            <Text style={styles.productName} numberOfLines={1}>
              {order.bom?.product?.name ?? "Unknown Product"}
            </Text>

            <View style={styles.orderMeta}>
              <Text style={styles.metaText}>
                Qty: {order.quantity_to_produce} {order.bom?.product?.unit}
              </Text>
              <Text style={styles.metaText}>{order.location?.name ?? "—"}</Text>
              <Text style={styles.metaText}>
                {new Date(order.created_at).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.editHint}>Tap to view →</Text>
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 48,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  title: { fontSize: 20, fontWeight: "700", color: "#333" },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  filterRow: {
    maxHeight: 52,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    paddingVertical: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f9f9f9",
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: { fontSize: 13, fontWeight: "600", color: "#555" },
  chipTextActive: { color: "#fff" },
  scroll: { flex: 1, padding: 16 },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  orderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  orderNumber: { fontSize: 13, fontWeight: "700", color: "#8E8E93" },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: { fontSize: 11, fontWeight: "700", color: "#333" },
  productName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  orderMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  metaText: { fontSize: 12, color: "#999" },
  editHint: {
    fontSize: 11,
    color: COLORS.gray?.[400] ?? "#999",
    marginTop: 8,
    textAlign: "right",
  },
  emptyState: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  restrictedText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 16,
  },
  backLink: { fontSize: 15, color: COLORS.primary, fontWeight: "600" },
});
