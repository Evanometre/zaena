// FILE: app/purchases/[id].tsx
import { queueOperation } from "@/lib/localDb";
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import FloatingReceiptShare from "../../components/Floatingreceiptshare";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import { InvoiceData, InvoiceGenerator } from "../../lib/invoices/core";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

type PaymentStatus = "unpaid" | "partial" | "paid";

interface PurchasePayment {
  id: string;
  amount: number;
  notes: string | null;
  created_at: string;
}

interface Purchase {
  id: string;
  total_cost: number;
  total_items: number;
  total_units: number;
  acquisition_costs: number;
  notes: string;
  created_at: string;
  payment_status: PaymentStatus;
  amount_paid: number;
  suppliers: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  } | null;
  locations: {
    id: string;
    name: string;
    address?: string;
  };
  purchase_items: {
    id: string;
    quantity: number;
    unit_cost: number;
    total_cost: number;
    products: {
      name: string;
      unit: string;
    };
  }[];
}

const STATUS_CONFIG: Record<
  PaymentStatus,
  { label: string; color: string; bg: string }
> = {
  unpaid: { label: "Unpaid", color: "#DC2626", bg: "#FEE2E2" },
  partial: { label: "Partial", color: "#D97706", bg: "#FEF3C7" },
  paid: { label: "Paid", color: "#16A34A", bg: "#DCFCE7" },
};

