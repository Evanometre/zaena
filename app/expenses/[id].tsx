// FILE: app/expenses/[id].tsx
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { PermissionGuard } from "../../context/PermissionGuard";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import { InvoiceData, InvoiceGenerator } from "../../lib/invoices/core";
import { queueOperation } from "../../lib/localDb";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface ExpenseDetail {
  id: string;
  category: string;
  amount: number;
  expense_type: "operating" | "capital";
  payment_method: string;
  notes: string | null;
  occurred_at: string;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  organization_id: string;
  location_id: string;
  locations: { name: string };
}

interface FinancialEvent {
  id: string;
  event_type: string;
  amount: number;
  occurred_at: string;
}

export default function ExpenseDetailScreen() {
  const [expense, setExpense] = useState<ExpenseDetail | null>(null);
  const [financialEvents, setFinancialEvents] = useState<FinancialEvent[]>([]);
  const [showReceiptShare, setShowReceiptShare] = useState(false);
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const orgRef = useRef<{
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  }>({ name: "Your Business" });

  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);

  const canDelete = hasPermission("expenses.delete");
  const canViewLedger = hasPermission("ledger.read");

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

        // Fetch full org details for receipt while we're here
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
    loadOrgCurrency();
  }, [organizationId]);

  const fetchExpense = useCallback(async () => {
    setLoading(true);
    try {
      // ── Show cache immediately ──────────────────────────
      const cacheKey = `expense_detail_${id}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { expense: ce, events: cev } = JSON.parse(cached);
        setExpense(ce);
        setFinancialEvents(cev || []);
        setLoading(false);
      }

      // ── Fetch fresh ─────────────────────────────────────
      const { data: expenseData, error: expenseError } = await supabase
        .from("expenses")
        .select(
          "*, locations (name), user_profiles!expenses_created_by_fkey (full_name)",
        )
        .eq("id", id)
        .single();

      if (expenseError) throw expenseError;
      setExpense(expenseData);

      let events: FinancialEvent[] = [];
      if (canViewLedger && expenseData) {
        const { data: eventsData } = await supabase
          .from("financial_events")
          .select("id, event_type, amount, occurred_at")
          .eq("organization_id", expenseData.organization_id)
          .eq("location_id", expenseData.location_id)
          .order("occurred_at", { ascending: false });

        events = eventsData || [];
        setFinancialEvents(events);
      }

      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({ expense: expenseData, events }),
      );
    } catch (err: any) {
      if (!expense) console.error("Error fetching expense:", err);
    } finally {
      setLoading(false);
    }
  }, [id, canViewLedger]);

  useFocusEffect(
    useCallback(() => {
      if (id) fetchExpense();
    }, [id, fetchExpense]),
  );

  async function handleVoid() {
    if (!canDelete) {
      Alert.alert("Permission Denied", "You cannot void expenses.");
      return;
    }
    if (!expense) return;

    Alert.alert(
      "Void Expense",
      "This will create a reversal in your ledger, leaving the original expense intact for auditing.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Void Expense",
          style: "destructive",
          onPress: async () => {
            try {
              // Build reversal events from what we already have in state
              // If financialEvents is empty, we still queue — sync handler
              // will fetch and reverse at sync time if needed
              const reversalEvents = financialEvents.map((evt) => ({
                reference_id: expense.id,
                organization_id: expense.organization_id,
                location_id: expense.location_id,
                event_type: "reversal_" + evt.event_type,
                amount: -evt.amount,
                occurred_at: new Date().toISOString(),
                notes: `Reversal of event ${evt.id}`,
              }));

              await queueOperation({
                module: "expenses",
                operation: "void_expense",
                payload: {
                  expenseId: expense.id,
                  organizationId: expense.organization_id,
                  locationId: expense.location_id,
                  events: reversalEvents,
                },
              });

              Alert.alert(
                "Void Queued ✓",
                "Ledger reversal queued and will sync when online.",
                [{ text: "OK", onPress: () => router.back() }],
              );
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to void expense");
            }
          },
        },
      ],
    );
  }

  // ── Receipt pipeline ────────────────────────────────────────────────────────

  async function getExpenseReceiptData(): Promise<{
    invoiceData: InvoiceData;
    org: { name: string; phone?: string; email?: string; address?: string };
  } | null> {
    if (!expense) return null;

    const recorderNote = expense.created_by_name
      ? ` | Recorded by ${expense.created_by_name}`
      : "";

    const invoiceData: InvoiceData = {
      type: "expense_receipt",
      number: `EXP-${expense.id.substring(0, 8).toUpperCase()}`,
      date: new Date(expense.occurred_at),
      organizationId: organizationId!,

      location: {
        id: expense.location_id,
        name: expense.locations.name,
      },

      items: [
        {
          productName: expense.category,
          quantity: 1,
          unit: "expense",
          unitPrice: expense.amount,
          total: expense.amount,
          description: expense.notes ?? undefined,
        },
      ],

      subtotal: expense.amount,
      totalAmount: expense.amount,
      paymentMethod: expense.payment_method,
      amountPaid: expense.amount,
      notes: `Expense Type: ${expense.expense_type.toUpperCase()}${recorderNote}`,
    };

    return { invoiceData, org: orgRef.current };
  }

  async function generateExpensePDF(): Promise<string | null> {
    if (!expense || !organizationId) return null;
    try {
      const result = await getExpenseReceiptData();
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
      console.error("generateExpensePDF failed:", err);
      return null;
    }
  }

  // ── Guards ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Expense Details</Text>
          <View style={{ width: 60 }} />
        </View>
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: 40 }}
        />
      </View>
    );
  }

  if (!expense) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Expense Details</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>❌</Text>
          <Text style={styles.emptyText}>Expense not found</Text>
        </View>
      </View>
    );
  }

  const expNumber = `EXP-${expense.id.substring(0, 8).toUpperCase()}`;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Expense Details</Text>
        <PermissionGuard
          permission="expenses.delete"
          fallback={<View style={{ width: 60 }} />}
        >
          <TouchableOpacity onPress={handleVoid}>
            <Text style={styles.deleteButton}>Void</Text>
          </TouchableOpacity>
        </PermissionGuard>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Amount Card */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Amount</Text>
          <Text style={styles.amountValue}>
            {currency.symbol}
            {expense.amount.toLocaleString()}
          </Text>
          <View
            style={[
              styles.typeBadge,
              expense.expense_type === "operating"
                ? styles.typeBadgeOperating
                : styles.typeBadgeCapital,
            ]}
          >
            <Text style={styles.typeBadgeText}>
              {expense.expense_type === "operating"
                ? "Operating Expense"
                : "Capital Expense"}
            </Text>
          </View>
        </View>

        {/* Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Category</Text>
            <Text style={styles.detailValue}>{expense.category}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>📍 {expense.locations.name}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expense Date</Text>
            <Text style={styles.detailValue}>
              {new Date(expense.occurred_at).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Recorded Date</Text>
            <Text style={styles.detailValue}>
              {new Date(expense.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </Text>
          </View>

          {expense.created_by_name && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Recorded By</Text>
              <Text style={styles.detailValue}>{expense.created_by_name}</Text>
            </View>
          )}
        </View>

        {/* Notes Card */}
        {expense.notes && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notes</Text>
            <Text style={styles.notesText}>{expense.notes}</Text>
          </View>
        )}

        {/* Receipt */}
        <TouchableOpacity
          style={styles.receiptButton}
          onPress={() => setShowReceiptShare(true)}
        >
          <Text style={styles.receiptButtonIcon}>📄</Text>
          <Text style={styles.receiptButtonText}>Share Expense Receipt</Text>
        </TouchableOpacity>

        {/* Accounting Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Accounting Impact</Text>
          {expense.expense_type === "operating" ? (
            <Text style={styles.infoText}>
              This operating expense reduces net profit for the period. It
              affects profit calculations and distributions.
            </Text>
          ) : (
            <Text style={styles.infoText}>
              This capital expense is an asset purchase. It reduces cash but
              does not directly reduce profit.
            </Text>
          )}
        </View>

        {/* Financial Events */}
        <PermissionGuard permission="ledger.read">
          {financialEvents.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Financial Events</Text>
              {financialEvents.map((event) => (
                <View key={event.id} style={styles.eventRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventType}>
                      {event.event_type.replace(/_/g, " ").toUpperCase()}
                    </Text>
                    <Text style={styles.eventDate}>
                      {new Date(event.occurred_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.eventAmount,
                      { color: event.amount < 0 ? "red" : "green" },
                    ]}
                  >
                    {event.amount < 0 ? "-" : ""}
                    {currency.symbol}
                    {Math.abs(event.amount).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </PermissionGuard>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Floating Receipt Share */}
      <FloatingReceiptShare
        visible={showReceiptShare}
        onDismiss={() => setShowReceiptShare(false)}
        receiptNumber={expNumber}
        onGetReceiptData={getExpenseReceiptData}
        onGeneratePDF={generateExpensePDF}
        totalAmount={expense.amount}
        receiptType="sale" // expense_receipt renders fine under 'sale' layout
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
  backButton: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  deleteButton: { fontSize: 16, color: COLORS.danger, fontWeight: "600" },
  content: { flex: 1, padding: 16 },

  amountCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  amountLabel: { fontSize: 14, color: COLORS.secondary, marginBottom: 8 },
  amountValue: {
    fontSize: 40,
    fontWeight: "bold",
    color: COLORS.danger,
    marginBottom: 12,
  },
  typeBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  typeBadgeOperating: { backgroundColor: COLORS.danger },
  typeBadgeCapital: { backgroundColor: COLORS.secondary },
  typeBadgeText: { fontSize: 13, fontWeight: "600", color: COLORS.white },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailLabel: { fontSize: 14, color: COLORS.secondary },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    flex: 1,
    textAlign: "right",
  },
  notesText: { fontSize: 14, color: COLORS.primary, lineHeight: 22 },

  receiptButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  receiptButtonIcon: { fontSize: 18 },
  receiptButtonText: { fontSize: 15, fontWeight: "600", color: COLORS.white },

  infoCard: {
    backgroundColor: "#E3F2FD",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1565C0",
    marginBottom: 8,
  },
  infoText: { fontSize: 14, color: "#1565C0", lineHeight: 20 },

  eventRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  eventType: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
  eventDate: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  eventAmount: { fontSize: 15, fontWeight: "bold" },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: "600", color: COLORS.secondary },
});
