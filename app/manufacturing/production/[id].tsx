import { AntDesign } from "@expo/vector-icons";
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
import { usePermissions } from "../../../context/PermissionsContext";
import { COLORS } from "../../../lib/colors";
import supabase from "../../../lib/supabase";

const STATUS_COLORS: Record<string, string> = {
  draft: "#e2e8f0",
  confirmed: "#dbeafe",
  in_progress: "#fef9c3",
  completed: "#d4edda",
  closed: "#d4edda",
  cancelled: "#f8d7da",
};

const STATUS_TEXT: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
};

interface ConsumptionLine {
  bom_ingredient_id: string;
  raw_material_id: string;
  raw_material_name: string;
  expected_quantity: number;
  actual_quantity: string;
  unit: string;
  unit_cost: number;
}

interface OutputLine {
  id: string;
  product_id: string;
  product_name: string;
  output_type: string;
  quantity_produced: string;
  expected_quantity: number;
  unit: string;
}

interface CostLine {
  id: string;
  cost_type: string;
  description: string;
  amount: string;
  is_new: boolean;
  db_id?: string;
}

const OUTPUT_TYPES = [
  { value: "finished_good", label: "Finished Good" },
  { value: "byproduct", label: "Byproduct" },
  { value: "waste_sold", label: "Waste (Sellable)" },
  { value: "waste_discarded", label: "Waste (Discard)" },
];

