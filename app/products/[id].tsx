// app/products/EditProductScreen.tsx
import { syncNow } from "@/lib/syncEngine";
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import { queueOperation } from "../../lib/localDb";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface BulkPrice {
  id: string;
  name: string;
  quantity_multiplier: string;
  total_price: string; // ← user enters total, we divide on save
  unit_price: string; // ← computed for display only
  is_active?: boolean;
  archived_at?: string | null;
  is_new?: boolean;
}

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { organizationId } = useAuthStore();

  const [product, setProduct] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [bulkPrices, setBulkPrices] = useState<BulkPrice[]>([]);
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState({
    symbol: "",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const productType = form.product_type ?? "product";
  const isRetailProduct = productType === "product";
  const showSellableToggle =
    productType === "raw_material" || productType === "semi_finished";

  const canEdit = hasPermission("products.edit");
  const canDelete = hasPermission("products.delete");
  const canManagePricing = hasPermission("pricing.manage");

  const orgRef = useRef<{
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  }>({
    name: "Your Business",
  });

  useEffect(() => {
    if (id) fetchProduct();
  }, [id]);

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

        // Cache org details for receipt generation
        const orgDetails = { name: org.name || "Your Business" };
        orgRef.current = orgDetails;
        await AsyncStorage.setItem(
          `org_invoice_details_${organizationId}`,
          JSON.stringify(orgDetails),
        );
      } catch (err) {
        // Fall back to cache if fetch fails
        const cached = await AsyncStorage.getItem(
          `org_invoice_details_${organizationId}`,
        );
        if (cached) orgRef.current = JSON.parse(cached);
        console.error("Failed to load org details:", err);
      }
    }
    loadOrgCurrency();
  }, [organizationId]);

  async function fetchProduct() {
    setLoading(true);
    try {
      // ── Show cache immediately ──────────────────────────
      const cacheKey = `product_edit_${id}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { product: cp, bulkPrices: cbp } = JSON.parse(cached);
        setProduct(cp);
        setForm(cp);
        setBulkPrices(cbp || []);
        setLoading(false);
      }

      // ── Fetch fresh ─────────────────────────────────────
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      setProduct(data);
      setForm(data);

      const { data: bpData } = await supabase
        .from("product_bulk_prices")
        .select("*")
        .eq("product_id", id)
        .order("created_at", { ascending: true });

      const mappedBp = (bpData ?? []).map((bp: any) => {
        const qty = bp.quantity_multiplier ?? 1;
        const uPrice = bp.unit_price ?? 0;
        return {
          ...bp,
          is_active: bp.is_active ?? true,
          is_new: false,
          quantity_multiplier: qty.toString(),
          unit_price: uPrice.toString(),
          // Reconstruct total_price from unit_price × qty so the field is pre-filled
          total_price: (uPrice * qty).toString(),
        };
      });

      setBulkPrices(mappedBp);

      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({ product: data, bulkPrices: mappedBp }),
      );
    } catch (err: any) {
      if (!product) {
        Alert.alert("Error", err.message);
        router.back();
      }
    } finally {
      setLoading(false);
    }
  }

  function addBulkPrice() {
    setBulkPrices([
      ...bulkPrices,
      {
        id: Math.random().toString(),
        name: "",
        quantity_multiplier: "",
        total_price: "",
        unit_price: "",
        is_active: true,
        is_new: true,
      },
    ]);
  }

  function updateBulkPrice(
    bpId: string,
    field: keyof BulkPrice,
    value: string,
  ) {
    setBulkPrices((prev) =>
      prev.map((bp) => {
        if (bp.id !== bpId) return bp;
        const updated = { ...bp, [field]: value };

        // Auto-compute unit_price whenever qty or total_price changes
        const qty = parseFloat(
          field === "quantity_multiplier" ? value : updated.quantity_multiplier,
        );
        const total = parseFloat(
          field === "total_price" ? value : updated.total_price,
        );
        if (!isNaN(qty) && qty > 0 && !isNaN(total)) {
          updated.unit_price = (total / qty).toFixed(4);
        } else {
          updated.unit_price = "";
        }

        return updated;
      }),
    );
  }

  function deactivateBulkPrice(bpId: string) {
    setBulkPrices((prev) =>
      prev.map((bp) =>
        bp.id === bpId
          ? { ...bp, is_active: false, archived_at: new Date().toISOString() }
          : bp,
      ),
    );
  }

  async function saveChanges() {
    if (!canEdit) return;
    if (!organizationId) {
      Alert.alert("Error", "Organization not found");
      return;
    }

    try {
      setSaving(true);

      const updates = {
        name: form.name,
        category: form.category,
        sku: form.sku,
        default_cost_price: parseFloat(form.default_cost_price) || 0,
        default_selling_price: parseFloat(form.default_selling_price) || 0,
        product_type: form.product_type ?? "product",
        is_sellable:
          form.product_type === "product" ? true : (form.is_sellable ?? false),
        updated_at: new Date().toISOString(),
      };

      // Build bulk tier payload — unit_price is already computed in state
      const tiersPayload = bulkPrices
        .filter((bp) => bp.name && bp.quantity_multiplier && bp.unit_price)
        .map((bp) => ({
          id: bp.id,
          name: bp.name,
          quantity_multiplier: parseFloat(bp.quantity_multiplier),
          unit_price: parseFloat(bp.unit_price),
          is_active: bp.is_active ?? true,
          archived_at: bp.archived_at ?? null,
          is_new: bp.is_new ?? false,
        }));

      await queueOperation({
        module: "products",
        operation: "update_product",
        payload: {
          productId: id,
          organizationId,
          before: product,
          updates,
          bulkTiers: tiersPayload,
        },
      });

      await syncNow(); // attempt immediate sync while user sees the success alert
      router.back();

      // Optimistic cache update
      const updatedProduct = { ...product, ...updates };
      await AsyncStorage.setItem(
        `product_edit_${id}`,
        JSON.stringify({ product: updatedProduct, bulkPrices }),
      );
      // Invalidate list cache so index reflects name/status changes
      await AsyncStorage.removeItem(`products_${organizationId}`);

      Alert.alert("Saved ✓", "Changes saved and will sync when online.");
      router.back();
    } catch (error: any) {
      Alert.alert("Save Failed", error.message || "An unknown error occurred");
    } finally {
      setSaving(false);
    }
  }

  function confirmDeactivate() {
    Alert.alert(
      "Deactivate Product",
      "This product will no longer be available for sale. Past records will remain.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: deactivateProduct,
        },
      ],
    );
  }

  async function deactivateProduct() {
    if (!organizationId) return;
    try {
      await queueOperation({
        module: "products",
        operation: "deactivate_product",
        payload: { productId: id, before: product },
      });

      await syncNow(); // attempt immediate sync while user sees the success alert
      router.back();

      // Optimistic update
      const updatedProduct = { ...product, is_active: false };
      await AsyncStorage.setItem(
        `product_edit_${id}`,
        JSON.stringify({ product: updatedProduct, bulkPrices }),
      );
      await AsyncStorage.removeItem(`products_${organizationId}`);

      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (permLoading || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (!hasPermission("products.edit") && !hasPermission("products.read")) {
    return (
      <View style={styles.centered}>
        <Text style={styles.restrictedIcon}>🔐</Text>
        <Text style={styles.restrictedTitle}>Access Restricted</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButtonAlt}
        >
          <Text style={styles.backButtonAltText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Edit Product</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subHeading}>
          Last updated:{" "}
          {product.updated_at
            ? new Date(product.updated_at).toLocaleString()
            : "N/A"}
          {product.updated_by ? ` by ${product.updated_by}` : ""}
        </Text>

        {/* Core fields */}
        <Text style={styles.sectionLabel}>PRODUCT INFO</Text>
        <TextInput
          style={[styles.input, !canEdit && styles.inputReadOnly]}
          value={form.name}
          placeholder="Product name"
          onChangeText={(name) => setForm({ ...form, name })}
          editable={canEdit}
        />
        <TextInput
          style={[styles.input, !canEdit && styles.inputReadOnly]}
          value={form.category}
          placeholder="Category"
          onChangeText={(category) => setForm({ ...form, category })}
          editable={canEdit}
        />
        <TextInput
          style={[styles.input, !canEdit && styles.inputReadOnly]}
          value={form.sku}
          placeholder="SKU"
          onChangeText={(sku) => setForm({ ...form, sku })}
          editable={canEdit}
        />

        {/* Product Type */}
        <Text style={styles.sectionLabel}>PRODUCT TYPE</Text>
        <View style={styles.typeSelector}>
          {(["product", "raw_material", "semi_finished"] as const).map(
            (type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeOption,
                  productType === type && styles.typeOptionSelected,
                  !canEdit && styles.typeOptionDisabled,
                ]}
                onPress={() => {
                  if (!canEdit) return;
                  setForm({
                    ...form,
                    product_type: type,
                    is_sellable: type === "product",
                  });
                }}
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

        {showSellableToggle && (
          <View style={styles.sellableRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sellableLabel}>Available for Sale</Text>
              <Text style={styles.sellableHint}>
                Allow this item to appear in the sales screen
              </Text>
            </View>
            <Switch
              value={form.is_sellable ?? false}
              onValueChange={(val) => setForm({ ...form, is_sellable: val })}
              disabled={!canEdit}
            />
          </View>
        )}

        {/* Pricing */}
        <Text style={styles.sectionLabel}>PRICING</Text>
        {(isRetailProduct || form.is_sellable) && (
          <TextInput
            style={[styles.input, !canEdit && styles.inputReadOnly]}
            value={form.default_selling_price?.toString()}
            placeholder="Default selling price"
            keyboardType="decimal-pad"
            onChangeText={(v) => setForm({ ...form, default_selling_price: v })}
            editable={canEdit}
          />
        )}

        {/* Bulk Prices */}
        <View style={styles.bulkSection}>
          <View style={styles.bulkHeader}>
            <Text style={styles.sectionLabel}>BULK PRICES</Text>
            {canManagePricing && (
              <TouchableOpacity
                style={styles.addBulkButton}
                onPress={addBulkPrice}
              >
                <Text style={styles.addBulkButtonText}>+ Add Tier</Text>
              </TouchableOpacity>
            )}
          </View>

          {bulkPrices.length === 0 && (
            <Text style={styles.emptyBulk}>No bulk pricing tiers yet.</Text>
          )}

          {bulkPrices.map((bp, index) => (
            <View
              key={bp.id}
              style={[
                styles.bulkPriceCard,
                !bp.is_active && styles.inactiveCard,
              ]}
            >
              <View style={styles.bulkPriceHeader}>
                <Text style={styles.bulkPriceLabel}>Tier {index + 1}</Text>
                {bp.is_active && canManagePricing && (
                  <TouchableOpacity onPress={() => deactivateBulkPrice(bp.id)}>
                    <Text style={styles.removeButton}>Deactivate</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Row 1: Name + Qty */}
              <View style={styles.bulkPriceRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.miniLabel}>Name</Text>
                  <TextInput
                    style={styles.miniInput}
                    value={bp.name}
                    placeholder="e.g. Carton"
                    onChangeText={(val) => updateBulkPrice(bp.id, "name", val)}
                    editable={!!bp.is_active && canManagePricing}
                  />
                </View>
                <View style={{ flex: 0.7 }}>
                  <Text style={styles.miniLabel}>Qty in bundle</Text>
                  <TextInput
                    style={styles.miniInput}
                    value={bp.quantity_multiplier}
                    placeholder="12"
                    keyboardType="numeric"
                    onChangeText={(val) =>
                      updateBulkPrice(bp.id, "quantity_multiplier", val)
                    }
                    editable={!!bp.is_active && canManagePricing}
                  />
                </View>
              </View>

              {/* Row 2: Total Tier Price */}
              <View style={{ marginTop: 8 }}>
                <Text style={styles.miniLabel}>Total Tier Price</Text>
                <TextInput
                  style={styles.miniInput}
                  value={bp.total_price}
                  placeholder="e.g. 5000"
                  keyboardType="numeric"
                  onChangeText={(val) =>
                    updateBulkPrice(bp.id, "total_price", val)
                  }
                  editable={!!bp.is_active && canManagePricing}
                />
              </View>

              {/* Live preview */}
              {bp.quantity_multiplier && bp.total_price && bp.unit_price ? (
                <View style={styles.previewRow}>
                  <Text style={styles.previewText}>
                    {bp.name || "Tier"}: {bp.quantity_multiplier} units for{" "}
                    {currency.symbol}
                    {parseFloat(bp.total_price).toLocaleString()}
                  </Text>
                  <Text style={styles.previewUnit}>
                    ({currency.symbol}
                    {parseFloat(bp.unit_price).toFixed(2)} / unit)
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {/* Danger zone */}
        {canDelete && (
          <TouchableOpacity
            style={styles.dangerZone}
            onPress={confirmDeactivate}
          >
            <Text style={styles.dangerText}>Deactivate Product</Text>
          </TouchableOpacity>
        )}

        {canEdit && (
          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={saveChanges}
            disabled={saving}
          >
            <Text style={styles.saveText}>
              {saving ? "Saving…" : "Save Changes"}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  backButton: {
    fontSize: 16,
    color: COLORS.accent,
    fontWeight: "600",
    width: 60,
  },
  heading: { fontSize: 18, fontWeight: "700", color: "#333" },
  content: { flex: 1, padding: 16 },
  subHeading: { fontSize: 12, color: "#666", marginBottom: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8E8E93",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    fontSize: 16,
    color: "#333",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  inputReadOnly: { backgroundColor: "#F2F2F7", color: "#6C6C70" },
  typeSelector: { flexDirection: "row", gap: 8, marginBottom: 12 },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  typeOptionSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  typeOptionDisabled: { opacity: 0.6 },
  typeOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#555",
    textAlign: "center",
  },
  typeOptionTextSelected: { color: "#fff" },
  sellableRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  sellableLabel: { fontSize: 15, fontWeight: "600", color: "#333" },
  sellableHint: { fontSize: 12, color: "#8E8E93", marginTop: 2 },
  saveButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 32,
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  bulkSection: { marginBottom: 24 },
  bulkHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addBulkButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBulkButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  emptyBulk: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
    paddingVertical: 16,
  },
  bulkPriceCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  inactiveCard: { opacity: 0.5, backgroundColor: "#f8f8f8" },
  bulkPriceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  bulkPriceLabel: { fontSize: 14, fontWeight: "600", color: "#333" },
  removeButton: { fontSize: 14, color: COLORS.danger, fontWeight: "600" },
  bulkPriceRow: { flexDirection: "row", alignItems: "flex-end" },
  miniLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 4,
  },
  miniInput: {
    flex: 1,
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  previewText: { fontSize: 12, color: COLORS.accent, fontWeight: "500" },
  previewUnit: { fontSize: 12, color: "#8E8E93" },
  dangerZone: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fff5f5",
    borderWidth: 1,
    borderColor: "#f5c2c2",
    alignItems: "center",
    marginBottom: 16,
  },
  dangerText: { color: COLORS.danger, fontWeight: "700", fontSize: 16 },
  restrictedIcon: { fontSize: 40, marginBottom: 12 },
  restrictedTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 16,
  },
  backButtonAlt: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonAltText: { fontSize: 14, fontWeight: "600", color: "#fff" },
});