export default function PurchaseDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const purchaseId = params.id as string;
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [payments, setPayments] = useState<PurchasePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReceiptShare, setShowReceiptShare] = useState(false);
  const { hasPermission, loading: permLoading } = usePermissions();

  // Payment modal state
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Keep a ref to org details for receipt generation — populated when currency loads
  const orgRef = useRef<{
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  }>({
    name: "Your Business",
  });

  useEffect(() => {
    if (purchaseId) {
      fetchPurchase();
      fetchPayments();
    }
  }, [purchaseId]);

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

  async function fetchPurchase() {
    setLoading(true);
    try {
      const cacheKey = `purchase_detail_${purchaseId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setPurchase(JSON.parse(cached));
        setLoading(false);
      }

      const { data, error } = await supabase
        .from("purchases")
        .select(
          `
        *,
        suppliers (id, name, email, phone),
        locations (id, name, address),
        purchase_items (*, products (name, unit))
      `,
        )
        .eq("id", purchaseId)
        .single();

      if (error) throw error;
      setPurchase(data);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (err: any) {
      if (!purchase) Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPayments() {
    try {
      const cacheKey = `purchase_payments_${purchaseId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) setPayments(JSON.parse(cached));

      const { data, error } = await supabase
        .from("purchase_payments")
        .select("*")
        .eq("purchase_id", purchaseId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPayments(data || []);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data || []));
    } catch (err: any) {
      console.error("Error fetching payments:", err);
    }
  }

  async function handleRecordPayment() {
    if (!purchase) return;

    const amount = parseFloat(paymentAmount);
    const balance = purchase.total_cost - purchase.amount_paid;

    if (!paymentAmount || isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount.");
      return;
    }
    if (amount > balance) {
      Alert.alert(
        "Amount Too High",
        `Payment cannot exceed the balance of ${currency.symbol}${balance.toLocaleString()}.`,
      );
      return;
    }

    setSubmittingPayment(true);
    try {
      await queueOperation({
        module: "purchases",
        operation: "record_purchase_payment",
        payload: {
          purchaseId,
          amount,
          notes: paymentNotes.trim() || null,
        },
      });

      // Optimistically update local state and caches
      const newPayment: PurchasePayment = {
        id: `pending_${Date.now()}`,
        amount,
        notes: paymentNotes.trim() || null,
        created_at: new Date().toISOString(),
      };
      const updatedPayments = [newPayment, ...payments];
      setPayments(updatedPayments);
      await AsyncStorage.setItem(
        `purchase_payments_${purchaseId}`,
        JSON.stringify(updatedPayments),
      );

      // Update purchase amount_paid and status optimistically
      const newAmountPaid = purchase.amount_paid + amount;
      const newStatus: PaymentStatus =
        newAmountPaid >= purchase.total_cost
          ? "paid"
          : newAmountPaid > 0
            ? "partial"
            : "unpaid";

      const updatedPurchase = {
        ...purchase,
        amount_paid: newAmountPaid,
        payment_status: newStatus,
      };
      setPurchase(updatedPurchase);
      await AsyncStorage.setItem(
        `purchase_detail_${purchaseId}`,
        JSON.stringify(updatedPurchase),
      );

      // Invalidate list cache so index reflects new status
      await AsyncStorage.removeItem(`purchases_${organizationId}`);

      setPaymentModalVisible(false);
      setPaymentAmount("");
      setPaymentNotes("");

      Alert.alert(
        "Payment Queued ✓",
        `${currency.symbol}${amount.toLocaleString()} recorded and will sync automatically.`,
      );
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to record payment.");
    } finally {
      setSubmittingPayment(false);
    }
  }

  // ── Receipt pipeline ────────────────────────────────────────────────────────

  async function getPurchaseReceiptData(): Promise<{
    invoiceData: InvoiceData;
    org: { name: string; phone?: string; email?: string; address?: string };
  } | null> {
    if (!purchase) return null;

    const invoiceData: InvoiceData = {
      type: "purchase_order",
      number: `PO-${purchase.id.substring(0, 8).toUpperCase()}`,
      date: new Date(purchase.created_at),
      organizationId: organizationId!,

      // Supplier maps to "customer" slot in the shared InvoiceData type
      customer: purchase.suppliers
        ? {
            id: purchase.suppliers.id,
            name: purchase.suppliers.name,
            email: purchase.suppliers.email,
            phone: purchase.suppliers.phone,
          }
        : undefined,

      location: {
        id: purchase.locations.id,
        name: purchase.locations.name,
        address: purchase.locations.address,
      },

      items: purchase.purchase_items.map((item) => ({
        productName: item.products.name,
        quantity: item.quantity,
        unit: item.products.unit,
        unitPrice: item.unit_cost,
        total: item.total_cost,
      })),

      subtotal: purchase.total_cost - (purchase.acquisition_costs || 0),
      totalAmount: purchase.total_cost,

      amountPaid: purchase.amount_paid,
      balance:
        purchase.total_cost - purchase.amount_paid > 0
          ? purchase.total_cost - purchase.amount_paid
          : undefined,

      notes: purchase.notes || undefined,
    };

    return { invoiceData, org: orgRef.current };
  }

  async function generatePurchasePDF(): Promise<string | null> {
    if (!purchase || !organizationId) return null;
    try {
      const result = await getPurchaseReceiptData();
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
      console.error("generatePurchasePDF failed:", err);
      return null;
    }
  }

  // ── Guards ──────────────────────────────────────────────────────────────────

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

  if (!hasPermission("purchases.read")) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Purchase</Text>
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

  if (!purchase) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Purchase</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Purchase not found</Text>
        </View>
      </View>
    );
  }

  const baseCost = purchase.total_cost - (purchase.acquisition_costs || 0);
  const balance = purchase.total_cost - purchase.amount_paid;
  const statusConfig = STATUS_CONFIG[purchase.payment_status];
  const isPaid = purchase.payment_status === "paid";
  const poNumber = `PO-${purchase.id.substring(0, 8).toUpperCase()}`;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Purchase Details</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Payment Status Card */}
        <View
          style={[
            styles.paymentStatusCard,
            { borderColor: statusConfig.color },
          ]}
        >
          <View style={styles.paymentStatusHeader}>
            <Text style={styles.paymentStatusTitle}>Payment Status</Text>
            <View
              style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}
            >
              <Text
                style={[styles.statusBadgeText, { color: statusConfig.color }]}
              >
                {statusConfig.label}
              </Text>
            </View>
          </View>

          <View style={styles.paymentBreakdownRow}>
            <View style={styles.paymentBreakdownItem}>
              <Text style={styles.paymentBreakdownLabel}>Total Cost</Text>
              <Text style={styles.paymentBreakdownValue}>
                {currency.symbol}
                {purchase.total_cost.toLocaleString()}
              </Text>
            </View>
            <View style={styles.paymentBreakdownItem}>
              <Text style={styles.paymentBreakdownLabel}>Paid</Text>
              <Text
                style={[styles.paymentBreakdownValue, { color: "#16A34A" }]}
              >
                {currency.symbol}
                {purchase.amount_paid.toLocaleString()}
              </Text>
            </View>
            <View style={styles.paymentBreakdownItem}>
              <Text style={styles.paymentBreakdownLabel}>Balance</Text>
              <Text
                style={[
                  styles.paymentBreakdownValue,
                  { color: isPaid ? "#16A34A" : "#DC2626" },
                ]}
              >
                {currency.symbol}
                {balance.toLocaleString()}
              </Text>
            </View>
          </View>

          {!isPaid && hasPermission("purchases.payments.manage") && (
            <TouchableOpacity
              style={styles.recordPaymentButton}
              onPress={() => setPaymentModalVisible(true)}
            >
              <Text style={styles.recordPaymentButtonText}>
                💳 Record Payment
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Payment History */}
        {payments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Payment History ({payments.length})
            </Text>
            {payments.map((payment) => (
              <View key={payment.id} style={styles.paymentHistoryItem}>
                <View style={styles.paymentHistoryLeft}>
                  <Text style={styles.paymentHistoryAmount}>
                    {currency.symbol}
                    {payment.amount.toLocaleString()}
                  </Text>
                  {payment.notes && (
                    <Text style={styles.paymentHistoryNotes}>
                      {payment.notes}
                    </Text>
                  )}
                </View>
                <Text style={styles.paymentHistoryDate}>
                  {new Date(payment.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Purchase Info */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.purchaseDate}>
                {new Date(purchase.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
              <Text style={styles.purchaseTime}>
                {new Date(purchase.created_at).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
            <View style={styles.totalBadge}>
              <Text style={styles.totalBadgeText}>
                {currency.symbol}
                {purchase.total_cost.toLocaleString()}
              </Text>
            </View>
          </View>

          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier:</Text>
              <TouchableOpacity
                onPress={() => {
                  if (purchase.suppliers?.id) {
                    router.push(`/suppliers/${purchase.suppliers.id}`);
                  }
                }}
              >
                <Text
                  style={[
                    styles.infoValue,
                    purchase.suppliers && styles.linkText,
                  ]}
                >
                  {purchase.suppliers?.name || "No Supplier"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Location:</Text>
              <Text style={styles.infoValue}>📍 {purchase.locations.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Total Items:</Text>
              <Text style={styles.infoValue}>{purchase.total_items}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Total Units:</Text>
              <Text style={styles.infoValue}>{purchase.total_units}</Text>
            </View>
          </View>

          {purchase.notes && (
            <View style={styles.notesSection}>
              <Text style={styles.notesLabel}>Notes:</Text>
              <Text style={styles.notesText}>{purchase.notes}</Text>
            </View>
          )}
        </View>

        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Items ({purchase.purchase_items.length})
          </Text>
          {purchase.purchase_items.map((item, index) => (
            <View
              key={
                item.id ? `purchase-item-${item.id}` : `purchase-item-${index}`
              }
              style={styles.itemCard}
            >
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{item.products.name}</Text>
                <Text style={styles.itemTotal}>
                  {currency.symbol}
                  {item.total_cost.toFixed(2)}
                </Text>
              </View>
              <View style={styles.itemDetails}>
                <Text style={styles.itemDetail}>
                  {item.quantity} {item.products.unit}
                </Text>
                <Text style={styles.itemDetail}>×</Text>
                <Text style={styles.itemDetail}>
                  {currency.symbol}
                  {item.unit_cost.toFixed(2)} / {item.products.unit}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Cost Breakdown */}
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Cost Breakdown</Text>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Base Cost:</Text>
            <Text style={styles.breakdownValue}>
              {currency.symbol}
              {baseCost.toFixed(2)}
            </Text>
          </View>
          {purchase.acquisition_costs > 0 && (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Acquisition Costs:</Text>
              <Text style={styles.breakdownValue}>
                {currency.symbol}
                {purchase.acquisition_costs.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={[styles.breakdownRow, styles.breakdownTotal]}>
            <Text style={styles.breakdownTotalLabel}>Total Cost:</Text>
            <Text style={styles.breakdownTotalValue}>
              {currency.symbol}
              {purchase.total_cost.toFixed(2)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Cost per Unit:</Text>
            <Text style={styles.breakdownValue}>
              {currency.symbol}
              {(purchase.total_cost / purchase.total_units).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Acquisition Cost Details */}
        {purchase.acquisition_costs > 0 && (
          <View style={styles.acquisitionCard}>
            <Text style={styles.acquisitionTitle}>
              💰 Acquisition Costs Breakdown
            </Text>
            <Text style={styles.acquisitionHint}>
              These costs were distributed across all {purchase.total_units}{" "}
              units
            </Text>
            <Text style={styles.acquisitionNote}>
              Cost per unit from acquisition: {currency.symbol}
              {(purchase.acquisition_costs / purchase.total_units).toFixed(2)}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Actions</Text>

          {hasPermission("purchases.read") && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setShowReceiptShare(true)}
            >
              <Text style={styles.actionIcon}>📄</Text>
              <Text style={styles.actionText}>Purchase Order / GRN</Text>
            </TouchableOpacity>
          )}

          {purchase.suppliers && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() =>
                router.push(`/suppliers/${purchase.suppliers!.id}`)
              }
            >
              <Text style={styles.actionIcon}>🏢</Text>
              <Text style={styles.actionText}>View Supplier Details</Text>
            </TouchableOpacity>
          )}

          {hasPermission("inventory.adjust") && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push("/inventory/adjust")}
            >
              <Text style={styles.actionIcon}>📦</Text>
              <Text style={styles.actionText}>Add More Inventory</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Record Payment Modal */}
      <Modal
        visible={paymentModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Record Payment</Text>

            <View style={styles.modalBalanceRow}>
              <Text style={styles.modalBalanceLabel}>Balance Due</Text>
              <Text style={styles.modalBalanceValue}>
                {currency.symbol}
                {balance.toLocaleString()}
              </Text>
            </View>

            <Text style={styles.modalLabel}>Amount ({currency.symbol})</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="decimal-pad"
              placeholder={`Max ${currency.symbol}${balance.toLocaleString()}`}
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              autoFocus
            />

            <View style={styles.quickFillRow}>
              <TouchableOpacity
                style={styles.quickFillButton}
                onPress={() => setPaymentAmount((balance / 2).toFixed(2))}
              >
                <Text style={styles.quickFillText}>Half</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickFillButton}
                onPress={() => setPaymentAmount(balance.toFixed(2))}
              >
                <Text style={styles.quickFillText}>Full Balance</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.modalInput, { height: 80 }]}
              placeholder="e.g. Bank transfer, cash..."
              value={paymentNotes}
              onChangeText={setPaymentNotes}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setPaymentModalVisible(false);
                  setPaymentAmount("");
                  setPaymentNotes("");
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitButton,
                  submittingPayment && { opacity: 0.6 },
                ]}
                onPress={handleRecordPayment}
                disabled={submittingPayment}
              >
                {submittingPayment ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.modalSubmitText}>Record Payment</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Floating Receipt Share */}
      <FloatingReceiptShare
        visible={showReceiptShare}
        onDismiss={() => setShowReceiptShare(false)}
        receiptNumber={poNumber}
        onGetReceiptData={getPurchaseReceiptData}
        onGeneratePDF={generatePurchasePDF}
        customerPhone={purchase.suppliers?.phone}
        customerEmail={purchase.suppliers?.email}
        totalAmount={purchase.total_cost}
        receiptType="purchase"
      />
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

  paymentStatusCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  paymentStatusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  paymentStatusTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
  },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 13, fontWeight: "700" },
  paymentBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  paymentBreakdownItem: { alignItems: "center", flex: 1 },
  paymentBreakdownLabel: {
    fontSize: 12,
    color: COLORS.secondary,
    marginBottom: 4,
  },
  paymentBreakdownValue: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primary,
  },
  recordPaymentButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  recordPaymentButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "600",
  },

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
  paymentHistoryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  paymentHistoryLeft: { flex: 1 },
  paymentHistoryAmount: { fontSize: 15, fontWeight: "700", color: "#16A34A" },
  paymentHistoryNotes: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  paymentHistoryDate: { fontSize: 12, color: COLORS.secondary },

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
  purchaseDate: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  purchaseTime: { fontSize: 14, color: COLORS.secondary, marginTop: 4 },
  totalBadge: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  totalBadgeText: { fontSize: 18, fontWeight: "bold", color: COLORS.white },
  infoSection: { marginBottom: 16 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  infoLabel: { fontSize: 14, color: COLORS.secondary },
  infoValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  linkText: { color: COLORS.accent, textDecorationLine: "underline" },
  notesSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  notesLabel: { fontSize: 12, color: COLORS.secondary, marginBottom: 8 },
  notesText: { fontSize: 14, color: COLORS.primary, lineHeight: 20 },

  itemCard: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  itemName: { fontSize: 15, fontWeight: "600", color: COLORS.primary, flex: 1 },
  itemTotal: { fontSize: 15, fontWeight: "bold", color: COLORS.accent },
  itemDetails: { flexDirection: "row", gap: 8 },
  itemDetail: { fontSize: 13, color: COLORS.secondary },

  breakdownCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  breakdownLabel: { fontSize: 14, color: COLORS.secondary },
  breakdownValue: { fontSize: 14, fontWeight: "500", color: COLORS.primary },
  breakdownTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  breakdownTotalLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
  },
  breakdownTotalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.primary,
  },

  acquisitionCard: {
    backgroundColor: "#FFF9E6",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#FFC107",
  },
  acquisitionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
  },
  acquisitionHint: { fontSize: 12, color: COLORS.secondary, marginBottom: 8 },
  acquisitionNote: { fontSize: 14, fontWeight: "600", color: COLORS.primary },

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

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 16,
  },
  modalBalanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalBalanceLabel: { fontSize: 14, color: "#D97706", fontWeight: "600" },
  modalBalanceValue: { fontSize: 14, color: "#D97706", fontWeight: "700" },
  modalLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  quickFillRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  quickFillButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
  },
  quickFillText: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: COLORS.secondary },
  modalSubmitButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  modalSubmitText: { fontSize: 15, fontWeight: "700", color: COLORS.white },
});