export default function ProductionOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  const canManage = hasPermission("manufacturing.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState<any>(null);

  // Execution state
  const [consumptions, setConsumptions] = useState<ConsumptionLine[]>([]);
  const [outputs, setOutputs] = useState<OutputLine[]>([]);
  const [costs, setCosts] = useState<CostLine[]>([]);

  useEffect(() => {
    if (id) fetchOrder();
  }, [id]);

  async function fetchOrder() {
    setLoading(true);
    const { data, error } = await supabase
      .from("production_orders")
      .select(
        `
        *,
        bom:bom_id (
          *,
          product:product_id (id, name, unit),
          bom_ingredients (
            id, quantity_required, unit,
            raw_material:raw_material_id (id, name, unit)
          ),
          bom_cost_templates (cost_type, description, expected_amount)
        ),
        location:location_id (id, name),
        production_costs (id, cost_type, description, amount),
        production_outputs (*)
      `,
      )
      .eq("id", id)
      .single();

    if (error) {
      Alert.alert("Error", error.message);
      router.back();
      return;
    }

    setOrder(data);

    // Pre-fill consumptions from BOM scaled to quantity_to_produce
    const qty = data.quantity_to_produce;
    const prefilledConsumptions: ConsumptionLine[] =
      data.bom?.bom_ingredients?.map((ing: any) => ({
        bom_ingredient_id: ing.id,
        raw_material_id: ing.raw_material?.id,
        raw_material_name: ing.raw_material?.name,
        expected_quantity: ing.quantity_required * qty,
        actual_quantity: (ing.quantity_required * qty).toString(),
        unit: ing.unit ?? ing.raw_material?.unit ?? "",
        unit_cost: 0, // will be fetched from inventory WAC
      }));

    setConsumptions(prefilledConsumptions);

    // Pre-fill outputs — default to one finished good output
    const prefilledOutputs: OutputLine[] = [
      {
        id: Math.random().toString(),
        product_id: data.bom?.product?.id,
        product_name: data.bom?.product?.name,
        output_type: "finished_good",
        quantity_produced: qty.toString(),
        expected_quantity: qty,
        unit: data.bom?.product?.unit ?? "pcs",
      },
    ];
    setOutputs(prefilledOutputs);

    // Pre-fill costs from BOM cost templates
    const prefilledCosts: CostLine[] =
      data.bom?.bom_cost_templates?.map((ct: any) => ({
        id: Math.random().toString(),
        cost_type: ct.cost_type,
        description: ct.description ?? "",
        amount: ct.expected_amount?.toString() ?? "",
        is_new: true,
      })) ?? [];

    // Also load any already-saved costs
    const savedCosts: CostLine[] =
      data.production_costs?.map((pc: any) => ({
        id: pc.id,
        cost_type: pc.cost_type,
        description: pc.description ?? "",
        amount: pc.amount?.toString() ?? "",
        is_new: false,
        db_id: pc.id,
      })) ?? [];

    setCosts(savedCosts.length > 0 ? savedCosts : prefilledCosts);

    // Fetch WAC for each raw material
    await fetchMaterialCosts(prefilledConsumptions, data.location_id);

    setLoading(false);
  }

  async function fetchMaterialCosts(
    lines: ConsumptionLine[],
    locationId: string,
  ) {
    if (lines.length === 0) return;
    const productIds = lines.map((l) => l.raw_material_id);

    const { data } = await supabase
      .from("inventory")
      .select("product_id, weighted_avg_cost")
      .eq("location_id", locationId)
      .in("product_id", productIds);

    if (!data) return;

    setConsumptions((prev) =>
      prev.map((line) => {
        const inv = data.find((d) => d.product_id === line.raw_material_id);
        return { ...line, unit_cost: inv?.weighted_avg_cost ?? 0 };
      }),
    );
  }

  function updateConsumption(id: string, field: string, value: string) {
    setConsumptions((prev) =>
      prev.map((c) =>
        c.bom_ingredient_id === id ? { ...c, [field]: value } : c,
      ),
    );
  }

  function addOutput() {
    setOutputs((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        product_id: "",
        product_name: "",
        output_type: "byproduct",
        quantity_produced: "",
        expected_quantity: 0,
        unit: "",
      },
    ]);
  }

  function updateOutput(id: string, field: string, value: string) {
    setOutputs((prev) =>
      prev.map((o) => (o.id === id ? { ...o, [field]: value } : o)),
    );
  }

  function removeOutput(id: string) {
    setOutputs((prev) => prev.filter((o) => o.id !== id));
  }

  function updateCost(id: string, field: string, value: string) {
    setCosts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  }

  function addCost() {
    setCosts((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        cost_type: "labour",
        description: "",
        amount: "",
        is_new: true,
      },
    ]);
  }

  function removeCost(id: string) {
    setCosts((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleStartProduction() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("production_orders")
        .update({ status: "in_progress", started_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      await fetchOrder();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    // Validate
    for (const c of consumptions) {
      if (!c.actual_quantity || parseFloat(c.actual_quantity) < 0) {
        Alert.alert("Error", `Invalid quantity for ${c.raw_material_name}`);
        return;
      }
    }
    for (const o of outputs) {
      if (!o.quantity_produced || parseFloat(o.quantity_produced) < 0) {
        Alert.alert("Error", "All outputs must have a valid quantity");
        return;
      }
    }

    Alert.alert(
      "Complete Production",
      "This will deduct raw materials from inventory and add finished goods. This cannot be undone. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Complete", onPress: doComplete },
      ],
    );
  }

  async function doComplete() {
    setSaving(true);
    try {
      // Save any unsaved production costs first
      const newCosts = costs.filter((c) => c.is_new && c.amount);
      if (newCosts.length > 0) {
        const costInserts = newCosts.map((c) => ({
          production_order_id: id,
          cost_type: c.cost_type,
          description: c.description || null,
          amount: parseFloat(c.amount),
        }));
        const { error: costErr } = await supabase
          .from("production_costs")
          .insert(costInserts);
        if (costErr) throw costErr;
      }

      // Build payloads for the RPC
      const consumptionPayload = consumptions.map((c) => ({
        raw_material_id: c.raw_material_id,
        bom_ingredient_id: c.bom_ingredient_id,
        actual_quantity: parseFloat(c.actual_quantity),
        expected_quantity: c.expected_quantity,
        unit_cost: c.unit_cost,
      }));

      const outputPayload = outputs.map((o) => ({
        product_id: o.product_id,
        output_type: o.output_type,
        quantity_produced: parseFloat(o.quantity_produced),
        expected_quantity: o.expected_quantity,
        expected_raw_material_cost: consumptions.reduce(
          (sum, c) => sum + c.expected_quantity * c.unit_cost,
          0,
        ),
      }));

      const { data, error } = await supabase.rpc("complete_production_order", {
        p_production_order_id: id,
        p_location_id: order.location_id,
        p_device_id: null,
        p_outputs: outputPayload,
        p_consumptions: consumptionPayload,
      });

      if (error) throw error;

      const result = data as any;
      Alert.alert(
        "Production Complete ✅",
        `Total cost: ₦${parseFloat(result.total_cost).toLocaleString()}\nRaw materials: ₦${parseFloat(result.total_raw_material_cost).toLocaleString()}\nOther costs: ₦${parseFloat(result.total_production_costs).toLocaleString()}`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  // Computed cost summary
  const totalMaterialCost = consumptions.reduce(
    (sum, c) => sum + (parseFloat(c.actual_quantity) || 0) * c.unit_cost,
    0,
  );
  const totalOtherCosts = costs.reduce(
    (sum, c) => sum + (parseFloat(c.amount) || 0),
    0,
  );
  const totalCost = totalMaterialCost + totalOtherCosts;
  const finishedGoodOutput = outputs.find(
    (o) => o.output_type === "finished_good",
  );
  const unitCost =
    finishedGoodOutput && parseFloat(finishedGoodOutput.quantity_produced) > 0
      ? totalCost / parseFloat(finishedGoodOutput.quantity_produced)
      : 0;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const isLocked = order.status === "closed" || order.status === "cancelled";
  const isInProgress = order.status === "in_progress";
  const isConfirmed = order.status === "confirmed";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrow-left" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {order.order_number}
        </Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: STATUS_COLORS[order.status] ?? "#eee" },
          ]}
        >
          <Text style={styles.statusText}>
            {STATUS_TEXT[order.status] ?? order.status}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Order Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoProduct}>{order.bom?.product?.name}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Planned qty</Text>
            <Text style={styles.infoValue}>
              {order.quantity_to_produce} {order.bom?.product?.unit}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Location</Text>
            <Text style={styles.infoValue}>{order.location?.name}</Text>
          </View>
          {order.notes && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Notes</Text>
              <Text style={styles.infoValue}>{order.notes}</Text>
            </View>
          )}
          {order.started_at && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Started</Text>
              <Text style={styles.infoValue}>
                {new Date(order.started_at).toLocaleString()}
              </Text>
            </View>
          )}
        </View>

        {/* Start button */}
        {isConfirmed && canManage && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.startButton,
              saving && { opacity: 0.6 },
            ]}
            onPress={handleStartProduction}
            disabled={saving}
          >
            <Text style={styles.actionButtonText}>▶ Start Production</Text>
          </TouchableOpacity>
        )}

        {/* Material Consumption */}
        <Text style={styles.sectionLabel}>MATERIAL CONSUMPTION</Text>
        {consumptions.map((c) => (
          <View key={c.bom_ingredient_id} style={styles.consumptionCard}>
            <Text style={styles.consumptionName}>{c.raw_material_name}</Text>
            <View style={styles.consumptionRow}>
              <View style={styles.consumptionCol}>
                <Text style={styles.miniLabel}>Expected</Text>
                <Text style={styles.consumptionExpected}>
                  {c.expected_quantity} {c.unit}
                </Text>
              </View>
              <View style={styles.consumptionCol}>
                <Text style={styles.miniLabel}>Actual Used</Text>
                <TextInput
                  style={[styles.miniInput, isLocked && styles.inputReadOnly]}
                  value={c.actual_quantity}
                  onChangeText={(v) =>
                    updateConsumption(c.bom_ingredient_id, "actual_quantity", v)
                  }
                  keyboardType="decimal-pad"
                  editable={isInProgress && canManage}
                />
              </View>
              <View style={styles.consumptionCol}>
                <Text style={styles.miniLabel}>Unit Cost (WAC)</Text>
                <Text style={styles.consumptionWac}>
                  ₦{c.unit_cost.toFixed(2)}
                </Text>
              </View>
            </View>
            <Text style={styles.consumptionLineCost}>
              Line cost: ₦
              {(
                (parseFloat(c.actual_quantity) || 0) * c.unit_cost
              ).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
          </View>
        ))}

        {/* Production Costs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>PRODUCTION COSTS</Text>
          {isInProgress && canManage && (
            <TouchableOpacity style={styles.addRowButton} onPress={addCost}>
              <Text style={styles.addRowButtonText}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {costs.length === 0 && (
          <Text style={styles.emptySection}>
            No additional costs recorded yet.
          </Text>
        )}

        {costs.map((c) => (
          <View key={c.id} style={styles.costCard}>
            <View style={styles.costCardHeader}>
              <Text style={styles.costType}>
                {c.cost_type.charAt(0).toUpperCase() + c.cost_type.slice(1)}
                {c.description ? ` — ${c.description}` : ""}
              </Text>
              {isInProgress && canManage && (
                <TouchableOpacity onPress={() => removeCost(c.id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={[styles.input, isLocked && styles.inputReadOnly]}
              value={c.amount}
              onChangeText={(v) => updateCost(c.id, "amount", v)}
              placeholder="Amount (₦)"
              keyboardType="decimal-pad"
              editable={isInProgress && canManage}
            />
          </View>
        ))}

        {/* Outputs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>OUTPUTS</Text>
          {isInProgress && canManage && (
            <TouchableOpacity style={styles.addRowButton} onPress={addOutput}>
              <Text style={styles.addRowButtonText}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.helpText}>
          Record what came out of this production run — finished goods,
          byproducts, and waste.
        </Text>

        {outputs.map((o, index) => (
          <View key={o.id} style={styles.outputCard}>
            <View style={styles.outputCardHeader}>
              <Text style={styles.outputCardTitle}>Output {index + 1}</Text>
              {isInProgress &&
                canManage &&
                o.output_type !== "finished_good" && (
                  <TouchableOpacity onPress={() => removeOutput(o.id)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                )}
            </View>

            {/* Output type selector */}
            <View style={styles.outputTypeRow}>
              {OUTPUT_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.outputTypeOption,
                    o.output_type === type.value && styles.outputTypeSelected,
                    o.output_type === "finished_good" &&
                      styles.outputTypeDisabled,
                  ]}
                  onPress={() => {
                    if (!isInProgress || o.output_type === "finished_good")
                      return;
                    updateOutput(o.id, "output_type", type.value);
                  }}
                >
                  <Text
                    style={[
                      styles.outputTypeText,
                      o.output_type === type.value &&
                        styles.outputTypeTextSelected,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.outputProductName}>{o.product_name}</Text>

            <View style={styles.consumptionRow}>
              <View style={styles.consumptionCol}>
                <Text style={styles.miniLabel}>Expected</Text>
                <Text style={styles.consumptionExpected}>
                  {o.expected_quantity} {o.unit}
                </Text>
              </View>
              <View style={styles.consumptionCol}>
                <Text style={styles.miniLabel}>Actual</Text>
                <TextInput
                  style={[styles.miniInput, isLocked && styles.inputReadOnly]}
                  value={o.quantity_produced}
                  onChangeText={(v) =>
                    updateOutput(o.id, "quantity_produced", v)
                  }
                  keyboardType="decimal-pad"
                  editable={isInProgress && canManage}
                />
              </View>
            </View>
          </View>
        ))}

        {/* Cost Summary */}
        {(isInProgress || isLocked) && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>💰 Cost Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Raw Materials</Text>
              <Text style={styles.summaryValue}>
                ₦
                {totalMaterialCost.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Other Costs</Text>
              <Text style={styles.summaryValue}>
                ₦
                {totalOtherCosts.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.summaryTotalLabel}>Total Cost</Text>
              <Text style={styles.summaryTotalValue}>
                ₦
                {totalCost.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </Text>
            </View>
            {unitCost > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Unit Cost (Finished Good)
                </Text>
                <Text style={[styles.summaryValue, { color: COLORS.primary }]}>
                  ₦
                  {unitCost.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Complete button */}
        {isInProgress && canManage && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.completeButton,
              saving && { opacity: 0.6 },
            ]}
            onPress={handleComplete}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>
                ✅ Complete & Close Production
              </Text>
            )}
          </TouchableOpacity>
        )}

        {isLocked && (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedText}>
              🔒 This production order is {order.status}. No further edits are
              allowed.
            </Text>
          </View>
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
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#333",
    flex: 1,
    marginHorizontal: 8,
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: "700", color: "#333" },
  scroll: { flex: 1, padding: 16 },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  infoProduct: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  infoLabel: { fontSize: 13, color: "#999" },
  infoValue: { fontSize: 13, fontWeight: "600", color: "#333" },
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
  helpText: { fontSize: 12, color: "#8E8E93", marginBottom: 8, marginTop: -4 },
  consumptionCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  consumptionName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  consumptionRow: { flexDirection: "row", gap: 8 },
  consumptionCol: { flex: 1 },
  consumptionExpected: { fontSize: 14, color: "#666", paddingVertical: 8 },
  consumptionWac: { fontSize: 14, color: "#666", paddingVertical: 8 },
  consumptionLineCost: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "right",
  },
  costCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  costCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  costType: { fontSize: 14, fontWeight: "600", color: "#333" },
  outputCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  outputCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  outputCardTitle: { fontSize: 14, fontWeight: "700", color: "#333" },
  outputTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  outputTypeOption: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f9f9f9",
  },
  outputTypeSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  outputTypeDisabled: { opacity: 0.6 },
  outputTypeText: { fontSize: 11, fontWeight: "600", color: "#555" },
  outputTypeTextSelected: { color: "#fff" },
  outputProductName: { fontSize: 13, color: "#666", marginBottom: 8 },
  summaryCard: {
    backgroundColor: "#f0f8ff",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#bee3f8",
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2b6cb0",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#bee3f8",
  },
  summaryLabel: { fontSize: 13, color: "#555" },
  summaryValue: { fontSize: 13, fontWeight: "600", color: "#333" },
  summaryTotal: { marginTop: 4 },
  summaryTotalLabel: { fontSize: 15, fontWeight: "700", color: "#2b6cb0" },
  summaryTotalValue: { fontSize: 15, fontWeight: "700", color: "#2b6cb0" },
  actionButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  startButton: { backgroundColor: "#2b6cb0" },
  completeButton: { backgroundColor: "#276749" },
  actionButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  lockedBanner: {
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#dee2e6",
    alignItems: "center",
  },
  lockedText: { fontSize: 13, color: "#6c757d", textAlign: "center" },
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
    paddingVertical: 12,
    fontStyle: "italic",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 0,
  },
  inputReadOnly: { backgroundColor: "#F2F2F7", color: "#6C6C70" },
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
    padding: 8,
    fontSize: 14,
  },
  removeText: { fontSize: 13, color: COLORS.danger, fontWeight: "600" },
});
