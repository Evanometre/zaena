// FILE: app/products/index.tsx
import { AntDesign } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
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
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

export default function ProductsScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();
  const router = useRouter();

  const canCreate = hasPermission("products.create");
  const canEdit = hasPermission("products.update");

  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [organizationId]),
  );

  async function fetchProducts() {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      // ── Show cache immediately ──────────────────────────
      const cacheKey = `products_${organizationId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setProducts(JSON.parse(cached));
        setLoading(false);
      }

      // ── Fetch fresh ─────────────────────────────────────
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true });

      if (error) {
        setError(error.message);
      } else {
        setProducts(data ?? []);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(data ?? []));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }
  async function onRefresh() {
    setRefreshing(true);
    await fetchProducts();
  }

  const filtered = products.filter((p) =>
    search.trim()
      ? p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku?.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  // ── Guards ─────────────────────────────────
  if (permLoading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!hasPermission("products.read")) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerButton}
          >
            <AntDesign name="arrow-left" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Products</Text>
          <View style={{ width: 40 }} />
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 40,
          }}
        >
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔐</Text>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "600",
              color: "#374151",
              marginBottom: 8,
            }}
          >
            Access Restricted
          </Text>
          <Text style={{ fontSize: 14, color: "#9CA3AF", textAlign: "center" }}>
            You do not have permission to view products.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <AntDesign name="arrow-left" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Products</Text>
        {canCreate ? (
          <TouchableOpacity
            style={styles.addIconButton}
            onPress={() => router.push("/products/add")}
          >
            <Text style={styles.addIconText}>＋</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>⚠️ Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{products.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {products.filter((p) => p.is_active).length}
          </Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {products.filter((p) => !p.is_active).length}
          </Text>
          <Text style={styles.statLabel}>Inactive</Text>
        </View>
      </View>

      {/* Quick actions — only relevant ones based on permissions */}
      <View style={styles.actionRow}>
        {canCreate && (
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryAction]}
            onPress={() => router.push("/products/add")}
          >
            <Text style={styles.actionText}>Add Product</Text>
          </TouchableOpacity>
        )}
        {hasPermission("suppliers.read") && (
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryAction]}
            onPress={() => router.push("/suppliers")}
          >
            <Text style={styles.secondaryText}>Suppliers</Text>
          </TouchableOpacity>
        )}
        {hasPermission("inventory.adjust") && (
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryAction]}
            onPress={() => router.push("/inventory/adjust" as any)}
          >
            <Text style={styles.secondaryText}>Add Stock</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <AntDesign
          name="search"
          size={16}
          color={COLORS.gray[400]}
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, SKU, category..."
          placeholderTextColor={COLORS.gray[400]}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
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

        {!loading && filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyText}>
              {search ? `No results for "${search}"` : "No products yet"}
            </Text>
            {!search && canCreate && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push("/products/add")}
              >
                <Text style={styles.emptyButtonText}>Add First Product</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {filtered.map((product) => (
          <TouchableOpacity
            key={product.id}
            style={styles.productCard}
            activeOpacity={0.85}
            onPress={() => {
              if (canEdit) {
                router.push({
                  pathname: "/products/[id]",
                  params: { id: product.id },
                });
              }
            }}
          >
            <View style={styles.productHeader}>
              <Text style={styles.productName} numberOfLines={1}>
                {product.name}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  product.is_active ? styles.activeBadge : styles.inactiveBadge,
                ]}
              >
                {product.product_type && product.product_type !== "product" && (
                  <View
                    style={[
                      styles.typeBadge,
                      product.product_type === "raw_material"
                        ? styles.rawBadge
                        : styles.semiBadge,
                    ]}
                  >
                    <Text style={styles.typeBadgeText}>
                      {product.product_type === "raw_material" ? "Raw" : "Semi"}
                    </Text>
                  </View>
                )}
                <Text style={styles.statusText}>
                  {product.is_active ? "Active" : "Inactive"}
                </Text>
              </View>
            </View>
            <Text style={styles.productCategory}>
              {product.category || "Uncategorized"}
            </Text>
            <View style={styles.productFooter}>
              <Text style={styles.productSku}>SKU: {product.sku || "N/A"}</Text>
              <Text style={styles.productUnit}>
                Unit: {product.unit || "pcs"}
              </Text>
              {product.default_selling_price != null && (
                <Text style={styles.productPrice}>
                  ₦{product.default_selling_price.toLocaleString()}
                </Text>
              )}
            </View>
            {canEdit && <Text style={styles.editHint}>Tap to edit →</Text>}
          </TouchableOpacity>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
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
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 4,
  },
  rawBadge: { backgroundColor: "#fff3cd" },
  semiBadge: { backgroundColor: "#cce5ff" },
  typeBadgeText: { fontSize: 10, fontWeight: "600", color: "#555" },
  headerButton: { width: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "bold", color: "#333" },
  addIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  addIconText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: { fontSize: 24, fontWeight: "bold", color: COLORS.primary },
  statLabel: {
    fontSize: 11,
    color: COLORS.gray[600],
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryAction: { backgroundColor: COLORS.accent },
  actionText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  secondaryAction: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.gray[300],
  },
  secondaryText: { color: COLORS.gray[800], fontSize: 13, fontWeight: "500" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111827" },
  scroll: { flex: 1, paddingHorizontal: 16 },
  productCard: {
    padding: 16,
    marginBottom: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  productHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  productName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    flex: 1,
    marginRight: 8,
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  activeBadge: { backgroundColor: "#d4edda" },
  inactiveBadge: { backgroundColor: "#f8d7da" },
  statusText: { fontSize: 10, fontWeight: "600" },
  productCategory: { fontSize: 13, color: "#666", marginBottom: 8 },
  productFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  productSku: { fontSize: 12, color: "#999" },
  productUnit: { fontSize: 12, color: "#999" },
  productPrice: { fontSize: 12, color: COLORS.accent, fontWeight: "600" },
  editHint: {
    fontSize: 11,
    color: COLORS.gray[400],
    marginTop: 6,
    textAlign: "right",
  },
  errorBox: {
    margin: 16,
    padding: 16,
    backgroundColor: "#fee",
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#f00",
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#c00",
    marginBottom: 4,
  },
  errorText: { color: "#900", fontSize: 14 },
  emptyState: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
