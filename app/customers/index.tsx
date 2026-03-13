// FILE: app/customers/index.tsx
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
  Alert,
  Linking,
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

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  total_purchases: number;
  total_spent: number;
  last_purchase_date: string | null;
}

export default function CustomersScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: " ",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState("Our Store");
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  useFocusEffect(
    useCallback(() => {
      fetchCustomers();
    }, []),
  );

  useEffect(() => {
    async function loadOrgCurrency() {
      if (!organizationId) return;
      try {
        const org = await getOrganization(organizationId);
        if (org.name) setOrgName(org.name);
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

  async function fetchCustomers() {
    try {
      setLoading(true);
      if (!organizationId) return;

      // ── Show cache immediately ──────────────────────────
      const cacheKey = `customers_${organizationId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setCustomers(parsed);
        setFilteredCustomers(parsed);
        setLoading(false);
      }

      // ── Fetch fresh ─────────────────────────────────────
      const { data, error } = await supabase
        .from("customer_stats")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");

      if (error) throw error;

      setCustomers(data || []);
      setFilteredCustomers(data || []);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data || []));
    } catch (err) {
      console.error("Error fetching customers:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const handleWhatsApp = (phone: string | null, name: string) => {
    if (!phone) {
      Alert.alert("Error", "No phone number available for this customer.");
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    const message = `Hello ${name}, this is ${orgName}. How can we help you today?`;
    const url = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;

    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        // Fallback to web link if app isn't detected
        Linking.openURL(`https://wa.me/${cleanPhone}`);
      }
    });
  };

  const handleCall = (phone: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  function handleSearch(query: string) {
    setSearchQuery(query);
    if (!query.trim()) {
      setFilteredCustomers(customers);
      return;
    }

    const filtered = customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query.toLowerCase()) ||
        customer.phone?.toLowerCase().includes(query.toLowerCase()) ||
        customer.email?.toLowerCase().includes(query.toLowerCase()),
    );
    setFilteredCustomers(filtered);
  }

  function onRefresh() {
    setRefreshing(true);
    fetchCustomers();
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (loading || permissionsLoading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Guard: if user cannot view customers at all
  if (!hasPermission("customers.read")) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <Text style={{ color: COLORS.primary, fontSize: 16 }}>
          You do not have permission to view customers.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Customers</Text>
        {hasPermission("customers.create") && (
          <TouchableOpacity onPress={() => router.push("/customers/new")}>
            <Text style={styles.addButton}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search customers..."
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredCustomers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>
              {searchQuery ? "No customers found" : "No customers yet"}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? "Try a different search term"
                : "Add your first customer to get started"}
            </Text>
            {!searchQuery && hasPermission("customers.create") && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push("/customers/new")}
              >
                <Text style={styles.emptyButtonText}>Add Customer</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredCustomers.map((customer) => (
            <TouchableOpacity
              key={customer.id}
              style={styles.customerCard}
              onPress={() =>
                hasPermission("customers.update")
                  ? router.push(`/customers/${customer.id}`)
                  : undefined
              }
              disabled={!hasPermission("customers.update")}
            >
              <View style={styles.customerHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {customer.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.customerInfo}>
                  {/* Container for Name and Action Buttons */}
                  <View style={styles.nameActionRow}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {customer.name}
                    </Text>

                    {customer.phone && (
                      <View style={styles.actionGroup}>
                        <TouchableOpacity
                          onPress={() =>
                            handleWhatsApp(customer.phone, customer.name)
                          }
                          style={styles.actionCircle}
                        >
                          <Text style={{ fontSize: 14 }}>💬</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleCall(customer.phone)}
                          style={styles.actionCircle}
                        >
                          <Text style={{ fontSize: 14 }}>📞</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  {customer.phone && (
                    <Text style={styles.customerContact}>
                      📱 {customer.phone}
                    </Text>
                  )}
                  {customer.email && (
                    <Text style={styles.customerContact}>
                      ✉️ {customer.email}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.customerStats}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {customer.total_purchases}
                  </Text>
                  <Text style={styles.statLabel}>Purchases</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {currency.symbol}
                    {customer.total_spent.toLocaleString()}
                  </Text>
                  <Text style={styles.statLabel}>Total Spent</Text>
                </View>
              </View>

              {customer.last_purchase_date && (
                <Text style={styles.lastPurchase}>
                  Last purchase:{" "}
                  {new Date(customer.last_purchase_date).toLocaleDateString()}
                </Text>
              )}

              <View style={styles.chevronContainer}>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
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
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  actionGroup: {
    flexDirection: "row",
    gap: 8,
  },
  nameActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    paddingRight: 20, // Give space so it doesn't hit the chevron
  },
  actionCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backButton: {
    fontSize: 16,
    color: COLORS.primary,
    minWidth: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  addButton: {
    fontSize: 16,
    color: COLORS.accent,
    fontWeight: "600",
    minWidth: 60,
    textAlign: "right",
  },
  searchSection: {
    padding: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  customerCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  customerHeader: {
    flexDirection: "row",
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.white,
  },
  customerInfo: {
    flex: 1,
    justifyContent: "center",
  },
  customerName: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  customerContact: {
    fontSize: 13,
    color: COLORS.secondary,
    marginTop: 2,
  },
  customerStats: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    padding: 8,
    backgroundColor: COLORS.background,
    borderRadius: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 2,
  },
  lastPurchase: {
    fontSize: 12,
    color: COLORS.secondary,
    fontStyle: "italic",
  },
  chevronContainer: {
    position: "absolute",
    right: 16,
    top: 16,
  },
  chevron: {
    fontSize: 24,
    color: COLORS.secondary,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
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
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
  },
});
