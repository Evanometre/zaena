// FILE: app/payroll/[id].tsx
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useFocusEffect } from "@react-navigation/native";
import * as Print from "expo-print";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
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

interface PayrollRun {
  id: string;
  period_month: string;
  total_gross: number;
  total_pit: number;
  total_net: number;
  status: "draft" | "confirmed" | "paid";
  processed_at: string | null;
}

interface Payslip {
  id: string;
  employee_id: string;
  gross_salary: number;
  pit_deducted: number;
  other_deductions: number;
  net_salary: number;
  employee: {
    full_name: string;
    employee_id: string | null;
  };
}

export default function PayrollDetailScreen() {
  const router = useRouter();
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

  const { hasPermission, loading: permLoading } = usePermissions();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payrollRun, setPayrollRun] = useState<PayrollRun | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [updating, setUpdating] = useState(false);
  const [showReceiptShare, setShowReceiptShare] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (id) fetchPayrollDetail();
    }, [id]),
  );

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

  async function fetchPayrollDetail() {
    setLoading(true);
    try {
      const { data: run, error: runError } = await supabase
        .from("payroll_runs")
        .select("*")
        .eq("id", id)
        .single();

      if (runError) throw runError;
      setPayrollRun(run);

      const { data: slips, error: slipsError } = await supabase
        .from("payslips")
        .select(
          `
          *,
          employee:employees(full_name, employee_id)
        `,
        )
        .eq("payroll_run_id", id);

      if (slipsError) throw slipsError;
      setPayslips(slips || []);
    } catch (err: any) {
      console.error("Error fetching payroll detail:", err);
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchPayrollDetail();
  }

  async function handleConfirmPayroll() {
    if (!payrollRun) return;
    Alert.alert(
      "Confirm Payroll",
      "Are you sure you want to confirm this payroll? You cannot edit it after confirmation.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setUpdating(true);
            try {
              const { error } = await supabase
                .from("payroll_runs")
                .update({
                  status: "confirmed",
                  processed_at: new Date().toISOString(),
                })
                .eq("id", id);
              if (error) throw error;
              Alert.alert("Success", "Payroll confirmed successfully");
              fetchPayrollDetail();
            } catch (err: any) {
              Alert.alert("Error", err.message);
            } finally {
              setUpdating(false);
            }
          },
        },
      ],
    );
  }

  async function handleMarkAsPaid() {
    if (!payrollRun) return;
    Alert.alert(
      "Mark as Paid",
      "Have you paid all employees for this payroll?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Mark as Paid",
          onPress: async () => {
            setUpdating(true);
            try {
              const { error } = await supabase
                .from("payroll_runs")
                .update({ status: "paid" })
                .eq("id", id);
              if (error) throw error;
              Alert.alert("Success", "Payroll marked as paid");
              fetchPayrollDetail();
            } catch (err: any) {
              Alert.alert("Error", err.message);
            } finally {
              setUpdating(false);
            }
          },
        },
      ],
    );
  }

  async function handleDeletePayroll() {
    if (!payrollRun) return;
    if (payrollRun.status !== "draft") {
      Alert.alert("Error", "You can only delete draft payrolls");
      return;
    }
    Alert.alert(
      "Delete Payroll",
      "Are you sure you want to delete this payroll? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setUpdating(true);
            try {
              const { error: slipsError } = await supabase
                .from("payslips")
                .delete()
                .eq("payroll_run_id", id);
              if (slipsError) throw slipsError;

              const { error: runError } = await supabase
                .from("payroll_runs")
                .delete()
                .eq("id", id);
              if (runError) throw runError;

              Alert.alert("Success", "Payroll deleted successfully");
              router.back();
            } catch (err: any) {
              Alert.alert("Error", err.message);
            } finally {
              setUpdating(false);
            }
          },
        },
      ],
    );
  }

  // ── Receipt pipeline ────────────────────────────────────────────────────────

  async function getPayrollReceiptData(): Promise<{
    invoiceData: InvoiceData;
    org: { name: string; phone?: string; email?: string; address?: string };
  } | null> {
    if (!payrollRun || !organizationId) return null;

    const periodLabel = new Date(
      payrollRun.period_month + "-01",
    ).toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Each payslip → one line item showing net salary per employee
    const items = payslips.map((slip) => ({
      productName: slip.employee.full_name,
      quantity: 1,
      unit: "employee",
      unitPrice: slip.net_salary,
      total: slip.net_salary,
      description:
        slip.pit_deducted > 0
          ? `Gross: ${currency.symbol}${slip.gross_salary.toLocaleString()} | PIT: -${currency.symbol}${slip.pit_deducted.toLocaleString()}${slip.other_deductions > 0 ? ` | Other: -${currency.symbol}${slip.other_deductions.toLocaleString()}` : ""}`
          : undefined,
    }));

    const invoiceData: InvoiceData = {
      type: "expense_receipt", // renders as a cost document — appropriate for payroll
      number: `PAY-${payrollRun.id.substring(0, 8).toUpperCase()}`,
      date: new Date(
        payrollRun.processed_at ?? payrollRun.period_month + "-01",
      ),
      organizationId,

      items,

      subtotal: payrollRun.total_gross,
      totalAmount: payrollRun.total_net,
      amountPaid: payrollRun.status === "paid" ? payrollRun.total_net : 0,

      notes: [
        `Period: ${periodLabel}`,
        `Status: ${payrollRun.status.toUpperCase()}`,
        `Total Gross: ${currency.symbol}${payrollRun.total_gross.toLocaleString()}`,
        `Total PIT Deducted: -${currency.symbol}${payrollRun.total_pit.toLocaleString()}`,
        `Total Net Payable: ${currency.symbol}${payrollRun.total_net.toLocaleString()}`,
      ].join(" | "),
    };

    return { invoiceData, org: orgRef.current };
  }

  async function generatePayrollPDF(): Promise<string | null> {
    if (!payrollRun || !organizationId) return null;
    try {
      const result = await getPayrollReceiptData();
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
      console.error("generatePayrollPDF failed:", err);
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

  if (!hasPermission("payroll.read")) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>🔐 Access Restricted</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButtonAlt}
        >
          <Text style={styles.backButtonAltText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!payrollRun) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Payroll not found</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButtonAlt}
        >
          <Text style={styles.backButtonAltText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return COLORS.secondary;
      case "confirmed":
        return COLORS.accent;
      case "paid":
        return COLORS.success;
      default:
        return COLORS.secondary;
    }
  };

  const receiptNumber = `PAY-${payrollRun.id.substring(0, 8).toUpperCase()}`;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payroll Detail</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.periodText}>
              {new Date(payrollRun.period_month + "-01").toLocaleDateString(
                "en-US",
                {
                  month: "long",
                  year: "numeric",
                },
              )}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(payrollRun.status) },
              ]}
            >
              <Text style={styles.statusText}>
                {payrollRun.status.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.summaryStats}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Gross</Text>
              <Text style={styles.summaryValue}>
                {currency.symbol}
                {payrollRun.total_gross.toLocaleString()}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total PIT</Text>
              <Text style={[styles.summaryValue, { color: COLORS.danger }]}>
                -{currency.symbol}
                {payrollRun.total_pit.toLocaleString()}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Net</Text>
              <Text
                style={[
                  styles.summaryValue,
                  { color: COLORS.success, fontSize: 22, fontWeight: "bold" },
                ]}
              >
                {currency.symbol}
                {payrollRun.total_net.toLocaleString()}
              </Text>
            </View>
          </View>

          {payrollRun.processed_at && (
            <Text style={styles.processedText}>
              Processed:{" "}
              {new Date(payrollRun.processed_at).toLocaleDateString()}
            </Text>
          )}
        </View>

        {/* Action Buttons */}
        {payrollRun.status === "draft" && (
          <View style={styles.actionsRow}>
            {hasPermission("payroll.process") && (
              <TouchableOpacity
                style={[styles.actionButton, styles.confirmButton]}
                onPress={handleConfirmPayroll}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={styles.actionButtonText}>✓ Confirm Payroll</Text>
                )}
              </TouchableOpacity>
            )}
            {hasPermission("payroll.delete") && (
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={handleDeletePayroll}
                disabled={updating}
              >
                <Text style={styles.deleteButtonText}>🗑 Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {payrollRun.status === "confirmed" &&
          hasPermission("payroll.process") && (
            <TouchableOpacity
              style={[styles.actionButton, styles.paidButton]}
              onPress={handleMarkAsPaid}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.actionButtonText}>✓ Mark as Paid</Text>
              )}
            </TouchableOpacity>
          )}

        {/* Payroll Summary Sheet button — only meaningful once confirmed/paid */}
        {payrollRun.status !== "draft" && (
          <TouchableOpacity
            style={styles.receiptButton}
            onPress={() => setShowReceiptShare(true)}
          >
            <Text style={styles.receiptButtonIcon}>📄</Text>
            <Text style={styles.receiptButtonText}>Share Payroll Summary</Text>
          </TouchableOpacity>
        )}

        {/* Payslips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Payslips ({payslips.length} employee
            {payslips.length !== 1 ? "s" : ""})
          </Text>

          {payslips.map((slip) => (
            <View key={slip.id} style={styles.payslipCard}>
              <View style={styles.payslipHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.employeeName}>
                    {slip.employee.full_name}
                  </Text>
                  {slip.employee.employee_id && (
                    <Text style={styles.employeeId}>
                      ID: {slip.employee.employee_id}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.payslipBody}>
                <View style={styles.payslipRow}>
                  <Text style={styles.payslipLabel}>Gross Salary</Text>
                  <Text style={styles.payslipValue}>
                    {currency.symbol}
                    {slip.gross_salary.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.payslipRow}>
                  <Text style={styles.payslipLabel}>PIT Deducted</Text>
                  <Text style={[styles.payslipValue, { color: COLORS.danger }]}>
                    -{currency.symbol}
                    {slip.pit_deducted.toLocaleString()}
                  </Text>
                </View>
                {slip.other_deductions > 0 && (
                  <View style={styles.payslipRow}>
                    <Text style={styles.payslipLabel}>Other Deductions</Text>
                    <Text
                      style={[styles.payslipValue, { color: COLORS.danger }]}
                    >
                      -{currency.symbol}
                      {slip.other_deductions.toLocaleString()}
                    </Text>
                  </View>
                )}
                <View style={[styles.payslipRow, styles.netRow]}>
                  <Text style={styles.netLabel}>Net Salary</Text>
                  <Text style={styles.netValue}>
                    {currency.symbol}
                    {slip.net_salary.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Floating Receipt Share */}
      <FloatingReceiptShare
        visible={showReceiptShare}
        onDismiss={() => setShowReceiptShare(false)}
        receiptNumber={receiptNumber}
        onGetReceiptData={getPayrollReceiptData}
        onGeneratePDF={generatePayrollPDF}
        totalAmount={payrollRun.total_net}
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
  backButton: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
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
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  periodText: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: "700", color: COLORS.white },
  summaryStats: { gap: 12 },
  summaryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: { fontSize: 14, color: COLORS.secondary },
  summaryValue: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  processedText: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  actionsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  actionButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButton: { backgroundColor: COLORS.accent },
  paidButton: { backgroundColor: COLORS.success, marginBottom: 16 },
  deleteButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  actionButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.white },
  deleteButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.danger },

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

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },

  payslipCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  payslipHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  employeeName: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  employeeId: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  payslipBody: { gap: 8 },
  payslipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  payslipLabel: { fontSize: 14, color: COLORS.secondary },
  payslipValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  netRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  netLabel: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  netValue: { fontSize: 18, fontWeight: "bold", color: COLORS.success },

  errorText: { fontSize: 16, color: COLORS.danger, marginBottom: 16 },
  backButtonAlt: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  backButtonAltText: { fontSize: 14, fontWeight: "600", color: COLORS.white },
});
