// FILE: app/sales-orders/aging.tsx
import { getOrganization } from "@/onboarding/services/organizationService";
import {
    ALL_CURRENCIES,
    getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { File, Paths } from "expo-file-system/next";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgingInvoice {
  id: string;
  invoice_number: string;
  due_date: string;
  total_amount: number;
  amount_outstanding: number;
  days_overdue: number; // negative = not yet due
  sales_order_number: string;
}

interface CustomerAgingRow {
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  current: number; // not yet due
  bucket_1_30: number; // 1–30 days overdue
  bucket_31_60: number; // 31–60
  bucket_61_90: number; // 61–90
  bucket_90plus: number; // 90+
  total: number;
  invoices: AgingInvoice[];
  expanded: boolean;
}

type FilterMode = "all" | "overdue";

// ─── Bucket helpers ───────────────────────────────────────────────────────────

function bucketForDays(
  days: number,
): keyof Omit<
  CustomerAgingRow,
  | "customer_id"
  | "customer_name"
  | "customer_phone"
  | "total"
  | "invoices"
  | "expanded"
> {
  if (days <= 0) return "current";
  if (days <= 30) return "bucket_1_30";
  if (days <= 60) return "bucket_31_60";
  if (days <= 90) return "bucket_61_90";
  return "bucket_90plus";
}

const BUCKET_LABELS = ["Current", "1–30d", "31–60d", "61–90d", "90+d"];
const BUCKET_KEYS: (keyof CustomerAgingRow)[] = [
  "current",
  "bucket_1_30",
  "bucket_31_60",
  "bucket_61_90",
  "bucket_90plus",
];
const BUCKET_COLORS = ["#15803d", "#f59e0b", "#ea580c", "#dc2626", "#7f1d1d"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ARAgingReportScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission } = usePermissions();

  const [rows, setRows] = useState<CustomerAgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [asOfDate] = useState(new Date());
  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });
  const [orgName, setOrgName] = useState("Your Business");

  useEffect(() => {
    loadCurrency();
    fetchData();
  }, [organizationId]);

  // ── Currency / org ─────────────────────────────────────────────────────────

  async function loadCurrency() {
    if (!organizationId) return;
    try {
      const org = await getOrganization(organizationId);
      if (org.name) setOrgName(org.name);
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

  // ── Fetch ──────────────────────────────────────────────────────────────────

  async function fetchData() {
    if (!organizationId) return;
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("invoices")
        .select(
          `
          id,
          invoice_number,
          due_date,
          total_amount,
          amount_outstanding,
          status,
          customer:customers ( id, name, phone ),
          sales_order:sales_orders ( order_number )
        `,
        )
        .eq("organization_id", organizationId)
        .not("status", "eq", "paid")
        .order("due_date", { ascending: true });

      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Group by customer
      const map = new Map<string, CustomerAgingRow>();

      for (const inv of data ?? []) {
        const customer = Array.isArray(inv.customer)
          ? inv.customer[0]
          : inv.customer;
        const salesOrder = Array.isArray(inv.sales_order)
          ? inv.sales_order[0]
          : inv.sales_order;
        if (!customer) continue;

        const dueDate = new Date(inv.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - dueDate.getTime();
        const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        const agingInvoice: AgingInvoice = {
          id: inv.id,
          invoice_number: inv.invoice_number,
          due_date: inv.due_date,
          total_amount: inv.total_amount,
          amount_outstanding: inv.amount_outstanding,
          days_overdue: daysOverdue,
          sales_order_number: salesOrder?.order_number ?? "—",
        };

        if (!map.has(customer.id)) {
          map.set(customer.id, {
            customer_id: customer.id,
            customer_name: customer.name,
            customer_phone: customer.phone ?? null,
            current: 0,
            bucket_1_30: 0,
            bucket_31_60: 0,
            bucket_61_90: 0,
            bucket_90plus: 0,
            total: 0,
            invoices: [],
            expanded: false,
          });
        }

        const row = map.get(customer.id)!;
        const bucket = bucketForDays(daysOverdue);
        (row as any)[bucket] += inv.amount_outstanding;
        row.total += inv.amount_outstanding;
        row.invoices.push(agingInvoice);
      }

      setRows(Array.from(map.values()).sort((a, b) => b.total - a.total));
    } catch (err) {
      console.error("AR aging fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchData();
  }

  // ── Toggle expand ──────────────────────────────────────────────────────────

  function toggleExpand(customerId: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.customer_id === customerId ? { ...r, expanded: !r.expanded } : r,
      ),
    );
  }

  // ── Grand totals ───────────────────────────────────────────────────────────

  const visibleRows =
    filter === "overdue"
      ? rows.filter(
          (r) =>
            r.bucket_1_30 + r.bucket_31_60 + r.bucket_61_90 + r.bucket_90plus >
            0,
        )
      : rows;

  const grandTotals = {
    current: visibleRows.reduce((s, r) => s + r.current, 0),
    bucket_1_30: visibleRows.reduce((s, r) => s + r.bucket_1_30, 0),
    bucket_31_60: visibleRows.reduce((s, r) => s + r.bucket_31_60, 0),
    bucket_61_90: visibleRows.reduce((s, r) => s + r.bucket_61_90, 0),
    bucket_90plus: visibleRows.reduce((s, r) => s + r.bucket_90plus, 0),
    total: visibleRows.reduce((s, r) => s + r.total, 0),
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    try {
      const asOf = asOfDate.toLocaleDateString("en-NG", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const lines: string[] = [
        `AR Aging Report — ${orgName}`,
        `As of ${asOf}`,
        `Currency: ${currency.code}`,
        ``,
        `Customer,Phone,Current,1-30 Days,31-60 Days,61-90 Days,90+ Days,Total Outstanding`,
      ];

      for (const row of visibleRows) {
        lines.push(
          [
            `"${row.customer_name}"`,
            row.customer_phone ?? "",
            row.current.toFixed(2),
            row.bucket_1_30.toFixed(2),
            row.bucket_31_60.toFixed(2),
            row.bucket_61_90.toFixed(2),
            row.bucket_90plus.toFixed(2),
            row.total.toFixed(2),
          ].join(","),
        );

        // Invoice detail rows indented under each customer
        for (const inv of row.invoices) {
          const overdueTxt =
            inv.days_overdue > 0
              ? `${inv.days_overdue} days overdue`
              : inv.days_overdue === 0
                ? "Due today"
                : `Due in ${Math.abs(inv.days_overdue)} days`;
          lines.push(
            [
              `"  ${inv.invoice_number}"`,
              `"Order: ${inv.sales_order_number}"`,
              `"Due: ${new Date(inv.due_date).toLocaleDateString("en-NG")}"`,
              `"${overdueTxt}"`,
              ``,
              ``,
              ``,
              inv.amount_outstanding.toFixed(2),
            ].join(","),
          );
        }
      }

      // Grand total row
      lines.push(
        [
          `"TOTAL"`,
          `""`,
          grandTotals.current.toFixed(2),
          grandTotals.bucket_1_30.toFixed(2),
          grandTotals.bucket_31_60.toFixed(2),
          grandTotals.bucket_61_90.toFixed(2),
          grandTotals.bucket_90plus.toFixed(2),
          grandTotals.total.toFixed(2),
        ].join(","),
      );

      const dateStr = asOfDate.toISOString().slice(0, 10);
      const filename = `AR_Aging_${dateStr}.csv`;
      const file = new File(Paths.cache, filename);
      file.write(lines.join("\n"));

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/csv",
          dialogTitle: `AR Aging Report — ${asOf}`,
          UTI: "public.comma-separated-values-text",
        });
      }
    } catch (err: any) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  }

  // ── Format helpers ─────────────────────────────────────────────────────────

  function fmt(n: number) {
    if (n === 0) return "—";
    return (
      currency.symbol +
      n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function fmtFull(n: number) {
    return (
      currency.symbol +
      n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function overdueLabel(days: number) {
    if (days < 0) return `Due in ${Math.abs(days)}d`;
    if (days === 0) return "Due today";
    return `${days}d overdue`;
  }

  function overdueColor(days: number) {
    if (days <= 0) return BUCKET_COLORS[0];
    if (days <= 30) return BUCKET_COLORS[1];
    if (days <= 60) return BUCKET_COLORS[2];
    if (days <= 90) return BUCKET_COLORS[3];
    return BUCKET_COLORS[4];
  }

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!hasPermission("invoices.read")) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center", padding: 32 },
        ]}
      >
        <Text style={styles.permText}>
          You do not have permission to view this report.
        </Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const asOfLabel = asOfDate.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>{"<"} Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>AR Aging</Text>
          <Text style={styles.asOf}>As of {asOfLabel}</Text>
        </View>
        <TouchableOpacity
          style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
          onPress={handleExport}
          disabled={exporting || loading}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.exportBtnText}>Export</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {(["all", "overdue"] as FilterMode[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === f && styles.filterChipTextActive,
              ]}
            >
              {f === "all" ? "All Receivables" : "Overdue Only"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && rows.length === 0 ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* ── Grand total summary cards ── */}
          <View style={styles.summaryGrid}>
            {BUCKET_KEYS.map((key, i) => {
              const val = grandTotals[
                key as keyof typeof grandTotals
              ] as number;
              return (
                <View
                  key={key}
                  style={[
                    styles.summaryCard,
                    { borderTopColor: BUCKET_COLORS[i] },
                  ]}
                >
                  <Text
                    style={[
                      styles.summaryCardLabel,
                      { color: BUCKET_COLORS[i] },
                    ]}
                  >
                    {BUCKET_LABELS[i]}
                  </Text>
                  <Text
                    style={styles.summaryCardValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {val > 0 ? fmtFull(val) : "—"}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Total outstanding pill */}
          <View style={styles.totalPill}>
            <Text style={styles.totalPillLabel}>Total Outstanding</Text>
            <Text style={styles.totalPillValue}>
              {fmtFull(grandTotals.total)}
            </Text>
            <Text style={styles.totalPillCount}>
              {visibleRows.length} customer{visibleRows.length !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* ── Bucket header row ── */}
          {visibleRows.length > 0 && (
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>
                Customer
              </Text>
              {BUCKET_LABELS.map((label, i) => (
                <Text
                  key={label}
                  style={[styles.tableHeaderCell, { color: BUCKET_COLORS[i] }]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              ))}
              <Text style={[styles.tableHeaderCell, styles.tableHeaderTotal]}>
                Total
              </Text>
            </View>
          )}

          {/* ── Customer rows ── */}
          {visibleRows.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>✓</Text>
              <Text style={styles.emptyTitle}>
                {filter === "overdue"
                  ? "No overdue invoices"
                  : "No outstanding invoices"}
              </Text>
              <Text style={styles.emptyText}>All receivables are current.</Text>
            </View>
          ) : (
            visibleRows.map((row) => (
              <View key={row.customer_id}>
                {/* Customer summary row */}
                <TouchableOpacity
                  style={styles.customerRow}
                  onPress={() => toggleExpand(row.customer_id)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 2 }}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {row.customer_name}
                    </Text>
                    {row.customer_phone && (
                      <Text style={styles.customerPhone}>
                        {row.customer_phone}
                      </Text>
                    )}
                  </View>
                  {BUCKET_KEYS.map((key, i) => {
                    const val = (row as any)[key] as number;
                    return (
                      <Text
                        key={key}
                        style={[
                          styles.bucketCell,
                          val > 0 && {
                            color: BUCKET_COLORS[i],
                            fontWeight: "700",
                          },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {val > 0 ? fmt(val) : "—"}
                      </Text>
                    );
                  })}
                  <Text
                    style={styles.totalCell}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {fmtFull(row.total)}
                  </Text>
                </TouchableOpacity>

                {/* Expanded invoice detail */}
                {row.expanded && (
                  <View style={styles.invoiceDetail}>
                    {row.invoices
                      .sort((a, b) => b.days_overdue - a.days_overdue)
                      .map((inv) => (
                        <View key={inv.id} style={styles.invoiceDetailRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.invoiceNumber}>
                              {inv.invoice_number}
                            </Text>
                            <Text style={styles.invoiceOrderRef}>
                              Order: {inv.sales_order_number}
                            </Text>
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={styles.invoiceOutstanding}>
                              {fmtFull(inv.amount_outstanding)}
                            </Text>
                            <View
                              style={[
                                styles.overduePill,
                                {
                                  backgroundColor:
                                    overdueColor(inv.days_overdue) + "20",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.overduePillText,
                                  { color: overdueColor(inv.days_overdue) },
                                ]}
                              >
                                {overdueLabel(inv.days_overdue)}
                              </Text>
                            </View>
                            <Text style={styles.invoiceDueDate}>
                              Due{" "}
                              {new Date(inv.due_date).toLocaleDateString(
                                "en-NG",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                },
                              )}
                            </Text>
                          </View>
                        </View>
                      ))}

                    <TouchableOpacity
                      style={styles.viewOrdersLink}
                      onPress={() =>
                        router.push({
                          pathname: "/customers/[id]" as any,
                          params: { id: row.customer_id },
                        })
                      }
                    >
                      <Text style={styles.viewOrdersLinkText}>
                        View customer profile →
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}

          {/* Grand total footer row */}
          {visibleRows.length > 0 && (
            <View style={styles.grandTotalRow}>
              <Text style={[styles.grandTotalLabel, { flex: 2 }]}>TOTAL</Text>
              {BUCKET_KEYS.map((key, i) => {
                const val = grandTotals[
                  key as keyof typeof grandTotals
                ] as number;
                return (
                  <Text
                    key={key}
                    style={[
                      styles.grandTotalCell,
                      val > 0 && { color: BUCKET_COLORS[i] },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {val > 0 ? fmt(val) : "—"}
                  </Text>
                );
              })}
              <Text
                style={[styles.grandTotalCell, styles.grandTotalFinal]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {fmtFull(grandTotals.total)}
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  permText: { fontSize: 15, color: COLORS.secondary, textAlign: "center" },

  // Header
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
  headerCenter: { alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700", color: COLORS.primary },
  asOf: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  exportBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
    alignItems: "center",
  },
  exportBtnText: { color: COLORS.white, fontSize: 13, fontWeight: "700" },

  // Filter
  filterRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: { fontSize: 13, fontWeight: "600", color: COLORS.secondary },
  filterChipTextActive: { color: COLORS.white },

  scroll: { flex: 1 },

  // Summary grid
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 16,
    paddingBottom: 8,
  },
  summaryCard: {
    flex: 1,
    minWidth: "28%",
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    borderTopWidth: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  summaryCardLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  summaryCardValue: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
    textAlign: "center",
  },

  // Total pill
  totalPill: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalPillLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "600",
  },
  totalPillValue: { fontSize: 18, fontWeight: "700", color: COLORS.white },
  totalPillCount: { fontSize: 12, color: "rgba(255,255,255,0.6)" },

  // Table header
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.secondary,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableHeaderTotal: {
    color: COLORS.primary,
  },

  // Customer rows
  customerRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: "center",
  },
  customerName: { fontSize: 13, fontWeight: "700", color: COLORS.primary },
  customerPhone: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },
  bucketCell: {
    flex: 1,
    fontSize: 11,
    color: COLORS.secondary,
    textAlign: "center",
  },
  totalCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
    textAlign: "center",
  },

  // Invoice detail (expanded)
  invoiceDetail: {
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  invoiceDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  invoiceNumber: { fontSize: 13, fontWeight: "700", color: COLORS.primary },
  invoiceOrderRef: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },
  invoiceOutstanding: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 4,
  },
  overduePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
    alignSelf: "flex-end",
  },
  overduePillText: { fontSize: 11, fontWeight: "700" },
  invoiceDueDate: { fontSize: 11, color: COLORS.secondary },
  viewOrdersLink: { paddingVertical: 10, alignItems: "center" },
  viewOrdersLinkText: { fontSize: 13, color: COLORS.accent, fontWeight: "600" },

  // Grand total footer
  grandTotalRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  grandTotalLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.white,
    letterSpacing: 0.6,
  },
  grandTotalCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
  },
  grandTotalFinal: {
    color: COLORS.white,
    fontSize: 12,
  },

  // Empty
  emptyState: {
    alignItems: "center",
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16, color: "#15803d" },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 8,
  },
  emptyText: { fontSize: 14, color: COLORS.secondary, textAlign: "center" },
});
