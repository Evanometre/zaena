import { AntDesign } from "@expo/vector-icons";
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
import { usePermissions } from "../../../context/PermissionsContext";
import { COLORS } from "../../../lib/colors";
import supabase from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

interface Ingredient {
  id: string;
  raw_material_id: string;
  raw_material_name: string;
  quantity_required: string;
  unit: string;
  notes: string;
}

interface CostTemplate {
  id: string;
  cost_type: string;
  description: string;
  expected_amount: string;
}

const COST_TYPES = ["labour", "electricity", "packaging", "overhead", "other"];

export default function AddBOMScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission } = usePermissions();

  const [finishedGoods, setFinishedGoods] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);

  // BOM header
  const [selectedProductId, setSelectedProductId] = useState("");
  const [bomName, setBomName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");

  // Ingredients
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  // Cost templates
  const [costTemplates, setCostTemplates] = useState<CostTemplate[]>([]);

  // Product picker state
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState<string | null>(
    null,
  ); // ingredient id
  const [productSearch, setProductSearch] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");

  useEffect(() => {
    fetchProducts();
  }, [organizationId]);

  async function fetchProducts() {
    if (!organizationId) return;
    setLoadingProducts(true);

    const { data } = await supabase
      .from("products")
      .select("id, name, unit, product_type, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name");

    const all = data ?? [];
    setFinishedGoods(
      all.filter(
        (p) =>
          p.product_type === "product" || p.product_type === "semi_finished",
      ),
    );
    setRawMaterials(
      all.filter(
        (p) =>
          p.product_type === "raw_material" ||
          p.product_type === "semi_finished",
      ),
    );
    setLoadingProducts(false);
  }

  function addIngredient() {
    setIngredients([
      ...ingredients,
      {
        id: Math.random().toString(),
        raw_material_id: "",
        raw_material_name: "",
        quantity_required: "",
        unit: "",
        notes: "",
      },
    ]);
  }

  function updateIngredient(
    id: string,
    field: keyof Ingredient,
    value: string,
  ) {
    setIngredients(
      ingredients.map((ing) =>
        ing.id === id ? { ...ing, [field]: value } : ing,
      ),
    );
  }

  function removeIngredient(id: string) {
    setIngredients(ingredients.filter((ing) => ing.id !== id));
  }

  function addCostTemplate() {
    setCostTemplates([
      ...costTemplates,
      {
        id: Math.random().toString(),
        cost_type: "labour",
        description: "",
        expected_amount: "",
      },
    ]);
  }

  function updateCostTemplate(
    id: string,
    field: keyof CostTemplate,
    value: string,
  ) {
    setCostTemplates(
      costTemplates.map((ct) =>
        ct.id === id ? { ...ct, [field]: value } : ct,
      ),
    );
  }

  function removeCostTemplate(id: string) {
    setCostTemplates(costTemplates.filter((ct) => ct.id !== id));
  }

  async function handleSave() {
    if (!selectedProductId) {
      Alert.alert("Error", "Please select a finished product for this BOM");
      return;
    }
    if (ingredients.length === 0) {
      Alert.alert("Error", "Please add at least one ingredient");
      return;
    }
    for (const ing of ingredients) {
      if (!ing.raw_material_id) {
        Alert.alert(
          "Error",
          "All ingredients must have a raw material selected",
        );
        return;
      }
      if (!ing.quantity_required || parseFloat(ing.quantity_required) <= 0) {
        Alert.alert("Error", "All ingredients must have a valid quantity");
        return;
      }
    }
    for (const ct of costTemplates) {
      if (!ct.expected_amount || parseFloat(ct.expected_amount) <= 0) {
        Alert.alert("Error", "All cost templates must have a valid amount");
        return;
      }
    }

    setSaving(true);
    try {
      // Insert BOM header
      const { data: bom, error: bomError } = await supabase
        .from("bill_of_materials")
        .insert({
          organization_id: organizationId,
          product_id: selectedProductId,
          name: bomName.trim() || null,
          is_active: isActive,
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (bomError) throw bomError;

      // Insert ingredients
      const ingredientInserts = ingredients.map((ing) => ({
        bom_id: bom.id,
        raw_material_id: ing.raw_material_id,
        quantity_required: parseFloat(ing.quantity_required),
        unit: ing.unit.trim() || null,
        notes: ing.notes.trim() || null,
      }));

      const { error: ingError } = await supabase
        .from("bom_ingredients")
        .insert(ingredientInserts);

      if (ingError) throw ingError;

      // Insert cost templates if any
      if (costTemplates.length > 0) {
        const costInserts = costTemplates.map((ct) => ({
          bom_id: bom.id,
          cost_type: ct.cost_type,
          description: ct.description.trim() || null,
          expected_amount: parseFloat(ct.expected_amount),
        }));

        const { error: costError } = await supabase
          .from("bom_cost_templates")
          .insert(costInserts);

        if (costError) throw costError;
      }

      Alert.alert("Success", "BOM created successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  const selectedProduct = finishedGoods.find((p) => p.id === selectedProductId);
  const filteredProducts = finishedGoods.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()),
  );
  const filteredMaterials = rawMaterials.filter((p) =>
    p.name.toLowerCase().includes(materialSearch.toLowerCase()),
  );

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrow-left" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>New Product Recipe - Bill of Materials</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        {/* Finished Product Picker */}
        <Text style={styles.sectionLabel}>WHAT ARE YOU MAKING? *</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowProductPicker(!showProductPicker)}
        >
          <Text
            style={
              selectedProductId ? styles.pickerValue : styles.pickerPlaceholder
            }
          >
            {selectedProduct?.name ?? "Select a finished product..."}
          </Text>
          <AntDesign
            name={showProductPicker ? "up" : "down"}
            size={16}
            color="#999"
          />
        </TouchableOpacity>

        {showProductPicker && (
          <View style={styles.pickerDropdown}>
            <TextInput
              style={styles.pickerSearch}
              placeholder="Search products..."
              value={productSearch}
              onChangeText={setProductSearch}
              autoFocus
            />
            {loadingProducts ? (
              <ActivityIndicator style={{ padding: 16 }} />
            ) : filteredProducts.length === 0 ? (
              <Text style={styles.pickerEmpty}>
                No finished products or semi-finished goods found. Make sure
                products are marked as the correct type.
              </Text>
            ) : (
              filteredProducts.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.pickerOption,
                    p.id === selectedProductId && styles.pickerOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedProductId(p.id);
                    setShowProductPicker(false);
                    setProductSearch("");
                  }}
                >
                  <Text style={styles.pickerOptionText}>{p.name}</Text>
                  <Text style={styles.pickerOptionMeta}>
                    {p.product_type === "semi_finished"
                      ? "Semi-Finished"
                      : "Product"}{" "}
                    · {p.unit}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* BOM Name */}
        <Text style={styles.sectionLabel}>RECIPE/BOM NAME (OPTIONAL)</Text>
        <TextInput
          style={styles.input}
          value={bomName}
          onChangeText={setBomName}
          placeholder='e.g. "Standard Recipe", "Dry Season Formula"'
        />
        <Text style={styles.helpText}>
          Useful if you have multiple BOMs for the same product
        </Text>

        {/* Active toggle */}
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Active</Text>
          <Switch value={isActive} onValueChange={setIsActive} />
        </View>

        {/* Notes */}
        <Text style={styles.sectionLabel}>NOTES (OPTIONAL)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Any notes about this BOM..."
          multiline
          numberOfLines={3}
        />

        {/* Ingredients */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>INGREDIENTS *</Text>
          <TouchableOpacity style={styles.addRowButton} onPress={addIngredient}>
            <Text style={styles.addRowButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {ingredients.length === 0 && (
          <Text style={styles.emptySection}>
            No ingredients yet. Add the raw materials that go into this product.
          </Text>
        )}

        {ingredients.map((ing, index) => (
          <View key={ing.id} style={styles.ingredientCard}>
            <View style={styles.ingredientCardHeader}>
              <Text style={styles.ingredientCardTitle}>
                Ingredient {index + 1}
              </Text>
              <TouchableOpacity onPress={() => removeIngredient(ing.id)}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>

            {/* Raw material picker */}
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() =>
                setShowMaterialPicker(
                  showMaterialPicker === ing.id ? null : ing.id,
                )
              }
            >
              <Text
                style={
                  ing.raw_material_id
                    ? styles.pickerValue
                    : styles.pickerPlaceholder
                }
              >
                {ing.raw_material_name || "Select raw material..."}
              </Text>
              <AntDesign
                name={showMaterialPicker === ing.id ? "up" : "down"}
                size={16}
                color="#999"
              />
            </TouchableOpacity>

            {showMaterialPicker === ing.id && (
              <View style={styles.pickerDropdown}>
                <TextInput
                  style={styles.pickerSearch}
                  placeholder="Search materials..."
                  value={materialSearch}
                  onChangeText={setMaterialSearch}
                  autoFocus
                />
                {filteredMaterials.length === 0 ? (
                  <Text style={styles.pickerEmpty}>
                    No raw materials found. Add products with type &quot;Raw
                    Material&quot; first.
                  </Text>
                ) : (
                  filteredMaterials.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.pickerOption,
                        m.id === ing.raw_material_id &&
                          styles.pickerOptionSelected,
                      ]}
                      onPress={() => {
                        setIngredients((prev) =>
                          prev.map((item) =>
                            item.id === ing.id
                              ? {
                                  ...item,
                                  raw_material_id: m.id,
                                  raw_material_name: m.name,
                                  unit: m.unit ?? "",
                                }
                              : item,
                          ),
                        );
                        setShowMaterialPicker(null);
                        setMaterialSearch("");
                      }}
                    >
                      <Text style={styles.pickerOptionText}>{m.name}</Text>
                      <Text style={styles.pickerOptionMeta}>{m.unit}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* Quantity and unit */}
            <View style={styles.ingredientRow}>
              <View style={{ flex: 2, marginRight: 8 }}>
                <Text style={styles.miniLabel}>Quantity Required</Text>
                <TextInput
                  style={styles.miniInput}
                  value={ing.quantity_required}
                  onChangeText={(v) =>
                    updateIngredient(ing.id, "quantity_required", v)
                  }
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.miniLabel}>Unit</Text>
                <TextInput
                  style={styles.miniInput}
                  value={ing.unit}
                  onChangeText={(v) => updateIngredient(ing.id, "unit", v)}
                  placeholder="kg"
                />
              </View>
            </View>

            <TextInput
              style={[styles.input, { marginTop: 8, marginBottom: 0 }]}
              value={ing.notes}
              onChangeText={(v) => updateIngredient(ing.id, "notes", v)}
              placeholder="Notes (optional)"
            />
          </View>
        ))}

        {/* Expected Production Costs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>EXPECTED COSTS (OPTIONAL)</Text>
          <TouchableOpacity
            style={styles.addRowButton}
            onPress={addCostTemplate}
          >
            <Text style={styles.addRowButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helpText}>
          Define expected labour, electricity, and overhead costs per production
          run. These become the benchmark for variance tracking.
        </Text>

        {costTemplates.map((ct, index) => (
          <View key={ct.id} style={styles.ingredientCard}>
            <View style={styles.ingredientCardHeader}>
              <Text style={styles.ingredientCardTitle}>Cost {index + 1}</Text>
              <TouchableOpacity onPress={() => removeCostTemplate(ct.id)}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>

            {/* Cost type selector */}
            <View style={styles.costTypeRow}>
              {COST_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.costTypeOption,
                    ct.cost_type === type && styles.costTypeSelected,
                  ]}
                  onPress={() => updateCostTemplate(ct.id, "cost_type", type)}
                >
                  <Text
                    style={[
                      styles.costTypeText,
                      ct.cost_type === type && styles.costTypeTextSelected,
                    ]}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={ct.description}
              onChangeText={(v) => updateCostTemplate(ct.id, "description", v)}
              placeholder="Description (e.g. Machine operator - 4 hours)"
            />
            <TextInput
              style={styles.input}
              value={ct.expected_amount}
              onChangeText={(v) =>
                updateCostTemplate(ct.id, "expected_amount", v)
              }
              placeholder="Expected amount (₦)"
              keyboardType="decimal-pad"
            />
          </View>
        ))}

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Create BOM</Text>
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 8,
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
  helpText: { fontSize: 12, color: "#8E8E93", marginBottom: 12, marginTop: -8 },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 12,
  },
  switchLabel: { fontSize: 15, fontWeight: "600", color: "#333" },
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
  ingredientCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  ingredientCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  ingredientCardTitle: { fontSize: 14, fontWeight: "700", color: "#333" },
  removeText: { fontSize: 13, color: COLORS.danger, fontWeight: "600" },
  ingredientRow: { flexDirection: "row", marginTop: 8 },
  miniLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 4,
  },
  miniInput: {
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  costTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  costTypeOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f9f9f9",
  },
  costTypeSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  costTypeText: { fontSize: 12, fontWeight: "600", color: "#555" },
  costTypeTextSelected: { color: "#fff" },
  addRowButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addRowButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  emptySection: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    paddingVertical: 16,
    fontStyle: "italic",
  },
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
