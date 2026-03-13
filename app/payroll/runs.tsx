import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
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
  created_at: string;
}

export default function PayrollRunsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

  useFocusEffect(
    useCallback(() => {
      fetchPayrollRuns();
    }, []),
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
      } catch (err) {
        console.error("Failed to load org currency:", err);
      }
    }

    loadOrgCurrency();
  }, [organizationId]);

  function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  async function fetchPayrollRuns() {
    setLoading(true);
    try {
      if (!organizationId) throw new Error("No organization");

      const { data, error } = await supabase
        .from("payroll_runs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("period_month", { ascending: false });

      if (error) throw error;
      setRuns(data || []);
    } catch (err: any) {
      console.error("Error fetching payroll runs:", err);
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchPayrollRuns();
  }

  async function handleCreatePayroll() {
    if (!selectedMonth) {
      Alert.alert("Error", "Please select a month");
      return;
    }

    const existing = runs.find((r) => r.period_month === selectedMonth);
    if (existing) {
      Alert.alert("Error", "Payroll already exists for this month");
      return;
    }

    if (!organizationId) throw new Error("No organization");
    setCreating(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: employees, error: empError } = await supabase
        .from("employees")
        .select("*")
        .eq("organization_id", organizationId) // ← store value
        .eq("is_active", true);

      if (empError) throw empError;
      if (!employees || employees.length === 0) {
        Alert.alert("Error", "No active employees found. Add employees first.");
        return;
      }

      const { data: pitSettings, error: pitError } = await supabase
        .from("tax_settings")
        .select("config")
        .eq("organization_id", organizationId) // ← store value
        .eq("tax_type", "pit")
        .eq("is_active", true)
        .single();

      if (pitError) throw pitError;

      const pitConfig = pitSettings.config;

      // Calculate totals
      let totalGross = 0;
      let totalPIT = 0;
      let totalNet = 0;

      const payslips = employees.map((emp) => {
        const annualSalary = emp.monthly_salary * 12;
        const annualPIT = calculateAnnualPIT(annualSalary, pitConfig);
        const monthlyPIT = Math.round(annualPIT / 12);
        const netSalary = emp.monthly_salary - monthlyPIT;

        totalGross += emp.monthly_salary;
        totalPIT += monthlyPIT;
        totalNet += netSalary;

        return {
          employee_id: emp.id,
          gross_salary: emp.monthly_salary,
          pit_deducted: monthlyPIT,
          net_salary: netSalary,
        };
      });

      // Create payroll run
      const { data: newRun, error: runError } = await supabase
        .from("payroll_runs")
        .insert({
          organization_id: organizationId, // ← store value
          period_month: selectedMonth,
          total_gross: totalGross,
          total_pit: totalPIT,
          total_net: totalNet,
          status: "draft",
          created_by: user.id,
        })
        .select()
        .single();

      if (runError) throw runError;

      // Create payslips
      const payslipsWithRun = payslips.map((ps) => ({
        ...ps,
        payroll_run_id: newRun.id,
      }));

      const { error: slipsError } = await supabase
        .from("payslips")
        .insert(payslipsWithRun);

      if (slipsError) throw slipsError;

      // ── Pension contributions (auto-generated from payslips) ──────────────
      const pensionRows = payslips.map((ps) => ({
        organization_id: organizationId,
        employee_id: ps.employee_id,
        payroll_run_id: newRun.id,
        period_month: selectedMonth,
        gross_salary: ps.gross_salary,
        employee_contribution: Math.round(ps.gross_salary * 0.08 * 100) / 100,
        employer_contribution: Math.round(ps.gross_salary * 0.03 * 100) / 100,
        total_contribution: Math.round(ps.gross_salary * 0.11 * 100) / 100,
      }));

      const { error: pensionError } = await supabase
        .from("pension_contributions")
        .insert(pensionRows);

      if (pensionError) throw pensionError;
      // ─────────────────────────────────────────────────────────────────────

      Alert.alert("Success", "Payroll created successfully");
      setShowCreateModal(false);
      fetchPayrollRuns();

      // Navigate to detail
      router.push(`/payroll/${newRun.id}` as any);
    } catch (err: any) {
      console.error("Error creating payroll:", err);
      Alert.alert("Error", err.message);
    } finally {
      setCreating(false);
    }
  }

  function calculateAnnualPIT(annualIncome: number, pitConfig: any): number {
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

  function getStatusColor(status: string) {
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
  }

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

  if (!hasPermission("payroll.read")) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <Text style={styles.emptyIcon}>🔐</Text>
        <Text style={styles.emptyText}>Access Restricted</Text>
        <Text style={styles.emptySubtext}>
          You do not have permission to view payroll.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.emptyButton}
        >
          <Text style={styles.emptyButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        {hasPermission("payroll.process") ? (
          <TouchableOpacity onPress={() => setShowCreateModal(true)}>
            <Text style={styles.addButton}>+ Create</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing && (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 40 }}
          />
        )}

        {!loading && runs.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💰</Text>
            <Text style={styles.emptyText}>No payroll runs yet</Text>
            <Text style={styles.emptySubtext}>
              Create your first payroll to get started
            </Text>
            {hasPermission("payroll.process") && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => setShowCreateModal(true)}
              >
                <Text style={styles.emptyButtonText}>Create Payroll</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {runs.map((run) => (
          <TouchableOpacity
            key={run.id}
            style={styles.runCard}
            onPress={() => router.push(`/payroll/${run.id}` as any)}
          >
            <View style={styles.runHeader}>
              <Text style={styles.runMonth}>
                {new Date(run.period_month + "-01").toLocaleDateString(
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
                  { backgroundColor: getStatusColor(run.status) },
                ]}
              >
                <Text style={styles.statusText}>
                  {run.status.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.runStats}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Gross</Text>
                <Text style={styles.statValue}>
                  {currency.symbol}
                  {run.total_gross.toLocaleString()}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>PIT</Text>
                <Text style={[styles.statValue, { color: COLORS.danger }]}>
                  -{currency.symbol}
                  {run.total_pit.toLocaleString()}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Net</Text>
                <Text
                  style={[
                    styles.statValue,
                    { color: COLORS.success, fontWeight: "bold" },
                  ]}
                >
                  {currency.symbol}
                  {run.total_net.toLocaleString()}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Create Payroll Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Payroll</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Select Month</Text>
              <TextInput
                style={styles.input}
                value={selectedMonth}
                onChangeText={setSelectedMonth}
                placeholder="YYYY-MM"
                placeholderTextColor={COLORS.secondary}
              />
              <Text style={styles.hint}>Format: YYYY-MM (e.g., 2026-01)</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                creating && styles.submitButtonDisabled,
              ]}
              onPress={handleCreatePayroll}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.submitButtonText}>Create Payroll</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  list: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  runCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  runHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  runMonth: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: "600", color: COLORS.white },

  runStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  statItem: { alignItems: "center" },
  statLabel: { fontSize: 12, color: COLORS.secondary, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: "600", color: COLORS.primary },

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
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  modalClose: { fontSize: 24, color: COLORS.secondary },

  formGroup: { marginBottom: 20 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.primary,
  },
  hint: { fontSize: 12, color: COLORS.secondary, marginTop: 4 },

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
