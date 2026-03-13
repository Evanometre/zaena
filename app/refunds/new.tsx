// FILE: app/refunds/new.tsx
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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

interface SaleItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products: { name: string; unit: string };
}

interface Sale {
  id: string;
  receipt_number: string;
  total_amount: number;
  location_id: string;
  voided_at: string | null;
  sale_items: SaleItem[];
}

interface RefundItem {
  sale_item_id: string;
  product_id: string;
  product_name: string;
  unit: string;
  max_quantity: number;
  unit_price: number;
  quantity: number;
  amount: number;
  customAmount: string; // raw text input so user can type freely
  restock: boolean;
}

export default function NewRefundScreen() {
  const router = useRouter();

  const { saleId: paramSaleId, receiptNumber: paramReceiptNumber } =
    useLocalSearchParams<{ saleId?: string; receiptNumber?: string }>();

  const [receiptSearch, setReceiptSearch] = useState(paramReceiptNumber ?? "");
  const [searchLoading, setSearchLoading] = useState(false);
  const [sale, setSale] = useState<Sale | null>(null);
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [refundItems, setRefundItems] = useState<RefundItem[]>([]);
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "bank" | "pos" | "mobile"
  >("cash");
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const { hasPermission, loading: permLoading } = usePermissions();

  // Track whether we already auto-loaded from paramSaleId so we don't repeat
  const autoLoadedRef = useRef(false);

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

  // Auto-load sale when navigating from sale detail — only once
  useEffect(() => {
    if (paramSaleId && !autoLoadedRef.current) {
      autoLoadedRef.current = true;
      loadSaleById(paramSaleId);
    }
  }, [paramSaleId]);

  // ── Load sale by ID ─────────────────────────────────────────────────────────
  async function loadSaleById(id: string) {
    setSearchLoading(true);
    try {
      const { data, error } = await supabase
        .from("sales")
        .select(
          `
          *,
          sale_items (
            *,
            products (name, unit)
          )
        `,
        )
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        Alert.alert("Not Found", "Could not load the sale.");
        return;
      }

      if (data.voided_at) {
        Alert.alert("Error", "Cannot refund a voided sale.");
        return;
      }

      hydrateSale(data);
    } catch (err: any) {
      console.error("loadSaleById error:", err);
      Alert.alert("Error", err.message || "Failed to load sale");
    } finally {
      setSearchLoading(false);
    }
  }

  // ── Search by receipt number ────────────────────────────────────────────────
  async function searchSale() {
    if (!receiptSearch.trim()) {
      Alert.alert("Error", "Please enter a receipt number");
      return;
    }

    setSearchLoading(true);
    try {
      const { data, error } = await supabase
        .from("sales")
        .select(
          `
          *,
          sale_items (
            *,
            products (name, unit)
          )
        `,
        )
        .eq("receipt_number", receiptSearch.trim().toUpperCase())
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        Alert.alert("Not Found", "No sale found with that receipt number.");
        return;
      }

      if (data.voided_at) {
        Alert.alert("Error", "Cannot refund a voided sale.");
        return;
      }

      hydrateSale(data);
    } catch (err: any) {
      console.error("searchSale error:", err);
      Alert.alert("Error", err.message || "Failed to find sale");
    } finally {
      setSearchLoading(false);
    }
  }

  // ── Hydrate sale state and initialise refund items ──────────────────────────
  function hydrateSale(data: Sale) {
    setSale(data);
    setReceiptSearch(data.receipt_number);

    const items: RefundItem[] = data.sale_items.map((item: SaleItem) => {
      const defaultAmount = item.quantity * item.unit_price;
      return {
        sale_item_id: item.id,
        product_id: item.product_id,
        product_name: item.products.name,
        unit: item.products.unit,
        max_quantity: item.quantity,
        unit_price: item.unit_price,
        quantity: item.quantity,
        amount: defaultAmount,
        customAmount: defaultAmount.toFixed(2),
        restock: true,
      };
    });

    setRefundItems(items);
    setRefundType("full");
  }

  // ── Item controls ───────────────────────────────────────────────────────────

  function updateItemQuantity(index: number, newQty: number) {
    const item = refundItems[index];
    const qty = Math.max(0, Math.min(newQty, item.max_quantity));
    const defaultAmount = qty * item.unit_price;
    const updated = [...refundItems];
    updated[index] = {
      ...item,
      quantity: qty,
      amount: defaultAmount,
      customAmount: defaultAmount.toFixed(2),
    };
    setRefundItems(updated);
    recalcType(updated);
  }

  function updateItemAmount(index: number, text: string) {
    const item = refundItems[index];
    const maxAmount = item.quantity * item.unit_price;
    const parsed = parseFloat(text);
    const resolved = isNaN(parsed) ? 0 : Math.min(parsed, maxAmount);
    const updated = [...refundItems];
    updated[index] = {
      ...item,
      customAmount: text, // keep raw string while typing
      amount: resolved,
    };
    setRefundItems(updated);
    recalcType(updated);
  }

  function commitItemAmount(index: number) {
    // On blur, tidy up the displayed value
    const item = refundItems[index];
    const updated = [...refundItems];
    updated[index] = {
      ...item,
      customAmount: item.amount.toFixed(2),
    };
    setRefundItems(updated);
  }

  function toggleRestock(index: number) {
    const updated = [...refundItems];
    updated[index] = { ...updated[index], restock: !updated[index].restock };
    setRefundItems(updated);
  }

  function recalcType(items: RefundItem[]) {
    const isFullRefund = items.every(
      (i) =>
        i.quantity === i.max_quantity &&
        Math.abs(i.amount - i.max_quantity * i.unit_price) < 0.01,
    );
    setRefundType(isFullRefund ? "full" : "partial");
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function processRefund() {
    if (!sale) return;

    const itemsToRefund = refundItems.filter(
      (i) => i.quantity > 0 && i.amount > 0,
    );
    if (itemsToRefund.length === 0) {
      Alert.alert("Error", "Please select at least one item to refund");
      return;
    }

    const totalAmount = itemsToRefund.reduce((s, i) => s + i.amount, 0);
    if (totalAmount <= 0) {
      Alert.alert("Error", "Refund amount must be greater than zero");
      return;
    }

    if (!reason.trim()) {
      Alert.alert("Error", "Please enter a reason for the refund");
      return;
    }

    Alert.alert(
      "Confirm Refund",
      `Refund ${currency.symbol}${totalAmount.toFixed(2)} for ${itemsToRefund.length} item(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Process Refund", onPress: executeRefund },
      ],
    );
  }

  async function executeRefund() {
    if (!organizationId || !sale) return;
    setProcessing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const itemsToRefund = refundItems.filter(
        (i) => i.quantity > 0 && i.amount > 0,
      );
      const totalAmount = itemsToRefund.reduce((s, i) => s + i.amount, 0);

      // 1. Create refund record
      const { data: refund, error: refundError } = await supabase
        .from("refunds")
        .insert({
          organization_id: organizationId,
          location_id: sale.location_id,
          original_sale_id: sale.id,
          refund_amount: totalAmount,
          refund_type: refundType,
          reason,
          payment_method: paymentMethod,
          processed_by: user.id,
        })
        .select()
        .single();

      if (refundError) throw refundError;

      // 2. Create refund items
      const { error: itemsError } = await supabase.from("refund_items").insert(
        itemsToRefund.map((item) => ({
          refund_id: refund.id,
          sale_item_id: item.sale_item_id,
          product_id: item.product_id,
          quantity_refunded: item.quantity,
          amount_refunded: item.amount,
          restock: item.restock,
        })),
      );

      if (itemsError) throw itemsError;

      // 3. Restock inventory where flagged
      for (const item of itemsToRefund) {
        if (item.restock) {
          await supabase.rpc("mutate_inventory", {
            p_product_id: item.product_id,
            p_location_id: sale.location_id,
            p_direction: "in",
            p_quantity: item.quantity,
            p_unit_cost: item.unit_price,
            p_source_type: "return",
            p_source_id: refund.id,
            p_device_id: null,
            p_variation_id: null,
            p_bulk_tier_id: null,
          });
        }
      }

      // 4. Get or create financial account
      const { data: accounts } = await supabase
        .from("financial_accounts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("account_type", paymentMethod)
        .limit(1);

      let accountId = accounts?.[0]?.id;
      if (!accountId) {
        const { data: newAccount } = await supabase
          .from("financial_accounts")
          .insert({
            organization_id: organizationId,
            name:
              paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1),
            account_type: paymentMethod,
            is_active: true,
          })
          .select("id")
          .single();
        accountId = newAccount?.id;
      }

      // 5. Financial event (money out)
      await supabase.from("financial_events").insert({
        organization_id: organizationId,
        location_id: sale.location_id,
        event_type: "refund",
        account_id: accountId,
        direction: "out",
        amount: totalAmount,
        reference_type: "refund",
        reference_id: refund.id,
        occurred_at: new Date().toISOString(),
      });

      Alert.alert("Success", "Refund processed successfully", [
        {
          text: "View Refunds",
          onPress: () =>
            router.replace({
              pathname: "/refunds/[id]",
              params: { id: refund.id },
            }),
        },
      ]);
    } catch (err: any) {
      console.error("Refund error:", err);
      Alert.alert("Error", err.message || "Failed to process refund");
    } finally {
      setProcessing(false);
    }
  }

  const totalRefundAmount = refundItems.reduce((s, i) => s + i.amount, 0);

  const paymentMethods = [
    { value: "cash", label: "Cash", icon: "💵" },
    { value: "bank", label: "Bank", icon: "🏦" },
    { value: "pos", label: "POS", icon: "💳" },
    { value: "mobile", label: "Mobile", icon: "📱" },
  ];

  // ── Guards ──────────────────────────────────────────────────────────────────

  if (permLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!hasPermission("refunds.create")) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Refund</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centered}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔐</Text>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "600",
              color: COLORS.primary,
              marginBottom: 8,
            }}
          >
            Access Restricted
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: COLORS.secondary,
              textAlign: "center",
            }}
          >
            You don&apos;t have permission to process refunds.
          </Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Refund</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Loading overlay — only shown while actively fetching */}
      {searchLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading sale…</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* Manual search — only when no sale loaded */}
          {!sale && (
            <View style={styles.searchSection}>
              <Text style={styles.sectionTitle}>Find Sale</Text>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Enter receipt number…"
                  value={receiptSearch}
                  onChangeText={setReceiptSearch}
                  autoCapitalize="characters"
                  returnKeyType="search"
                  onSubmitEditing={searchSale}
                />
                <TouchableOpacity
                  style={styles.searchButton}
                  onPress={searchSale}
                  disabled={searchLoading}
                >
                  <Text style={styles.searchButtonText}>Search</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {sale && (
            <>
              {/* Sale header */}
              <View style={styles.saleCard}>
                <View style={styles.saleHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.receiptNumber}>
                      {sale.receipt_number}
                    </Text>
                    <Text style={styles.saleAmount}>
                      Original Total: {currency.symbol}
                      {sale.total_amount.toFixed(2)}
                    </Text>
                  </View>
                  {!paramSaleId && (
                    <TouchableOpacity
                      onPress={() => {
                        setSale(null);
                        setRefundItems([]);
                        setReceiptSearch("");
                      }}
                    >
                      <Text style={styles.changeButton}>Change</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Items */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Items to Refund</Text>
                <Text style={styles.sectionHint}>
                  Adjust quantity and/or enter a custom refund amount per item.
                </Text>

                {refundItems.map((item, index) => (
                  <View
                    key={`${item.sale_item_id}-${index}`}
                    style={[
                      styles.itemCard,
                      item.quantity === 0 && styles.itemCardDisabled,
                    ]}
                  >
                    {/* Item name + max info */}
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemName}>{item.product_name}</Text>
                      <Text style={styles.itemMaxInfo}>
                        max {item.max_quantity} {item.unit} @ {currency.symbol}
                        {item.unit_price.toFixed(2)}
                      </Text>
                    </View>

                    {/* Quantity row */}
                    <View style={styles.itemControls}>
                      <View style={styles.quantityControl}>
                        <TouchableOpacity
                          style={styles.qtyButton}
                          onPress={() =>
                            updateItemQuantity(index, item.quantity - 1)
                          }
                        >
                          <Text style={styles.qtyButtonText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>
                          {item.quantity} / {item.max_quantity} {item.unit}
                        </Text>
                        <TouchableOpacity
                          style={styles.qtyButton}
                          onPress={() =>
                            updateItemQuantity(index, item.quantity + 1)
                          }
                        >
                          <Text style={styles.qtyButtonText}>+</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.restockToggle,
                          item.restock && styles.restockActive,
                        ]}
                        onPress={() => toggleRestock(index)}
                      >
                        <Text
                          style={[
                            styles.restockText,
                            item.restock && styles.restockTextActive,
                          ]}
                        >
                          {item.restock ? "✓ Restock" : "No Restock"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Custom amount row */}
                    {item.quantity > 0 && (
                      <View style={styles.amountRow}>
                        <Text style={styles.amountLabel}>
                          Refund amount ({currency.symbol})
                        </Text>
                        <View style={styles.amountInputWrapper}>
                          <Text style={styles.amountCurrencyPrefix}>
                            {currency.symbol}
                          </Text>
                          <TextInput
                            style={styles.amountInput}
                            value={item.customAmount}
                            onChangeText={(t) => updateItemAmount(index, t)}
                            onBlur={() => commitItemAmount(index)}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                          />
                          <Text style={styles.amountMaxHint}>
                            / {currency.symbol}
                            {(item.max_quantity * item.unit_price).toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                ))}
              </View>

              {/* Payment Method */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Refund Payment Method</Text>
                <View style={styles.methodGrid}>
                  {paymentMethods.map((method) => (
                    <TouchableOpacity
                      key={method.value}
                      style={[
                        styles.methodButton,
                        paymentMethod === method.value &&
                          styles.methodButtonActive,
                      ]}
                      onPress={() => setPaymentMethod(method.value as any)}
                    >
                      <Text style={styles.methodIcon}>{method.icon}</Text>
                      <Text
                        style={[
                          styles.methodLabel,
                          paymentMethod === method.value &&
                            styles.methodLabelActive,
                        ]}
                      >
                        {method.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Reason */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Reason *</Text>
                <TextInput
                  style={styles.reasonInput}
                  placeholder="Why is this being refunded?"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Total */}
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>Refund Amount</Text>
                <Text style={styles.totalAmount}>
                  {currency.symbol}
                  {totalRefundAmount.toFixed(2)}
                </Text>
                <Text style={styles.refundTypeText}>
                  {refundType === "full" ? "Full Refund" : "Partial Refund"}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.processButton,
                  processing && styles.buttonDisabled,
                ]}
                onPress={processRefund}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.processButtonText}>Process Refund</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.secondary },
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
  backButton: { fontSize: 16, color: COLORS.primary },
  title: { fontSize: 20, fontWeight: "600", color: COLORS.primary },
  content: { flex: 1, padding: 16 },

  searchSection: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: COLORS.secondary,
    marginBottom: 12,
  },
  searchRow: { flexDirection: "row", gap: 12 },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    borderRadius: 8,
    justifyContent: "center",
  },
  searchButtonText: { color: COLORS.white, fontSize: 14, fontWeight: "600" },

  saleCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  saleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  receiptNumber: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  saleAmount: { fontSize: 14, color: COLORS.secondary, marginTop: 4 },
  changeButton: { fontSize: 14, color: COLORS.accent, fontWeight: "600" },

  section: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },

  itemCard: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  itemCardDisabled: {
    opacity: 0.45,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    flex: 1,
    marginRight: 8,
  },
  itemMaxInfo: {
    fontSize: 11,
    color: COLORS.secondary,
    textAlign: "right",
  },
  itemControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  quantityControl: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyButton: {
    width: 32,
    height: 32,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  qtyButtonText: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  qtyText: {
    fontSize: 13,
    color: COLORS.secondary,
    minWidth: 80,
    textAlign: "center",
  },
  restockToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  restockActive: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  restockText: { fontSize: 12, fontWeight: "600", color: COLORS.secondary },
  restockTextActive: { color: COLORS.white },

  // Custom amount input
  amountRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  amountLabel: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: "500",
    flex: 1,
  },
  amountInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
  },
  amountCurrencyPrefix: {
    fontSize: 14,
    color: COLORS.secondary,
    marginRight: 4,
  },
  amountInput: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    minWidth: 70,
    textAlign: "right",
    padding: 0,
  },
  amountMaxHint: {
    fontSize: 11,
    color: COLORS.secondary,
    marginLeft: 4,
  },

  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  methodButton: {
    flex: 1,
    minWidth: "45%",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  methodButtonActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  methodIcon: { fontSize: 32, marginBottom: 8 },
  methodLabel: { fontSize: 12, fontWeight: "600", color: COLORS.secondary },
  methodLabelActive: { color: COLORS.white },

  reasonInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },

  totalCard: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.warning,
  },
  totalLabel: { fontSize: 14, color: COLORS.secondary, marginBottom: 8 },
  totalAmount: { fontSize: 32, fontWeight: "bold", color: COLORS.warning },
  refundTypeText: { fontSize: 12, color: COLORS.secondary, marginTop: 4 },

  processButton: {
    backgroundColor: COLORS.warning,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 32,
  },
  processButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
  buttonDisabled: { opacity: 0.6 },
});
