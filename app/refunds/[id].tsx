// FILE: app/refunds/[id].tsx
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import * as Print from "expo-print";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import FloatingReceiptShare from "../../components/Floatingreceiptshare";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import { InvoiceData, InvoiceGenerator } from "../../lib/invoices/core";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface Refund {
  id: string;
  original_sale_id: string;
  refund_amount: number;
  refund_type: "full" | "partial";
  reason: string | null;
  payment_method: "cash" | "bank" | "pos" | "mobile";
  created_at: string;
  location: { name: string };
  processed_by_user: { full_name: string } | null;
  original_sale: { receipt_number: string; total_amount: number };
  refund_items: {
    id: string;
    quantity_refunded: number;
    amount_refunded: number;
    restock: boolean;
    products: { name: string; unit: string };
  }[];
}

export default function RefundDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const refundId = params.id as string;
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const orgRef = useRef<{
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  }>({ name: "Your Business" });

  const [refund, setRefund] = useState<Refund | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReceiptShare, setShowReceiptShare] = useState(false);
  const { hasPermission, loading: permLoading } = usePermissions();

  useEffect(() => {
    if (refundId) fetchRefund();
  }, [refundId]);

  useEffect(() => {
    async function loadOrgDetails() {
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

        const { data: orgFull } = await supabase
          .from("organizations")
          .select("name, phone, email, address")
          .eq("id", organizationId)
          .single();

        if (orgFull?.name) {
          orgRef.current = {
            name: orgFull.name,
            phone: orgFull.phone ?? undefined,
            email: orgFull.email ?? undefined,
            address: orgFull.address ?? undefined,
          };
        }
      } catch (err) {
        console.error("Failed to load org details:", err);
      }
    }
    loadOrgDetails();
  }, [organizationId]);

  async function fetchRefund() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("refunds")
        .select(
          `
          *,
          location:locations!location_id (name),
          processed_by_user:user_profiles!processed_by (full_name),
          original_sale:sales!original_sale_id (receipt_number, total_amount),
          refund_items (
            *,
            products (name, unit)
          )
        `,
        )
        .eq("id", refundId)
        .single();

      if (error) throw error;
      setRefund(data);
    } catch (err: any) {
      console.error("Error fetching refund:", err);
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Receipt pipeline ────────────────────────────────────────────────────────

  async function getRefundReceiptData(): Promise<{
    invoiceData: InvoiceData;
    org: { name: string; phone?: string; email?: string; address?: string };
  } | null> {
    if (!refund || !organizationId) return null;

    const items = refund.refund_items.map((item) => ({
      productName: item.products.name,
      quantity: item.quantity_refunded,
      unit: item.products.unit,
      unitPrice: item.amount_refunded / item.quantity_refunded,
      total: item.amount_refunded,
      description: item.restock ? "Restocked to inventory" : undefined,
    }));

    const notesLines = [
      `Original Sale: ${refund.original_sale.receipt_number}`,
      `Refund Type: ${refund.refund_type === "full" ? "Full Refund" : "Partial Refund"}`,
      `Processed By: ${refund.processed_by_user?.full_name ?? "Unknown"}`,
    ];
    if (refund.reason) notesLines.push(`Reason: ${refund.reason}`);

    const invoiceData: InvoiceData = {
      type: "expense_receipt",
      number: `REF-${refund.id.substring(0, 8).toUpperCase()}`,
      date: new Date(refund.created_at),
      organizationId,

      location: { id: "", name: refund.location.name },

      items,

      subtotal: refund.refund_amount,
      totalAmount: refund.refund_amount,
      amountPaid: refund.refund_amount,
      paymentMethod: refund.payment_method,
      notes: notesLines.join(" | "),
    };

    return { invoiceData, org: orgRef.current };
  }

  async function generateRefundPDF(): Promise<string | null> {
    if (!refund || !organizationId) return null;
    try {
      const result = await getRefundReceiptData();
      if (!result) return null;
      const generator = new InvoiceGenerator(organizationId);
      await generator.initialize();
      const html = generator.buildHTML(result.invoiceData);
      const { uri } = await Print.printToFileAsync({
        html,
        width: 595,
        height: 842,
      });
      return uri;
    } catch (err) {
      console.error("generateRefundPDF failed:", err);
      return null;
    }
  }

  // ── Guards ──────────────────────────────────────────────────────────────────

  if (permLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!hasPermission("refunds.read")) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Refund</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.errorState}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔐</Text>
          <Text style={styles.errorText}>Access Restricted</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!refund) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Refund</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Refund not found</Text>
        </View>
      </View>
    );
  }

  const receiptNumber = `REF-${refund.id.substring(0, 8).toUpperCase()}`;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Refund Details</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Refund Info */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.refundDate}>
                {new Date(refund.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
              <Text style={styles.refundTime}>
                {new Date(refund.created_at).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
            <View style={styles.amountBadge}>
              <Text style={styles.amountBadgeText}>
                {currency.symbol}
                {refund.refund_amount.toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type</Text>
              <View
                style={[
                  styles.typeBadge,
                  refund.refund_type === "full"
                    ? styles.typeFull
                    : styles.typePartial,
                ]}
              >
                <Text style={styles.typeText}>
                  {refund.refund_type === "full"
                    ? "FULL REFUND"
                    : "PARTIAL REFUND"}
                </Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Original Sale</Text>
              <TouchableOpacity
                onPress={() =>
                  router.push(`/sales/${refund.original_sale_id}` as any)
                }
              >
                <Text style={styles.linkText}>
                  {refund.original_sale.receipt_number}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Original Amount</Text>
              <Text style={styles.infoValue}>
                {currency.symbol}
                {refund.original_sale.total_amount.toFixed(2)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Payment Method</Text>
              <Text style={styles.infoValue}>
                {refund.payment_method.toUpperCase()}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue}>📍 {refund.location.name}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Processed By</Text>
              <Text style={styles.infoValue}>
                {refund.processed_by_user?.full_name || "Unknown"}
              </Text>
            </View>
          </View>

          {refund.reason && (
            <View style={styles.reasonSection}>
              <Text style={styles.reasonLabel}>Reason</Text>
              <Text style={styles.reasonText}>{refund.reason}</Text>
            </View>
          )}
        </View>

        {/* Refunded Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Refunded Items ({refund.refund_items.length})
          </Text>
          {refund.refund_items.map((item, index) => (
            <View key={`item-${item.id}-${index}`} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.products.name}</Text>
                  <Text style={styles.itemQty}>
                    {item.quantity_refunded} {item.products.unit}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.itemAmount}>
                    {currency.symbol}
                    {item.amount_refunded.toFixed(2)}
                  </Text>
                  {item.restock && (
                    <View style={styles.restockBadge}>
                      <Text style={styles.restockText}>✓ Restocked</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Refund Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Items Refunded</Text>
            <Text style={styles.summaryValue}>
              {refund.refund_items.reduce((s, i) => s + i.quantity_refunded, 0)}{" "}
              units
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Items Restocked</Text>
            <Text style={styles.summaryValue}>
              {refund.refund_items
                .filter((i) => i.restock)
                .reduce((s, i) => s + i.quantity_refunded, 0)}{" "}
              units
            </Text>
          </View>

          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryTotalLabel}>Total Refunded</Text>
            <Text style={styles.summaryTotalValue}>
              {currency.symbol}
              {refund.refund_amount.toFixed(2)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Refund Method</Text>
            <Text style={styles.summaryValue}>
              {refund.payment_method.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Actions</Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowReceiptShare(true)}
          >
            <Text style={styles.actionIcon}>📄</Text>
            <Text style={styles.actionText}>Share Refund Receipt</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              router.push(`/sales/${refund.original_sale_id}` as any)
            }
          >
            <Text style={styles.actionIcon}>🧾</Text>
            <Text style={styles.actionText}>View Original Sale</Text>
          </TouchableOpacity>

          {hasPermission("refunds.create") && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push("/refunds/new")}
            >
              <Text style={styles.actionIcon}>↩️</Text>
              <Text style={styles.actionText}>Process Another Refund</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Floating Receipt Share */}
      <FloatingReceiptShare
        visible={showReceiptShare}
        onDismiss={() => setShowReceiptShare(false)}
        receiptNumber={receiptNumber}
        onGetReceiptData={getRefundReceiptData}
        onGeneratePDF={generateRefundPDF}
        totalAmount={refund.refund_amount}
        receiptType="sale"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { justifyContent: "center", alignItems: "center", flex: 1 },
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

  card: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  refundDate: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  refundTime: { fontSize: 14, color: COLORS.secondary, marginTop: 4 },
  amountBadge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.warning,
  },
  amountBadgeText: { fontSize: 18, fontWeight: "bold", color: COLORS.warning },

  infoSection: { marginBottom: 16 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  infoLabel: { fontSize: 14, color: COLORS.secondary },
  infoValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.accent,
    textDecorationLine: "underline",
  },

  typeBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  typeFull: { backgroundColor: "#fee2e2" },
  typePartial: { backgroundColor: "#fef3c7" },
  typeText: { fontSize: 11, fontWeight: "700", color: COLORS.primary },

  reasonSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  reasonLabel: { fontSize: 12, color: COLORS.secondary, marginBottom: 8 },
  reasonText: { fontSize: 14, color: COLORS.primary, lineHeight: 20 },

  section: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },

  itemCard: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  itemHeader: { flexDirection: "row", justifyContent: "space-between" },
  itemName: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  itemQty: { fontSize: 13, color: COLORS.secondary, marginTop: 4 },
  itemAmount: { fontSize: 15, fontWeight: "bold", color: COLORS.warning },
  restockBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  restockText: { fontSize: 10, fontWeight: "600", color: COLORS.white },

  summaryCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.warning,
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
  summaryLabel: { fontSize: 14, color: COLORS.secondary },
  summaryValue: { fontSize: 14, fontWeight: "500", color: COLORS.primary },
  summaryTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  summaryTotalLabel: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.warning,
  },

  actionsCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    marginBottom: 8,
  },
  actionIcon: { fontSize: 20, marginRight: 12 },
  actionText: { fontSize: 14, fontWeight: "500", color: COLORS.primary },

  errorState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 48,
  },
  errorText: { fontSize: 18, color: COLORS.secondary },
});
