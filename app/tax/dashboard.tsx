// FILE: app/tax/dashboard.tsx
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

// ── Types ──────────────────────────────────────────────────────────────────────

interface TaxSummaryBase {
  totalVATCollected: number;
  totalVATRemitted: number;
  vatOutstanding: number;
  totalPITDeducted: number;
  totalPITRemitted: number;
  pitOutstanding: number;
  totalTaxLiability: number;
  totalTaxRemitted: number;
  totalTaxOutstanding: number;
  totalWHTDeducted: number;
  totalWHTRemitted: number;
  whtOutstanding: number;
  totalPensionDue: number;
  totalPensionRemitted: number;
  pensionOutstanding: number;
}

interface BusinessNameTaxSummary extends TaxSummaryBase {
  mode: "business_name";
  ownerNetProfit: number;
  ownerEstimatedPIT: number;
  ownerPITRemitted: number;
  ownerPITOutstanding: number;
}

interface CompanyTaxSummary extends TaxSummaryBase {
  mode: "registered_company";
  annualTurnover: number;
  netProfit: number;
  citRate: number;
  citTier: string;
  estimatedCIT: number;
  citRemitted: number;
  citOutstanding: number;
  estimatedDevLevy: number;
  devLevyRemitted: number;
  devLevyOutstanding: number;
}

type TaxSummary = BusinessNameTaxSummary | CompanyTaxSummary;

interface TaxRemittance {
  id: string;
  tax_type: string;
  period_start: string;
  period_end: string;
  amount_due: number;
  amount_paid: number;
  payment_date: string | null;
  status: "pending" | "paid";
  notes: string | null;
  created_at: string;
}

// ── CIT helpers — Nigeria Tax Act 2025, effective 1 April 2026 ─────────────────
//
// Two tiers only. No "medium" tier exists in the new law.
//   Small company:  turnover ≤ ₦50M AND fixed assets ≤ ₦250M → 0%
//   Large company:  turnover > ₦50M → 30%
//
// Minimum tax: ABOLISHED.
// Fixed assets condition cannot be verified from transaction data alone —
// a UI note prompts users to confirm with their accountant if near the threshold.

function getCITTier(turnover: number): { rate: number; tier: string } {
  if (turnover <= 50_000_000)
    return { rate: 0, tier: "Small Company — CIT Exempt (≤ ₦50M turnover)" };
  return { rate: 30, tier: "Large Company (30%)" };
}

function calculateCIT(turnover: number, profit: number): number {
  if (profit <= 0) return 0;
  const { rate } = getCITTier(turnover);
  if (rate === 0) return 0;
  // Minimum tax abolished under Nigeria Tax Act 2025
  return Math.round((profit * rate) / 100);
}

// Development Levy: 4% of assessable profit
// Exempt for small companies (turnover ≤ ₦50M, same threshold as CIT exemption)
function calculateDevLevy(turnover: number, profit: number): number {
  if (turnover <= 50_000_000) return 0;
  if (profit <= 0) return 0;
  return Math.round((profit * 4) / 100);
}

// ── PIT helpers — Nigeria Tax Act 2025, effective 1 January 2026 ───────────────
//
// CRA (Consolidated Relief Allowance) is abolished.
// Rent relief: min(20% of annual rent paid, ₦500,000) — stored per employee.
// Six progressive brackets, exemption floor ₦800,000.
//
// annualIncome:  gross annual income (or business profit for sole proprietors)
// pitConfig:     config JSONB from tax_settings row
// rentRelief:    pre-calculated rent relief for this individual (default 0)

function calculatePIT(
  annualIncome: number,
  pitConfig: any,
  rentRelief: number = 0,
): number {
  // Apply rent relief first, then check exemption floor
  const taxableIncome = Math.max(0, annualIncome - rentRelief);
  const exemption = pitConfig.annual_exemption ?? 800_000;
  if (taxableIncome <= exemption) return 0;

  let totalTax = 0;
  for (const bracket of pitConfig.brackets ?? []) {
    if (taxableIncome <= bracket.min) break;
    const bracketMax = bracket.max ?? Infinity;
    const taxableInBracket = Math.min(taxableIncome, bracketMax) - bracket.min;
    totalTax += (taxableInBracket * bracket.rate) / 100;
  }
  return Math.round(totalTax);
}

// ── Filing deadlines ───────────────────────────────────────────────────────────

interface DeadlineStatus {
  label: string;
  dueDate: Date;
  isOverdue: boolean;
  daysRemaining: number;
  urgency: "ok" | "soon" | "overdue";
}

