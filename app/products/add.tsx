// FILE: app/products/add.tsx
// Merged: Add Product + optional Initial Stock In (one form, two outbox entries)

import { queueOperation } from "@/lib/localDb";
import { syncNow } from "@/lib/syncEngine";
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useAuthStore } from "@/stores/authStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

interface BulkPrice {
  id: string;
  name: string;
  quantity_multiplier: string;
  total_price: string;
}

export default function AddProductScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();
  const [loading, setLoading] = useState(false);

  // ── Currency ──────────────────────────────────────────────────────────────
  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  // ── Product fields ────────────────────────────────────────────────────────
  const [productType, setProductType] = useState<
    "product" | "raw_material" | "semi_finished"
  >("product");
  const [isSellable, setIsSellable] = useState(true);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [defaultSellingPrice, setDefaultSellingPrice] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [bulkPrices, setBulkPrices] = useState<BulkPrice[]>([]);

  // ── Initial stock toggle ──────────────────────────────────────────────────
  const [addInitialStock, setAddInitialStock] = useState(false);

  // ── Stock fields (mirrors adjust.tsx stock-in) ────────────────────────────
  const [locations, setLocations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [stockQuantity, setStockQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [showAcquisitionCosts, setShowAcquisitionCosts] = useState(false);
  const [transportationCost, setTransportationCost] = useState("");
  const [offloadCost, setOffloadCost] = useState("");
  const [customsCost, setCustomsCost] = useState("");
  const [otherCost, setOtherCost] = useState("");
  const [stockNotes, setStockNotes] = useState("");

  // ── Derived ───────────────────────────────────────────────────────────────
  const isRetailProduct = productType === "product";
  const showSellableToggle =
    productType === "raw_material" || productType === "semi_finished";
  const effectiveIsSellable = isRetailProduct ? true : isSellable;

  // ── Load currency + locations/suppliers for stock section ─────────────────
  useEffect(() => {
    async function init() {
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

      // Load locations + suppliers from cache first, then network
      try {
        const cached = await AsyncStorage.getItem(
          `adjust_form_data_${organizationId}`,
        );
        if (cached) {
          const { locations: cl, suppliers: cs } = JSON.parse(cached);
          if (cl?.length) {
            setLocations(cl);
            setSelectedLocation(cl[0]);
          }
          if (cs?.length) setSuppliers(cs);
        }
      } catch {}

      try {
        const [locRes, supRes] = await Promise.all([
          supabase
            .from("locations")
            .select("*")
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: true }),
          supabase
            .from("suppliers")
            .select("*")
            .eq("is_active", true)
            .eq("organization_id", organizationId)
            .order("name"),
        ]);
        if (locRes.data) {
          setLocations(locRes.data);
          if (locRes.data.length > 0) setSelectedLocation(locRes.data[0]);
        }
        if (supRes.data) setSuppliers(supRes.data);
      } catch {}
    }
    init();
  }, [organizationId]);

  // ── Cost math (identical to adjust.tsx) ───────────────────────────────────
  function calculateTotalCost() {
    const baseUnitCost = parseFloat(unitCost) || 0;
    const transport = parseFloat(transportationCost) || 0;
    const offload = parseFloat(offloadCost) || 0;
    const customs = parseFloat(customsCost) || 0;
    const other = parseFloat(otherCost) || 0;
    const qty = parseFloat(stockQuantity) || 1;

    const totalAcquisition = transport + offload + customs + other;
    const costPerUnit = baseUnitCost + totalAcquisition / qty;

    return {
      baseTotal: baseUnitCost * qty,
      acquisitionTotal: totalAcquisition,
      grandTotal: baseUnitCost * qty + totalAcquisition,
      costPerUnit,
    };
  }

  function calculateProfitMargin() {
    const costs = calculateTotalCost();
    const selling = parseFloat(defaultSellingPrice) || 0;
    if (selling === 0 || costs.costPerUnit === 0)
      return { margin: 0, profit: 0, percentage: 0 };
    const profit = selling - costs.costPerUnit;
    const percentage = (profit / selling) * 100;
    return { margin: profit, profit, percentage };
  }

  // ── Bulk price helpers ────────────────────────────────────────────────────
  function addBulkPrice() {
    setBulkPrices([
      ...bulkPrices,
      {
        id: Math.random().toString(),
        name: "",
        quantity_multiplier: "",
        total_price: "",
      },
    ]);
  }
  function removeBulkPrice(id: string) {
    setBulkPrices(bulkPrices.filter((bp) => bp.id !== id));
  }
  function updateBulkPrice(id: string, field: keyof BulkPrice, value: string) {
    setBulkPrices(
      bulkPrices.map((bp) => (bp.id === id ? { ...bp, [field]: value } : bp)),
    );
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!name.trim()) return "Product name is required";
    if (effectiveIsSellable) {
      if (!defaultSellingPrice || parseFloat(defaultSellingPrice) <= 0)
        return "Selling price is required and must be greater than 0";
    }
    for (const bp of bulkPrices) {
      if (!bp.name.trim()) return "All bulk price tiers must have a name";
      if (!bp.quantity_multiplier || parseFloat(bp.quantity_multiplier) <= 0)
        return "All bulk price tiers must have a valid quantity multiplier";
      if (!bp.total_price || parseFloat(bp.total_price) <= 0)
        return "All bulk price tiers must have a valid total price";
    }
    if (addInitialStock) {
      if (!selectedLocation)
        return "Please select a location for the initial stock";
      if (!stockQuantity || parseFloat(stockQuantity) <= 0)
        return "Please enter a valid quantity for initial stock";
      if (!unitCost || parseFloat(unitCost) <= 0)
        return "Please enter a valid unit cost for initial stock";
    }
    return null;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const err = validate();
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    if (!organizationId) {
      Alert.alert("Error", "No organization found");
      return;
    }

    const costs = calculateTotalCost();
    const profitInfo = calculateProfitMargin();

    const confirmMsg = addInitialStock
      ? `Add "${name.trim()}" with ${stockQuantity} ${unit} initial stock at ${currency.symbol}${costs.costPerUnit.toFixed(2)}/unit?\n\nTotal cost: ${currency.symbol}${costs.grandTotal.toFixed(2)}${effectiveIsSellable ? `\nMargin: ${profitInfo.percentage.toFixed(1)}%` : ""}`
      : `Add "${name.trim()}" with no initial stock?`;

    Alert.alert("Confirm", confirmMsg, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: () => processSubmit(costs) },
    ]);
  }

  async function processSubmit(costs: ReturnType<typeof calculateTotalCost>) {
    if (!organizationId) return;
    setLoading(true);
    try {
      // 1. Build bulk tiers payload
      const tiersPayload = bulkPrices.map((bp) => {
        const qty = parseFloat(bp.quantity_multiplier);
        const total = parseFloat(bp.total_price);
        return {
          id: bp.id,
          name: bp.name.trim(),
          quantity_multiplier: qty,
          unit_price: total / qty,
          is_active: true,
          archived_at: null,
          is_new: true,
        };
      });

      // 2. Queue product creation
      await queueOperation({
        module: "products",
        operation: "create_product",
        payload: {
          organizationId,
          name: name.trim(),
          sku: sku.trim() || null,
          category: category.trim() || null,
          unit: unit.trim(),
          defaultSellingPrice: effectiveIsSellable
            ? parseFloat(defaultSellingPrice)
            : 0,
          isActive,
          productType,
          isSellable: effectiveIsSellable,
          bulkTiers: tiersPayload,
        },
      });

      // 3. Optimistically update products cache
      try {
        const cacheKey = `products_${organizationId}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const items = JSON.parse(cached);
          const pendingId = `pending_${Date.now()}`;
          items.push({
            id: pendingId,
            organization_id: organizationId,
            name: name.trim(),
            sku: sku.trim() || null,
            category: category.trim() || null,
            unit: unit.trim(),
            default_selling_price: effectiveIsSellable
              ? parseFloat(defaultSellingPrice)
              : 0,
            default_cost_price: addInitialStock ? costs.costPerUnit : 0,
            is_active: isActive,
            product_type: productType,
            is_sellable: effectiveIsSellable,
          });
          items.sort((a: any, b: any) => a.name.localeCompare(b.name));
          await AsyncStorage.setItem(cacheKey, JSON.stringify(items));
        }
      } catch {}

      // 4. If initial stock requested, queue stock_in too
      if (addInitialStock && selectedLocation) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const qty = parseFloat(stockQuantity);

        await queueOperation({
          module: "inventory",
          operation: "stock_in",
          payload: {
            organizationId,
            userId: user.id,
            // productId will be a pending local ID — the sync engine must handle
            // this gracefully (stock_in handler reads productId from outbox sequence)
            // We pass name so the handler can look it up if needed
            productId: `pending_product_${name.trim().toLowerCase().replace(/\s+/g, "_")}`,
            productName: name.trim(),
            locationId: selectedLocation.id,
            supplierId: selectedSupplier?.id || null,
            supplierName: selectedSupplier?.name || null,
            quantity: qty,
            tierMultiplier: 1,
            tierName: null,
            costPerTier: null,
            baseUnitCost: costs.costPerUnit,
            costPerUnit: costs.costPerUnit,
            grandTotal: costs.grandTotal,
            sellingPrice: effectiveIsSellable
              ? parseFloat(defaultSellingPrice)
              : 0,
            acquisitionCosts: {
              transportation: parseFloat(transportationCost) || 0,
              offload: parseFloat(offloadCost) || 0,
              customs: parseFloat(customsCost) || 0,
              other: parseFloat(otherCost) || 0,
            },
            acquisitionTotal: costs.acquisitionTotal,
            notes: stockNotes.trim() || null,
            occurredAt: new Date().toISOString(),
            // Flag: syncHandler should resolve productId from the preceding
            // create_product entry before executing this stock_in
            awaitsPrecedingProduct: true,
          },
        });

        // Optimistically update inventory cache
        try {
          const invCacheKey = `inventory_${organizationId}`;
          const invCached = await AsyncStorage.getItem(invCacheKey);
          if (invCached) {
            const items = JSON.parse(invCached);
            items.push({
              product_id: `pending_product_${name.trim().toLowerCase().replace(/\s+/g, "_")}`,
              location_id: selectedLocation.id,
              quantity_on_hand: qty,
              weighted_avg_cost: costs.costPerUnit,
              products: {
                name: name.trim(),
                sku: sku.trim() || null,
                unit: unit.trim(),
                category: category.trim() || null,
              },
              locations: { name: selectedLocation.name },
            });
            await AsyncStorage.setItem(invCacheKey, JSON.stringify(items));
          }
        } catch {}
      }

      await syncNow();

      const successMsg = addInitialStock
        ? `"${name.trim()}" added with ${stockQuantity} ${unit} in stock.\n\nThe stock has been saved as an unpaid purchase. Go to Purchases to record payment when ready.`
        : `"${name.trim()}" has been saved and will sync automatically when online.`;

      Alert.alert("Product Saved ✓", successMsg, [
        { text: "OK", onPress: () => router.replace("/(tabs)") },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Guard renders ─────────────────────────────────────────────────────────
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

  if (!hasPermission("products.create")) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Product</Text>
          <View style={{ width: 60 }} />
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
            You do not have permission to add products.
          </Text>
        </View>
      </View>
    );
  }

  const costs = calculateTotalCost();
  const profitInfo = calculateProfitMargin();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add Product</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.form}>
        {/* ── SECTION: Product Details ── */}
        <Text style={styles.sectionHeader}>Product Details</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Product Name <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Rice 50kg"
            editable={!loading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>SKU (Optional)</Text>
          <TextInput
            style={styles.input}
            value={sku}
            onChangeText={setSku}
            placeholder="e.g., RICE-50KG-001"
            editable={!loading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Category (Optional)</Text>
          <TextInput
            style={styles.input}
            value={category}
            onChangeText={setCategory}
            placeholder="e.g., Grains"
            editable={!loading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Unit</Text>
          <TextInput
            style={styles.input}
            value={unit}
            onChangeText={setUnit}
            placeholder="e.g., pcs, kg, bag"
            editable={!loading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Product Type</Text>
          <View style={styles.typeSelector}>
            {(["product", "raw_material", "semi_finished"] as const).map(
              (type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeOption,
                    productType === type && styles.typeOptionSelected,
                  ]}
                  onPress={() => {
                    setProductType(type);
                    if (type === "product") setIsSellable(true);
                    else setIsSellable(false);
                  }}
                  disabled={loading}
                >
                  <Text
                    style={[
                      styles.typeOptionText,
                      productType === type && styles.typeOptionTextSelected,
                    ]}
                  >
                    {type === "product"
                      ? "Product"
                      : type === "raw_material"
                        ? "Raw Material"
                        : "Semi-Finished"}
                  </Text>
                </TouchableOpacity>
              ),
            )}
          </View>
          <Text style={styles.helpText}>
            {productType === "product"
              ? "A finished good available for sale"
              : productType === "raw_material"
                ? "An input used in manufacturing. Not sold by default."
                : "Manufactured but used as input for another product."}
          </Text>
        </View>

        {showSellableToggle && (
          <View style={styles.switchGroup}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Available for Sale</Text>
              <Text style={styles.helpText}>
                Allow this item to appear in the sales screen
              </Text>
            </View>
            <Switch
              value={isSellable}
              onValueChange={setIsSellable}
              disabled={loading}
            />
          </View>
        )}

        {effectiveIsSellable && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Default Selling Price ({currency.symbol}){" "}
              <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={defaultSellingPrice}
              onChangeText={setDefaultSellingPrice}
              placeholder="0.00"
              keyboardType="numeric"
              editable={!loading}
            />
            <Text style={styles.helpText}>
              Price for a single {unit || "unit"}
            </Text>
          </View>
        )}

        {/* Bulk Prices */}
        {hasPermission("pricing.manage") && (
          <View style={styles.bulkSection}>
            <View style={styles.bulkHeader}>
              <Text style={styles.sectionTitle}>Bulk Prices (Optional)</Text>
              <TouchableOpacity
                style={styles.addBulkButton}
                onPress={addBulkPrice}
                disabled={loading}
              >
                <Text style={styles.addBulkButtonText}>+ Add Tier</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helpText}>
              Add tiers like &quot;Dozen&quot;, &quot;Carton&quot;, etc.
            </Text>
            {bulkPrices.map((bp, index) => (
              <View key={bp.id} style={styles.bulkPriceCard}>
                <View style={styles.bulkPriceHeader}>
                  <Text style={styles.bulkPriceLabel}>Tier {index + 1}</Text>
                  <TouchableOpacity
                    onPress={() => removeBulkPrice(bp.id)}
                    disabled={loading}
                  >
                    <Text style={styles.removeButton}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.bulkPriceRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.miniLabel}>Name (e.g. Carton)</Text>
                    <TextInput
                      style={styles.miniInput}
                      value={bp.name}
                      onChangeText={(val) =>
                        updateBulkPrice(bp.id, "name", val)
                      }
                      placeholder="Dozen"
                      editable={!loading}
                    />
                  </View>
                  <View style={{ flex: 0.6, marginRight: 8 }}>
                    <Text style={styles.miniLabel}>Qty in bundle</Text>
                    <TextInput
                      style={styles.miniInput}
                      value={bp.quantity_multiplier}
                      onChangeText={(val) =>
                        updateBulkPrice(bp.id, "quantity_multiplier", val)
                      }
                      placeholder="12"
                      keyboardType="numeric"
                      editable={!loading}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>Total Tier Price</Text>
                    <TextInput
                      style={styles.miniInput}
                      value={bp.total_price}
                      onChangeText={(val) =>
                        updateBulkPrice(bp.id, "total_price", val)
                      }
                      placeholder="5000"
                      keyboardType="numeric"
                      editable={!loading}
                    />
                  </View>
                </View>
                {bp.quantity_multiplier && bp.total_price && (
                  <View
                    style={{
                      marginTop: 8,
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={styles.bulkPricePreview}>
                      {bp.name || "Tier"}: {bp.quantity_multiplier} units for{" "}
                      {currency.symbol}
                      {parseFloat(bp.total_price).toLocaleString()}
                    </Text>
                    <Text
                      style={[
                        styles.bulkPricePreview,
                        { color: COLORS.gray[500] },
                      ]}
                    >
                      ({currency.symbol}
                      {(
                        parseFloat(bp.total_price) /
                        parseFloat(bp.quantity_multiplier)
                      ).toFixed(2)}{" "}
                      / unit)
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.switchGroup}>
          <Text style={styles.label}>Active</Text>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            disabled={loading}
          />
        </View>

        {/* ── SECTION: Initial Stock ── */}
        <View style={styles.stockToggleCard}>
          <TouchableOpacity
            style={styles.stockToggleRow}
            onPress={() => setAddInitialStock(!addInitialStock)}
            disabled={loading}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.stockToggleTitle}>Add Initial Stock</Text>
              <Text style={styles.stockToggleSubtext}>
                Do you have this item in stock right now?
              </Text>
            </View>
            <View
              style={[
                styles.toggleSwitch,
                addInitialStock && styles.toggleSwitchActive,
              ]}
            >
              <View
                style={[
                  styles.toggleKnob,
                  addInitialStock && styles.toggleKnobActive,
                ]}
              />
            </View>
          </TouchableOpacity>
        </View>

        {addInitialStock && (
          <View style={styles.stockSection}>
            {/* Location */}
            <View style={styles.stockSubSection}>
              <View style={styles.stockSubSectionHeader}>
                <Text style={styles.stockSubSectionTitle}>Location</Text>
                <TouchableOpacity
                  onPress={() => router.push("/locations" as any)}
                >
                  <Text style={styles.addLinkButton}>+ New</Text>
                </TouchableOpacity>
              </View>
              {locations.length === 0 ? (
                <View style={styles.noLocationWarning}>
                  <Text style={styles.noLocationText}>
                    No locations found. Add a location first.
                  </Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
                          selectedLocation?.id === loc.id &&
                            styles.chipTextActive,
                        ]}
                      >
                        📍 {loc.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Supplier */}
            <View style={styles.stockSubSection}>
              <View style={styles.stockSubSectionHeader}>
                <Text style={styles.stockSubSectionTitle}>
                  Supplier (Optional)
                </Text>
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
                {suppliers.map((sup) => (
                  <TouchableOpacity
                    key={sup.id}
                    style={[
                      styles.chip,
                      selectedSupplier?.id === sup.id && styles.chipActive,
                    ]}
                    onPress={() => setSelectedSupplier(sup)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedSupplier?.id === sup.id &&
                          styles.chipTextActive,
                      ]}
                    >
                      🏢 {sup.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Quantity */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Opening Quantity ({unit || "units"}){" "}
                <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={stockQuantity}
                onChangeText={setStockQuantity}
                keyboardType="numeric"
                placeholder="0"
                editable={!loading}
              />
            </View>

            {/* Cost */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Cost per {unit || "unit"} ({currency.symbol}){" "}
                <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={unitCost}
                onChangeText={setUnitCost}
                keyboardType="numeric"
                placeholder="0.00"
                editable={!loading}
              />
            </View>

            {/* Profit preview */}
            {parseFloat(unitCost) > 0 &&
              parseFloat(defaultSellingPrice) > 0 &&
              effectiveIsSellable && (
                <View style={styles.profitCard}>
                  <View style={styles.profitRow}>
                    <Text style={styles.profitLabel}>
                      Gross Profit per {unit || "unit"}:
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

            {/* Acquisition costs (collapsible) */}
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
                    value={stockNotes}
                    onChangeText={setStockNotes}
                    placeholder="Additional notes..."
                    multiline
                    numberOfLines={3}
                    editable={!loading}
                  />
                </View>
              </View>
            )}

            {/* Cost summary */}
            {parseFloat(stockQuantity) > 0 && parseFloat(unitCost) > 0 && (
              <View style={styles.costSummary}>
                <Text style={styles.summaryTitle}>Cost Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Cost per {unit || "unit"}:
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
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>
              {addInitialStock ? "Add Product & Stock" : "Add Product"}
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
  form: { flex: 1, padding: 16 },

  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 16,
    marginTop: 4,
  },

  inputGroup: { marginBottom: 20 },
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
    color: COLORS.primary,
  },
  textArea: { height: 80, textAlignVertical: "top" },
  helpText: { fontSize: 12, color: COLORS.secondary, marginTop: 4 },

  typeSelector: { flexDirection: "row", gap: 8 },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
  },
  typeOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  typeOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.secondary,
    textAlign: "center",
  },
  typeOptionTextSelected: { color: COLORS.white },

  switchGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },

  // Bulk prices
  bulkSection: { marginBottom: 20 },
  bulkHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  addBulkButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBulkButtonText: { color: COLORS.white, fontSize: 13, fontWeight: "600" },
  bulkPriceCard: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bulkPriceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  bulkPriceLabel: { fontSize: 14, fontWeight: "600", color: COLORS.secondary },
  removeButton: { fontSize: 18, color: COLORS.danger, fontWeight: "bold" },
  bulkPriceRow: { flexDirection: "row", alignItems: "flex-end" },
  miniLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 4,
  },
  miniInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
  },
  bulkPricePreview: {
    fontSize: 12,
    color: COLORS.accent,
    marginTop: 8,
    fontWeight: "500",
  },

  // Initial stock toggle card
  stockToggleCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginBottom: 4,
    overflow: "hidden",
  },
  stockToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  stockToggleTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 2,
  },
  stockToggleSubtext: { fontSize: 13, color: COLORS.secondary },
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

  // Stock section (revealed when toggle is on)
  stockSection: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.accent,
    padding: 16,
    marginBottom: 20,
    marginTop: 2,
    gap: 0,
  },
  stockSubSection: { marginBottom: 20 },
  stockSubSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  stockSubSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  addLinkButton: { fontSize: 14, fontWeight: "600", color: COLORS.accent },

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

  noLocationWarning: {
    backgroundColor: "#FFF3CD",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFC107",
  },
  noLocationText: { fontSize: 13, color: "#92400E", fontWeight: "500" },

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
    backgroundColor: COLORS.background,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  toggleButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.primary },

  acquisitionSection: {
    backgroundColor: COLORS.background,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  costSummary: {
    backgroundColor: COLORS.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
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
