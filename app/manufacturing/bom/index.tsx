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

export default function BOMListScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();
  const [boms, setBoms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const canCreate = hasPermission("manufacturing.manage");

  useFocusEffect(
    useCallback(() => {
      fetchBOMs();
    }, [organizationId]),
  );

  async function fetchBOMs() {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("bill_of_materials")
      .select(
        `
        id,
        name,
        is_active,
        created_at,
        product:product_id (
          id,
          name,
          unit,
          category
        ),
        bom_ingredients (count)
      `,
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (!error) setBoms(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchBOMs();
  }

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
        <Text style={styles.title}>Bill of Materials</Text>
        {canCreate ? (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push("/manufacturing/bom/add" as any)}
          >
            <Text style={styles.addButtonText}>＋</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

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

        {!loading && boms.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🧪</Text>
            <Text style={styles.emptyTitle}>No BOMs yet</Text>
            <Text style={styles.emptySubtitle}>
              A recipe/Bill of Materials tells the system what raw materials go
              into making each product, and how much of each material is needed.
            </Text>
            {canCreate && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push("/manufacturing/bom/add" as any)}
              >
                <Text style={styles.emptyButtonText}>Create First BOM</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {boms.map((bom) => (
          <TouchableOpacity
            key={bom.id}
            style={styles.bomCard}
            onPress={() =>
              router.push({
                pathname: "/manufacturing/bom/[id]" as any,
                params: { id: bom.id },
              })
            }
          >
            <View style={styles.bomCardHeader}>
              <Text style={styles.bomProductName} numberOfLines={1}>
                {bom.product?.name ?? "Unknown Product"}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  bom.is_active ? styles.activeBadge : styles.inactiveBadge,
                ]}
              >
                <Text style={styles.statusText}>
                  {bom.is_active ? "Active" : "Inactive"}
                </Text>
              </View>
            </View>

            {bom.name && <Text style={styles.bomName}>{bom.name}</Text>}

            <View style={styles.bomMeta}>
              <Text style={styles.bomMetaText}>
                {bom.product?.category ?? "Uncategorized"}
              </Text>
              <Text style={styles.bomMetaText}>
                {bom.bom_ingredients?.[0]?.count ?? 0} ingredient
                {bom.bom_ingredients?.[0]?.count !== 1 ? "s" : ""}
              </Text>
              <Text style={styles.bomMetaText}>
                Unit: {bom.product?.unit ?? "pcs"}
              </Text>
            </View>
            <Text style={styles.editHint}>Tap to view / edit →</Text>
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
  scroll: { flex: 1, padding: 16 },
  bomCard: {
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
  bomCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  bomProductName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    flex: 1,
    marginRight: 8,
  },
  bomName: {
    fontSize: 13,
    color: "#666",
    marginBottom: 8,
    fontStyle: "italic",
  },
  bomMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    marginTop: 4,
  },
  bomMetaText: { fontSize: 12, color: "#999" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  activeBadge: { backgroundColor: "#d4edda" },
  inactiveBadge: { backgroundColor: "#f8d7da" },
  statusText: { fontSize: 10, fontWeight: "600", color: "#333" },
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
  backLink: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "600",
  },
});
