// FILE: app/inventory/adjust.tsx
import { queueOperation } from "@/lib/localDb";
import { syncNow } from "@/lib/syncEngine";
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useAuthStore } from "@/stores/authStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

export default function AdjustInventoryScreen() {
  const { organizationId: storeOrgId } = useAuthStore();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const [currency, setCurrency] = useState({
    symbol: "",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [isBackdated, setIsBackdated] = useState(false);
  const [adjustedDate, setAdjustedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [quantity, setQuantity] = useState("");
  // unitCost meaning:
  //   - no tier selected: cost per base unit (e.g. cost per piece)
  //   - tier selected:    cost per tier unit (e.g. cost per dozen)
  //   downstream always divides by multiplier to get base unit cost
  const [unitCost, setUnitCost] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const [stockOutReason, setStockOutReason] = useState("");
  const [showAcquisitionCosts, setShowAcquisitionCosts] = useState(false);
  const [transportationCost, setTransportationCost] = useState("");
  const [offloadCost, setOffloadCost] = useState("");
  const [customsCost, setCustomsCost] = useState("");
  const [otherCost, setOtherCost] = useState("");
  const [notes, setNotes] = useState("");
  const [productTiers, setProductTiers] = useState<any[]>([]);
  const [selectedTier, setSelectedTier] = useState<any>(null);

  const filteredProducts = productSearch.trim()
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.sku?.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.category?.toLowerCase().includes(productSearch.toLowerCase()),
      )
    : products.slice(0, 5);

  // ── Derived cost helpers ──────────────────────────────────────────────────

  // Base unit cost: when tier active, unitCost is per-tier → divide by multiplier
  function getBaseUnitCost(): number {
    const entered = parseFloat(unitCost) || 0;
    if (selectedTier) {
      const multiplier = selectedTier.quantity_multiplier || 1;
      return multiplier > 0 ? entered / multiplier : 0;
    }
    return entered;
  }

  React.useEffect(() => {
    if (!permissionsLoading && !hasPermission("inventory.adjust")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to adjust inventory",
        [{ text: "OK", onPress: () => router.back() }],
      );
    }
  }, [permissionsLoading, hasPermission]);

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

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setOrganizationId(storeOrgId);
      if (!storeOrgId) {
        Alert.alert("Error", "Organization not found");
        return;
      }

      const cached = await AsyncStorage.getItem(
        `adjust_form_data_${storeOrgId}`,
      );
      if (cached) {
        const {
          products: cp,
          locations: cl,
          suppliers: cs,
        } = JSON.parse(cached);
        setProducts(cp || []);
        setLocations(cl || []);
        setSuppliers(cs || []);
        if (cl?.length > 0) setSelectedLocation(cl[0]);
        if (params.productId && cp) {
          const product = cp.find((p: any) => p.id === params.productId);
          if (product) {
            setSelectedProduct(product);
            fetchProductTiers(product.id);
            if (product.default_cost_price > 0)
              setUnitCost(product.default_cost_price.toString());
            if (product.default_selling_price > 0)
              setSellingPrice(product.default_selling_price.toString());
          }
        }
        setInitialLoading(false);
      }

      const [productsRes, locationsRes, suppliersRes] = await Promise.all([
        supabase
          .from("products")
          .select("*")
          .eq("is_active", true)
          .eq("organization_id", storeOrgId),
        supabase
          .from("locations")
          .select("*")
          .eq("organization_id", storeOrgId)
          .order("created_at", { ascending: true }),
        supabase
          .from("suppliers")
          .select("*")
          .eq("is_active", true)
          .eq("organization_id", storeOrgId)
          .order("name"),
      ]);

      if (productsRes.data) setProducts(productsRes.data);
      if (locationsRes.data) {
        setLocations(locationsRes.data);
        if (locationsRes.data.length > 0)
          setSelectedLocation(locationsRes.data[0]);
      }
      if (suppliersRes.data) setSuppliers(suppliersRes.data);

      await AsyncStorage.setItem(
        `adjust_form_data_${storeOrgId}`,
        JSON.stringify({
          products: productsRes.data || [],
          locations: locationsRes.data || [],
          suppliers: suppliersRes.data || [],
        }),
      );

      if (params.productId && productsRes.data) {
        const product = productsRes.data.find((p) => p.id === params.productId);
        if (product) {
          setSelectedProduct(product);
          fetchProductTiers(product.id);
          if (product.default_cost_price > 0)
            setUnitCost(product.default_cost_price.toString());
          if (product.default_selling_price > 0)
            setSellingPrice(product.default_selling_price.toString());
        }
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setInitialLoading(false);
    }
  }

  function calculateTotalCost() {
    const baseUnitCost = getBaseUnitCost();
    const transport = parseFloat(transportationCost) || 0;
    const offload = parseFloat(offloadCost) || 0;
    const customs = parseFloat(customsCost) || 0;
    const other = parseFloat(otherCost) || 0;
    const qty = parseFloat(quantity) || 1;
    const multiplier = selectedTier?.quantity_multiplier || 1;
    // qty is in tier units; base units = qty * multiplier
    const baseUnits = qty * multiplier;

    const totalAcquisition = transport + offload + customs + other;
    const costPerBaseUnit = baseUnitCost + totalAcquisition / baseUnits;

    return {
      baseTotal: baseUnitCost * baseUnits,
      acquisitionTotal: totalAcquisition,
      grandTotal: baseUnitCost * baseUnits + totalAcquisition,
      costPerUnit: costPerBaseUnit, // always per base unit (e.g. per piece)
    };
  }

  function calculateProfitMargin() {
    const costs = calculateTotalCost();
    const selling = parseFloat(sellingPrice) || 0;
    if (selling === 0 || costs.costPerUnit === 0)
      return { margin: 0, profit: 0, percentage: 0 };
    const profit = selling - costs.costPerUnit;
    const percentage = (profit / selling) * 100;
    return { margin: profit, profit, percentage };
  }

  async function fetchProductTiers(productId: string) {
    try {
      const { data, error } = await supabase
        .from("product_bulk_prices")
        .select("*")
        .eq("product_id", productId)
        .eq("is_active", true);
      if (error) throw error;
      setProductTiers(data || []);
    } catch (err) {
      console.error("Error fetching tiers:", err);
    }
  }

  const handleProductSelect = (product: any) => {
    setSelectedProduct(product);
    setSelectedTier(null);
    setProductSearch("");
    fetchProductTiers(product.id);
    if (product.default_cost_price > 0)
      setUnitCost(product.default_cost_price.toString());
    if (product.default_selling_price > 0)
      setSellingPrice(product.default_selling_price.toString());
  };

  const handleTierSelect = (tier: any) => {
    setSelectedTier(tier);
    if (!tier && selectedProduct) {
      // Returning to base unit — restore product's base cost
      setUnitCost(selectedProduct.default_cost_price?.toString() || "");
    } else {
      // Switching to a tier — clear cost so user enters what they paid per tier unit
      setUnitCost("");
    }
  };

  async function handleSubmit() {
    if (!hasPermission("inventory.adjust")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to adjust inventory",
      );
      return;
    }
    if (!selectedProduct || !selectedLocation) {
      Alert.alert("Error", "Please select a product and location");
      return;
    }
    if (!quantity || parseFloat(quantity) <= 0) {
      Alert.alert("Error", "Please enter a valid quantity");
      return;
    }
    if (direction === "out") {
      if (!stockOutReason || stockOutReason.trim().length < 5) {
        Alert.alert(
          "Error",
          "Please provide a detailed reason for removing stock (minimum 5 characters)",
        );
        return;
      }
    }
    if (direction === "in") {
      if (!unitCost || parseFloat(unitCost) <= 0) {
        Alert.alert(
          "Error",
          selectedTier
            ? `Please enter the cost per ${selectedTier.name}`
            : "Please enter a valid unit cost",
        );
        return;
      }
      const isSellable = selectedProduct?.is_sellable !== false;
      if (isSellable && (!sellingPrice || parseFloat(sellingPrice) <= 0)) {
        Alert.alert("Error", "Please enter a valid selling price");
        return;
      }
    }

    const costs = calculateTotalCost();
    const profitInfo = calculateProfitMargin();
    const multiplier = selectedTier?.quantity_multiplier || 1;
    const baseQuantity = parseFloat(quantity) * multiplier;

    Alert.alert(
      "Confirm Adjustment",
      `${direction === "in" ? "Add" : "Remove"} ${quantity} ${
        selectedTier
          ? `${selectedTier.name}${parseFloat(quantity) > 1 ? "s" : ""} (= ${baseQuantity} ${selectedProduct.unit})`
          : selectedProduct.unit
      } ${direction === "in" ? "to" : "from"} ${selectedProduct.name}?

${
  direction === "in"
    ? `${selectedSupplier ? `Supplier: ${selectedSupplier.name}\n` : ""}${selectedTier ? `Cost per ${selectedTier.name}: ${currency.symbol}${parseFloat(unitCost).toFixed(2)}\n` : ""}Cost per ${selectedProduct.unit}: ${currency.symbol}${costs.costPerUnit.toFixed(2)}
Selling price: ${currency.symbol}${parseFloat(sellingPrice).toFixed(2)}
Profit margin: ${currency.symbol}${profitInfo.margin.toFixed(2)} (${profitInfo.percentage.toFixed(1)}%)
${costs.acquisitionTotal > 0 ? `\nAcquisition costs: ${currency.symbol}${costs.acquisitionTotal.toFixed(2)}` : ""}
Grand total: ${currency.symbol}${costs.grandTotal.toFixed(2)}`
    : `Reason: ${stockOutReason}`
}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => processAdjustment(costs) },
      ],
    );
  }

  async function processAdjustment(costs: any) {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (!storeOrgId) throw new Error("Organization not found");

      const multiplier = selectedTier?.quantity_multiplier || 1;
      const baseQuantity = parseFloat(quantity) * multiplier;
      const occurredAt = isBackdated
        ? adjustedDate.toISOString()
        : new Date().toISOString();

      if (direction === "in") {
        await queueOperation({
          module: "inventory",
          operation: "stock_in",
          payload: {
            organizationId: storeOrgId,
            userId: user.id,
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            locationId: selectedLocation.id,
            supplierId: selectedSupplier?.id || null,
            supplierName: selectedSupplier?.name || null,
            quantity: parseFloat(quantity),
            tierMultiplier: multiplier,
            tierName: selectedTier?.name || null,
            // costPerTier: what the user entered (per dozen, per carton, etc.)
            costPerTier: selectedTier ? parseFloat(unitCost) : null,
            // baseUnitCost: derived per-piece cost — what hits COGS
            baseUnitCost: costs.costPerUnit,
            costPerUnit: costs.costPerUnit,
            grandTotal: costs.grandTotal,
            sellingPrice: parseFloat(sellingPrice),
            acquisitionCosts: {
              transportation: parseFloat(transportationCost) || 0,
              offload: parseFloat(offloadCost) || 0,
              customs: parseFloat(customsCost) || 0,
              other: parseFloat(otherCost) || 0,
            },
            acquisitionTotal: costs.acquisitionTotal,
            notes: notes.trim() || null,
            occurredAt,
          },
        });

        try {
          const cacheKey = `inventory_${storeOrgId}`;
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            const items = JSON.parse(cached);
            const existing = items.find(
              (i: any) =>
                i.product_id === selectedProduct.id &&
                i.location_id === selectedLocation.id,
            );
            if (existing) {
              existing.quantity_on_hand += baseQuantity;
              existing.weighted_avg_cost = costs.costPerUnit;
            } else {
              items.push({
                product_id: selectedProduct.id,
                location_id: selectedLocation.id,
                quantity_on_hand: baseQuantity,
                weighted_avg_cost: costs.costPerUnit,
                products: {
                  name: selectedProduct.name,
                  sku: selectedProduct.sku,
                  unit: selectedProduct.unit,
                  category: selectedProduct.category,
                },
                locations: { name: selectedLocation.name },
              });
            }
            await AsyncStorage.setItem(cacheKey, JSON.stringify(items));
          }
        } catch {}

        await syncNow();

        Alert.alert(
          "Stock Added ✓",
          `${selectedProduct.name} ×${baseQuantity} ${selectedProduct.unit} recorded successfully.\n\nThis has been saved as an unpaid purchase. Go to Purchases to record payment when ready.`,
          [{ text: "OK", onPress: () => router.replace("/(tabs)/inventory") }],
        );
      } else {
        await queueOperation({
          module: "inventory",
          operation: "stock_out",
          payload: {
            organizationId: storeOrgId,
            userId: user.id,
            productId: selectedProduct.id,
            locationId: selectedLocation.id,
            quantity: parseFloat(quantity),
            unitCost: selectedProduct.default_cost_price || 0,
            reason: stockOutReason.trim(),
            isBackdated,
            occurredAt,
          },
        });

        try {
          const cacheKey = `inventory_${storeOrgId}`;
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            const items = JSON.parse(cached);
            const existing = items.find(
              (i: any) =>
                i.product_id === selectedProduct.id &&
                i.location_id === selectedLocation.id,
            );
            if (existing) {
              existing.quantity_on_hand = Math.max(
                0,
                existing.quantity_on_hand - parseFloat(quantity),
              );
            }
            await AsyncStorage.setItem(cacheKey, JSON.stringify(items));
          }
        } catch {}

        await syncNow();

        Alert.alert(
          "Stock Removed ✓",
          `Removed ${parseFloat(quantity)} ${selectedProduct.unit} of ${selectedProduct.name}.`,
          [{ text: "OK", onPress: () => router.replace("/(tabs)/inventory") }],
        );
      }
    } catch (err: any) {
      console.error("Unexpected error:", err);
      Alert.alert(
        "Error",
        err.message || "Failed to queue inventory adjustment",
      );
    } finally {
      setLoading(false);
    }
  }

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
  if (!hasPermission("inventory.adjust")) return null;
  if (initialLoading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const costs = calculateTotalCost();
  const profitInfo = calculateProfitMargin();

  // Cost field label — changes based on selected tier
  const costFieldLabel = selectedTier
    ? `Cost per ${selectedTier.name} (${currency.symbol})`
    : `Cost per ${selectedProduct?.unit || "unit"} (${currency.symbol})`;

  // Derived per-unit hint — only shown when tier is active and cost is entered
  const derivedUnitCost =
    selectedTier && parseFloat(unitCost) > 0
      ? parseFloat(unitCost) / (selectedTier.quantity_multiplier || 1)
      : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Adjust Inventory</Text>
        <TouchableOpacity onPress={() => router.push("/inventory/bulk-adjust")}>
          <Text style={styles.bulkButton}>Bulk →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.form}>
        {/* Direction */}
        <View style={styles.section}>
          <View style={styles.directionButtons}>
            <TouchableOpacity
              style={[
                styles.directionButton,
                direction === "in" && styles.directionButtonActive,
              ]}
              onPress={() => setDirection("in")}
            >
              <Text
                style={[
                  styles.directionButtonText,
                  direction === "in" && styles.directionButtonTextActive,
                ]}
              >
                ⬇️ Stock In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.directionButton,
                direction === "out" && styles.directionButtonActive,
              ]}
              onPress={() => setDirection("out")}
            >
              <Text
                style={[
                  styles.directionButtonText,
                  direction === "out" && styles.directionButtonTextActive,
                ]}
              >
                ⬆️ Stock Out
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Product Search */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Product{selectedProduct ? `: ${selectedProduct.name}` : ""}
          </Text>
          <View style={styles.searchWrap}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, SKU or category…"
              placeholderTextColor={COLORS.secondary}
              value={productSearch}
              onChangeText={setProductSearch}
            />
            {productSearch.length > 0 && (
              <TouchableOpacity onPress={() => setProductSearch("")}>
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {selectedProduct && productSearch.length === 0 && (
            <View style={styles.selectedProductBadge}>
              <Text style={styles.selectedProductText}>
                {selectedProduct.name}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedProduct(null);
                  setProductTiers([]);
                  setSelectedTier(null);
                }}
              >
                <Text style={styles.selectedProductClear}>Change</Text>
              </TouchableOpacity>
            </View>
          )}

          {(productSearch.length > 0 || !selectedProduct) && (
            <View style={styles.searchResults}>
              {filteredProducts.length === 0 ? (
                <Text style={styles.searchEmpty}>
                  No products match &quot;{productSearch}&quot;
                </Text>
              ) : (
                filteredProducts.map((product) => (
                  <TouchableOpacity
                    key={product.id}
                    style={[
                      styles.searchResultRow,
                      selectedProduct?.id === product.id &&
                        styles.searchResultRowActive,
                    ]}
                    onPress={() => handleProductSelect(product)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.searchResultName,
                          selectedProduct?.id === product.id &&
                            styles.searchResultNameActive,
                        ]}
                      >
                        {product.name}
                      </Text>
                      {(product.category || product.sku) && (
                        <Text style={styles.searchResultMeta}>
                          {[
                            product.category,
                            product.sku ? `SKU: ${product.sku}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      )}
                    </View>
                    {selectedProduct?.id === product.id && (
                      <Text style={styles.searchResultCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>

        {/* Location */}
        <View style={styles.section}>
          <View style={styles.locationHeader}>
            <Text style={styles.sectionTitle}>Location</Text>
            <TouchableOpacity onPress={() => router.push("/locations" as any)}>
              <Text style={styles.addLocationButton}>+ New</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {locations.length === 0 ? (
              <View style={styles.noLocationWarning}>
                <Text style={styles.noLocationText}>
                  No locations found. Add a location first.
                </Text>
              </View>
            ) : (
              locations.map((location) => (
                <TouchableOpacity
                  key={location.id}
                  style={[
                    styles.chip,
                    selectedLocation?.id === location.id && styles.chipActive,
                  ]}
                  onPress={() => setSelectedLocation(location)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedLocation?.id === location.id &&
                        styles.chipTextActive,
                    ]}
                  >
                    📍 {location.name}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>

        {/* Stocking Unit / Tier */}
        {selectedProduct && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stocking Unit</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.chip, !selectedTier && styles.chipActive]}
                onPress={() => handleTierSelect(null)}
              >
                <Text
                  style={[
                    styles.chipText,
                    !selectedTier && styles.chipTextActive,
                  ]}
                >
                  {selectedProduct.unit || "Unit"} (Base)
                </Text>
              </TouchableOpacity>
              {productTiers.map((tier) => (
                <TouchableOpacity
                  key={tier.id}
                  style={[
                    styles.chip,
                    selectedTier?.id === tier.id && styles.chipActive,
                  ]}
                  onPress={() => handleTierSelect(tier)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedTier?.id === tier.id && styles.chipTextActive,
                    ]}
                  >
                    {tier.name} (×{tier.quantity_multiplier})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Quantity */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {selectedTier
              ? `How many ${selectedTier.name}s are you stocking in?`
              : `Quantity (${selectedProduct?.unit || "units"})`}{" "}
            <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
            placeholder="0"
            editable={!loading}
          />
          {selectedTier && parseFloat(quantity) > 0 && (
            <View style={styles.conversionBanner}>
              <Text style={styles.conversionText}>
                {quantity} {selectedTier.name}
                {parseFloat(quantity) > 1 ? "s" : ""} ×{" "}
                {selectedTier.quantity_multiplier} {selectedProduct?.unit}/
                {selectedTier.name} ={" "}
                <Text style={styles.conversionHighlight}>
                  {(
                    parseFloat(quantity) * selectedTier.quantity_multiplier
                  ).toFixed(0)}{" "}
                  {selectedProduct?.unit} total
                </Text>
              </Text>
            </View>
          )}
        </View>

        {/* Backdating */}
        <View style={styles.backdatingSection}>
          <TouchableOpacity
            style={styles.backdatingToggle}
            onPress={() => {
              setIsBackdated(!isBackdated);
              if (!isBackdated) setShowDatePicker(true);
            }}
          >
            <View style={styles.toggleRow}>
              <View style={styles.toggleLeft}>
                <Text style={styles.toggleLabel}>📅 Historical Entry</Text>
                <Text style={styles.toggleSubtext}>
                  Record adjustment from a past date
                </Text>
              </View>
              <View
                style={[
                  styles.toggleSwitch,
                  isBackdated && styles.toggleSwitchActive,
                ]}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    isBackdated && styles.toggleKnobActive,
                  ]}
                />
              </View>
            </View>
          </TouchableOpacity>

          {isBackdated && (
            <View style={styles.datePickerSection}>
              <View style={styles.warningBox}>
                <Text style={styles.warningIcon}>⚠️</Text>
                <Text style={styles.warningText}>
                  Backdated entries. Only use for catching up on historical
                  data.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.dateButtonLabel}>Adjustment Date:</Text>
                <Text style={styles.dateButtonValue}>
                  {adjustedDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
                <Text style={styles.dateButtonIcon}>📆</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={adjustedDate}
                  mode="date"
                  display="default"
                  maximumDate={new Date()}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === "ios");
                    if (selectedDate) setAdjustedDate(selectedDate);
                  }}
                />
              )}
            </View>
          )}
        </View>

        {/* Stock Out Reason */}
        {direction === "out" && (
          <View style={styles.reasonSection}>
            <View style={styles.reasonHeader}>
              <Text style={styles.reasonTitle}>
                ⚠️ Reason for Stock Removal{" "}
                <Text style={styles.required}>*</Text>
              </Text>
              <Text style={styles.reasonSubtitle}>
                This cannot be changed later. Be specific.
              </Text>
            </View>
            <TextInput
              style={[styles.input, styles.textArea, styles.reasonInput]}
              value={stockOutReason}
              onChangeText={setStockOutReason}
              placeholder="E.g., Damaged goods, Customer return, Internal use, Theft, Expired, Transfer to X location..."
              multiline
              numberOfLines={4}
              editable={!loading}
              maxLength={500}
            />
            <Text style={styles.charCount}>
              {stockOutReason.length}/500 characters
            </Text>
          </View>
        )}

        {/* Stock In fields */}
        {direction === "in" && (
          <>
            <View style={styles.section}>
              <View style={styles.supplierHeader}>
                <Text style={styles.sectionTitle}>Supplier (Optional)</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity
                  style={[styles.chip, !selectedSupplier && styles.chipActive]}
                  onPress={() => setSelectedSupplier(null)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      !selectedSupplier && styles.chipTextActive,
                    ]}
                  >
                    None
                  </Text>
                </TouchableOpacity>
                {suppliers.map((supplier) => (
                  <TouchableOpacity
                    key={supplier.id}
                    style={[
                      styles.chip,
                      selectedSupplier?.id === supplier.id && styles.chipActive,
                    ]}
                    onPress={() => setSelectedSupplier(supplier)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedSupplier?.id === supplier.id &&
                          styles.chipTextActive,
                      ]}
                    >
                      🏢 {supplier.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Cost field — label and hint change based on selected tier */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {costFieldLabel} <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={unitCost}
                onChangeText={setUnitCost}
                keyboardType="numeric"
                placeholder="0.00"
                editable={!loading}
              />
              {/* Derived per-unit hint when tier is active */}
              {derivedUnitCost !== null && (
                <View style={styles.derivedCostHint}>
                  <Text style={styles.derivedCostText}>
                    = {currency.symbol}
                    {derivedUnitCost.toFixed(2)} per {selectedProduct?.unit}
                  </Text>
                </View>
              )}
            </View>

            {selectedProduct?.is_sellable !== false && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Selling Price per {selectedProduct?.unit || "unit"} (
                  {currency.symbol}) <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={sellingPrice}
                  onChangeText={setSellingPrice}
                  keyboardType="numeric"
                  placeholder="0.00"
                />
              </View>
            )}

            {parseFloat(unitCost) > 0 && parseFloat(sellingPrice) > 0 && (
              <View style={styles.profitCard}>
                <View style={styles.profitRow}>
                  <Text style={styles.profitLabel}>
                    Gross Profit per {selectedProduct?.unit || "unit"}:
                  </Text>
                  <Text
                    style={[
                      styles.profitValue,
                      {
                        color:
                          profitInfo.margin >= 0
                            ? COLORS.success
                            : COLORS.danger,
                      },
                    ]}
                  >
                    {currency.symbol}
                    {profitInfo.margin.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.profitRow}>
                  <Text style={styles.profitLabel}>Margin:</Text>
                  <Text
                    style={[
                      styles.profitValue,
                      {
                        color:
                          profitInfo.percentage >= 0
                            ? COLORS.success
                            : COLORS.danger,
                      },
                    ]}
                  >
                    {profitInfo.percentage.toFixed(1)}%
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setShowAcquisitionCosts(!showAcquisitionCosts)}
            >
              <Text style={styles.toggleButtonText}>
                {showAcquisitionCosts ? "▼" : "▶"} Acquisition Costs (Optional)
              </Text>
            </TouchableOpacity>

            {showAcquisitionCosts && (
              <View style={styles.acquisitionSection}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    Transportation ({currency.symbol})
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={transportationCost}
                    onChangeText={setTransportationCost}
                    keyboardType="numeric"
                    placeholder="0.00"
                    editable={!loading}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Offload ({currency.symbol})</Text>
                  <TextInput
                    style={styles.input}
                    value={offloadCost}
                    onChangeText={setOffloadCost}
                    keyboardType="numeric"
                    placeholder="0.00"
                    editable={!loading}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    Customs/Duty ({currency.symbol})
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={customsCost}
                    onChangeText={setCustomsCost}
                    keyboardType="numeric"
                    placeholder="0.00"
                    editable={!loading}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    Other Costs ({currency.symbol})
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={otherCost}
                    onChangeText={setOtherCost}
                    keyboardType="numeric"
                    placeholder="0.00"
                    editable={!loading}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Notes</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Additional notes..."
                    multiline
                    numberOfLines={3}
                    editable={!loading}
                  />
                </View>
              </View>
            )}

            {parseFloat(quantity) > 0 && parseFloat(unitCost) > 0 && (
              <View style={styles.costSummary}>
                <Text style={styles.summaryTitle}>Cost Summary</Text>
                {selectedTier && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>
                      Cost per {selectedTier.name}:
                    </Text>
                    <Text style={styles.summaryValue}>
                      {currency.symbol}
                      {parseFloat(unitCost).toFixed(2)}
                    </Text>
                  </View>
                )}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Cost per {selectedProduct?.unit || "unit"}:
                  </Text>
                  <Text style={styles.summaryValue}>
                    {currency.symbol}
                    {costs.costPerUnit.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Base Cost:</Text>
                  <Text style={styles.summaryValue}>
                    {currency.symbol}
                    {costs.baseTotal.toFixed(2)}
                  </Text>
                </View>
                {costs.acquisitionTotal > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Acquisition:</Text>
                    <Text style={styles.summaryValue}>
                      {currency.symbol}
                      {costs.acquisitionTotal.toFixed(2)}
                    </Text>
                  </View>
                )}
                <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                  <Text style={styles.summaryLabelBold}>Total Cost:</Text>
                  <Text style={styles.summaryValueBold}>
                    {currency.symbol}
                    {costs.grandTotal.toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.submitButtonText}>
              {direction === "in" ? "Add Stock" : "Remove Stock"}
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 48 }} />
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
  backButton: { fontSize: 16, color: COLORS.primary },
  title: { fontSize: 20, fontWeight: "600", color: COLORS.primary },
  bulkButton: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  form: { flex: 1, padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 12,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 8,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.primary },
  searchClear: { fontSize: 16, color: COLORS.secondary, paddingLeft: 8 },
  searchResults: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchResultRowActive: { backgroundColor: "#EEF9F8" },
  searchResultName: { fontSize: 15, fontWeight: "500", color: COLORS.primary },
  searchResultNameActive: { color: COLORS.accent },
  searchResultMeta: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  searchResultCheck: {
    fontSize: 16,
    color: COLORS.accent,
    fontWeight: "700",
    marginLeft: 8,
  },
  searchEmpty: {
    padding: 16,
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
  },
  selectedProductBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#EEF9F8",
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedProductText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
  },
  selectedProductClear: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: "600",
  },
  locationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addLocationButton: { fontSize: 14, fontWeight: "600", color: COLORS.accent },
  noLocationWarning: {
    backgroundColor: "#FFF3CD",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFC107",
  },
  noLocationText: { fontSize: 13, color: "#92400E", fontWeight: "500" },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    marginRight: 8,
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  chipText: { fontSize: 14, fontWeight: "500", color: COLORS.secondary },
  chipTextActive: { color: COLORS.white },
  inputGroup: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 8,
  },
  required: { color: COLORS.danger },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: { height: 80, textAlignVertical: "top" },
  // NEW: derived cost hint below the cost input when tier is active
  derivedCostHint: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignSelf: "flex-start",
  },
  derivedCostText: {
    fontSize: 13,
    color: "#1E40AF",
    fontWeight: "600",
  },
  directionButtons: { flexDirection: "row", gap: 12 },
  directionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
  },
  directionButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  directionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  directionButtonTextActive: { color: COLORS.white },
  conversionBanner: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  conversionText: { fontSize: 13, color: "#1E40AF" },
  conversionHighlight: { fontWeight: "700" },
  backdatingSection: { marginBottom: 20 },
  backdatingToggle: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    padding: 16,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleLeft: { flex: 1 },
  toggleLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  toggleSubtext: { fontSize: 13, color: COLORS.secondary },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    padding: 2,
    justifyContent: "center",
  },
  toggleSwitchActive: { backgroundColor: COLORS.accent },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleKnobActive: { transform: [{ translateX: 22 }] },
  datePickerSection: { marginTop: 16 },
  warningBox: {
    flexDirection: "row",
    backgroundColor: "#FFF9E6",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFC107",
    marginBottom: 12,
  },
  warningIcon: { fontSize: 20, marginRight: 8 },
  warningText: { flex: 1, fontSize: 13, color: "#92400E", lineHeight: 18 },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  dateButtonLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
    marginRight: 8,
  },
  dateButtonValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
  },
  dateButtonIcon: { fontSize: 20 },
  reasonSection: {
    backgroundColor: "#FFF9E6",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#FFC107",
  },
  reasonHeader: { marginBottom: 12 },
  reasonTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 4,
  },
  reasonSubtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    fontStyle: "italic",
  },
  reasonInput: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: "#FFC107",
    minHeight: 100,
  },
  charCount: {
    fontSize: 11,
    color: COLORS.secondary,
    textAlign: "right",
    marginTop: 4,
  },
  supplierHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addSupplierButton: { fontSize: 14, fontWeight: "600", color: COLORS.accent },
  profitCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.success,
  },
  profitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  profitLabel: { fontSize: 14, color: COLORS.secondary },
  profitValue: { fontSize: 16, fontWeight: "600" },
  toggleButton: {
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  toggleButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  acquisitionSection: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  costSummary: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryRowTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  summaryLabel: { fontSize: 14, color: COLORS.secondary },
  summaryValue: { fontSize: 14, fontWeight: "500", color: COLORS.primary },
  summaryLabelBold: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  summaryValueBold: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  submitButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  buttonDisabled: { backgroundColor: COLORS.gray[400] },
  submitButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
});
