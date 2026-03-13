// FILE: app/drawings/index.tsx (or wherever this screen lives)
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import * as Print from "expo-print";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import FloatingReceiptShare from "../../components/Floatingreceiptshare";
import { PermissionButton } from "../../context/PermisionButton";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import { InvoiceData, InvoiceGenerator } from "../../lib/invoices/core";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface Drawing {
  id: string;
  amount: number;
  notes: string | null;
  occurred_at: string;
  created_at: string;
}

interface FinancialSummary {
  // Allocation-based mode
  allocationMode: boolean; // true = allocations exist, false = fallback
  totalAllocated: number; // sum of all profit_allocations for the year
  distributableAmount: number; // from allocations (already net of PIT via RPC)

  // Fallback mode (no allocations)
  netProfit: number;
  estimatedPIT: number;

  // Common
  totalDrawings: number; // sum of owner_drawings (net, includes reversals)
  availableToWithdraw: number; // the number shown prominently
  overdrawn: boolean; // withdrawn more than available
}

export default function OwnerDrawingsScreen() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  // Receipt share state — one FloatingReceiptShare, fed whichever drawing was tapped
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [showReceiptShare, setShowReceiptShare] = useState(false);

  const orgRef = useRef<{
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  }>({ name: "Your Business" });

  // Add drawing modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().split("T")[0],
  );

  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear().toString(),
  );

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [selectedYear]),
  );

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

        // Fetch full org details for receipts
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

  async function fetchData() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { data: drawingsData, error: drawingsError } = await supabase
        .from("owner_drawings")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .gte("occurred_at", `${selectedYear}-01-01`)
        .lte("occurred_at", `${selectedYear}-12-31`)
        .order("occurred_at", { ascending: false });

      if (drawingsError) throw drawingsError;
      const resolvedDrawings = drawingsData || [];
      setDrawings(resolvedDrawings);

      await calculateSummary(profile.organization_id, resolvedDrawings);
    } catch (err: any) {
      console.error("Error fetching data:", err);
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function calculateSummary(orgId: string, currentDrawings: Drawing[]) {
    try {
      const yearStart = `${selectedYear}-01-01`;
      const yearEnd = `${selectedYear}-12-31`;

      // Net drawings for the year (includes negative reversal entries)
      const totalDrawings = currentDrawings.reduce(
        (sum, d) => sum + Number(d.amount),
        0,
      );

      // ── Path 1: check if profit allocations exist for this year ──────────────
      const { data: allocations } = await supabase
        .from("profit_allocations")
        .select("allocated_amount, distributable_amount")
        .eq("organization_id", orgId)
        .gte("period_start", yearStart)
        .lte("period_end", yearEnd);

      if (allocations && allocations.length > 0) {
        // Sum all allocated amounts across all categories — it's all owner money
        const totalAllocated = allocations.reduce(
          (sum, a) => sum + Number(a.allocated_amount),
          0,
        );
        // Use distributable_amount from the most recent allocation (already net of PIT)
        const distributableAmount =
          Number(allocations[0].distributable_amount) || totalAllocated;
        const availableToWithdraw = totalAllocated - totalDrawings;

        setSummary({
          allocationMode: true,
          totalAllocated,
          distributableAmount,
          netProfit: 0,
          estimatedPIT: 0,
          totalDrawings,
          availableToWithdraw,
          overdrawn: availableToWithdraw < 0,
        });
        return;
      }

      // ── Path 2: no allocations — fallback to live net profit calculation ─────
      const [salesRes, expensesRes, purchasesRes, payrollRes, pitRes] =
        await Promise.all([
          supabase
            .from("sales")
            .select("total_amount")
            .eq("organization_id", orgId)
            .gte("occurred_at", yearStart)
            .lte("occurred_at", yearEnd)
            .eq("is_voided", false),

          supabase
            .from("expenses")
            .select("amount")
            .eq("organization_id", orgId)
            .gte("occurred_at", yearStart)
            .lte("occurred_at", yearEnd),

          supabase
            .from("purchases")
            .select("total_cost")
            .eq("organization_id", orgId)
            .gte("occurred_at", yearStart)
            .lte("occurred_at", yearEnd),

          supabase
            .from("payroll_runs")
            .select("total_net")
            .eq("organization_id", orgId)
            .gte("period_month", `${selectedYear}-01`)
            .lte("period_month", `${selectedYear}-12`)
            .eq("status", "paid"),

          supabase
            .from("tax_settings")
            .select("config")
            .eq("organization_id", orgId)
            .eq("tax_type", "pit")
            .eq("is_active", true)
            .maybeSingle(),
        ]);

      const totalRevenue =
        salesRes.data?.reduce((s, r) => s + Number(r.total_amount), 0) || 0;
      const totalExpenses =
        expensesRes.data?.reduce((s, r) => s + Number(r.amount), 0) || 0;
      const totalCOGS =
        purchasesRes.data?.reduce((s, r) => s + Number(r.total_cost), 0) || 0;
      const totalPayroll =
        payrollRes.data?.reduce((s, r) => s + Number(r.total_net), 0) || 0;

      const netProfit = totalRevenue - totalCOGS - totalExpenses - totalPayroll;

      let estimatedPIT = 0;
      if (pitRes.data && netProfit > 0) {
        estimatedPIT = calculatePIT(netProfit, pitRes.data.config);
      }

      const availableToWithdraw = netProfit - estimatedPIT - totalDrawings;

      setSummary({
        allocationMode: false,
        totalAllocated: 0,
        distributableAmount: Math.max(0, netProfit - estimatedPIT),
        netProfit,
        estimatedPIT,
        totalDrawings,
        availableToWithdraw,
        overdrawn: availableToWithdraw < 0,
      });
    } catch (err: any) {
      console.error("Error calculating summary:", err);
    }
  }

  function calculatePIT(annualIncome: number, pitConfig: any): number {
    const relief = Math.max(
      annualIncome * pitConfig.consolidation_relief_rate,
      pitConfig.max_consolidation_relief,
    );
    const taxableIncome = Math.max(0, annualIncome - relief);
    let totalTax = 0;
    let remaining = taxableIncome;
    for (const bracket of pitConfig.brackets) {
      if (remaining <= 0) break;
      const bracketSize = (bracket.max || Infinity) - bracket.min;
      const taxableInBracket = Math.min(remaining, bracketSize);
      totalTax += (taxableInBracket * bracket.rate) / 100;
      remaining -= taxableInBracket;
    }
    return Math.round(totalTax);
  }

  function onRefresh() {
    setRefreshing(true);
    fetchData();
  }

  function openAddModal() {
    setAmount("");
    setNotes("");
    setOccurredAt(new Date().toISOString().split("T")[0]);
    setShowAddModal(true);
  }

  async function handleAddDrawing() {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }
    const available = summary ? summary.availableToWithdraw : Infinity;
    if (summary && parseFloat(amount) > available) {
      const label = summary.allocationMode
        ? "allocated funds"
        : "estimated available funds";
      Alert.alert(
        "Warning",
        `This withdrawal exceeds your ${label} (${currency.symbol}${Math.max(0, available).toLocaleString()}). Continue anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => saveDrawing() },
        ],
      );
      return;
    }
    saveDrawing();
  }

  async function saveDrawing() {
    if (!hasPermission("drawings.manage")) {
      Alert.alert("Permission Denied", "You cannot record drawings");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { error } = await supabase.from("owner_drawings").insert({
        organization_id: profile.organization_id,
        amount: parseFloat(amount),
        notes: notes.trim() || null,
        occurred_at: occurredAt,
        created_by: user.id,
      });

      if (error) throw error;

      Alert.alert("Success", "Drawing recorded successfully");
      setShowAddModal(false);
      fetchData();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleVoidDrawing(drawing: Drawing) {
    if (!hasPermission("drawings.delete")) {
      Alert.alert("Permission Denied", "You cannot void drawings");
      return;
    }

    const dateStr = new Date(drawing.occurred_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    Alert.alert(
      "Void Drawing",
      `This will create a reversal entry for ${currency.symbol}${Number(drawing.amount).toLocaleString()} (${dateStr}), cancelling it out while keeping the audit trail intact.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Void Drawing",
          style: "destructive",
          onPress: async () => {
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (!user) throw new Error("Not authenticated");

              const { data: profile } = await supabase
                .from("user_profiles")
                .select("organization_id")
                .eq("id", user.id)
                .single();

              if (!profile) throw new Error("Profile not found");

              // Insert a counter-entry — negative amount, no schema changes needed
              const { error } = await supabase.from("owner_drawings").insert({
                organization_id: profile.organization_id,
                amount: -Math.abs(drawing.amount),
                notes: `Reversal of drawing on ${dateStr}`,
                occurred_at: new Date().toISOString().split("T")[0],
                created_by: user.id,
              });

              if (error) throw error;

              Alert.alert(
                "Voided",
                "A reversal entry has been created. The net drawing is now zero.",
              );
              fetchData();
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ],
    );
  }

  // ── Receipt pipeline ────────────────────────────────────────────────────────

  function openReceiptShare(drawing: Drawing) {
    setSelectedDrawing(drawing);
    setShowReceiptShare(true);
  }

  async function getDrawingReceiptData(): Promise<{
    invoiceData: InvoiceData;
    org: { name: string; phone?: string; email?: string; address?: string };
  } | null> {
    if (!selectedDrawing || !organizationId) return null;

    const invoiceData: InvoiceData = {
      type: "withdrawal_receipt",
      number: `WD-${selectedDrawing.id.substring(0, 8).toUpperCase()}`,
      date: new Date(selectedDrawing.occurred_at),
      organizationId,

      items: [
        {
          productName: "Owner's Drawing",
          quantity: 1,
          unit: "transaction",
          unitPrice: selectedDrawing.amount,
          total: selectedDrawing.amount,
          description: selectedDrawing.notes ?? undefined,
        },
      ],

      subtotal: selectedDrawing.amount,
      totalAmount: selectedDrawing.amount,
      amountPaid: selectedDrawing.amount,
      notes: selectedDrawing.notes ?? undefined,
    };

    return { invoiceData, org: orgRef.current };
  }

  async function generateDrawingPDF(): Promise<string | null> {
    if (!selectedDrawing || !organizationId) return null;
    try {
      const result = await getDrawingReceiptData();
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
      console.error("generateDrawingPDF failed:", err);
      return null;
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) =>
    (currentYear - i).toString(),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Owner&apos;s Drawings</Text>
        <PermissionButton permission="drawings.manage" onPress={openAddModal}>
          <Text style={styles.addButton}>+ Add</Text>
        </PermissionButton>
      </View>

      {/* Year Filter */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {years.map((year) => (
            <TouchableOpacity
              key={year}
              style={[
                styles.yearButton,
                selectedYear === year && styles.yearButtonActive,
              ]}
              onPress={() => setSelectedYear(year)}
            >
              <Text
                style={[
                  styles.yearText,
                  selectedYear === year && styles.yearTextActive,
                ]}
              >
                {year}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Financial Summary */}
        {summary && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>
              {summary.allocationMode
                ? `Profit Allocations (${selectedYear})`
                : `Estimated Summary (${selectedYear})`}
            </Text>

            {summary.allocationMode ? (
              // ── Allocation mode ─────────────────────────────────────────────
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Allocated</Text>
                  <Text
                    style={[styles.summaryValue, { color: COLORS.success }]}
                  >
                    {currency.symbol}
                    {summary.totalAllocated.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Already Withdrawn</Text>
                  <Text style={[styles.summaryValue, { color: COLORS.danger }]}>
                    -{currency.symbol}
                    {Math.max(0, summary.totalDrawings).toLocaleString()}
                  </Text>
                </View>
              </>
            ) : (
              // ── Fallback mode ────────────────────────────────────────────────
              <>
                <View style={styles.infoModeBox}>
                  <Text style={styles.infoModeText}>
                    💡 No profit allocations recorded for {selectedYear}.
                    Showing an estimate based on net profit. Go to{" "}
                    <Text style={styles.infoModeLink}>Profit Distribution</Text>{" "}
                    to allocate properly.
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Net Profit (est.)</Text>
                  <Text
                    style={[
                      styles.summaryValue,
                      {
                        color:
                          summary.netProfit >= 0
                            ? COLORS.success
                            : COLORS.danger,
                      },
                    ]}
                  >
                    {currency.symbol}
                    {summary.netProfit.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Estimated PIT</Text>
                  <Text style={[styles.summaryValue, { color: COLORS.danger }]}>
                    -{currency.symbol}
                    {summary.estimatedPIT.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Already Withdrawn</Text>
                  <Text style={[styles.summaryValue, { color: COLORS.danger }]}>
                    -{currency.symbol}
                    {Math.max(0, summary.totalDrawings).toLocaleString()}
                  </Text>
                </View>
              </>
            )}

            {/* Available — always shown */}
            <View style={[styles.summaryRow, styles.availableRow]}>
              <Text style={styles.availableLabel}>Available to Withdraw</Text>
              <Text
                style={[
                  styles.availableValue,
                  { color: summary.overdrawn ? COLORS.danger : COLORS.success },
                ]}
              >
                {summary.overdrawn ? "-" : ""}
                {currency.symbol}
                {Math.abs(summary.availableToWithdraw).toLocaleString()}
              </Text>
            </View>

            {summary.overdrawn && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ You&apos;ve withdrawn more than your{" "}
                  {summary.allocationMode
                    ? "allocated amount"
                    : "estimated after-tax profit"}
                  . This may create tax liabilities.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Drawings List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Drawings History ({drawings.length})
          </Text>

          {loading && !refreshing && (
            <ActivityIndicator
              size="large"
              color={COLORS.primary}
              style={{ marginTop: 20 }}
            />
          )}

          {!loading && drawings.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💰</Text>
              <Text style={styles.emptyText}>No drawings recorded</Text>
              <Text style={styles.emptySubtext}>
                Track money you withdraw from the business
              </Text>
              <PermissionButton
                permission="drawings.manage"
                style={styles.emptyButton}
                onPress={openAddModal}
              >
                <Text style={styles.emptyButtonText}>Record Drawing</Text>
              </PermissionButton>
            </View>
          )}

          {drawings.map((drawing) => (
            <View key={drawing.id} style={styles.drawingCard}>
              <View style={styles.drawingHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.drawingAmount}>
                    {currency.symbol}
                    {Number(drawing.amount).toLocaleString()}
                  </Text>
                  <Text style={styles.drawingDate}>
                    {new Date(drawing.occurred_at).toLocaleDateString("en-US", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                  {drawing.notes && (
                    <Text style={styles.drawingNotes}>{drawing.notes}</Text>
                  )}
                </View>

                {/* Actions */}
                <View style={styles.drawingActions}>
                  <TouchableOpacity
                    style={styles.shareButton}
                    onPress={() => openReceiptShare(drawing)}
                  >
                    <Text style={styles.shareIcon}>📄</Text>
                  </TouchableOpacity>

                  {hasPermission("drawings.delete") && drawing.amount > 0 && (
                    <TouchableOpacity
                      style={styles.voidButton}
                      onPress={() => handleVoidDrawing(drawing)}
                    >
                      <Text style={styles.voidButtonText}>Void</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Add Drawing Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Drawing</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {summary && (
                <View style={styles.modalInfo}>
                  <Text style={styles.modalInfoText}>
                    Available: {currency.symbol}
                    {summary.availableToWithdraw.toLocaleString()}
                  </Text>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Amount ({currency.symbol}){" "}
                  <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="50000"
                  keyboardType="decimal-pad"
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Date</Text>
                <TextInput
                  style={styles.input}
                  value={occurredAt}
                  onChangeText={setOccurredAt}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Notes (Optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Personal expenses, school fees, etc."
                  multiline
                  numberOfLines={3}
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  saving && styles.submitButtonDisabled,
                ]}
                onPress={handleAddDrawing}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.submitButtonText}>Record Drawing</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Floating Receipt Share — one instance, fed whichever drawing was tapped */}
      {selectedDrawing && (
        <FloatingReceiptShare
          visible={showReceiptShare}
          onDismiss={() => setShowReceiptShare(false)}
          receiptNumber={`WD-${selectedDrawing.id.substring(0, 8).toUpperCase()}`}
          onGetReceiptData={getDrawingReceiptData}
          onGeneratePDF={generateDrawingPDF}
          totalAmount={selectedDrawing.amount}
          receiptType="withdrawal"
        />
      )}
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
  title: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  addButton: { fontSize: 16, fontWeight: "600", color: COLORS.accent },

  filterContainer: {
    backgroundColor: COLORS.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  yearButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    marginRight: 8,
  },
  yearButtonActive: { backgroundColor: COLORS.accent },
  yearText: { fontSize: 14, fontWeight: "600", color: COLORS.secondary },
  yearTextActive: { color: COLORS.white },

  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: { fontSize: 14, color: COLORS.secondary },
  summaryValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  availableRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  availableLabel: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  availableValue: { fontSize: 18, fontWeight: "bold", color: COLORS.success },
  warningBox: {
    backgroundColor: "#FFF3CD",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  warningText: { fontSize: 12, color: "#856404", lineHeight: 18 },
  infoModeBox: {
    backgroundColor: "#E3F2FD",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  infoModeText: { fontSize: 12, color: "#1565C0", lineHeight: 18 },
  infoModeLink: { fontWeight: "700", textDecorationLine: "underline" },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },

  drawingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  drawingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  drawingAmount: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 4,
  },
  drawingDate: { fontSize: 13, color: COLORS.secondary, marginBottom: 4 },
  drawingNotes: {
    fontSize: 13,
    color: COLORS.primary,
    marginTop: 4,
    fontStyle: "italic",
  },
  drawingActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  shareButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  shareIcon: { fontSize: 18 },
  voidButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  voidButtonText: { fontSize: 12, fontWeight: "600", color: COLORS.danger },

  emptyState: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.white },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  modalClose: { fontSize: 24, color: COLORS.secondary },
  modalInfo: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalInfoText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.accent,
    textAlign: "center",
  },

  formGroup: { marginBottom: 20 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
  },
  required: { color: COLORS.danger },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.primary,
  },
  textArea: { height: 80, textAlignVertical: "top" },
  submitButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 16, fontWeight: "600", color: COLORS.white },
});
