import { AntDesign } from "@expo/vector-icons";
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
import { usePermissions } from "../../../context/PermissionsContext";
import { COLORS } from "../../../lib/colors";
import supabase from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

export default function AddProductionOrderScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission } = usePermissions();

  const [boms, setBoms] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedBomId, setSelectedBomId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [quantityToProduce, setQuantityToProduce] = useState("");
  const [notes, setNotes] = useState("");

  const [showBomPicker, setShowBomPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [bomSearch, setBomSearch] = useState("");

  useEffect(() => {
    fetchData();
  }, [organizationId]);

  async function fetchData() {
    if (!organizationId) return;
    setLoading(true);

    const [bomsRes, locationsRes] = await Promise.all([
      supabase
        .from("bill_of_materials")
        .select(
          `
          id, name, is_active,
          product:product_id (name, unit),
          bom_ingredients (
            id, quantity_required, unit,
            raw_material:raw_material_id (id, name, unit)
          ),
          bom_cost_templates (cost_type, description, expected_amount)
        `,
        )
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),

      supabase
        .from("locations")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name"),
    ]);

    setBoms(bomsRes.data ?? []);
    setLocations(locationsRes.data ?? []);

    // Default to first location
    if (locationsRes.data && locationsRes.data.length > 0) {
      setSelectedLocationId(locationsRes.data[0].id);
    }

    setLoading(false);
  }

  const selectedBom = boms.find((b) => b.id === selectedBomId);
  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  const filteredBoms = boms.filter((b) =>
    b.product?.name?.toLowerCase().includes(bomSearch.toLowerCase()),
  );

  // Calculate expected material needs based on quantity
  function getExpectedIngredients() {
    if (!selectedBom || !quantityToProduce) return [];
    const qty = parseFloat(quantityToProduce);
    if (isNaN(qty) || qty <= 0) return [];
    return selectedBom.bom_ingredients.map((ing: any) => ({
      ...ing,
      expected_total: ing.quantity_required * qty,
    }));
  }

  // Generate a simple order number
  function generateOrderNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `PO-${year}${month}-${rand}`;
  }

  async function handleCreate() {
    if (!selectedBomId) {
      Alert.alert("Error", "Please select a BOM");
      return;
    }
    if (!selectedLocationId) {
      Alert.alert("Error", "Please select a location");
      return;
    }
    if (!quantityToProduce || parseFloat(quantityToProduce) <= 0) {
      Alert.alert("Error", "Please enter a valid quantity to produce");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("production_orders")
        .insert({
          organization_id: organizationId,
          bom_id: selectedBomId,
          location_id: selectedLocationId,
          quantity_to_produce: parseFloat(quantityToProduce),
          status: "confirmed",
          order_number: generateOrderNumber(),
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      Alert.alert(
        "Success",
        `Production order ${data.order_number} created. Go to the order to start production.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission("manufacturing.manage")) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🔐</Text>
        <Text style={styles.restrictedText}>Access Restricted</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const expectedIngredients = getExpectedIngredients();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrow-left" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>New Production Order</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        {/* BOM Picker */}
        <Text style={styles.sectionLabel}>BILL OF MATERIALS *</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowBomPicker(!showBomPicker)}
        >
          <Text
            style={
              selectedBomId ? styles.pickerValue : styles.pickerPlaceholder
            }
          >
            {selectedBom?.product?.name
              ? `${selectedBom.product.name}${selectedBom.name ? ` — ${selectedBom.name}` : ""}`
              : "Select a BOM..."}
          </Text>
          <AntDesign
            name={showBomPicker ? "up" : "down"}
            size={16}
            color="#999"
          />
        </TouchableOpacity>

        {showBomPicker && (
          <View style={styles.pickerDropdown}>
            <TextInput
              style={styles.pickerSearch}
              placeholder="Search..."
              value={bomSearch}
              onChangeText={setBomSearch}
              autoFocus
            />
            {filteredBoms.length === 0 ? (
              <Text style={styles.pickerEmpty}>
                No active BOMs found. Create a BOM first.
              </Text>
            ) : (
              filteredBoms.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.pickerOption,
                    b.id === selectedBomId && styles.pickerOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedBomId(b.id);
                    setShowBomPicker(false);
                    setBomSearch("");
                  }}
                >
                  <Text style={styles.pickerOptionText}>{b.product?.name}</Text>
                  {b.name && (
                    <Text style={styles.pickerOptionMeta}>{b.name}</Text>
                  )}
                  <Text style={styles.pickerOptionMeta}>
                    {b.bom_ingredients?.length ?? 0} ingredients
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Location Picker */}
        <Text style={styles.sectionLabel}>PRODUCTION LOCATION *</Text>
        <View style={styles.locationRow}>
          {locations.map((loc) => (
            <TouchableOpacity
              key={loc.id}
              style={[
                styles.locationOption,
                selectedLocationId === loc.id && styles.locationOptionSelected,
              ]}
              onPress={() => setSelectedLocationId(loc.id)}
            >
              <Text
                style={[
                  styles.locationOptionText,
                  selectedLocationId === loc.id &&
                    styles.locationOptionTextSelected,
                ]}
              >
                {loc.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quantity */}
        <Text style={styles.sectionLabel}>QUANTITY TO PRODUCE *</Text>
        <TextInput
          style={styles.input}
          value={quantityToProduce}
          onChangeText={setQuantityToProduce}
          placeholder={`How many ${selectedBom?.product?.unit ?? "units"}?`}
          keyboardType="decimal-pad"
        />

        {/* Material preview */}
        {expectedIngredients.length > 0 && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>📦 Materials Required</Text>
            <Text style={styles.previewSubtitle}>
              Based on BOM for {quantityToProduce} {selectedBom?.product?.unit}
            </Text>
            {expectedIngredients.map((ing: any) => (
              <View key={ing.id} style={styles.previewRow}>
                <Text style={styles.previewMaterial}>
                  {ing.raw_material?.name}
                </Text>
                <Text style={styles.previewQty}>
                  {ing.expected_total} {ing.unit ?? ing.raw_material?.unit}
                </Text>
              </View>
            ))}
            {selectedBom?.bom_cost_templates?.length > 0 && (
              <>
                <Text style={[styles.previewTitle, { marginTop: 12 }]}>
                  💰 Expected Costs
                </Text>
                {selectedBom.bom_cost_templates.map((ct: any, i: number) => (
                  <View key={i} style={styles.previewRow}>
                    <Text style={styles.previewMaterial}>
                      {ct.cost_type.charAt(0).toUpperCase() +
                        ct.cost_type.slice(1)}
                      {ct.description ? ` — ${ct.description}` : ""}
                    </Text>
                    <Text style={styles.previewQty}>
                      ₦{parseFloat(ct.expected_amount).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* Notes */}
        <Text style={styles.sectionLabel}>NOTES (OPTIONAL)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Any notes about this production run..."
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Create Production Order</Text>
          )}
        </TouchableOpacity>

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
    padding: 16,
    paddingTop: 48,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#333" },
  form: { flex: 1, padding: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8E8E93",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  textArea: { height: 80, textAlignVertical: "top" },
  pickerButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  pickerValue: { fontSize: 15, color: "#333", flex: 1 },
  pickerPlaceholder: { fontSize: 15, color: "#aaa", flex: 1 },
  pickerDropdown: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
    maxHeight: 280,
  },
  pickerSearch: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    padding: 12,
    fontSize: 14,
  },
  pickerOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  pickerOptionSelected: { backgroundColor: "#f0f8ff" },
  pickerOptionText: { fontSize: 15, color: "#333", fontWeight: "500" },
  pickerOptionMeta: { fontSize: 12, color: "#999", marginTop: 2 },
  pickerEmpty: {
    padding: 16,
    fontSize: 13,
    color: "#999",
    textAlign: "center",
  },
  locationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  locationOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  locationOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  locationOptionText: { fontSize: 14, fontWeight: "600", color: "#555" },
  locationOptionTextSelected: { color: "#fff" },
  previewCard: {
    backgroundColor: "#f0f8ff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#bee3f8",
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2b6cb0",
    marginBottom: 8,
  },
  previewSubtitle: {
    fontSize: 12,
    color: "#4a90d9",
    marginBottom: 8,
    marginTop: -4,
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#bee3f8",
  },
  previewMaterial: { fontSize: 13, color: "#333", flex: 1 },
  previewQty: { fontSize: 13, fontWeight: "600", color: "#2b6cb0" },
  saveButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  restrictedText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 16,
  },
  backLink: { fontSize: 15, color: COLORS.primary, fontWeight: "600" },
});
