// FILE: app/customers/[id].tsx
import { queueOperation } from "@/lib/localDb";
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  credit_limit: number;
  credit_terms: number;
  created_at: string;
}

interface Sale {
  id: string;
  receipt_number: string;
  total_amount: number;
  created_at: string;
  payment_status: string;
}

interface SalesOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  order_date: string;
  expected_delivery_date: string | null;
}

const SO_STATUS_COLORS: Record<string, string> = {
  draft: "#e2e8f0",
  confirmed: "#dbeafe",
  in_fulfillment: "#fef9c3",
  fulfilled: "#d4edda",
  invoiced: "#e9d5ff",
  closed: "#d4edda",
  cancelled: "#f8d7da",
};

const SO_STATUS_TEXT: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  in_fulfillment: "In Fulfillment",
  fulfilled: "Fulfilled",
  invoiced: "Invoiced",
  closed: "Closed",
  cancelled: "Cancelled",
};

export default function CustomerDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { hasPermission } = usePermissions();

  const customerId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [creditLimit, setCreditLimit] = useState("0");
  const [creditTerms, setCreditTerms] = useState("30");

  const [stats, setStats] = useState({
    totalPurchases: 0,
    totalSpent: 0,
    outstandingBalance: 0,
    lastPurchase: null as string | null,
  });

  const canEdit = hasPermission("customers.edit");
  const canViewSales = hasPermission("sales.read");
  const canViewSalesOrders = hasPermission("sales_orders.read");
  const canDeactivate =
    hasPermission("customers.delete") || hasPermission("customers.edit");

  useEffect(() => {
    if (customerId) fetchCustomerDetails();
  }, [customerId]);

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

  async function fetchCustomerDetails() {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!customerId || !uuidRegex.test(customerId)) {
      setLoading(false);
      Alert.alert(
        "Invalid customer",
        `Customer ID is not valid: ${customerId}`,
      );
      router.back();
      return;
    }

    try {
      setLoading(true);

      // Show cache immediately
      const cacheKey = `customer_detail_${customerId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const {
          customer: cc,
          stats: cs,
          sales: csl,
          salesOrders: cso,
        } = JSON.parse(cached);
        setCustomer(cc);
        setName(cc.name);
        setPhone(cc.phone || "");
        setEmail(cc.email || "");
        setAddress(cc.address || "");
        setNotes(cc.notes || "");
        setCreditLimit((cc.credit_limit ?? 0).toString());
        setCreditTerms((cc.credit_terms ?? 30).toString());
        if (cs) setStats(cs);
        if (csl) setSales(csl);
        if (cso) setSalesOrders(cso);
        setLoading(false);
      }

      // Fetch fresh customer data
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();

      if (customerError) throw customerError;

      setCustomer(customerData);
      setName(customerData.name);
      setPhone(customerData.phone || "");
      setEmail(customerData.email || "");
      setAddress(customerData.address || "");
      setNotes(customerData.notes || "");
      setCreditLimit((customerData.credit_limit ?? 0).toString());
      setCreditTerms((customerData.credit_terms ?? 30).toString());

      // Fetch stats
      const { data: statsData } = await supabase
        .from("customer_stats")
        .select("*")
        .eq("id", customerId)
        .single();

      const freshStats = statsData
        ? {
            totalPurchases: statsData.total_purchases,
            totalSpent: statsData.total_spent,
            outstandingBalance: statsData.outstanding_balance ?? 0,
            lastPurchase: statsData.last_purchase_date,
          }
        : stats;
      if (statsData) setStats(freshStats);

      // Fetch recent POS sales
      let freshSales: Sale[] = [];
      if (canViewSales) {
        const { data: salesData } = await supabase
          .from("sales")
          .select(
            "id, receipt_number, total_amount, created_at, payment_status",
          )
          .eq("customer_id", customerId)
          .is("voided_at", null)
          .order("created_at", { ascending: false })
          .limit(10);
        freshSales = salesData || [];
        setSales(freshSales);
      }

      // Fetch recent sales orders
      let freshSalesOrders: SalesOrder[] = [];
      if (canViewSalesOrders) {
        const { data: soData } = await supabase
          .from("sales_orders")
          .select(
            "id, order_number, status, total_amount, order_date, expected_delivery_date",
          )
          .eq("customer_id", customerId)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(10);
        freshSalesOrders = soData || [];
        setSalesOrders(freshSalesOrders);
      }

      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          customer: customerData,
          stats: freshStats,
          sales: freshSales,
          salesOrders: freshSalesOrders,
        }),
      );
    } catch (err) {
      if (!customer) {
        console.error("Error fetching customer details:", err);
        Alert.alert("Error", "Failed to load customer details");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!canEdit) {
      Alert.alert(
        "Permission Denied",
        "You don't have permission to edit customers",
      );
      return;
    }
    if (!name.trim()) {
      Alert.alert("Error", "Customer name is required");
      return;
    }

    const parsedCreditLimit = parseFloat(creditLimit) || 0;
    const parsedCreditTerms = parseInt(creditTerms) || 30;

    if (parsedCreditLimit < 0) {
      Alert.alert("Error", "Credit limit cannot be negative");
      return;
    }

    setSaving(true);
    try {
      await queueOperation({
        module: "customers",
        operation: "update_customer",
        payload: {
          customerId,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          credit_limit: parsedCreditLimit,
          credit_terms: parsedCreditTerms,
        },
      });

      if (customer) {
        const updated = {
          ...customer,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          credit_limit: parsedCreditLimit,
          credit_terms: parsedCreditTerms,
        };
        setCustomer(updated);
        const cacheKey = `customer_detail_${customerId}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          await AsyncStorage.setItem(
            cacheKey,
            JSON.stringify({ ...parsed, customer: updated }),
          );
        }
        if (organizationId)
          await AsyncStorage.removeItem(`customers_${organizationId}`);
      }

      setEditMode(false);
      Alert.alert("Saved ✓", "Changes saved and will sync when online.");
    } catch (err: any) {
      console.error("Error updating customer:", err);
      Alert.alert("Error", err.message || "Failed to update customer");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setName(customer?.name || "");
    setPhone(customer?.phone || "");
    setEmail(customer?.email || "");
    setAddress(customer?.address || "");
    setNotes(customer?.notes || "");
    setCreditLimit((customer?.credit_limit ?? 0).toString());
    setCreditTerms((customer?.credit_terms ?? 30).toString());
    setEditMode(false);
  }

  async function handleToggleActive() {
    if (!customer) return;
    if (!canDeactivate) {
      Alert.alert(
        "Permission Denied",
        "You don't have permission to deactivate customers",
      );
      return;
    }

    const newStatus = !customer.is_active;

    Alert.alert(
      newStatus ? "Activate Customer" : "Deactivate Customer",
      `Are you sure you want to ${newStatus ? "activate" : "deactivate"} this customer?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: newStatus ? "Activate" : "Deactivate",
          style: newStatus ? "default" : "destructive",
          onPress: async () => {
            try {
              await queueOperation({
                module: "customers",
                operation: "toggle_customer_active",
                payload: { customerId, isActive: newStatus },
              });

              const updated = { ...customer, is_active: newStatus };
              setCustomer(updated);
              const cacheKey = `customer_detail_${customerId}`;
              const cached = await AsyncStorage.getItem(cacheKey);
              if (cached) {
                const parsed = JSON.parse(cached);
                await AsyncStorage.setItem(
                  cacheKey,
                  JSON.stringify({ ...parsed, customer: updated }),
                );
              }
              if (organizationId)
                await AsyncStorage.removeItem(`customers_${organizationId}`);

              Alert.alert(
                "Done ✓",
                `Customer ${newStatus ? "activated" : "deactivated"} and will sync when online.`,
              );
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ],
    );
  }

  function formatNaira(amount: number) {
    return (
      currency.symbol +
      amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!customer || !uuidRegex.test(customerId)) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>{"<"} Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Loading...</Text>
          <View style={{ width: 60 }} />
        </View>
      </View>
    );
  }

  const isOverLimit =
    customer.credit_limit > 0 &&
    stats.outstandingBalance > customer.credit_limit;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>{"<"} Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Customer Details</Text>
        {!editMode ? (
          <PermissionGuard permission="customers.edit">
            <TouchableOpacity onPress={() => setEditMode(true)}>
              <Text style={styles.editButton}>Edit</Text>
            </TouchableOpacity>
          </PermissionGuard>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <ScrollView style={styles.content}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {customer.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          {!customer.is_active && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          )}
        </View>

        {/* Stats Cards */}
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalPurchases}</Text>
            <Text style={styles.statLabel}>Purchases</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {currency.symbol}
              {stats.totalSpent.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>
          <View
            style={[
              styles.statCard,
              stats.outstandingBalance > 0 && styles.statCardWarning,
              isOverLimit && styles.statCardDanger,
            ]}
          >
            <Text
              style={[
                styles.statValue,
                stats.outstandingBalance > 0 && styles.statValueWarning,
                isOverLimit && styles.statValueDanger,
              ]}
            >
              {currency.symbol}
              {stats.outstandingBalance.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Outstanding</Text>
          </View>
        </View>

        {/* Credit limit warning */}
        {isOverLimit && (
          <View style={styles.creditWarning}>
            <Text style={styles.creditWarningText}>
              {"⚠"} Over credit limit by{" "}
              {formatNaira(stats.outstandingBalance - customer.credit_limit)}
            </Text>
          </View>
        )}

        {stats.lastPurchase && (
          <Text style={styles.lastPurchaseText}>
            Last purchase: {new Date(stats.lastPurchase).toLocaleDateString()}
          </Text>
        )}

        {/* Customer Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Information</Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Name</Text>
            {editMode && canEdit ? (
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                editable={!saving}
              />
            ) : (
              <Text style={styles.infoValue}>{customer.name}</Text>
            )}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Phone</Text>
            {editMode && canEdit ? (
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                editable={!saving}
              />
            ) : (
              <Text style={styles.infoValue}>
                {customer.phone || "Not provided"}
              </Text>
            )}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Email</Text>
            {editMode && canEdit ? (
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!saving}
              />
            ) : (
              <Text style={styles.infoValue}>
                {customer.email || "Not provided"}
              </Text>
            )}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Address</Text>
            {editMode && canEdit ? (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={address}
                onChangeText={setAddress}
                multiline
                numberOfLines={3}
                editable={!saving}
              />
            ) : (
              <Text style={styles.infoValue}>
                {customer.address || "Not provided"}
              </Text>
            )}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Notes</Text>
            {editMode && canEdit ? (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                editable={!saving}
              />
            ) : (
              <Text style={styles.infoValue}>
                {customer.notes || "No notes"}
              </Text>
            )}
          </View>
        </View>

        {/* Credit Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credit Settings</Text>

          <View style={styles.creditRow}>
            <View style={[styles.infoCard, { flex: 1, marginRight: 6 }]}>
              <Text style={styles.infoLabel}>Credit Limit</Text>
              {editMode && canEdit ? (
                <TextInput
                  style={styles.input}
                  value={creditLimit}
                  onChangeText={setCreditLimit}
                  keyboardType="decimal-pad"
                  editable={!saving}
                />
              ) : (
                <Text style={styles.infoValue}>
                  {customer.credit_limit === 0
                    ? "Unlimited"
                    : formatNaira(customer.credit_limit)}
                </Text>
              )}
            </View>
            <View style={[styles.infoCard, { flex: 1, marginLeft: 6 }]}>
              <Text style={styles.infoLabel}>Credit Terms</Text>
              {editMode && canEdit ? (
                <TextInput
                  style={styles.input}
                  value={creditTerms}
                  onChangeText={setCreditTerms}
                  keyboardType="number-pad"
                  editable={!saving}
                />
              ) : (
                <Text style={styles.infoValue}>
                  Net {customer.credit_terms} days
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Sales Orders */}
        {canViewSalesOrders && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Sales Orders</Text>
              {hasPermission("sales_orders.create") && (
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/sales-orders/add" as any,
                      params: {
                        customerId: customer.id,
                        customerName: customer.name,
                      },
                    })
                  }
                >
                  <Text style={styles.sectionAction}>+ New Order</Text>
                </TouchableOpacity>
              )}
            </View>

            {salesOrders.length === 0 ? (
              <View style={styles.emptyPurchases}>
                <Text style={styles.emptyPurchasesText}>
                  No sales orders yet
                </Text>
              </View>
            ) : (
              salesOrders.map((so) => (
                <TouchableOpacity
                  key={so.id}
                  style={styles.soCard}
                  onPress={() =>
                    router.push({
                      pathname: "/sales-orders/[id]" as any,
                      params: { id: so.id },
                    })
                  }
                >
                  <View style={styles.soHeader}>
                    <Text style={styles.soNumber}>{so.order_number}</Text>
                    <View
                      style={[
                        styles.soBadge,
                        {
                          backgroundColor:
                            SO_STATUS_COLORS[so.status] ?? "#eee",
                        },
                      ]}
                    >
                      <Text style={styles.soBadgeText}>
                        {SO_STATUS_TEXT[so.status] ?? so.status}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.soFooter}>
                    <Text style={styles.soAmount}>
                      {formatNaira(so.total_amount)}
                    </Text>
                    <Text style={styles.soDate}>
                      {new Date(so.order_date).toLocaleDateString()}
                      {so.expected_delivery_date
                        ? ` · Due ${new Date(so.expected_delivery_date).toLocaleDateString()}`
                        : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Recent POS Purchases */}
        <PermissionGuard permission="sales.read">
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent POS Purchases</Text>
            {sales.length === 0 ? (
              <View style={styles.emptyPurchases}>
                <Text style={styles.emptyPurchasesText}>No purchases yet</Text>
              </View>
            ) : (
              sales.map((sale) => (
                <TouchableOpacity
                  key={sale.id}
                  style={styles.saleCard}
                  onPress={() => router.push(`/sales/${sale.id}`)}
                >
                  <View style={styles.saleHeader}>
                    <Text style={styles.saleReceipt}>
                      {sale.receipt_number}
                    </Text>
                    <Text
                      style={[
                        styles.saleStatus,
                        sale.payment_status === "paid" && styles.saleStatusPaid,
                        sale.payment_status === "unpaid" &&
                          styles.saleStatusUnpaid,
                        sale.payment_status === "partial" &&
                          styles.saleStatusPartial,
                      ]}
                    >
                      {sale.payment_status}
                    </Text>
                  </View>
                  <View style={styles.saleFooter}>
                    <Text style={styles.saleAmount}>
                      {currency.symbol}
                      {sale.total_amount.toLocaleString()}
                    </Text>
                    <Text style={styles.saleDate}>
                      {new Date(sale.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </PermissionGuard>

        {/* Action Buttons */}
        {editMode && canEdit ? (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <PermissionGuard
            permission="customers.delete"
            fallback={
              <PermissionGuard permission="customers.edit">
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[
                      styles.button,
                      customer.is_active
                        ? styles.deactivateButton
                        : styles.activateButton,
                    ]}
                    onPress={handleToggleActive}
                  >
                    <Text style={styles.toggleButtonText}>
                      {customer.is_active ? "Deactivate" : "Activate"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </PermissionGuard>
            }
          >
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[
                  styles.button,
                  customer.is_active
                    ? styles.deactivateButton
                    : styles.activateButton,
                ]}
                onPress={handleToggleActive}
              >
                <Text style={styles.toggleButtonText}>
                  {customer.is_active ? "Deactivate" : "Activate"}
                </Text>
              </TouchableOpacity>
            </View>
          </PermissionGuard>
        )}

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
  backButton: { fontSize: 16, color: COLORS.primary, minWidth: 60 },
  title: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  editButton: {
    fontSize: 16,
    color: COLORS.accent,
    fontWeight: "600",
    minWidth: 60,
    textAlign: "right",
  },
  content: { flex: 1 },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: { fontSize: 36, fontWeight: "bold", color: COLORS.white },
  inactiveBadge: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inactiveBadgeText: { color: COLORS.white, fontSize: 12, fontWeight: "600" },
  statsSection: {
    flexDirection: "row",
    gap: 8,
    padding: 16,
    backgroundColor: COLORS.white,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  statCardWarning: { backgroundColor: "#fff8e1" },
  statCardDanger: { backgroundColor: "#fdecea" },
  statValue: { fontSize: 16, fontWeight: "bold", color: COLORS.primary },
  statValueWarning: { color: "#f59e0b" },
  statValueDanger: { color: COLORS.danger },
  statLabel: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 4,
    textAlign: "center",
  },
  creditWarning: {
    backgroundColor: "#fdecea",
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f5c6cb",
  },
  creditWarningText: {
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: "600",
    textAlign: "center",
  },
  lastPurchaseText: {
    textAlign: "center",
    fontSize: 13,
    color: COLORS.secondary,
    fontStyle: "italic",
    paddingBottom: 16,
    backgroundColor: COLORS.white,
  },
  section: { padding: 16 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionAction: { fontSize: 14, color: COLORS.accent, fontWeight: "600" },
  creditRow: { flexDirection: "row" },
  infoCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.secondary,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  infoValue: { fontSize: 16, color: COLORS.primary },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: { height: 80, textAlignVertical: "top" },

  // Sales orders
  soCard: {
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  soHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  soNumber: { fontSize: 14, fontWeight: "700", color: COLORS.primary },
  soBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  soBadgeText: { fontSize: 11, fontWeight: "700", color: "#333" },
  soFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  soAmount: { fontSize: 15, fontWeight: "bold", color: COLORS.primary },
  soDate: { fontSize: 12, color: COLORS.secondary },

  // POS sales
  emptyPurchases: {
    backgroundColor: COLORS.white,
    padding: 32,
    borderRadius: 12,
    alignItems: "center",
  },
  emptyPurchasesText: {
    fontSize: 14,
    color: COLORS.secondary,
    fontStyle: "italic",
  },
  saleCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  saleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  saleReceipt: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  saleStatus: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  saleStatusPaid: {
    backgroundColor: COLORS.success + "20",
    color: COLORS.success,
  },
  saleStatusUnpaid: {
    backgroundColor: COLORS.danger + "20",
    color: COLORS.danger,
  },
  saleStatusPartial: {
    backgroundColor: COLORS.warning + "20",
    color: COLORS.warning,
  },
  saleFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  saleAmount: { fontSize: 16, fontWeight: "bold", color: COLORS.primary },
  saleDate: { fontSize: 12, color: COLORS.secondary },

  // Action buttons
  actionButtons: { flexDirection: "row", gap: 12, paddingHorizontal: 16 },
  button: { flex: 1, padding: 16, borderRadius: 10, alignItems: "center" },
  cancelButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  saveButton: { backgroundColor: COLORS.primary },
  saveButtonText: { fontSize: 16, fontWeight: "600", color: COLORS.white },
  deactivateButton: { backgroundColor: COLORS.danger },
  activateButton: { backgroundColor: COLORS.success },
  toggleButtonText: { fontSize: 16, fontWeight: "600", color: COLORS.white },
});
