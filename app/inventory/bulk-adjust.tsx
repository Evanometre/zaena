// FILE: app/inventory/bulk-adjust.tsx
import { queueOperation } from "@/lib/localDb";
import { syncNow } from "@/lib/syncEngine";
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
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
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface BatchItem {
  product: any;
  tiers: any[];
  selectedTier: any; // null = base unit
  quantity: string;
  // unitCost meaning:
  //   - no tier: cost per base unit (e.g. per piece)
  //   - tier active: cost per tier unit (e.g. per dozen)
  //   downstream divides by quantity_multiplier to get base unit cost
  unitCost: string;
  sellingPrice: string;
}

export default function BulkAdjustInventoryScreen() {
  const { organizationId: storeOrgId } = useAuthStore();
  const router = useRouter();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [showBulkCosts, setShowBulkCosts] = useState(false);
  const [bulkTransportation, setBulkTransportation] = useState("");
  const [bulkOffload, setBulkOffload] = useState("");
  const [bulkCustoms, setBulkCustoms] = useState("");
  const [bulkOther, setBulkOther] = useState("");
  const [batchNotes, setBatchNotes] = useState("");

  // PATCH 1: show first 5 products when search is empty; full filtered list when typing
  const filteredProducts = productSearch.trim()
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.sku?.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.category?.toLowerCase().includes(productSearch.toLowerCase()),
      )
    : products.slice(0, 5);

  React.useEffect(() => {
    if (!permissionsLoading && !hasPermission("inventory.adjust")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to perform bulk inventory adjustments",
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
      if (!storeOrgId) return;

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
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setInitialLoading(false);
    }
  }

  async function fetchTiersForProduct(productId: string): Promise<any[]> {
    try {
      const { data } = await supabase
        .from("product_bulk_prices")
        .select("*")
        .eq("product_id", productId)
        .eq("is_active", true);
      return data || [];
    } catch {
      return [];
    }
  }

  async function addItemToBatch(product: any) {
    const exists = batchItems.find((item) => item.product.id === product.id);
    if (exists) {
      Alert.alert("Already Added", "This product is already in the batch");
      return;
    }

    const tiers = await fetchTiersForProduct(product.id);

    setBatchItems((prev) => [
      ...prev,
      {
        product,
        tiers,
        selectedTier: null,
        quantity: "",
        unitCost: product.default_cost_price?.toString() || "",
        sellingPrice: product.default_selling_price?.toString() || "",
      },
    ]);

    setProductSearch("");
  }

  function removeItemFromBatch(productId: string) {
    setBatchItems(batchItems.filter((item) => item.product.id !== productId));
  }

  function updateBatchItem(
    productId: string,
    field: keyof BatchItem,
    value: any,
  ) {
    setBatchItems(
      batchItems.map((item) =>
        item.product.id === productId ? { ...item, [field]: value } : item,
      ),
    );
  }

  function handleTierSelectForItem(productId: string, tier: any) {
    setBatchItems(
      batchItems.map((item) => {
        if (item.product.id !== productId) return item;
        return {
          ...item,
          selectedTier: tier,
          unitCost: tier
            ? ""
            : item.product.default_cost_price?.toString() || "",
        };
      }),
    );
  }

  function getBaseUnitCostForItem(item: BatchItem): number {
    const entered = parseFloat(item.unitCost) || 0;
    if (item.selectedTier) {
      const multiplier = item.selectedTier.quantity_multiplier || 1;
      return multiplier > 0 ? entered / multiplier : 0;
    }
    return entered;
  }

  function calculateBulkAcquisitionCosts() {
    return (
      (parseFloat(bulkTransportation) || 0) +
      (parseFloat(bulkOffload) || 0) +
      (parseFloat(bulkCustoms) || 0) +
      (parseFloat(bulkOther) || 0)
    );
  }

  function calculateBatchSummary() {
    const totalUnits = batchItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const multiplier = item.selectedTier?.quantity_multiplier || 1;
      return sum + qty * multiplier;
    }, 0);

    const totalCost = batchItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const cost = parseFloat(item.unitCost) || 0;
      if (item.selectedTier) {
        return sum + qty * cost;
      } else {
        return sum + qty * cost;
      }
    }, 0);

    const bulkCosts = calculateBulkAcquisitionCosts();

    return {
      itemCount: batchItems.length,
      totalUnits,
      totalCost,
      bulkCosts,
      grandTotal: totalCost + bulkCosts,
    };
  }

  async function handleBulkSubmit() {
    if (!hasPermission("inventory.adjust")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to perform bulk inventory adjustments",
      );
      return;
    }
    if (!selectedLocation) {
      Alert.alert("Error", "Please select a location");
      return;
    }
    if (batchItems.length === 0) {
      Alert.alert("Error", "Please add at least one product to the batch");
      return;
    }

    for (const item of batchItems) {
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        Alert.alert("Error", `Please enter quantity for ${item.product.name}`);
        return;
      }
      if (!item.unitCost || parseFloat(item.unitCost) <= 0) {
        Alert.alert(
          "Error",
          item.selectedTier
            ? `Please enter cost per ${item.selectedTier.name} for ${item.product.name}`
            : `Please enter cost for ${item.product.name}`,
        );
        return;
      }
      if (item.product.is_sellable !== false) {
        if (!item.sellingPrice || parseFloat(item.sellingPrice) <= 0) {
          Alert.alert(
            "Error",
            `Please enter selling price for ${item.product.name}`,
          );
          return;
        }
      }
    }

    const summary = calculateBatchSummary();

    Alert.alert(
      "Confirm Bulk Addition",
      `Add ${summary.itemCount} products (${summary.totalUnits} total units)?${selectedSupplier ? `\nSupplier: ${selectedSupplier.name}` : ""}
Base Cost: ${currency.symbol}${summary.totalCost.toFixed(2)}${summary.bulkCosts > 0 ? `\nBulk Acquisition: ${currency.symbol}${summary.bulkCosts.toFixed(2)}` : ""}
Grand Total: ${currency.symbol}${summary.grandTotal.toFixed(2)}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => processBulkAdjustment(summary) },
      ],
    );
  }

  async function processBulkAdjustment(summary: any) {
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (!organizationId) throw new Error("Organization not found");

      const acqCostPerUnit =
        summary.totalUnits > 0
          ? calculateBulkAcquisitionCosts() / summary.totalUnits
          : 0;

      await queueOperation({
        module: "inventory",
        operation: "bulk_stock_in",
        payload: {
          organizationId,
          userId: user.id,
          locationId: selectedLocation.id,
          supplierId: selectedSupplier?.id || null,
          supplierName: selectedSupplier?.name || null,
          items: batchItems.map((item) => {
            const qty = parseFloat(item.quantity);
            const multiplier = item.selectedTier?.quantity_multiplier || 1;
            const baseQty = qty * multiplier;
            const baseUnitCost = getBaseUnitCostForItem(item);
            const costPerUnit = baseUnitCost + acqCostPerUnit;
            return {
              productId: item.product.id,
              productName: item.product.name,
              quantity: qty,
              tierMultiplier: multiplier,
              tierName: item.selectedTier?.name || null,
              baseQuantity: baseQty,
              costPerTier: item.selectedTier ? parseFloat(item.unitCost) : null,
              baseUnitCost,
              costPerUnit,
              sellingPrice: parseFloat(item.sellingPrice) || 0,
              totalCost: baseQty * baseUnitCost,
            };
          }),
          bulkAcquisitionCosts: {
            transportation: parseFloat(bulkTransportation) || 0,
            offload: parseFloat(bulkOffload) || 0,
            customs: parseFloat(bulkCustoms) || 0,
            other: parseFloat(bulkOther) || 0,
          },
          acquisitionTotal: summary.bulkCosts,
          grandTotal: summary.grandTotal,
          totalUnits: summary.totalUnits,
          notes: batchNotes.trim() || null,
          occurredAt: new Date().toISOString(),
        },
      });

      // Optimistic cache update
      try {
        const cacheKey = `inventory_${organizationId}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const items = JSON.parse(cached);
          for (const bItem of batchItems) {
            const qty = parseFloat(bItem.quantity);
            const multiplier = bItem.selectedTier?.quantity_multiplier || 1;
            const baseQty = qty * multiplier;
            const baseUnitCost = getBaseUnitCostForItem(bItem);
            const cpUnit = baseUnitCost + acqCostPerUnit;
            const existing = items.find(
              (i: any) =>
                i.product_id === bItem.product.id &&
                i.location_id === selectedLocation.id,
            );
            if (existing) {
              existing.quantity_on_hand += baseQty;
              existing.weighted_avg_cost = cpUnit;
            } else {
              items.push({
                product_id: bItem.product.id,
                location_id: selectedLocation.id,
                quantity_on_hand: baseQty,
                weighted_avg_cost: cpUnit,
                products: {
                  name: bItem.product.name,
                  sku: bItem.product.sku,
                  unit: bItem.product.unit,
                  category: bItem.product.category,
                },
                locations: { name: selectedLocation.name },
              });
            }
          }
          await AsyncStorage.setItem(cacheKey, JSON.stringify(items));
        }
      } catch {}

      await syncNow();

      Alert.alert(
        "Bulk Stock Added ✓",
        `${summary.itemCount} products (${summary.totalUnits} units) recorded successfully.\n\nThis has been saved as an unpaid purchase. Go to Purchases to record payment when ready.`,
        [{ text: "OK", onPress: () => router.replace("/(tabs)/inventory") }],
      );
    } catch (err: any) {
      console.error("Bulk adjustment error:", err);
      Alert.alert("Error", err.message || "Failed to queue bulk adjustment");
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

  const summary = calculateBatchSummary();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Bulk Inventory</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
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
                  ⚠️ No locations found. Add a location first.
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

        {/* Supplier — PATCH 2: removed + New button to prevent navigating away and losing state */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Supplier (Optional)</Text>
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

        {/* Product Search — PATCH 1: show results when empty (first 5) or typing (filtered) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Add Products to Batch
            {batchItems.length > 0 ? ` (${batchItems.length} added)` : ""}
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

          <View style={styles.searchResults}>
            {filteredProducts.length === 0 ? (
              <Text style={styles.searchEmpty}>
                {productSearch.trim()
                  ? `No products match "${productSearch}"`
                  : "No products found."}
              </Text>
            ) : (
              filteredProducts.map((product) => {
                const alreadyAdded = batchItems.some(
                  (i) => i.product.id === product.id,
                );
                return (
                  <TouchableOpacity
                    key={product.id}
                    style={[
                      styles.searchResultRow,
                      alreadyAdded && styles.searchResultRowAdded,
                    ]}
                    onPress={() => {
                      if (!alreadyAdded) addItemToBatch(product);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.searchResultName,
                          alreadyAdded && styles.searchResultNameAdded,
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
                    <Text
                      style={
                        alreadyAdded
                          ? styles.searchResultAdded
                          : styles.searchResultAdd
                      }
                    >
                      {alreadyAdded ? "Added ✓" : "+ Add"}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {!productSearch.trim() && products.length > 5 && (
            <Text style={styles.searchHint}>
              Showing 5 of {products.length} products. Type to search all.
            </Text>
          )}
        </View>

        {/* Batch Items */}
        {batchItems.length > 0 && (
          <View style={styles.batchList}>
            <Text style={styles.sectionTitle}>
              Batch Items ({batchItems.length})
            </Text>

            {batchItems.map((item) => {
              const qty = parseFloat(item.quantity) || 0;
              const multiplier = item.selectedTier?.quantity_multiplier || 1;
              const baseQty = qty * multiplier;
              const baseUnitCost = getBaseUnitCostForItem(item);
              const selling = parseFloat(item.sellingPrice) || 0;
              const profit = selling - baseUnitCost;
              const margin = selling > 0 ? (profit / selling) * 100 : 0;

              const derivedUnitCost =
                item.selectedTier && parseFloat(item.unitCost) > 0
                  ? parseFloat(item.unitCost) / multiplier
                  : null;

              const costLabel = item.selectedTier
                ? `Cost per ${item.selectedTier.name} (${currency.symbol})`
                : `Cost (${currency.symbol})`;

              return (
                <View key={item.product.id} style={styles.batchItem}>
                  <View style={styles.batchItemHeader}>
                    <Text style={styles.batchItemName}>
                      {item.product.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => removeItemFromBatch(item.product.id)}
                    >
                      <Text style={styles.removeButton}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {item.tiers.length > 0 && (
                    <View style={styles.tierSection}>
                      <Text style={styles.tierLabel}>Stocking Unit</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                      >
                        <TouchableOpacity
                          style={[
                            styles.tierChip,
                            !item.selectedTier && styles.tierChipActive,
                          ]}
                          onPress={() =>
                            handleTierSelectForItem(item.product.id, null)
                          }
                        >
                          <Text
                            style={[
                              styles.tierChipText,
                              !item.selectedTier && styles.tierChipTextActive,
                            ]}
                          >
                            {item.product.unit || "Unit"} (Base)
                          </Text>
                        </TouchableOpacity>
                        {item.tiers.map((tier) => (
                          <TouchableOpacity
                            key={tier.id}
                            style={[
                              styles.tierChip,
                              item.selectedTier?.id === tier.id &&
                                styles.tierChipActive,
                            ]}
                            onPress={() =>
                              handleTierSelectForItem(item.product.id, tier)
                            }
                          >
                            <Text
                              style={[
                                styles.tierChipText,
                                item.selectedTier?.id === tier.id &&
                                  styles.tierChipTextActive,
                              ]}
                            >
                              {tier.name} (×{tier.quantity_multiplier})
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  <View style={styles.batchItemInputs}>
                    <View style={styles.miniInputWrap}>
                      <Text style={styles.miniLabel}>
                        {item.selectedTier
                          ? `${item.selectedTier.name}s`
                          : "Qty"}
                      </Text>
                      <TextInput
                        style={styles.miniTextInput}
                        value={item.quantity}
                        onChangeText={(val) =>
                          updateBatchItem(item.product.id, "quantity", val)
                        }
                        keyboardType="numeric"
                        placeholder="0"
                      />
                    </View>

                    <View style={styles.miniInputWrap}>
                      <Text style={styles.miniLabel}>{costLabel}</Text>
                      <TextInput
                        style={styles.miniTextInput}
                        value={item.unitCost}
                        onChangeText={(val) =>
                          updateBatchItem(item.product.id, "unitCost", val)
                        }
                        keyboardType="numeric"
                        placeholder="0.00"
                      />
                    </View>

                    {item.product.is_sellable !== false && (
                      <View style={styles.miniInputWrap}>
                        <Text style={styles.miniLabel}>
                          Selling/{item.product.unit || "unit"} (
                          {currency.symbol})
                        </Text>
                        <TextInput
                          style={styles.miniTextInput}
                          value={item.sellingPrice}
                          onChangeText={(val) =>
                            updateBatchItem(
                              item.product.id,
                              "sellingPrice",
                              val,
                            )
                          }
                          keyboardType="numeric"
                          placeholder="0.00"
                        />
                      </View>
                    )}
                  </View>

                  {derivedUnitCost !== null && (
                    <View style={styles.derivedCostHint}>
                      <Text style={styles.derivedCostText}>
                        = {currency.symbol}
                        {derivedUnitCost.toFixed(2)} per{" "}
                        {item.product.unit || "unit"}
                      </Text>
                    </View>
                  )}

                  {item.selectedTier && qty > 0 && (
                    <View style={styles.conversionBanner}>
                      <Text style={styles.conversionText}>
                        {item.quantity} {item.selectedTier.name}
                        {qty > 1 ? "s" : ""} × {multiplier} ={" "}
                        <Text style={styles.conversionHighlight}>
                          {baseQty} {item.product.unit} total
                        </Text>
                      </Text>
                    </View>
                  )}

                  {qty > 0 && baseUnitCost > 0 && selling > 0 && (
                    <View style={styles.batchItemFooter}>
                      <Text style={styles.itemTotal}>
                        Total: {currency.symbol}
                        {(baseQty * baseUnitCost).toFixed(2)}
                      </Text>
                      <Text
                        style={[
                          styles.itemMargin,
                          {
                            color: margin >= 0 ? COLORS.success : COLORS.danger,
                          },
                        ]}
                      >
                        Margin: {margin.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Bulk Acquisition Costs */}
        {batchItems.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setShowBulkCosts(!showBulkCosts)}
            >
              <Text style={styles.toggleButtonText}>
                {showBulkCosts ? "▼" : "▶"} Bulk Acquisition Costs (Optional)
              </Text>
            </TouchableOpacity>

            {showBulkCosts && (
              <View style={styles.bulkCostsSection}>
                <Text style={styles.bulkCostsHint}>
                  These costs will be distributed across all{" "}
                  {summary.totalUnits} units
                </Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    Transportation ({currency.symbol})
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={bulkTransportation}
                    onChangeText={setBulkTransportation}
                    keyboardType="numeric"
                    placeholder="0.00"
                    editable={!loading}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Offload ({currency.symbol})</Text>
                  <TextInput
                    style={styles.input}
                    value={bulkOffload}
                    onChangeText={setBulkOffload}
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
                    value={bulkCustoms}
                    onChangeText={setBulkCustoms}
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
                    value={bulkOther}
                    onChangeText={setBulkOther}
                    keyboardType="numeric"
                    placeholder="0.00"
                    editable={!loading}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Notes</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={batchNotes}
                    onChangeText={setBatchNotes}
                    placeholder="Batch notes..."
                    multiline
                    numberOfLines={3}
                    editable={!loading}
                  />
                </View>
              </View>
            )}
          </>
        )}

        {/* Summary */}
        {batchItems.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Batch Summary</Text>
            {selectedSupplier && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Supplier:</Text>
                <Text style={styles.summaryValue}>{selectedSupplier.name}</Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Products:</Text>
              <Text style={styles.summaryValue}>{summary.itemCount}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Units:</Text>
              <Text style={styles.summaryValue}>{summary.totalUnits}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Base Cost:</Text>
              <Text style={styles.summaryValue}>
                {currency.symbol}
                {summary.totalCost.toFixed(2)}
              </Text>
            </View>
            {summary.bulkCosts > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Bulk Costs:</Text>
                <Text style={styles.summaryValue}>
                  {currency.symbol}
                  {summary.bulkCosts.toFixed(2)}
                </Text>
              </View>
            )}
            <View style={[styles.summaryRow, styles.summaryRowTotal]}>
              <Text style={styles.summaryLabelBold}>Grand Total:</Text>
              <Text style={styles.summaryValueBold}>
                {currency.symbol}
                {summary.grandTotal.toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {batchItems.length > 0 && (
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.buttonDisabled]}
            onPress={handleBulkSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.submitButtonText}>
                Add {summary.itemCount} Product
                {summary.itemCount !== 1 ? "s" : ""} to Inventory
              </Text>
            )}
          </TouchableOpacity>
        )}

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
  content: { flex: 1, padding: 16 },
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
  searchResultRowAdded: { backgroundColor: "#F9F9F9" },
  searchResultName: { fontSize: 15, fontWeight: "500", color: COLORS.primary },
  searchResultNameAdded: { color: COLORS.secondary },
  searchResultMeta: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  searchResultAdd: { fontSize: 13, color: COLORS.accent, fontWeight: "600" },
  searchResultAdded: { fontSize: 13, color: COLORS.secondary },
  searchEmpty: {
    padding: 16,
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
  },
  searchHint: {
    fontSize: 12,
    color: COLORS.secondary,
    textAlign: "center",
    paddingTop: 6,
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
  batchList: { marginBottom: 20 },
  batchItem: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  batchItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  batchItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    flex: 1,
    marginRight: 8,
  },
  removeButton: { fontSize: 20, color: COLORS.danger },
  tierSection: { marginBottom: 12 },
  tierLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 6,
  },
  tierChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    marginRight: 8,
  },
  tierChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  tierChipText: { fontSize: 12, fontWeight: "500", color: COLORS.secondary },
  tierChipTextActive: { color: COLORS.white },
  batchItemInputs: { flexDirection: "row", gap: 8, marginBottom: 8 },
  miniInputWrap: { flex: 1 },
  miniLabel: { fontSize: 11, color: COLORS.secondary, marginBottom: 4 },
  miniTextInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
  },
  derivedCostHint: {
    marginTop: 2,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#EFF6FF",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignSelf: "flex-start",
  },
  derivedCostText: {
    fontSize: 12,
    color: "#1E40AF",
    fontWeight: "600",
  },
  conversionBanner: {
    marginTop: 4,
    marginBottom: 8,
    padding: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  conversionText: { fontSize: 12, color: "#1E40AF" },
  conversionHighlight: { fontWeight: "700" },
  batchItemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  itemTotal: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  itemMargin: { fontSize: 14, fontWeight: "600" },
  inputGroup: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: { height: 80, textAlignVertical: "top" },
  toggleButton: {
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  toggleButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  bulkCostsSection: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bulkCostsHint: {
    fontSize: 12,
    color: COLORS.secondary,
    marginBottom: 16,
    fontStyle: "italic",
  },
  summaryCard: {
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
    marginBottom: 32,
  },
  buttonDisabled: { backgroundColor: COLORS.gray[400] },
  submitButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
});
