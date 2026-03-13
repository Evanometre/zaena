// FILE: app/suppliers/index.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  payment_terms: string;
  is_active: boolean;
  notes: string;
  created_at: string;
}

export default function SuppliersScreen() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const router = useRouter();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { organizationId } = useAuthStore();

  useFocusEffect(
    useCallback(() => {
      fetchSuppliers();
    }, [showInactive]),
  );

  async function fetchSuppliers() {
    if (!organizationId) return;
    setLoading(true);
    try {
      // ── Show cache immediately ──────────────────────────
      const cacheKey = `suppliers_${organizationId}_${showInactive}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setSuppliers(JSON.parse(cached));
        setLoading(false);
      }

      // ── Fetch fresh ─────────────────────────────────────
      let query = supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true });

      if (!showInactive) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;
      if (error) {
        if (!cached) Alert.alert("Error", error.message);
      } else {
        setSuppliers(data || []);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(data || []));
      }
    } catch (err: any) {
      if (!suppliers.length) Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchSuppliers();
  }

  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const activeCount = suppliers.filter((s) => s.is_active).length;

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

  if (!hasPermission("suppliers.read")) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Suppliers</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔐</Text>
          <Text style={styles.emptyText}>Access Restricted</Text>
          <Text style={styles.emptySubtext}>
            You don&apos;t have permission to view suppliers.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Suppliers</Text>
        {hasPermission("suppliers.create") ? (
          <TouchableOpacity onPress={() => router.push("/suppliers/new")}>
            <Text style={styles.addButton}>+ Add</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{suppliers.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: COLORS.success }]}>
            {activeCount}
          </Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: COLORS.secondary }]}>
            {suppliers.length - activeCount}
          </Text>
          <Text style={styles.statLabel}>Inactive</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search suppliers..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowInactive(!showInactive)}
        >
          <Text style={styles.filterButtonText}>
            {showInactive ? "✓ Show Inactive" : "○ Show Inactive"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing && (
          <ActivityIndicator size="large" color={COLORS.primary} />
        )}

        {filteredSuppliers.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏢</Text>
            <Text style={styles.emptyText}>No suppliers found</Text>
            <Text style={styles.emptySubtext}>
              Add suppliers to track your purchases
            </Text>
            {hasPermission("suppliers.create") && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push("/suppliers/new")}
              >
                <Text style={styles.emptyButtonText}>+ Add First Supplier</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {filteredSuppliers.map((supplier) => (
          <TouchableOpacity
            key={supplier.id}
            style={[
              styles.supplierCard,
              !supplier.is_active && styles.supplierCardInactive,
            ]}
            onPress={() => router.push(`/suppliers/${supplier.id}`)}
          >
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.supplierName}>{supplier.name}</Text>
                {supplier.contact_person && (
                  <Text style={styles.contactPerson}>
                    👤 {supplier.contact_person}
                  </Text>
                )}
              </View>
              {!supplier.is_active && (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.inactiveBadgeText}>Inactive</Text>
                </View>
              )}
            </View>

            <View style={styles.cardBody}>
              {supplier.phone && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>📞</Text>
                  <Text style={styles.infoText}>{supplier.phone}</Text>
                </View>
              )}
              {supplier.email && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>✉️</Text>
                  <Text style={styles.infoText}>{supplier.email}</Text>
                </View>
              )}
              {supplier.payment_terms && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>💳</Text>
                  <Text style={styles.infoText}>{supplier.payment_terms}</Text>
                </View>
              )}
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.dateText}>
                Added {new Date(supplier.created_at).toLocaleDateString()}
              </Text>
              <Text style={styles.viewButton}>View →</Text>
            </View>
          </TouchableOpacity>
        ))}
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
  addButton: { fontSize: 16, fontWeight: "600", color: COLORS.accent },
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
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  backButton: { fontSize: 16, color: COLORS.primary, fontWeight: "600" },
  filterRow: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterButton: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  filterButtonText: { fontSize: 14, fontWeight: "500", color: COLORS.primary },
  list: { flex: 1, paddingHorizontal: 16 },
  supplierCard: {
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
  supplierCardInactive: {
    opacity: 0.6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  supplierName: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  contactPerson: { fontSize: 13, color: COLORS.secondary, marginTop: 4 },
  inactiveBadge: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inactiveBadgeText: { fontSize: 10, fontWeight: "600", color: COLORS.white },
  cardBody: { marginBottom: 12 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  infoIcon: { fontSize: 14, marginRight: 8 },
  infoText: { fontSize: 14, color: COLORS.secondary, flex: 1 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dateText: { fontSize: 12, color: COLORS.secondary },
  viewButton: { fontSize: 14, fontWeight: "600", color: COLORS.accent },
  emptyState: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
});
