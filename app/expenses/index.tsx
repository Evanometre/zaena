// FILE: app/expenses/index.tsx
import { useOnAppForeground } from "@/lib/hooks/useOnAppForeground";
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { PermissionButton } from "../../context/PermisionButton";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface Expense {
  id: string;
  category: string;
  amount: number;
  expense_type: "operating" | "capital";
  payment_method: string;
  notes: string | null;
  occurred_at: string;
  created_at: string;
  locations: {
    name: string;
  };
}

export default function ExpensesScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: " ",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "operating" | "capital">("all");

  const canCreate = hasPermission("expenses.create");

  useFocusEffect(
    useCallback(() => {
      fetchExpenses();
    }, [filter]),
  );

  useOnAppForeground(fetchExpenses);

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

  async function fetchExpenses() {
    setLoading(true);
    try {
      // ── Show cache immediately ──────────────────────────
      const cacheKey = `expenses_${organizationId}_${filter}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setExpenses(JSON.parse(cached));
        setLoading(false);
      }

      // ── Fetch fresh ─────────────────────────────────────
      if (!organizationId) return;

      let query = supabase
        .from("expenses")
        .select("*, locations (name)")
        .eq("organization_id", organizationId)
        .order("occurred_at", { ascending: false });

      if (filter !== "all") query = query.eq("expense_type", filter);

      const { data, error } = await query;
      if (error) throw error;

      setExpenses(data || []);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data || []));
    } catch (err: any) {
      console.error("Error fetching expenses:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchExpenses();
  }

  const filteredExpenses = expenses.filter(
    (expense) =>
      expense.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (expense.notes &&
        expense.notes.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const totalOperating = expenses
    .filter((e) => e.expense_type === "operating")
    .reduce((sum, e) => sum + e.amount, 0);

  const totalCapital = expenses
    .filter((e) => e.expense_type === "capital")
    .reduce((sum, e) => sum + e.amount, 0);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  const renderExpense = ({ item }: { item: Expense }) => (
    <TouchableOpacity
      style={styles.expenseCard}
      onPress={() => router.push(`/expenses/${item.id}` as any)}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.category}>{item.category}</Text>
          <Text style={styles.location}>📍 {item.locations.name}</Text>
        </View>
        <View>
          <Text style={styles.amount}>
            {currency.symbol}
            {item.amount.toLocaleString()}
          </Text>
          <View
            style={[
              styles.typeBadge,
              item.expense_type === "operating"
                ? styles.typeBadgeOperating
                : styles.typeBadgeCapital,
            ]}
          >
            <Text style={styles.typeBadgeText}>
              {item.expense_type === "operating" ? "Operating" : "Capital"}
            </Text>
          </View>
        </View>
      </View>

      {item.notes && (
        <Text style={styles.notes} numberOfLines={2}>
          📝 {item.notes}
        </Text>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.date}>
          {new Date(item.occurred_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </Text>
        {item.payment_method && (
          <Text style={styles.paymentMethod}>
            {item.payment_method.toUpperCase()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButtonContainer}
        >
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Expenses</Text>
        <PermissionButton
          permission="expenses.create"
          onPress={() => router.push("/expenses/new" as any)}
        >
          <Text style={styles.addButton}>+ Add</Text>
        </PermissionButton>
      </View>

      {/* Stats Summary */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {currency.symbol}
            {totalExpenses.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: COLORS.danger }]}>
            {currency.symbol}
            {totalOperating.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Operating</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: COLORS.secondary }]}>
            {currency.symbol}
            {totalCapital.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Capital</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search expenses..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={COLORS.secondary}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === "all" && styles.filterButtonActive,
          ]}
          onPress={() => setFilter("all")}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === "all" && styles.filterButtonTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === "operating" && styles.filterButtonActive,
          ]}
          onPress={() => setFilter("operating")}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === "operating" && styles.filterButtonTextActive,
            ]}
          >
            Operating
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === "capital" && styles.filterButtonActive,
          ]}
          onPress={() => setFilter("capital")}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === "capital" && styles.filterButtonTextActive,
            ]}
          >
            Capital
          </Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: 40 }}
        />
      ) : filteredExpenses.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>💸</Text>
          <Text style={styles.emptyText}>No expenses recorded</Text>
          <Text style={styles.emptySubtext}>
            {searchQuery
              ? "No expenses match your search"
              : "Start tracking your business expenses"}
          </Text>
          {!searchQuery && canCreate && (
            <PermissionButton
              permission="expenses.create"
              style={styles.emptyButton}
              onPress={() => router.push("/expenses/new" as any)}
            >
              <Text style={styles.emptyButtonText}>Add First Expense</Text>
            </PermissionButton>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredExpenses}
          renderItem={renderExpense}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
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
  statNumber: { fontSize: 16, fontWeight: "bold", color: COLORS.primary },
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
    color: COLORS.primary,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  filterButtonTextActive: {
    color: COLORS.white,
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  expenseCard: {
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  category: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  location: { fontSize: 13, color: COLORS.secondary, marginTop: 4 },
  amount: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.danger,
    textAlign: "right",
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  typeBadgeOperating: {
    backgroundColor: COLORS.danger,
  },
  typeBadgeCapital: {
    backgroundColor: COLORS.secondary,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.white,
  },
  notes: {
    fontSize: 13,
    color: COLORS.secondary,
    fontStyle: "italic",
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  date: { fontSize: 12, color: COLORS.secondary },
  paymentMethod: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primary,
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
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
  emptyButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.white,
  },
  backButtonContainer: {
    marginRight: 12, // spacing between back button and title
  },

  backButton: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
  },
});
