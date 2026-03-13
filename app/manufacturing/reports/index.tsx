import { AntDesign } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { usePermissions } from "../../../context/PermissionsContext";
import { COLORS } from "../../../lib/colors";
import supabase from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

type TimeFilter = "this_month" | "last_month" | "all_time";

const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  this_month: "This Month",
  last_month: "Last Month",
  all_time: "All Time",
};

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  finished_good: "Main Product",
  byproduct: "Useful Byproduct",
  waste_sold: "Waste (Sold)",
  waste_discarded: "Waste (Discarded)",
};

function getDateRange(filter: TimeFilter): {
  from: string | null;
  to: string | null;
} {
  const now = new Date();
  if (filter === "all_time") return { from: null, to: null };

  if (filter === "this_month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    ).toISOString();
    return { from, to };
  }

  // last_month
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const to = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
  ).toISOString();
  return { from, to };
}

function formatNaira(amount: number) {
  return (
    "₦" +
    amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ManufacturingReportScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();

  const [timeFilter, setTimeFilter] = useState<TimeFilter>("this_month");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  async function fetchReport() {
    if (!organizationId) return;
    setLoading(true);

    const { from, to } = getDateRange(timeFilter);

    let query = supabase
      .from("production_orders")
      .select(
        `
        id,
        order_number,
        status,
        quantity_to_produce,
        started_at,
        completed_at,
        closed_at,
        created_at,
        bom:bom_id (
          product:product_id (name, unit)
        ),
        location:location_id (name),
        production_outputs (
          id,
          product_id,
          output_type,
          quantity_produced,
          expected_quantity,
          raw_material_cost,
          production_costs_absorbed,
          total_cost,
          unit_cost,
          quantity_variance,
          cost_variance,
          produced_at,
          product:product_id (name, unit)
        ),
        production_material_consumption (
          id,
          raw_material_id,
          expected_quantity,
          actual_quantity,
          unit_cost,
          raw_material:raw_material_id (name, unit)
        ),
        production_costs (
          id,
          cost_type,
          description,
          amount
        )
      `,
      )
      .eq("organization_id", organizationId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false });

    if (from) query = query.gte("closed_at", from);
    if (to) query = query.lte("closed_at", to);

    const { data, error } = await query;
    if (!error) setOrders(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(
    useCallback(() => {
      fetchReport();
    }, [organizationId, timeFilter]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchReport();
  }

  // Summary stats
  const totalRuns = orders.length;
  const totalUnitsProduced = orders.reduce((sum, o) => {
    const fg = o.production_outputs?.find(
      (out: any) => out.output_type === "finished_good",
    );
    return sum + (fg?.quantity_produced ?? 0);
  }, 0);
  const totalCostSpent = orders.reduce((sum, o) => {
    const fg = o.production_outputs?.find(
      (out: any) => out.output_type === "finished_good",
    );
    return sum + (fg?.total_cost ?? 0);
  }, 0);

  if (permLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!hasPermission("manufacturing.read")) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>{"🔒"}</Text>
        <Text style={styles.restrictedText}>Access Restricted</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrow-left" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Production Report</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Time filter chips */}
      <View style={styles.filterRow}>
        {(["this_month", "last_month", "all_time"] as TimeFilter[]).map(
          (f) => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, timeFilter === f && styles.chipActive]}
              onPress={() => setTimeFilter(f)}
            >
              <Text
                style={[
                  styles.chipText,
                  timeFilter === f && styles.chipTextActive,
                ]}
              >
                {TIME_FILTER_LABELS[f]}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading && !refreshing && (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 40 }}
          />
        )}

        {!loading && (
          <>
            {/* Summary Cards */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{totalRuns}</Text>
                <Text style={styles.summaryLabel}>Completed Runs</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {totalUnitsProduced.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })}
                </Text>
                <Text style={styles.summaryLabel}>Units Produced</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, { fontSize: 14 }]}>
                  {formatNaira(totalCostSpent)}
                </Text>
                <Text style={styles.summaryLabel}>Total Cost</Text>
              </View>
            </View>

            {orders.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>{"📊"}</Text>
                <Text style={styles.emptyTitle}>No completed runs</Text>
                <Text style={styles.emptySubtitle}>
                  Completed production runs will appear here once you finish and
                  close them.
                </Text>
              </View>
            )}

            {orders.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              const fgOutput = order.production_outputs?.find(
                (o: any) => o.output_type === "finished_good",
              );
              const otherOutputs =
                order.production_outputs?.filter(
                  (o: any) => o.output_type !== "finished_good",
                ) ?? [];
              const consumptions = order.production_material_consumption ?? [];
              const costs = order.production_costs ?? [];
              const totalOtherCosts = costs.reduce(
                (s: number, c: any) => s + (c.amount ?? 0),
                0,
              );

              return (
                <TouchableOpacity
                  key={order.id}
                  style={styles.orderCard}
                  onPress={() =>
                    setExpandedOrderId(isExpanded ? null : order.id)
                  }
                  activeOpacity={0.85}
                >
                  {/* Run header */}
                  <View style={styles.orderCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderProduct} numberOfLines={1}>
                        {order.bom?.product?.name ?? "—"}
                      </Text>
                      <Text style={styles.orderMeta}>
                        {order.order_number} · {order.location?.name} ·{" "}
                        {order.closed_at ? formatDate(order.closed_at) : "—"}
                      </Text>
                    </View>
                    <AntDesign
                      name={isExpanded ? "up" : "down"}
                      size={14}
                      color="#999"
                      style={{ marginLeft: 8 }}
                    />
                  </View>

                  {/* Always-visible quick stats */}
                  <View style={styles.quickStats}>
                    <View style={styles.quickStat}>
                      <Text style={styles.quickStatValue}>
                        {fgOutput?.quantity_produced ?? "—"}{" "}
                        {order.bom?.product?.unit}
                      </Text>
                      <Text style={styles.quickStatLabel}>Produced</Text>
                    </View>
                    <View style={styles.quickStat}>
                      <Text style={styles.quickStatValue}>
                        {fgOutput?.unit_cost != null
                          ? formatNaira(fgOutput.unit_cost)
                          : "—"}
                      </Text>
                      <Text style={styles.quickStatLabel}>Unit Cost</Text>
                    </View>
                    <View style={styles.quickStat}>
                      <Text style={styles.quickStatValue}>
                        {fgOutput?.total_cost != null
                          ? formatNaira(fgOutput.total_cost)
                          : "—"}
                      </Text>
                      <Text style={styles.quickStatLabel}>Total Cost</Text>
                    </View>
                  </View>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <View style={styles.expandedDetail}>
                      {/* Cost Breakdown */}
                      <Text style={styles.detailSectionLabel}>
                        COST BREAKDOWN
                      </Text>
                      <View style={styles.detailTable}>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailRowLabel}>
                            Raw Materials
                          </Text>
                          <Text style={styles.detailRowValue}>
                            {fgOutput?.raw_material_cost != null
                              ? formatNaira(fgOutput.raw_material_cost)
                              : "—"}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailRowLabel}>Other Costs</Text>
                          <Text style={styles.detailRowValue}>
                            {formatNaira(totalOtherCosts)}
                          </Text>
                        </View>
                        {costs.map((c: any) => (
                          <View key={c.id} style={styles.detailSubRow}>
                            <Text style={styles.detailSubRowLabel}>
                              {">"}{" "}
                              {c.cost_type.charAt(0).toUpperCase() +
                                c.cost_type.slice(1)}
                              {c.description ? ` — ${c.description}` : ""}
                            </Text>
                            <Text style={styles.detailSubRowValue}>
                              {formatNaira(c.amount)}
                            </Text>
                          </View>
                        ))}
                        <View style={[styles.detailRow, styles.detailRowTotal]}>
                          <Text style={styles.detailRowTotalLabel}>Total</Text>
                          <Text style={styles.detailRowTotalValue}>
                            {fgOutput?.total_cost != null
                              ? formatNaira(fgOutput.total_cost)
                              : "—"}
                          </Text>
                        </View>
                      </View>

                      {/* Variance — Raw Materials */}
                      {consumptions.length > 0 && (
                        <>
                          <Text style={styles.detailSectionLabel}>
                            MATERIAL USAGE — PLANNED VS ACTUAL
                          </Text>
                          <View style={styles.detailTable}>
                            <View style={styles.varianceHeaderRow}>
                              <Text style={[styles.varianceCell, { flex: 2 }]}>
                                Material
                              </Text>
                              <Text style={styles.varianceCell}>Planned</Text>
                              <Text style={styles.varianceCell}>Actual</Text>
                              <Text style={styles.varianceCell}>Diff</Text>
                            </View>
                            {consumptions.map((c: any) => {
                              const diff =
                                (c.actual_quantity ?? 0) -
                                (c.expected_quantity ?? 0);
                              const over = diff > 0;
                              const under = diff < 0;
                              return (
                                <View key={c.id} style={styles.varianceRow}>
                                  <Text
                                    style={[styles.varianceCell, { flex: 2 }]}
                                    numberOfLines={1}
                                  >
                                    {c.raw_material?.name ?? "—"}
                                  </Text>
                                  <Text style={styles.varianceCell}>
                                    {c.expected_quantity} {c.raw_material?.unit}
                                  </Text>
                                  <Text style={styles.varianceCell}>
                                    {c.actual_quantity} {c.raw_material?.unit}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.varianceCell,
                                      over && styles.varianceOver,
                                      under && styles.varianceUnder,
                                    ]}
                                  >
                                    {diff === 0
                                      ? "✓"
                                      : `${over ? "▲" : "▼"}${Math.abs(diff).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        </>
                      )}

                      {/* Outputs */}
                      {(fgOutput || otherOutputs.length > 0) && (
                        <>
                          <Text style={styles.detailSectionLabel}>OUTPUTS</Text>
                          <View style={styles.detailTable}>
                            {fgOutput && (
                              <View style={styles.detailRow}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.detailRowLabel}>
                                    {fgOutput.product?.name ?? "Finished Good"}
                                  </Text>
                                  <Text style={styles.outputTypeBadge}>
                                    Main Product
                                  </Text>
                                </View>
                                <Text style={styles.detailRowValue}>
                                  {fgOutput.quantity_produced}{" "}
                                  {fgOutput.product?.unit}
                                </Text>
                              </View>
                            )}
                            {otherOutputs.map((o: any) => (
                              <View key={o.id} style={styles.detailRow}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.detailRowLabel}>
                                    {o.product?.name ?? "—"}
                                  </Text>
                                  <Text style={styles.outputTypeBadge}>
                                    {OUTPUT_TYPE_LABELS[o.output_type] ??
                                      o.output_type}
                                  </Text>
                                </View>
                                <Text style={styles.detailRowValue}>
                                  {o.quantity_produced} {o.product?.unit}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Unit Cost Over Time */}
            {orders.length > 1 && (
              <>
                <Text style={styles.sectionHeading}>UNIT COST TREND</Text>
                <Text style={styles.sectionSubheading}>
                  Cost per finished good unit across runs (oldest to newest)
                </Text>
                <View style={styles.trendCard}>
                  {[...orders]
                    .filter((o) =>
                      o.production_outputs?.some(
                        (out: any) =>
                          out.output_type === "finished_good" &&
                          out.unit_cost != null,
                      ),
                    )
                    .reverse()
                    .map((order, index, arr) => {
                      const fg = order.production_outputs?.find(
                        (o: any) => o.output_type === "finished_good",
                      );
                      const prev = index > 0 ? arr[index - 1] : null;
                      const prevFg = prev?.production_outputs?.find(
                        (o: any) => o.output_type === "finished_good",
                      );
                      const unitCost = fg?.unit_cost ?? 0;
                      const prevUnitCost = prevFg?.unit_cost ?? null;
                      const direction =
                        prevUnitCost == null
                          ? null
                          : unitCost > prevUnitCost
                            ? "up"
                            : unitCost < prevUnitCost
                              ? "down"
                              : "flat";

                      return (
                        <View key={order.id} style={styles.trendRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.trendProduct} numberOfLines={1}>
                              {order.bom?.product?.name}
                            </Text>
                            <Text style={styles.trendDate}>
                              {order.closed_at
                                ? formatDate(order.closed_at)
                                : "—"}{" "}
                              · {order.order_number}
                            </Text>
                          </View>
                          <View style={styles.trendRight}>
                            <Text style={styles.trendUnitCost}>
                              {formatNaira(unitCost)}
                            </Text>
                            {direction === "up" && (
                              <Text style={styles.trendUp}>
                                ▲ more expensive
                              </Text>
                            )}
                            {direction === "down" && (
                              <Text style={styles.trendDown}>▼ cheaper</Text>
                            )}
                            {direction === "flat" && (
                              <Text style={styles.trendFlat}>— same</Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                </View>
              </>
            )}
          </>
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
  title: { fontSize: 20, fontWeight: "700", color: "#333" },
  filterRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f9f9f9",
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: { fontSize: 13, fontWeight: "600", color: "#555" },
  chipTextActive: { color: "#fff" },
  scroll: { flex: 1 },

  // Summary cards
  summaryRow: {
    flexDirection: "row",
    padding: 16,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#8E8E93",
    fontWeight: "600",
    textAlign: "center",
  },

  // Order card
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  orderCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  orderProduct: { fontSize: 15, fontWeight: "700", color: "#333" },
  orderMeta: { fontSize: 12, color: "#8E8E93", marginTop: 2 },
  quickStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  quickStat: { alignItems: "center", flex: 1 },
  quickStatValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    marginBottom: 2,
  },
  quickStatLabel: { fontSize: 10, color: "#8E8E93", fontWeight: "600" },

  // Expanded detail
  expandedDetail: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 12,
  },
  detailSectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#8E8E93",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 12,
  },
  detailTable: {
    backgroundColor: "#fafafa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  detailRowLabel: { fontSize: 13, color: "#444", flex: 1 },
  detailRowValue: { fontSize: 13, fontWeight: "600", color: "#333" },
  detailSubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    backgroundColor: "#f5f5f5",
  },
  detailSubRowLabel: { fontSize: 12, color: "#777", flex: 1 },
  detailSubRowValue: { fontSize: 12, color: "#555", fontWeight: "600" },
  detailRowTotal: { backgroundColor: "#f0f8ff" },
  detailRowTotalLabel: { fontSize: 13, fontWeight: "700", color: "#2b6cb0" },
  detailRowTotalValue: { fontSize: 13, fontWeight: "700", color: "#2b6cb0" },

  // Variance table
  varianceHeaderRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#f0f0f0",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  varianceRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  varianceCell: {
    flex: 1,
    fontSize: 12,
    color: "#444",
    fontWeight: "500",
  },
  varianceOver: { color: "#c0392b", fontWeight: "700" },
  varianceUnder: { color: "#27ae60", fontWeight: "700" },

  // Outputs
  outputTypeBadge: {
    fontSize: 10,
    color: "#8E8E93",
    marginTop: 2,
    fontWeight: "600",
  },

  // Unit cost trend
  sectionHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8E8E93",
    letterSpacing: 0.8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionSubheading: {
    fontSize: 12,
    color: "#aaa",
    marginHorizontal: 16,
    marginBottom: 10,
  },
  trendCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    overflow: "hidden",
  },
  trendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  trendProduct: { fontSize: 13, fontWeight: "600", color: "#333" },
  trendDate: { fontSize: 11, color: "#8E8E93", marginTop: 2 },
  trendRight: { alignItems: "flex-end" },
  trendUnitCost: { fontSize: 14, fontWeight: "700", color: COLORS.primary },
  trendUp: { fontSize: 11, color: "#c0392b", fontWeight: "600", marginTop: 2 },
  trendDown: {
    fontSize: 11,
    color: "#27ae60",
    fontWeight: "600",
    marginTop: 2,
  },
  trendFlat: {
    fontSize: 11,
    color: "#8E8E93",
    fontWeight: "600",
    marginTop: 2,
  },

  emptyState: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  restrictedText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 16,
  },
  backLink: { fontSize: 15, color: COLORS.primary, fontWeight: "600" },
});
