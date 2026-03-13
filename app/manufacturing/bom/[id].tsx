import { AntDesign } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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

const COST_TYPES = ["labour", "electricity", "packaging", "overhead", "other"];

export default function EditBOMScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission } = usePermissions();

  const canEdit = hasPermission("manufacturing.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bom, setBom] = useState<any>(null);
  const [finishedGoods, setFinishedGoods] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);

  // Form state
  const [bomName, setBomName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [costTemplates, setCostTemplates] = useState<any[]>([]);

  // Picker state
  const [showMaterialPicker, setShowMaterialPicker] = useState<string | null>(
    null,
  );
  const [materialSearch, setMaterialSearch] = useState("");

  useEffect(() => {
    if (id) {
      fetchBOM();
      fetchProducts();
    }
  }, [id]);

  async function fetchProducts() {
    if (!organizationId) return;
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
  }

  async function fetchBOM() {
    const { data, error } = await supabase
      .from("bill_of_materials")
      .select(
        `
        *,
        product:product_id (id, name, unit, product_type),
        bom_ingredients (*),
        bom_cost_templates (*)
      `,
      )
      .eq("id", id)
      .single();

    if (error) {
      Alert.alert("Error", error.message);
      router.back();
      return;
    }

    setBom(data);
    setBomName(data.name ?? "");
    setIsActive(data.is_active);
    setNotes(data.notes ?? "");
    setSelectedProductId(data.product_id);
    setIngredients(
      (data.bom_ingredients ?? []).map((ing: any) => ({
        ...ing,
        quantity_required: ing.quantity_required?.toString() ?? "",
        unit: ing.unit ?? "",
        notes: ing.notes ?? "",
        raw_material_name: "",
        is_new: false,
      })),
    );
    setCostTemplates(
      (data.bom_cost_templates ?? []).map((ct: any) => ({
        ...ct,
        expected_amount: ct.expected_amount?.toString() ?? "",
        is_new: false,
      })),
    );
    setLoading(false);
  }

  // Resolve raw material names after both are loaded
  useEffect(() => {
    if (rawMaterials.length > 0 && ingredients.length > 0) {
      setIngredients((prev) =>
        prev.map((ing) => {
          const match = rawMaterials.find((m) => m.id === ing.raw_material_id);
          return {
            ...ing,
            raw_material_name: match?.name ?? ing.raw_material_name,
          };
        }),
      );
    }
  }, [rawMaterials]);

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
        is_new: true,
      },
    ]);
  }

  function updateIngredient(id: string, field: string, value: string) {
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
        is_new: true,
      },
    ]);
  }

  function updateCostTemplate(id: string, field: string, value: string) {
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

    setSaving(true);
    try {
      // Update BOM header
      const { error: bomError } = await supabase
        .from("bill_of_materials")
        .update({
          name: bomName.trim() || null,
          is_active: isActive,
          notes: notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (bomError) throw bomError;

      // Delete all existing ingredients and re-insert
      // This is simpler than diffing and handles reordering cleanly
      await supabase.from("bom_ingredients").delete().eq("bom_id", id);

      const ingredientInserts = ingredients.map((ing) => ({
        bom_id: id,
        raw_material_id: ing.raw_material_id,
        quantity_required: parseFloat(ing.quantity_required),
        unit: ing.unit?.trim() || null,
        notes: ing.notes?.trim() || null,
      }));

      const { error: ingError } = await supabase
        .from("bom_ingredients")
        .insert(ingredientInserts);

      if (ingError) throw ingError;

      // Same for cost templates
      await supabase.from("bom_cost_templates").delete().eq("bom_id", id);

      if (costTemplates.length > 0) {
        const costInserts = costTemplates.map((ct) => ({
          bom_id: id,
          cost_type: ct.cost_type,
          description: ct.description?.trim() || null,
          expected_amount: parseFloat(ct.expected_amount),
        }));

        const { error: costError } = await supabase
          .from("bom_cost_templates")
          .insert(costInserts);

        if (costError) throw costError;
      }

      Alert.alert("Success", "BOM updated successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredMaterials = rawMaterials.filter((p) =>
    p.name.toLowerCase().includes(materialSearch.toLowerCase()),
  );

  const selectedProduct =
    finishedGoods.find((p) => p.id === selectedProductId) ?? bom?.product;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrow-left" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Edit Recipe/BOM</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        {/* Finished product — read only in edit mode */}
        <Text style={styles.sectionLabel}>WHAT ARE YOU MAKING?</Text>
        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyText}>
            {selectedProduct?.name ?? "—"}
          </Text>
          <Text style={styles.readOnlyMeta}>
            {selectedProduct?.product_type === "semi_finished"
              ? "Semi-Finished"
              : "Product"}{" "}
            · {selectedProduct?.unit}
          </Text>
        </View>
        <Text style={styles.helpText}>
          The finished product cannot be changed after creation. Create a new
          BOM if needed.
        </Text>

        {/* BOM Name */}
        <Text style={styles.sectionLabel}>BOM NAME (OPTIONAL)</Text>
        <TextInput
          style={[styles.input, !canEdit && styles.inputReadOnly]}
          value={bomName}
          onChangeText={setBomName}
          placeholder='e.g. "Standard Recipe"'
          editable={canEdit}
        />

        {/* Active */}
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Active</Text>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            disabled={!canEdit}
          />
        </View>

        {/* Notes */}
        <Text style={styles.sectionLabel}>NOTES</Text>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            !canEdit && styles.inputReadOnly,
          ]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Any notes about this BOM..."
          multiline
          numberOfLines={3}
          editable={canEdit}
        />

        {/* Ingredients */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>
            INGREDIENTS/RAW MATERIALS NEEDED
          </Text>
          {canEdit && (
            <TouchableOpacity
              style={styles.addRowButton}
              onPress={addIngredient}
            >
              <Text style={styles.addRowButtonText}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {ingredients.map((ing, index) => (
          <View key={ing.id} style={styles.ingredientCard}>
            <View style={styles.ingredientCardHeader}>
              <Text style={styles.ingredientCardTitle}>
                Ingredient {index + 1}
              </Text>
              {canEdit && (
                <TouchableOpacity onPress={() => removeIngredient(ing.id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.pickerButton, !canEdit && styles.inputReadOnly]}
              onPress={() => {
                if (!canEdit) return;
                setShowMaterialPicker(
                  showMaterialPicker === ing.id ? null : ing.id,
                );
              }}
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
              {canEdit && (
                <AntDesign
                  name={showMaterialPicker === ing.id ? "up" : "down"}
                  size={16}
                  color="#999"
                />
              )}
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
                {filteredMaterials.map((m) => (
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
                ))}
              </View>
            )}

            <View style={styles.ingredientRow}>
              <View style={{ flex: 2, marginRight: 8 }}>
                <Text style={styles.miniLabel}>Quantity Required</Text>
                <TextInput
                  style={[styles.miniInput, !canEdit && styles.inputReadOnly]}
                  value={ing.quantity_required}
                  onChangeText={(v) =>
                    updateIngredient(ing.id, "quantity_required", v)
                  }
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  editable={canEdit}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.miniLabel}>Unit</Text>
                <TextInput
                  style={[styles.miniInput, !canEdit && styles.inputReadOnly]}
                  value={ing.unit}
                  onChangeText={(v) => updateIngredient(ing.id, "unit", v)}
                  placeholder="kg"
                  editable={canEdit}
                />
              </View>
            </View>

            <TextInput
              style={[
                styles.input,
                { marginTop: 8, marginBottom: 0 },
                !canEdit && styles.inputReadOnly,
              ]}
              value={ing.notes}
              onChangeText={(v) => updateIngredient(ing.id, "notes", v)}
              placeholder="Notes (optional)"
              editable={canEdit}
            />
          </View>
        ))}

        {/* Expected Costs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>EXPECTED COSTS</Text>
          {canEdit && (
            <TouchableOpacity
              style={styles.addRowButton}
              onPress={addCostTemplate}
            >
              <Text style={styles.addRowButtonText}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {costTemplates.map((ct, index) => (
          <View key={ct.id} style={styles.ingredientCard}>
            <View style={styles.ingredientCardHeader}>
              <Text style={styles.ingredientCardTitle}>Cost {index + 1}</Text>
              {canEdit && (
                <TouchableOpacity onPress={() => removeCostTemplate(ct.id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.costTypeRow}>
              {COST_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.costTypeOption,
                    ct.cost_type === type && styles.costTypeSelected,
                  ]}
                  onPress={() => {
                    if (!canEdit) return;
                    updateCostTemplate(ct.id, "cost_type", type);
                  }}
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
              style={[
                styles.input,
                { marginTop: 8 },
                !canEdit && styles.inputReadOnly,
              ]}
              value={ct.description}
              onChangeText={(v) => updateCostTemplate(ct.id, "description", v)}
              placeholder="Description"
              editable={canEdit}
            />
            <TextInput
              style={[styles.input, !canEdit && styles.inputReadOnly]}
              value={ct.expected_amount}
              onChangeText={(v) =>
                updateCostTemplate(ct.id, "expected_amount", v)
              }
              placeholder="Expected amount (₦)"
              keyboardType="decimal-pad"
              editable={canEdit}
            />
          </View>
        ))}

        {canEdit && (
          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
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
  inputReadOnly: { backgroundColor: "#F2F2F7", color: "#6C6C70" },
  textArea: { height: 80, textAlignVertical: "top" },
  helpText: { fontSize: 12, color: "#8E8E93", marginBottom: 12, marginTop: -4 },
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
  readOnlyField: {
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  readOnlyText: { fontSize: 15, fontWeight: "600", color: "#333" },
  readOnlyMeta: { fontSize: 12, color: "#8E8E93", marginTop: 2 },
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
  saveButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
