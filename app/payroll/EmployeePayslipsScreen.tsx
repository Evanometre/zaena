// app/payroll/EmployeePayslipsScreen.tsx
import { getOrganization } from "@/onboarding/services/organizationService";
import {
    ALL_CURRENCIES,
    getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface Payslip {
  id: string;
  gross_salary: number;
  pit_deducted: number;
  other_deductions: number;
  net_salary: number;
  payroll_run: {
    period_month: string;
    status: "draft" | "confirmed" | "paid";
  };
}

export default function EmployeePayslipsScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { employeeId, employeeName } = useLocalSearchParams<{
    employeeId: string;
    employeeName: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

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

  useFocusEffect(
    useCallback(() => {
      if (employeeId) fetchPayslips();
    }, [employeeId]),
  );

  async function fetchPayslips() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("payslips")
        .select(
          `
          id,
          gross_salary,
          pit_deducted,
          other_deductions,
          net_salary,
          payroll_run:payroll_runs(period_month, status)
        `,
        )
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const formatted: Payslip[] = (data || []).map((row: any) => ({
        id: row.id,
        gross_salary: row.gross_salary,
        pit_deducted: row.pit_deducted,
        other_deductions: row.other_deductions,
        net_salary: row.net_salary,
        payroll_run: row.payroll_run?.[0] ?? {
          period_month: "",
          status: "draft",
        },
      }));

      setPayslips(formatted);
    } catch (err: any) {
      console.error("Error fetching payslips:", err);
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchPayslips();
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

  const totalPaid = payslips
    .filter((p) => p.payroll_run.status === "paid")
    .reduce((sum, p) => sum + p.net_salary, 0);

  // ── Permission guard ───────────────────────
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
        <Text style={styles.emptyIcon}>🔐</Text>
        <Text style={styles.emptyTitle}>Access Restricted</Text>
        <Text style={styles.emptySubtext}>
          You do not have permission to view payslips.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButtonAlt}
        >
          <Text style={styles.backButtonAltText}>Go Back</Text>
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
        <Text style={styles.title} numberOfLines={1}>
          {employeeName ?? "Employee"}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>{payslips.length}</Text>
          <Text style={styles.summaryLabel}>Payslips</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>
            {currency.symbol}
            {totalPaid.toLocaleString()}
          </Text>
          <Text style={styles.summaryLabel}>Total Paid (net)</Text>
        </View>
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

        {!loading && payslips.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTitle}>No payslips yet</Text>
            <Text style={styles.emptySubtext}>
              Payslips will appear here once payroll runs are processed.
            </Text>
          </View>
        )}

        {payslips.map((slip) => (
          <View key={slip.id} style={styles.payslipCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.periodText}>
                {new Date(
                  slip.payroll_run.period_month + "-01",
                ).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(slip.payroll_run.status) },
                ]}
              >
                <Text style={styles.statusText}>
                  {slip.payroll_run.status.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Gross Salary</Text>
                <Text style={styles.rowValue}>
                  {currency.symbol}
                  {slip.gross_salary.toLocaleString()}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>PIT Deducted</Text>
                <Text style={[styles.rowValue, { color: COLORS.danger }]}>
                  -{currency.symbol}
                  {slip.pit_deducted.toLocaleString()}
                </Text>
              </View>
              {slip.other_deductions > 0 && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Other Deductions</Text>
                  <Text style={[styles.rowValue, { color: COLORS.danger }]}>
                    -{currency.symbol}
                    {slip.other_deductions.toLocaleString()}
                  </Text>
                </View>
              )}
              <View style={[styles.row, styles.netRow]}>
                <Text style={styles.netLabel}>Net Salary</Text>
                <Text style={styles.netValue}>
                  {currency.symbol}
                  {slip.net_salary.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { justifyContent: "center", alignItems: "center", padding: 40 },
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
  backButton: {
    fontSize: 16,
    color: COLORS.accent,
    fontWeight: "600",
    width: 60,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.primary,
    flex: 1,
    textAlign: "center",
  },

  summaryStrip: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryDivider: { width: 1, backgroundColor: COLORS.border },
  summaryNumber: { fontSize: 20, fontWeight: "700", color: COLORS.primary },
  summaryLabel: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },

  list: { flex: 1, padding: 16 },

  payslipCard: {
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  periodText: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: "700", color: COLORS.white },

  cardBody: { gap: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: { fontSize: 14, color: COLORS.secondary },
  rowValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  netRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  netLabel: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  netValue: { fontSize: 18, fontWeight: "bold", color: COLORS.success },

  emptyState: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
    lineHeight: 20,
  },

  backButtonAlt: {
    marginTop: 16,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonAltText: { fontSize: 14, fontWeight: "600", color: COLORS.white },
});
