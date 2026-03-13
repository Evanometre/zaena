// FILE: app/sales-orders/add.tsx
import { queueOperation } from "@/lib/localDb";
import { getOrganization } from "@/onboarding/services/organizationService";
import {
    ALL_CURRENCIES,
    getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  unit: string;
  category: string;
  default_selling_price: number | null;
  product_type: string;
  is_sellable: boolean;
}

interface LineItem {
  product: Product;
  quantity: number;
  unit_price: number;
  discount: number; // fixed amount per line
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  credit_limit: number;
  credit_terms: number;
}

interface Location {
  id: string;
  name: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddSalesOrderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  // Pre-fill customer from navigation params (e.g. from customer detail screen)
  const prefilledCustomerId = Array.isArray(params.customerId)
    ? params.customerId[0]
    : params.customerId;
  const prefilledCustomerName = Array.isArray(params.customerName)
    ? params.customerName[0]
    : params.customerName;

  // ── Core state ──────────────────────────────────────────────────────────────
  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Order fields
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(
    null,
  );
  const [orderDate, setOrderDate] = useState(new Date());
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<Date | null>(
    null,
  );
  const [requiresProduction, setRequiresProduction] = useState(false);
  const [notes, setNotes] = useState("");
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState(0);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Reference data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // UI state
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showOrderDatePicker, setShowOrderDatePicker] = useState(false);
  const [showDeliveryDatePicker, setShowDeliveryDatePicker] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [editingLinePrice, setEditingLinePrice] = useState<string | null>(null);
  const [editingLineQty, setEditingLineQty] = useState<string | null>(null);
  const [editingLineDiscount, setEditingLineDiscount] = useState<string | null>(
    null,
  );

  const deviceIdRef = useRef<string | null>(null);
  const deviceNameRef = useRef<string>("APP");

  // ── Permission guard ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!permissionsLoading && !hasPermission("sales_orders.create")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to create sales orders",
        [{ text: "OK", onPress: () => router.back() }],
      );
    }
  }, [permissionsLoading, hasPermission]);

  // ── Initial data load ───────────────────────────────────────────────────────
  useEffect(() => {
    loadCurrency();
    loadLocations();
    loadCustomers();
    loadProducts();
    loadVATRate();
    preloadDevice();
  }, [organizationId]);

  // Pre-fill customer if navigated from customer detail
  useEffect(() => {
    if (prefilledCustomerId && customers.length > 0) {
      const found = customers.find((c) => c.id === prefilledCustomerId);
      if (found) setSelectedCustomer(found);
    } else if (prefilledCustomerId && prefilledCustomerName) {
      // Set a stub so the field shows the name even before customers load
      setSelectedCustomer({
        id: prefilledCustomerId,
        name: prefilledCustomerName as string,
        phone: null,
        credit_limit: 0,
        credit_terms: 30,
      });
    }
  }, [prefilledCustomerId, customers]);

  async function loadCurrency() {
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
    } catch {}
  }

  async function loadVATRate() {
    if (!organizationId) return;
    try {
      const { data } = await supabase
        .from("tax_settings")
        .select("rate")
        .eq("organization_id", organizationId)
        .eq("tax_type", "vat")
        .eq("is_active", true)
        .single();
      if (data?.rate) setTaxRate(data.rate);
    } catch {}
  }

  async function loadLocations() {
    try {
      const cached = await AsyncStorage.getItem("locations_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        setLocations(parsed);
        setSelectedLocation(parsed[0] ?? null);
      }
      if (!organizationId) return;
      const { data } = await supabase
        .from("locations")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });
      if (data && data.length > 0) {
        setLocations(data);
        setSelectedLocation((prev) => prev ?? data[0]);
      }
    } catch {}
  }

  async function loadCustomers() {
    if (!organizationId) return;
    try {
      const cacheKey = `customers_${organizationId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) setCustomers(JSON.parse(cached));

      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, credit_limit, credit_terms")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");
      if (data) setCustomers(data);
    } catch {}
  }

  async function loadProducts() {
    try {
      const cached = await AsyncStorage.getItem("products_cache");
      if (cached) setProducts(JSON.parse(cached));

      if (!organizationId) return;
      const { data } = await supabase
        .from("products")
        .select(
          "id, name, unit, category, default_selling_price, product_type, is_sellable",
        )
        .eq("is_active", true)
        .order("name")
        .limit(300);
      if (data) {
        setProducts(data);
        await AsyncStorage.setItem("products_cache", JSON.stringify(data));
      }
    } catch {}
  }

  async function preloadDevice() {
    if (!organizationId) return;
    try {
      const cached = await AsyncStorage.getItem("checkout_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        deviceIdRef.current = parsed.deviceId;
        deviceNameRef.current = parsed.deviceName ?? "APP";
        return;
      }
      const { data: devices } = await supabase
        .from("devices")
        .select("id, device_name")
        .eq("organization_id", organizationId)
        .limit(1);
      if (devices?.[0]) {
        deviceIdRef.current = devices[0].id;
        deviceNameRef.current = devices[0].device_name ?? "APP";
      }
    } catch {}
  }

  // ── Computations ────────────────────────────────────────────────────────────

  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price - item.discount,
    0,
  );
  const parsedOrderDiscount = parseFloat(orderDiscount) || 0;
  const discountedSubtotal = Math.max(0, subtotal - parsedOrderDiscount);
  const taxAmount = (discountedSubtotal * taxRate) / 100;
  const total = discountedSubtotal + taxAmount;

  // ── Line item helpers ───────────────────────────────────────────────────────

  function addProduct(product: Product) {
    const existing = lineItems.find((l) => l.product.id === product.id);
    if (existing) {
      setLineItems(
        lineItems.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        ),
      );
    } else {
      setLineItems([
        ...lineItems,
        {
          product,
          quantity: 1,
          unit_price: product.default_selling_price ?? 0,
          discount: 0,
        },
      ]);
    }
    setShowProductModal(false);
    setProductSearch("");
  }

  function removeLineItem(productId: string) {
    setLineItems(lineItems.filter((l) => l.product.id !== productId));
  }

  function updateLineField(
    productId: string,
    field: "quantity" | "unit_price" | "discount",
    value: number,
  ) {
    setLineItems(
      lineItems.map((l) =>
        l.product.id === productId ? { ...l, [field]: Math.max(0, value) } : l,
      ),
    );
  }

  // ── Order number generation ─────────────────────────────────────────────────

  async function generateOrderNumber(): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const locationCode = (selectedLocation?.name ?? "LOC")
      .substring(0, 3)
      .toUpperCase()
      .padEnd(3, "X");
    const seqKey = `so_seq_${organizationId}_${dateStr}`;
    let seq = Number(await AsyncStorage.getItem(seqKey)) || 0;
    seq += 1;
    await AsyncStorage.setItem(seqKey, seq.toString());
    return `SO-${dateStr}-${locationCode}-${seq.toString().padStart(4, "0")}`;
  }

  // ── Save as draft ───────────────────────────────────────────────────────────

  async function handleSaveDraft() {
    if (!validateForm()) return;
    setSaving(true);
    try {
      await submitOrder("draft");
      Alert.alert(
        "Draft Saved ✓",
        "Sales order saved as draft and will sync when online.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save draft");
    } finally {
      setSaving(false);
    }
  }

  // ── Confirm order ───────────────────────────────────────────────────────────

  async function handleConfirmOrder() {
    if (!validateForm()) return;
    Alert.alert(
      "Confirm Order",
      requiresProduction
        ? "This is a Make-to-Order. Stock availability will not be checked. Confirm?"
        : "Stock will be reserved for this order. Confirm?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setConfirming(true);
            try {
              const orderId = await submitOrder("draft");
              // Queue the confirm RPC as a dependent operation
              await queueOperation({
                module: "sales_orders",
                operation: "confirm_sales_order",
                payload: { orderId },
                dependsOn: orderId,
              });
              Alert.alert(
                "Order Confirmed ✓",
                "Order confirmed and will sync when online.",
                [{ text: "OK", onPress: () => router.back() }],
              );
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to confirm order");
            } finally {
              setConfirming(false);
            }
          },
        },
      ],
    );
  }

  async function submitOrder(status: "draft"): Promise<string> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    if (!organizationId) throw new Error("Organization not found");

    const orderId = Crypto.randomUUID();
    const orderNumber = await generateOrderNumber();

    await queueOperation({
      module: "sales_orders",
      operation: "create_sales_order",
      payload: {
        orderId,
        organizationId,
        locationId: selectedLocation!.id,
        customerId: selectedCustomer!.id,
        orderNumber,
        status,
        orderDate: orderDate.toISOString(),
        expectedDeliveryDate: expectedDeliveryDate?.toISOString() ?? null,
        requiresProduction,
        subtotal,
        discount: parsedOrderDiscount,
        tax: taxAmount,
        totalAmount: total,
        notes: notes.trim() || null,
        createdBy: user.id,
        items: lineItems.map((l) => ({
          productId: l.product.id,
          quantityOrdered: l.quantity,
          unitPrice: l.unit_price,
          discount: l.discount,
          lineTotal: l.quantity * l.unit_price - l.discount,
        })),
      },
    });

    // Invalidate list cache
    await AsyncStorage.removeItem(`sales_orders_${organizationId}`);

    return orderId;
  }

  function validateForm(): boolean {
    if (!selectedCustomer) {
      Alert.alert("Missing Customer", "Please select a customer.");
      return false;
    }
    if (!selectedLocation) {
      Alert.alert("Missing Location", "Please select a location.");
      return false;
    }
    if (lineItems.length === 0) {
      Alert.alert("No Items", "Please add at least one product.");
      return false;
    }
    for (const item of lineItems) {
      if (item.unit_price <= 0) {
        Alert.alert("Missing Price", `${item.product.name} has no price set.`);
        return false;
      }
      if (item.quantity <= 0) {
        Alert.alert(
          "Invalid Quantity",
          `${item.product.name} must have quantity > 0.`,
        );
        return false;
      }
    }
    return true;
  }

  // ── Filtered lists ──────────────────────────────────────────────────────────

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone ?? "").includes(customerSearch),
  );

  const filteredProducts = products
    .filter((p) => {
      const sellable = p.product_type === "product" || p.is_sellable;
      if (!sellable) return false;
      if (!productSearch.trim()) return true;
      return p.name.toLowerCase().includes(productSearch.toLowerCase());
    })
    .slice(0, 30);

  // ── Guards ──────────────────────────────────────────────────────────────────

  if (permissionsLoading) {
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

  if (!hasPermission("sales_orders.create")) return null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>{"<"} Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Sales Order</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        {/* ── Customer ── */}
        <Text style={styles.sectionLabel}>CUSTOMER</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowCustomerModal(true)}
        >
          {selectedCustomer ? (
            <View>
              <Text style={styles.pickerButtonValue}>
                {selectedCustomer.name}
              </Text>
              {selectedCustomer.phone && (
                <Text style={styles.pickerButtonSub}>
                  {selectedCustomer.phone}
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.pickerButtonPlaceholder}>Select customer…</Text>
          )}
          <Text style={styles.pickerChevron}>›</Text>
        </TouchableOpacity>

        {/* Credit limit warning */}
        {selectedCustomer &&
          selectedCustomer.credit_limit > 0 &&
          total > selectedCustomer.credit_limit && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningBannerText}>
                {"⚠"} Order total exceeds this customer&apos;s credit limit of{" "}
                {currency.symbol}
                {selectedCustomer.credit_limit.toLocaleString()}
              </Text>
            </View>
          )}

        {/* ── Location ── */}
        <Text style={styles.sectionLabel}>FULFILLMENT LOCATION</Text>
        {locations.length <= 1 ? (
          <View style={styles.singleLocation}>
            <Text style={styles.singleLocationText}>
              {"📍 "}
              {selectedLocation?.name ?? "No location found"}
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
          >
            {locations.map((loc) => (
              <TouchableOpacity
                key={loc.id}
                style={[
                  styles.chip,
                  selectedLocation?.id === loc.id && styles.chipActive,
                ]}
                onPress={() => setSelectedLocation(loc)}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedLocation?.id === loc.id && styles.chipTextActive,
                  ]}
                >
                  {"📍 "}
                  {loc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── Dates ── */}
        <Text style={styles.sectionLabel}>DATES</Text>
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.fieldLabel}>Order Date</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowOrderDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {orderDate.toLocaleDateString("en-NG", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.fieldLabel}>Expected Delivery</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDeliveryDatePicker(true)}
            >
              <Text
                style={[
                  styles.dateButtonText,
                  !expectedDeliveryDate && styles.datePlaceholder,
                ]}
              >
                {expectedDeliveryDate
                  ? expectedDeliveryDate.toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "Optional"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {showOrderDatePicker && (
          <DateTimePicker
            value={orderDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, date) => {
              setShowOrderDatePicker(false);
              if (date) setOrderDate(date);
            }}
          />
        )}
        {showDeliveryDatePicker && (
          <DateTimePicker
            value={expectedDeliveryDate ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={orderDate}
            onChange={(_, date) => {
              setShowDeliveryDatePicker(false);
              if (date) setExpectedDeliveryDate(date);
            }}
          />
        )}

        {/* ── MTO Toggle ── */}
        <View style={styles.mtoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.mtoLabel}>Make-to-Order (MTO)</Text>
            <Text style={styles.mtoSub}>
              {requiresProduction
                ? "Stock availability will not be checked. Link a production order after confirmation."
                : "Stock will be reserved from inventory on confirmation."}
            </Text>
          </View>
          <Switch
            value={requiresProduction}
            onValueChange={setRequiresProduction}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={requiresProduction ? COLORS.accent : "#f4f3f4"}
          />
        </View>

        {/* ── Line Items ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>LINE ITEMS</Text>
          <TouchableOpacity
            style={styles.addItemButton}
            onPress={() => setShowProductModal(true)}
          >
            <Text style={styles.addItemButtonText}>+ Add Product</Text>
          </TouchableOpacity>
        </View>

        {lineItems.length === 0 ? (
          <TouchableOpacity
            style={styles.emptyItems}
            onPress={() => setShowProductModal(true)}
          >
            <Text style={styles.emptyItemsText}>Tap to add products</Text>
          </TouchableOpacity>
        ) : (
          lineItems.map((item) => (
            <View key={item.product.id} style={styles.lineItem}>
              <View style={styles.lineItemHeader}>
                <Text style={styles.lineItemName} numberOfLines={1}>
                  {item.product.name}
                </Text>
                <TouchableOpacity
                  onPress={() => removeLineItem(item.product.id)}
                >
                  <Text style={styles.removeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.lineItemUnit}>{item.product.unit}</Text>

              <View style={styles.lineItemControls}>
                {/* Quantity */}
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() =>
                      updateLineField(
                        item.product.id,
                        "quantity",
                        item.quantity - 1,
                      )
                    }
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  {editingLineQty === item.product.id ? (
                    <TextInput
                      style={styles.qtyInput}
                      value={item.quantity.toString()}
                      keyboardType="numeric"
                      autoFocus
                      onChangeText={(v) =>
                        updateLineField(
                          item.product.id,
                          "quantity",
                          parseFloat(v) || 0,
                        )
                      }
                      onBlur={() => setEditingLineQty(null)}
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setEditingLineQty(item.product.id)}
                    >
                      <Text style={styles.qtyText}>{item.quantity}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() =>
                      updateLineField(
                        item.product.id,
                        "quantity",
                        item.quantity + 1,
                      )
                    }
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>

                {/* Unit price */}
                <View style={styles.priceField}>
                  <Text style={styles.priceFieldLabel}>Price</Text>
                  {editingLinePrice === item.product.id ? (
                    <TextInput
                      style={styles.priceInput}
                      value={item.unit_price.toString()}
                      keyboardType="decimal-pad"
                      autoFocus
                      onChangeText={(v) =>
                        updateLineField(
                          item.product.id,
                          "unit_price",
                          parseFloat(v) || 0,
                        )
                      }
                      onBlur={() => setEditingLinePrice(null)}
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setEditingLinePrice(item.product.id)}
                    >
                      <Text style={styles.priceValue}>
                        {currency.symbol}
                        {item.unit_price.toLocaleString()} ✎
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Line discount */}
                <View style={styles.priceField}>
                  <Text style={styles.priceFieldLabel}>Disc.</Text>
                  {editingLineDiscount === item.product.id ? (
                    <TextInput
                      style={styles.priceInput}
                      value={item.discount.toString()}
                      keyboardType="decimal-pad"
                      autoFocus
                      onChangeText={(v) =>
                        updateLineField(
                          item.product.id,
                          "discount",
                          parseFloat(v) || 0,
                        )
                      }
                      onBlur={() => setEditingLineDiscount(null)}
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setEditingLineDiscount(item.product.id)}
                    >
                      <Text
                        style={[
                          styles.priceValue,
                          item.discount > 0 && { color: COLORS.danger },
                        ]}
                      >
                        {item.discount > 0
                          ? `-${currency.symbol}${item.discount.toLocaleString()}`
                          : "—"}{" "}
                        ✎
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Line total */}
              <View style={styles.lineTotalRow}>
                <Text style={styles.lineTotalLabel}>Line Total</Text>
                <Text style={styles.lineTotalValue}>
                  {currency.symbol}
                  {(
                    item.quantity * item.unit_price -
                    item.discount
                  ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          ))
        )}

        {/* ── Order Summary ── */}
        {lineItems.length > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>
                {currency.symbol}
                {subtotal.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.summaryRow}
              onPress={() => setShowDiscountModal(true)}
            >
              <Text style={styles.summaryLabel}>Order Discount</Text>
              <Text
                style={[
                  styles.summaryValue,
                  parsedOrderDiscount > 0 && { color: COLORS.danger },
                ]}
              >
                {parsedOrderDiscount > 0
                  ? `-${currency.symbol}${parsedOrderDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                  : "+ Add"}
              </Text>
            </TouchableOpacity>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>VAT ({taxRate}%)</Text>
              <Text style={styles.summaryValue}>
                {currency.symbol}
                {taxAmount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </Text>
            </View>

            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                {currency.symbol}
                {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        )}

        {/* ── Notes ── */}
        <Text style={styles.sectionLabel}>NOTES</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Any special instructions or notes for this order…"
          multiline
          numberOfLines={3}
          placeholderTextColor="#9CA3AF"
        />

        {/* ── Action Buttons ── */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.draftButton, saving && styles.buttonDisabled]}
            onPress={handleSaveDraft}
            disabled={saving || confirming}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <Text style={styles.draftButtonText}>Save as Draft</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.confirmButton, confirming && styles.buttonDisabled]}
            onPress={handleConfirmOrder}
            disabled={saving || confirming}
          >
            {confirming ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.confirmButtonText}>Confirm Order</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── Customer Picker Modal ── */}
      <Modal
        visible={showCustomerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustomerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Customer</Text>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search by name or phone…"
              value={customerSearch}
              onChangeText={setCustomerSearch}
              autoFocus
              placeholderTextColor="#9CA3AF"
            />
            <ScrollView
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
            >
              {filteredCustomers.length === 0 ? (
                <Text style={styles.modalEmpty}>No customers found.</Text>
              ) : (
                filteredCustomers.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.modalItem,
                      selectedCustomer?.id === c.id && styles.modalItemActive,
                    ]}
                    onPress={() => {
                      setSelectedCustomer(c);
                      setShowCustomerModal(false);
                      setCustomerSearch("");
                    }}
                  >
                    <Text style={styles.modalItemName}>{c.name}</Text>
                    {c.phone && (
                      <Text style={styles.modalItemSub}>{c.phone}</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => {
                setShowCustomerModal(false);
                setCustomerSearch("");
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Product Picker Modal ── */}
      <Modal
        visible={showProductModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProductModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Add Product</Text>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search products…"
              value={productSearch}
              onChangeText={setProductSearch}
              autoFocus
              placeholderTextColor="#9CA3AF"
            />
            <ScrollView
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
            >
              {filteredProducts.length === 0 ? (
                <Text style={styles.modalEmpty}>No products found.</Text>
              ) : (
                filteredProducts.map((p) => {
                  const already = lineItems.some((l) => l.product.id === p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.modalItem,
                        already && styles.modalItemAlready,
                      ]}
                      onPress={() => addProduct(p)}
                    >
                      <View style={styles.modalItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modalItemName}>{p.name}</Text>
                          <Text style={styles.modalItemSub}>
                            {p.category ?? "Uncategorised"} · {p.unit}
                          </Text>
                        </View>
                        <Text style={styles.modalItemPrice}>
                          {p.default_selling_price
                            ? `${currency.symbol}${p.default_selling_price.toLocaleString()}`
                            : "No price"}
                        </Text>
                      </View>
                      {already && (
                        <Text style={styles.alreadyBadge}>Already added</Text>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => {
                setShowProductModal(false);
                setProductSearch("");
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Order Discount Modal ── */}
      <Modal
        visible={showDiscountModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDiscountModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: 280 }]}>
            <Text style={styles.modalTitle}>Order Discount</Text>
            <Text style={styles.fieldLabel}>
              Fixed amount ({currency.symbol})
            </Text>
            <TextInput
              style={styles.discountInput}
              value={orderDiscount}
              onChangeText={setOrderDiscount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              autoFocus
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalClearBtn}
                onPress={() => {
                  setOrderDiscount("0");
                  setShowDiscountModal(false);
                }}
              >
                <Text style={styles.modalClearText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalApplyBtn}
                onPress={() => setShowDiscountModal(false)}
              >
                <Text style={styles.modalApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  title: { fontSize: 20, fontWeight: "700", color: COLORS.primary },

  form: { flex: 1, padding: 16 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8E8E93",
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 6,
  },

  // Customer / location pickers
  pickerButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerButtonValue: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  pickerButtonSub: { fontSize: 13, color: COLORS.secondary, marginTop: 2 },
  pickerButtonPlaceholder: { fontSize: 15, color: "#9CA3AF" },
  pickerChevron: { fontSize: 22, color: COLORS.secondary },

  warningBanner: {
    backgroundColor: "#fdecea",
    borderWidth: 1,
    borderColor: "#f5c6cb",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  warningBannerText: { fontSize: 13, color: COLORS.danger, fontWeight: "600" },

  singleLocation: {
    backgroundColor: COLORS.accent + "15",
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 10,
    padding: 12,
  },
  singleLocationText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },

  chipScroll: { marginBottom: 4 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 13, fontWeight: "600", color: COLORS.secondary },
  chipTextActive: { color: COLORS.white },

  // Dates
  row: { flexDirection: "row" },
  dateButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
  },
  dateButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  datePlaceholder: { color: "#9CA3AF" },

  // MTO
  mtoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 14,
    marginTop: 20,
    gap: 12,
  },
  mtoLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  mtoSub: { fontSize: 12, color: COLORS.secondary, lineHeight: 18 },

  // Add item button
  addItemButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addItemButtonText: { color: COLORS.white, fontSize: 13, fontWeight: "700" },

  emptyItems: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    borderStyle: "dashed",
    padding: 32,
    alignItems: "center",
  },
  emptyItemsText: { fontSize: 14, color: "#9CA3AF" },

  // Line items
  lineItem: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lineItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  lineItemName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primary,
    flex: 1,
  },
  lineItemUnit: { fontSize: 12, color: COLORS.secondary, marginBottom: 10 },
  removeBtn: { fontSize: 18, color: COLORS.danger, paddingLeft: 8 },

  lineItemControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyBtnText: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  qtyText: {
    fontSize: 15,
    fontWeight: "700",
    marginHorizontal: 10,
    minWidth: 24,
    textAlign: "center",
    color: COLORS.primary,
  },
  qtyInput: {
    minWidth: 40,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderColor: COLORS.accent,
    color: COLORS.primary,
    paddingVertical: 2,
    marginHorizontal: 8,
  },

  priceField: { alignItems: "flex-start" },
  priceFieldLabel: {
    fontSize: 11,
    color: COLORS.secondary,
    marginBottom: 4,
    fontWeight: "600",
  },
  priceValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  priceInput: {
    fontSize: 14,
    fontWeight: "600",
    borderBottomWidth: 1.5,
    borderColor: COLORS.accent,
    color: COLORS.primary,
    paddingVertical: 2,
    minWidth: 70,
  },

  lineTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  lineTotalLabel: { fontSize: 12, color: COLORS.secondary, fontWeight: "600" },
  lineTotalValue: { fontSize: 15, fontWeight: "700", color: COLORS.primary },

  // Summary
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  summaryLabel: { fontSize: 14, color: COLORS.secondary },
  summaryValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  totalRow: {
    borderTopWidth: 2,
    borderTopColor: COLORS.primary,
    marginTop: 4,
    paddingTop: 12,
    marginBottom: 0,
  },
  totalLabel: { fontSize: 16, fontWeight: "700", color: COLORS.primary },
  totalValue: { fontSize: 20, fontWeight: "700", color: COLORS.primary },

  // Notes
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: COLORS.primary,
  },
  textArea: { height: 80, textAlignVertical: "top" },

  // Action buttons
  actionButtons: { flexDirection: "row", gap: 12, marginTop: 20 },
  draftButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  draftButtonText: { fontSize: 15, fontWeight: "700", color: COLORS.primary },
  confirmButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: COLORS.primary,
  },
  confirmButtonText: { fontSize: 15, fontWeight: "700", color: COLORS.white },
  buttonDisabled: { opacity: 0.5 },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 16,
  },
  modalSearch: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.primary,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalList: { maxHeight: 380 },
  modalEmpty: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
    paddingVertical: 24,
  },
  modalItem: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: COLORS.background,
  },
  modalItemActive: {
    backgroundColor: COLORS.primary + "15",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  modalItemAlready: { opacity: 0.6 },
  modalItemRow: { flexDirection: "row", alignItems: "center" },
  modalItemName: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  modalItemSub: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  modalItemPrice: { fontSize: 14, fontWeight: "700", color: COLORS.accent },
  alreadyBadge: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 4,
    fontStyle: "italic",
  },
  modalCancelBtn: {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: COLORS.secondary },
  discountInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    color: COLORS.primary,
    marginBottom: 16,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalClearBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalClearText: { fontSize: 15, fontWeight: "600", color: COLORS.danger },
  modalApplyBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: "center",
  },
  modalApplyText: { fontSize: 15, fontWeight: "600", color: COLORS.white },
});