function getTaxDeadlines(financialYearEndMonth: number = 12): DeadlineStatus[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  // VAT — due 21st of the following month
  const vatDueMonth = month === 11 ? 0 : month + 1;
  const vatDueYear = month === 11 ? year + 1 : year;
  const vatDue = new Date(vatDueYear, vatDueMonth, 21);

  // PAYE — due 10th of the following month
  const payeDueMonth = month === 11 ? 0 : month + 1;
  const payeDueYear = month === 11 ? year + 1 : year;
  const payeDue = new Date(payeDueYear, payeDueMonth, 10);

  // CIT — 6 months after financial year end
  const citDueMonthIndex = (financialYearEndMonth - 1 + 6) % 12; // 0-indexed
  const citDueYearOffset = financialYearEndMonth - 1 + 6 >= 12 ? 1 : 0;
  const citDue = new Date(year + citDueYearOffset, citDueMonthIndex, 30);
  const effectiveCITDue =
    citDue < now
      ? new Date(year + citDueYearOffset + 1, citDueMonthIndex, 30)
      : citDue;

  const toStatus = (label: string, dueDate: Date): DeadlineStatus => {
    const msRemaining = dueDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
    const isOverdue = daysRemaining < 0;
    const urgency: "ok" | "soon" | "overdue" = isOverdue
      ? "overdue"
      : daysRemaining <= 7
        ? "soon"
        : "ok";
    return { label, dueDate, isOverdue, daysRemaining, urgency };
  };

  return [
    toStatus("VAT (monthly)", vatDue),
    toStatus("PAYE (monthly)", payeDue),
    toStatus("CIT (annual)", effectiveCITDue),
  ];
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TaxDashboardScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const businessType = useAuthStore((s) => s.businessType);
  const company = businessType === "registered_company";
  const { hasPermission, loading: permLoading } = usePermissions();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [remittances, setRemittances] = useState<TaxRemittance[]>([]);
  const [financialYearEndMonth, setFinancialYearEndMonth] = useState(12);
  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear().toString(),
  );
  const [currency, setCurrency] = useState({
    symbol: "",
    code: "NGN",
    name: "Nigerian Naira",
  });

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  type TaxTypeOption = "vat" | "pit" | "cit" | "pit_owner" | "wht" | "dev_levy";
  const [taxType, setTaxType] = useState<TaxTypeOption>("vat");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState("");

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [selectedYear]),
  );

  useEffect(() => {
    async function loadOrgMeta() {
      if (!organizationId) return;
      try {
        // Load currency
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

        // Load financial year end month — determines CIT filing deadline
        const { data: settings } = await supabase
          .from("organization_settings")
          .select("financial_year_end_month")
          .eq("organization_id", organizationId)
          .single();
        if (settings?.financial_year_end_month) {
          setFinancialYearEndMonth(settings.financial_year_end_month);
        }
      } catch (err) {
        console.error("Failed to load org meta:", err);
      }
    }
    loadOrgMeta();
  }, [organizationId]);

  async function fetchData() {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data: remittancesData, error: remittancesError } = await supabase
        .from("tax_remittances")
        .select("*")
        .eq("organization_id", organizationId)
        .gte("period_start", `${selectedYear}-01-01`)
        .lte("period_end", `${selectedYear}-12-31`)
        .order("period_start", { ascending: false });

      if (remittancesError) throw remittancesError;
      setRemittances(remittancesData || []);
      await calculateTaxSummary(organizationId, remittancesData || []);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function calculateTaxSummary(
    orgId: string,
    remittancesData: TaxRemittance[],
  ) {
    try {
      const yearStart = `${selectedYear}-01-01`;
      const yearEnd = `${selectedYear}-12-31`;

      // ── VAT ──────────────────────────────────────────────────────────────────
      const { data: salesData } = await supabase
        .from("sales")
        .select("total_amount, tax, total_cogs")
        .eq("organization_id", orgId)
        .gte("occurred_at", yearStart)
        .lte("occurred_at", yearEnd);

      const totalSales =
        salesData?.reduce(
          (sum, s) => sum + Number(s.total_amount) - Number(s.tax || 0),
          0,
        ) || 0;
      const totalVATCollected =
        salesData?.reduce((sum, s) => sum + Number(s.tax || 0), 0) || 0;

      const vatRemittances = remittancesData.filter(
        (r) => r.tax_type === "vat",
      );
      const totalVATRemitted = vatRemittances.reduce(
        (sum, r) => sum + Number(r.amount_paid),
        0,
      );
      const vatOutstanding = Math.max(0, totalVATCollected - totalVATRemitted);

      // ── Employee PAYE — both modes ────────────────────────────────────────────
      const { data: payrollData } = await supabase
        .from("payroll_runs")
        .select("total_pit")
        .eq("organization_id", orgId)
        .gte("period_month", selectedYear + "-01")
        .lte("period_month", selectedYear + "-12")
        .in("status", ["confirmed", "paid"]);

      const totalPITDeducted =
        payrollData?.reduce((sum, pr) => sum + Number(pr.total_pit), 0) || 0;

      const pitRemittances = remittancesData.filter(
        (r) => r.tax_type === "pit",
      );
      const totalPITRemitted = pitRemittances.reduce(
        (sum, r) => sum + Number(r.amount_paid),
        0,
      );
      const pitOutstanding = Math.max(0, totalPITDeducted - totalPITRemitted);

      // ── WHT — both modes ──────────────────────────────────────────────────────
      const { data: whtExpenses } = await supabase
        .from("expenses")
        .select("wht_amount")
        .eq("organization_id", orgId)
        .gt("wht_amount", 0)
        .gte("occurred_at", yearStart)
        .lte("occurred_at", yearEnd);

      const totalWHTDeducted =
        whtExpenses?.reduce((sum, e) => sum + Number(e.wht_amount || 0), 0) ||
        0;

      const whtRemittances = remittancesData.filter(
        (r) => r.tax_type === "wht",
      );
      const totalWHTRemitted = whtRemittances.reduce(
        (sum, r) => sum + Number(r.amount_paid),
        0,
      );
      const whtOutstanding = Math.max(0, totalWHTDeducted - totalWHTRemitted);

      // ── Pension — both modes ──────────────────────────────────────────────────
      const { data: pensionData } = await supabase
        .from("pension_contributions")
        .select("total_contribution, remitted")
        .eq("organization_id", orgId)
        .gte("created_at", yearStart)
        .lte("created_at", yearEnd);

      const totalPensionDue =
        pensionData?.reduce(
          (sum, p) => sum + Number(p.total_contribution || 0),
          0,
        ) || 0;
      const totalPensionRemitted =
        pensionData?.reduce(
          (sum, p) =>
            sum + (p.remitted ? Number(p.total_contribution || 0) : 0),
          0,
        ) || 0;
      const pensionOutstanding = Math.max(
        0,
        totalPensionDue - totalPensionRemitted,
      );

      // ── Net profit — shared ───────────────────────────────────────────────────
      const [expensesRes, payrollNetRes] = await Promise.all([
        supabase
          .from("expenses")
          .select("amount")
          .eq("organization_id", orgId)
          .gte("occurred_at", yearStart)
          .lte("occurred_at", yearEnd),

        supabase
          .from("payroll_runs")
          .select("total_net")
          .eq("organization_id", orgId)
          .gte("period_month", selectedYear + "-01")
          .lte("period_month", selectedYear + "-12")
          .eq("status", "paid"),
      ]);

      const totalExpenses =
        expensesRes.data?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
      const totalCOGS =
        salesData?.reduce((sum, s) => sum + Number(s.total_cogs || 0), 0) || 0;

      const totalPayroll =
        payrollNetRes.data?.reduce((sum, p) => sum + Number(p.total_net), 0) ||
        0;

      const netProfit = totalSales - totalCOGS - totalExpenses - totalPayroll;

      // ── Mode-specific ─────────────────────────────────────────────────────────

      if (company) {
        const annualTurnover = totalSales;
        const { rate, tier } = getCITTier(annualTurnover);
        const estimatedCIT = calculateCIT(annualTurnover, netProfit);
        const estimatedDevLevy = calculateDevLevy(annualTurnover, netProfit);

        const citRemittances = remittancesData.filter(
          (r) => r.tax_type === "cit",
        );
        const citRemitted = citRemittances.reduce(
          (sum, r) => sum + Number(r.amount_paid),
          0,
        );
        const citOutstanding = Math.max(0, estimatedCIT - citRemitted);

        const devLevyRemittances = remittancesData.filter(
          (r) => r.tax_type === "dev_levy",
        );
        const devLevyRemitted = devLevyRemittances.reduce(
          (sum, r) => sum + Number(r.amount_paid),
          0,
        );
        const devLevyOutstanding = Math.max(
          0,
          estimatedDevLevy - devLevyRemitted,
        );

        const totalTaxLiability =
          totalVATCollected +
          totalPITDeducted +
          estimatedCIT +
          estimatedDevLevy +
          totalWHTDeducted;
        const totalTaxRemitted =
          totalVATRemitted +
          totalPITRemitted +
          citRemitted +
          devLevyRemitted +
          totalWHTRemitted;

        setSummary({
          mode: "registered_company",
          totalVATCollected,
          totalVATRemitted,
          vatOutstanding,
          totalPITDeducted,
          totalPITRemitted,
          pitOutstanding,
          annualTurnover,
          netProfit,
          citRate: rate,
          citTier: tier,
          estimatedCIT,
          citRemitted,
          citOutstanding,
          totalTaxLiability,
          totalTaxRemitted,
          totalTaxOutstanding: totalTaxLiability - totalTaxRemitted,
          totalWHTDeducted,
          totalWHTRemitted,
          whtOutstanding,
          totalPensionDue,
          totalPensionRemitted,
          pensionOutstanding,
          estimatedDevLevy,
          devLevyRemitted,
          devLevyOutstanding,
        });
      } else {
        // Sole proprietor: owner pays PIT on business profit
        const { data: pitSettings } = await supabase
          .from("tax_settings")
          .select("config")
          .eq("organization_id", orgId)
          .eq("tax_type", "pit")
          .eq("is_active", true)
          .single();

        let ownerEstimatedPIT = 0;
        if (pitSettings && netProfit > 0) {
          // Rent relief not applicable to business profit — only to salary income
          ownerEstimatedPIT = calculatePIT(netProfit, pitSettings.config);
        }

        const ownerPITRemittances = remittancesData.filter(
          (r) => r.tax_type === "pit_owner",
        );
        const ownerPITRemitted = ownerPITRemittances.reduce(
          (sum, r) => sum + Number(r.amount_paid),
          0,
        );
        const ownerPITOutstanding = Math.max(
          0,
          ownerEstimatedPIT - ownerPITRemitted,
        );

        const totalTaxLiability =
          totalVATCollected +
          totalPITDeducted +
          ownerEstimatedPIT +
          totalWHTDeducted;
        const totalTaxRemitted =
          totalVATRemitted +
          totalPITRemitted +
          ownerPITRemitted +
          totalWHTRemitted;

        setSummary({
          mode: "business_name",
          totalVATCollected,
          totalVATRemitted,
          vatOutstanding,
          totalPITDeducted,
          totalPITRemitted,
          pitOutstanding,
          ownerNetProfit: netProfit,
          ownerEstimatedPIT,
          ownerPITRemitted,
          ownerPITOutstanding,
          totalTaxLiability,
          totalTaxRemitted,
          totalTaxOutstanding: totalTaxLiability - totalTaxRemitted,
          totalWHTDeducted,
          totalWHTRemitted,
          whtOutstanding,
          totalPensionDue,
          totalPensionRemitted,
          pensionOutstanding,
        });
      }
    } catch (err: any) {
      console.error("Error calculating tax summary:", err);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchData();
  }

  function openAddModal(type: TaxTypeOption) {
    setTaxType(type);
    setAmountPaid("");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setShowAddModal(true);
  }

  async function handleAddRemittance() {
    if (!amountPaid || parseFloat(amountPaid) <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }
    if (!organizationId) return;

    setSaving(true);
    try {
      const date = new Date(paymentDate);
      const periodStart = new Date(date.getFullYear(), date.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];

      const { error } = await supabase.from("tax_remittances").insert({
        organization_id: organizationId,
        tax_type: taxType,
        period_start: periodStart,
        period_end: periodEnd,
        amount_due: parseFloat(amountPaid),
        amount_paid: parseFloat(amountPaid),
        payment_date: paymentDate,
        status: "paid",
        notes: notes.trim() || null,
      });

      if (error) throw error;
      Alert.alert("Success", "Tax remittance recorded successfully");
      setShowAddModal(false);
      fetchData();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRemittance(remittanceId: string) {
    Alert.alert(
      "Delete Remittance",
      "Are you sure you want to delete this tax payment record?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("tax_remittances")
                .delete()
                .eq("id", remittanceId);
              if (error) throw error;
              fetchData();
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ],
    );
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) =>
    (currentYear - i).toString(),
  );

  // Computed here so it always reflects the loaded financialYearEndMonth
  const deadlines = getTaxDeadlines(financialYearEndMonth);

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

  if (!hasPermission("reports.view")) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Tax Dashboard</Text>
          <View style={{ width: 60 }} />
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 40,
          }}
        >
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔐</Text>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "600",
              color: COLORS.primary,
              marginBottom: 8,
            }}
          >
            Access Restricted
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: COLORS.secondary,
              textAlign: "center",
            }}
          >
            You do not have permission to view the tax dashboard.
          </Text>
        </View>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Tax Dashboard</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Year filter */}
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

        {summary && (
          <>
            {/* Overall summary */}
            <View style={styles.overallCard}>
              <Text style={styles.overallTitle}>
                Overall Tax Summary ({selectedYear})
              </Text>
              <View style={styles.overallRow}>
                <Text style={styles.overallLabel}>Total Tax Liability:</Text>
                <Text style={styles.overallValue}>
                  {currency.symbol}
                  {summary.totalTaxLiability.toLocaleString()}
                </Text>
              </View>
              <View style={styles.overallRow}>
                <Text style={styles.overallLabel}>Total Remitted:</Text>
                <Text style={[styles.overallValue, { color: "#86efac" }]}>
                  {currency.symbol}
                  {summary.totalTaxRemitted.toLocaleString()}
                </Text>
              </View>
              <View style={[styles.overallRow, styles.outstandingRow]}>
                <Text style={styles.outstandingLabel}>Outstanding:</Text>
                <Text style={styles.outstandingValue}>
                  {currency.symbol}
                  {summary.totalTaxOutstanding.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Filing deadlines */}
            <View style={styles.deadlineContainer}>
              <Text style={styles.deadlineHeader}>Filing Deadlines</Text>
              {deadlines.map((d) => (
                <View
                  key={d.label}
                  style={[
                    styles.deadlineRow,
                    d.urgency === "overdue" && styles.deadlineOverdue,
                    d.urgency === "soon" && styles.deadlineSoon,
                  ]}
                >
                  <View style={styles.deadlineLeft}>
                    <Text style={styles.deadlineLabel}>{d.label}</Text>
                    <Text style={styles.deadlineDate}>
                      Due{" "}
                      {d.dueDate.toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <View style={styles.deadlineBadge}>
                    {d.urgency === "overdue" ? (
                      <Text style={styles.badgeOverdue}>OVERDUE</Text>
                    ) : d.urgency === "soon" ? (
                      <Text style={styles.badgeSoon}>
                        {d.daysRemaining}d left
                      </Text>
                    ) : (
                      <Text style={styles.badgeOk}>
                        {d.daysRemaining}d left
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* VAT */}
            <View style={styles.taxSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>VAT (7.5%)</Text>
                {hasPermission("tax.manage") && (
                  <TouchableOpacity onPress={() => openAddModal("vat")}>
                    <Text style={styles.recordButton}>+ Record Payment</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.taxCard}>
                <View style={styles.taxRow}>
                  <Text style={styles.taxLabel}>VAT Collected:</Text>
                  <Text style={styles.taxValue}>
                    {currency.symbol}
                    {summary.totalVATCollected.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.taxRow}>
                  <Text style={styles.taxLabel}>VAT Remitted:</Text>
                  <Text style={[styles.taxValue, { color: COLORS.success }]}>
                    {currency.symbol}
                    {summary.totalVATRemitted.toLocaleString()}
                  </Text>
                </View>
                <View style={[styles.taxRow, styles.highlightRow]}>
                  <Text style={styles.taxLabelBold}>Outstanding:</Text>
                  <Text style={styles.taxValueBold}>
                    {currency.symbol}
                    {summary.vatOutstanding.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Employee PAYE */}
            <View style={styles.taxSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Employee PAYE (Payroll)</Text>
                {hasPermission("tax.manage") && (
                  <TouchableOpacity onPress={() => openAddModal("pit")}>
                    <Text style={styles.recordButton}>+ Record Payment</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.taxCard}>
                <View style={styles.taxRow}>
                  <Text style={styles.taxLabel}>PIT Deducted:</Text>
                  <Text style={styles.taxValue}>
                    {currency.symbol}
                    {summary.totalPITDeducted.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.taxRow}>
                  <Text style={styles.taxLabel}>PIT Remitted:</Text>
                  <Text style={[styles.taxValue, { color: COLORS.success }]}>
                    {currency.symbol}
                    {summary.totalPITRemitted.toLocaleString()}
                  </Text>
                </View>
                <View style={[styles.taxRow, styles.highlightRow]}>
                  <Text style={styles.taxLabelBold}>Outstanding:</Text>
                  <Text style={styles.taxValueBold}>
                    {currency.symbol}
                    {summary.pitOutstanding.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* WHT */}
            {summary.totalWHTDeducted > 0 && (
              <View style={styles.taxSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Withholding Tax (WHT)</Text>
                  {hasPermission("tax.manage") && (
                    <TouchableOpacity onPress={() => openAddModal("wht")}>
                      <Text style={styles.recordButton}>+ Record Payment</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.taxCard}>
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>
                      WHT Deducted from Vendors:
                    </Text>
                    <Text style={styles.taxValue}>
                      {currency.symbol}
                      {summary.totalWHTDeducted.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>WHT Remitted to NRS:</Text>
                    <Text style={[styles.taxValue, { color: COLORS.success }]}>
                      {currency.symbol}
                      {summary.totalWHTRemitted.toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.taxRow, styles.highlightRow]}>
                    <Text style={styles.taxLabelBold}>Outstanding:</Text>
                    <Text style={styles.taxValueBold}>
                      {currency.symbol}
                      {summary.whtOutstanding.toLocaleString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    💡 WHT is deducted when paying vendors for rent,
                    professional fees, contracts, and commissions. Remit to the
                    Nigeria Revenue Service (NRS) using the schedule for the
                    relevant period.
                  </Text>
                </View>
              </View>
            )}

            {/* Pension */}
            {summary.totalPensionDue > 0 && (
              <View style={styles.taxSection}>
                <Text style={styles.sectionTitle}>Pension Contributions</Text>
                <View style={styles.taxCard}>
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>
                      Total Due (Employee 8% + Employer 3%):
                    </Text>
                    <Text style={styles.taxValue}>
                      {currency.symbol}
                      {summary.totalPensionDue.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>Remitted to PFA:</Text>
                    <Text style={[styles.taxValue, { color: COLORS.success }]}>
                      {currency.symbol}
                      {summary.totalPensionRemitted.toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.taxRow, styles.highlightRow]}>
                    <Text style={styles.taxLabelBold}>Outstanding:</Text>
                    <Text style={styles.taxValueBold}>
                      {currency.symbol}
                      {summary.pensionOutstanding.toLocaleString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    💡 Pension remittances go to each employee&apos;s chosen
                    PFA, not the NRS. Deadline is 7 days after salary payment
                    under the Pension Reform Act.
                  </Text>
                </View>
              </View>
            )}

            {/* CIT — company mode only */}
            {summary.mode === "registered_company" && (
              <View style={styles.taxSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    Company Income Tax (CIT)
                  </Text>
                  {hasPermission("tax.manage") && (
                    <TouchableOpacity onPress={() => openAddModal("cit")}>
                      <Text style={styles.recordButton}>+ Record Payment</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.taxCard}>
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>Annual Turnover:</Text>
                    <Text style={styles.taxValue}>
                      {currency.symbol}
                      {summary.annualTurnover.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>CIT Tier:</Text>
                    <Text style={styles.taxValue}>{summary.citTier}</Text>
                  </View>
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>Net Profit:</Text>
                    <Text
                      style={[
                        styles.taxValue,
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
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>Estimated CIT:</Text>
                    <Text style={styles.taxValue}>
                      {currency.symbol}
                      {summary.estimatedCIT.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>CIT Remitted:</Text>
                    <Text style={[styles.taxValue, { color: COLORS.success }]}>
                      {currency.symbol}
                      {summary.citRemitted.toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.taxRow, styles.highlightRow]}>
                    <Text style={styles.taxLabelBold}>Outstanding:</Text>
                    <Text style={styles.taxValueBold}>
                      {currency.symbol}
                      {summary.citOutstanding.toLocaleString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    💡 Under the Nigeria Tax Act 2025 (effective April 2026):
                    small companies with turnover ≤ ₦50M AND fixed assets ≤
                    ₦250M are fully exempt from CIT. All others pay 30%. The
                    minimum tax rule has been abolished. File annually via the
                    NRS portal. Consult a tax professional to confirm your
                    classification.
                  </Text>
                </View>
              </View>
            )}

            {/* Development Levy — company mode, large companies only */}
            {summary.mode === "registered_company" &&
              summary.estimatedDevLevy > 0 && (
                <View style={styles.taxSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                      Development Levy (4%)
                    </Text>
                    {hasPermission("tax.manage") && (
                      <TouchableOpacity
                        onPress={() => openAddModal("dev_levy")}
                      >
                        <Text style={styles.recordButton}>
                          + Record Payment
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.taxCard}>
                    <View style={styles.taxRow}>
                      <Text style={styles.taxLabel}>
                        Estimated Levy (4% of profit):
                      </Text>
                      <Text style={styles.taxValue}>
                        {currency.symbol}
                        {summary.estimatedDevLevy.toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.taxRow}>
                      <Text style={styles.taxLabel}>Remitted:</Text>
                      <Text
                        style={[styles.taxValue, { color: COLORS.success }]}
                      >
                        {currency.symbol}
                        {summary.devLevyRemitted.toLocaleString()}
                      </Text>
                    </View>
                    <View style={[styles.taxRow, styles.highlightRow]}>
                      <Text style={styles.taxLabelBold}>Outstanding:</Text>
                      <Text style={styles.taxValueBold}>
                        {currency.symbol}
                        {summary.devLevyOutstanding.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoText}>
                      💡 The Development Levy (4% of assessable profit) replaces
                      the Tertiary Education Tax, NITDA Levy, NASENI Levy, and
                      Police Trust Fund Levy under the Nigeria Tax Act 2025.
                      Exempt for small companies (turnover ≤ ₦50M). Filed
                      alongside CIT, effective April 2026.
                    </Text>
                  </View>
                </View>
              )}

            {/* Owner PIT — business name mode only */}
            {summary.mode === "business_name" && (
              <View style={styles.taxSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    Owner&apos;s Personal Income Tax
                  </Text>
                  {hasPermission("tax.manage") && (
                    <TouchableOpacity onPress={() => openAddModal("pit_owner")}>
                      <Text style={styles.recordButton}>+ Record Payment</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.taxCard}>
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>Net Profit:</Text>
                    <Text
                      style={[
                        styles.taxValue,
                        {
                          color:
                            summary.ownerNetProfit >= 0
                              ? COLORS.success
                              : COLORS.danger,
                        },
                      ]}
                    >
                      {currency.symbol}
                      {summary.ownerNetProfit.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>Estimated PIT:</Text>
                    <Text style={styles.taxValue}>
                      {currency.symbol}
                      {summary.ownerEstimatedPIT.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.taxRow}>
                    <Text style={styles.taxLabel}>PIT Remitted:</Text>
                    <Text style={[styles.taxValue, { color: COLORS.success }]}>
                      {currency.symbol}
                      {summary.ownerPITRemitted.toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.taxRow, styles.highlightRow]}>
                    <Text style={styles.taxLabelBold}>Outstanding:</Text>
                    <Text style={styles.taxValueBold}>
                      {currency.symbol}
                      {summary.ownerPITOutstanding.toLocaleString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    💡 As a sole proprietor, you pay PIT on your business profit
                    during annual tax filing. The first ₦800,000 is exempt.
                    Rates: 15% → 18% → 21% → 23% → 25% progressively. File by
                    January 31st each year via the NRS portal.
                  </Text>
                </View>
              </View>
            )}

            {/* Payment history */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment History</Text>
              {remittances.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>📋</Text>
                  <Text style={styles.emptyText}>No tax payments recorded</Text>
                </View>
              )}
              {remittances.map((remittance) => (
                <View key={remittance.id} style={styles.remittanceCard}>
                  <View style={styles.remittanceHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.remittanceTypeRow}>
                        <Text style={styles.remittanceType}>
                          {remittance.tax_type.toUpperCase()}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: COLORS.success },
                          ]}
                        >
                          <Text style={styles.statusText}>PAID</Text>
                        </View>
                      </View>
                      <Text style={styles.remittanceAmount}>
                        {currency.symbol}
                        {Number(remittance.amount_paid).toLocaleString()}
                      </Text>
                      <Text style={styles.remittancePeriod}>
                        Period:{" "}
                        {new Date(remittance.period_start).toLocaleDateString()}{" "}
                        — {new Date(remittance.period_end).toLocaleDateString()}
                      </Text>
                      {remittance.payment_date && (
                        <Text style={styles.remittanceDate}>
                          Paid:{" "}
                          {new Date(
                            remittance.payment_date,
                          ).toLocaleDateString()}
                        </Text>
                      )}
                      {remittance.notes && (
                        <Text style={styles.remittanceNotes}>
                          {remittance.notes}
                        </Text>
                      )}
                    </View>
                    {hasPermission("tax.manage") && (
                      <TouchableOpacity
                        onPress={() => handleDeleteRemittance(remittance.id)}
                      >
                        <Text style={styles.deleteIcon}>🗑</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Remittance Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Tax Payment</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Tax Type</Text>
                <View style={styles.radioGroup}>
                  {(["vat", "wht", "pit"] as TaxTypeOption[]).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.radioButton,
                        taxType === type && styles.radioButtonActive,
                      ]}
                      onPress={() => setTaxType(type)}
                    >
                      <Text
                        style={[
                          styles.radioText,
                          taxType === type && styles.radioTextActive,
                        ]}
                      >
                        {type === "pit"
                          ? company
                            ? "PAYE"
                            : "Emp. PIT"
                          : type.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {company ? (
                    <>
                      <TouchableOpacity
                        style={[
                          styles.radioButton,
                          taxType === "cit" && styles.radioButtonActive,
                        ]}
                        onPress={() => setTaxType("cit")}
                      >
                        <Text
                          style={[
                            styles.radioText,
                            taxType === "cit" && styles.radioTextActive,
                          ]}
                        >
                          CIT
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.radioButton,
                          taxType === "dev_levy" && styles.radioButtonActive,
                        ]}
                        onPress={() => setTaxType("dev_levy")}
                      >
                        <Text
                          style={[
                            styles.radioText,
                            taxType === "dev_levy" && styles.radioTextActive,
                          ]}
                        >
                          Dev Levy
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.radioButton,
                        taxType === "pit_owner" && styles.radioButtonActive,
                      ]}
                      onPress={() => setTaxType("pit_owner")}
                    >
                      <Text
                        style={[
                          styles.radioText,
                          taxType === "pit_owner" && styles.radioTextActive,
                        ]}
                      >
                        Owner PIT
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Amount Paid ({currency.symbol}){" "}
                  <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={amountPaid}
                  onChangeText={setAmountPaid}
                  placeholder="50000"
                  keyboardType="decimal-pad"
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Payment Date</Text>
                <TextInput
                  style={styles.input}
                  value={paymentDate}
                  onChangeText={setPaymentDate}
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
                  placeholder="Payment reference, receipt number, etc."
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
                onPress={handleAddRemittance}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.submitButtonText}>Record Payment</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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
  overallCard: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  overallTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 12,
  },
  overallRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  overallLabel: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  overallValue: { fontSize: 14, fontWeight: "600", color: COLORS.white },
  outstandingRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.3)",
  },
  outstandingLabel: { fontSize: 15, fontWeight: "600", color: COLORS.white },
  outstandingValue: { fontSize: 18, fontWeight: "bold", color: COLORS.white },
  deadlineContainer: { marginBottom: 24 },
  deadlineHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  deadlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.border,
  },
  deadlineOverdue: {
    borderLeftColor: COLORS.danger,
    backgroundColor: "rgba(220,53,69,0.08)",
  },
  deadlineSoon: {
    borderLeftColor: COLORS.warning,
    backgroundColor: "rgba(201,146,42,0.08)",
  },
  deadlineLeft: { flex: 1 },
  deadlineLabel: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  deadlineDate: { fontSize: 12, color: COLORS.accent, marginTop: 2 },
  deadlineBadge: { marginLeft: 12 },
  badgeOverdue: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.danger,
    letterSpacing: 0.5,
  },
  badgeSoon: { fontSize: 12, fontWeight: "600", color: COLORS.warning },
  badgeOk: { fontSize: 12, color: COLORS.accent },
  taxSection: { marginBottom: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  recordButton: { fontSize: 13, fontWeight: "600", color: COLORS.accent },
  taxCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  taxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  taxLabel: { fontSize: 14, color: COLORS.secondary },
  taxValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  highlightRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  taxLabelBold: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  taxValueBold: { fontSize: 16, fontWeight: "bold", color: COLORS.danger },
  infoBox: {
    backgroundColor: "#E8F4FD",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  infoText: { fontSize: 12, color: "#1565C0", lineHeight: 18 },
  section: { marginBottom: 16 },
  remittanceCard: {
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
  remittanceHeader: { flexDirection: "row", justifyContent: "space-between" },
  remittanceTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  remittanceType: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.accent,
    marginRight: 8,
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 9, fontWeight: "700", color: COLORS.white },
  remittanceAmount: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 4,
  },
  remittancePeriod: { fontSize: 12, color: COLORS.secondary, marginBottom: 2 },
  remittanceDate: { fontSize: 12, color: COLORS.secondary, marginBottom: 2 },
  remittanceNotes: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 4,
    fontStyle: "italic",
  },
  deleteIcon: { fontSize: 20 },
  emptyState: { padding: 32, alignItems: "center" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: COLORS.secondary },
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
  formGroup: { marginBottom: 20 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
  },
  required: { color: COLORS.danger },
  radioGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  radioButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  radioButtonActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  radioText: { fontSize: 13, fontWeight: "600", color: COLORS.secondary },
  radioTextActive: { color: COLORS.white },
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
