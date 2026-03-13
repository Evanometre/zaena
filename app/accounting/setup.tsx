// app/accounting/setup.tsx
// Accounting Module Activation Wizard
// 3 steps: Choose template → Enter opening balances → Confirm & activate
// Called once per org. After activation, redirects to chart-of-accounts.

import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuthStore } from "../../stores/authStore";

// ─── Design tokens ────────────────────────────────────────────
const D = {
  teal: "#0E2931",
  tealMid: "#1A3D4A",
  tealLight: "#2A5568",
  gold: "#C9922A",
  goldLight: "#E8B84B",
  paper: "#F5F0E8",
  paperDeep: "#EDE7D9",
  ink: "#1A1008",
  inkMid: "#3D2E1A",
  inkDim: "#7A6A52",
  inkGhost: "#B8A98C",
  rule: "#D4C9B0",
  white: "#FFFFFF",
  green: "#1A6B4A",
  red: "#8B2020",
};

// ─── Opening balance fields ────────────────────────────────────
const OPENING_FIELDS = [
  {
    code: "1101",
    label: "Cash in Hand",
    hint: "Physical cash at your premises",
  },
  {
    code: "1102",
    label: "Cash at Bank",
    hint: "Total across all bank accounts",
  },
  {
    code: "1103",
    label: "POS Float",
    hint: "Funds in POS terminal settlement",
  },
  { code: "1104", label: "Mobile Wallet", hint: "OPay, Palmpay, etc." },
  {
    code: "1201",
    label: "Money Owed to You",
    hint: "Outstanding customer balances",
  },
  {
    code: "1301",
    label: "Stock Value",
    hint: "Total value of inventory on hand",
  },
  {
    code: "2101",
    label: "You Owe Suppliers",
    hint: "Unpaid supplier invoices",
  },
  {
    code: "2501",
    label: "Loans Outstanding",
    hint: "Bank loans and borrowings",
  },
];

type BalanceMap = Record<string, string>;

export default function AccountingSetup() {
  const { organizationId } = useAuthStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [template, setTemplate] = useState<"nigeria_ican" | "blank">(
    "nigeria_ican",
  );
  const [businessType, setBusinessType] = useState<string>("business_name");

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("organizations")
      .select("business_type")
      .eq("id", organizationId)
      .single()
      .then(({ data }) => {
        if (data?.business_type) setBusinessType(data.business_type);
      });
  }, [organizationId]);
  const [fiscalMonth, setFiscalMonth] = useState(1);
  const [balances, setBalances] = useState<BalanceMap>({});
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateStep = (nextStep: 1 | 2 | 3) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
    setStep(nextStep);
  };

  const handleBalance = (code: string, value: string) => {
    // Strip non-numeric except decimal
    const clean = value.replace(/[^0-9.]/g, "");
    setBalances((prev) => ({ ...prev, [code]: clean }));
  };

  const buildOpeningBalances = (): Record<string, number> => {
    const result: Record<string, number> = {};
    OPENING_FIELDS.forEach((f) => {
      const v = parseFloat(balances[f.code] || "0");
      if (v > 0) result[f.code] = v;
    });
    return result;
  };

  const computeSummary = () => {
    const ob = buildOpeningBalances();
    const assets =
      (ob["1101"] || 0) +
      (ob["1102"] || 0) +
      (ob["1103"] || 0) +
      (ob["1104"] || 0) +
      (ob["1201"] || 0) +
      (ob["1301"] || 0);
    const liabs = (ob["2101"] || 0) + (ob["2501"] || 0);
    const equity = assets - liabs;
    return { assets, liabs, equity };
  };

  const handleActivate = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const ob = buildOpeningBalances();
      const { data, error } = await supabase.rpc("activate_accounting", {
        p_org_id: organizationId,
        p_activation_date: new Date().toISOString().split("T")[0],
        p_opening_balances: ob,
        p_coa_template: template,
      });
      if (error) throw error;
      Alert.alert(
        "Accounting Activated",
        "Your books are open. Opening entry has been posted.",
        [
          {
            text: "View Chart of Accounts",
            onPress: () => router.replace("/accounting/chart-of-accounts"),
          },
        ],
      );
    } catch (err: any) {
      Alert.alert("Activation Failed", err.message || "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const { assets, liabs, equity } = computeSummary();
  const fmt = (n: number) =>
    n.toLocaleString("en-NG", { minimumFractionDigits: 0 });
  const capitalLabel =
    businessType === "registered_company" ? "Share Capital" : "Owner's Capital";
  const drawingsLabel =
    businessType === "registered_company"
      ? "Dividends Paid"
      : "Owner's Drawings";

  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={s.root}>
        {/* ── Top bar ── */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>ACCOUNTING SETUP</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* ── Step indicator ── */}
        <View style={s.stepRow}>
          {[1, 2, 3].map((n) => (
            <React.Fragment key={n}>
              <View style={[s.stepDot, step >= n && s.stepDotActive]}>
                <Text style={[s.stepNum, step >= n && s.stepNumActive]}>
                  {n}
                </Text>
              </View>
              {n < 3 && (
                <View style={[s.stepLine, step > n && s.stepLineActive]} />
              )}
            </React.Fragment>
          ))}
        </View>

        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ══════════════════ STEP 1 ══════════════════ */}
            {step === 1 && (
              <View style={s.stepContent}>
                <Text style={s.stepLabel}>STEP 1 OF 3</Text>
                <Text style={s.stepTitle}>Choose Your Setup</Text>
                <Text style={s.stepSub}>
                  Select a chart of accounts template. The Nigeria ICAN template
                  includes 60+ pre-configured accounts aligned to Nigerian
                  accounting standards.
                </Text>

                {/* Template cards */}
                <TouchableOpacity
                  style={[
                    s.templateCard,
                    template === "nigeria_ican" && s.templateCardActive,
                  ]}
                  onPress={() => setTemplate("nigeria_ican")}
                  activeOpacity={0.85}
                >
                  <View style={s.templateHeader}>
                    <View
                      style={[
                        s.radioOuter,
                        template === "nigeria_ican" && s.radioOuterActive,
                      ]}
                    >
                      {template === "nigeria_ican" && (
                        <View style={s.radioInner} />
                      )}
                    </View>
                    <Text
                      style={[
                        s.templateName,
                        template === "nigeria_ican" && s.templateNameActive,
                      ]}
                    >
                      Nigeria ICAN Standard
                    </Text>
                    <View style={s.templateBadge}>
                      <Text style={s.templateBadgeText}>RECOMMENDED</Text>
                    </View>
                  </View>
                  <Text style={s.templateDesc}>
                    Pre-loaded with ICAN-aligned account codes. Covers assets,
                    liabilities, equity, income, cost of sales, operating
                    expenses, and tax accounts. Mapped to Nigerian tax law
                    including VAT, PAYE, CIT, and Development Levy.
                  </Text>
                  <View style={s.templateMeta}>
                    <Text style={s.templateMetaText}>
                      60+ accounts · FIRS-aligned · IFRS for SMEs
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    s.templateCard,
                    template === "blank" && s.templateCardActive,
                  ]}
                  onPress={() => setTemplate("blank")}
                  activeOpacity={0.85}
                >
                  <View style={s.templateHeader}>
                    <View
                      style={[
                        s.radioOuter,
                        template === "blank" && s.radioOuterActive,
                      ]}
                    >
                      {template === "blank" && <View style={s.radioInner} />}
                    </View>
                    <Text
                      style={[
                        s.templateName,
                        template === "blank" && s.templateNameActive,
                      ]}
                    >
                      Blank Chart of Accounts
                    </Text>
                  </View>
                  <Text style={s.templateDesc}>
                    Start with an empty chart of accounts and build your own
                    structure. Recommended for accountants who prefer full
                    control.
                  </Text>
                </TouchableOpacity>

                {/* Fiscal year */}
                <View style={s.section}>
                  <Text style={s.sectionLabel}>FINANCIAL YEAR START</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={s.monthScroll}
                  >
                    {MONTHS.map((m, i) => (
                      <TouchableOpacity
                        key={m}
                        style={[
                          s.monthChip,
                          fiscalMonth === i + 1 && s.monthChipActive,
                        ]}
                        onPress={() => setFiscalMonth(i + 1)}
                      >
                        <Text
                          style={[
                            s.monthText,
                            fiscalMonth === i + 1 && s.monthTextActive,
                          ]}
                        >
                          {m.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={s.hint}>
                    Most Nigerian businesses use January. Change if your fiscal
                    year starts differently.
                  </Text>
                </View>

                <TouchableOpacity
                  style={s.primaryBtn}
                  onPress={() => animateStep(2)}
                >
                  <Text style={s.primaryBtnText}>Continue →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ══════════════════ STEP 2 ══════════════════ */}
            {step === 2 && (
              <View style={s.stepContent}>
                <Text style={s.stepLabel}>STEP 2 OF 3</Text>
                <Text style={s.stepTitle}>Opening Balances</Text>
                <Text style={s.stepSub}>
                  Enter what your business currently has and owes as of today.
                  Leave fields blank if they don&apos;t apply. You can adjust
                  these later through manual journal entries.
                </Text>

                <View style={s.balanceGroup}>
                  <Text style={s.balanceGroupLabel}>WHAT YOU HAVE</Text>
                  {OPENING_FIELDS.filter((f) => f.code.startsWith("1")).map(
                    (f) => (
                      <View key={f.code} style={s.balanceRow}>
                        <View style={s.balanceLabelCol}>
                          <Text style={s.balanceLabel}>{f.label}</Text>
                          <Text style={s.balanceHint}>{f.hint}</Text>
                        </View>
                        <View style={s.balanceInputWrap}>
                          <Text style={s.balanceCurrency}>₦</Text>
                          <TextInput
                            style={s.balanceInput}
                            value={balances[f.code] || ""}
                            onChangeText={(v) => handleBalance(f.code, v)}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={D.inkGhost}
                          />
                        </View>
                      </View>
                    ),
                  )}
                </View>

                <View style={[s.balanceGroup, { marginTop: 16 }]}>
                  <Text style={s.balanceGroupLabel}>WHAT YOU OWE</Text>
                  {OPENING_FIELDS.filter((f) => f.code.startsWith("2")).map(
                    (f) => (
                      <View key={f.code} style={s.balanceRow}>
                        <View style={s.balanceLabelCol}>
                          <Text style={s.balanceLabel}>{f.label}</Text>
                          <Text style={s.balanceHint}>{f.hint}</Text>
                        </View>
                        <View style={s.balanceInputWrap}>
                          <Text style={s.balanceCurrency}>₦</Text>
                          <TextInput
                            style={s.balanceInput}
                            value={balances[f.code] || ""}
                            onChangeText={(v) => handleBalance(f.code, v)}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={D.inkGhost}
                          />
                        </View>
                      </View>
                    ),
                  )}
                </View>

                {/* Live equity preview */}
                <View style={s.equityPreview}>
                  <View style={s.equityRow}>
                    <Text style={s.equityLabel}>Total Assets</Text>
                    <Text style={s.equityValue}>₦{fmt(assets)}</Text>
                  </View>
                  <View style={s.equityRow}>
                    <Text style={s.equityLabel}>Total Liabilities</Text>
                    <Text style={[s.equityValue, { color: D.red }]}>
                      ₦{fmt(liabs)}
                    </Text>
                  </View>
                  <View style={s.equityDivider} />
                  <View style={s.equityRow}>
                    <Text style={s.equityLabelBold}>Opening Equity</Text>
                    <Text
                      style={[
                        s.equityValueBold,
                        { color: equity >= 0 ? D.green : D.red },
                      ]}
                    >
                      ₦{fmt(equity)}
                    </Text>
                  </View>
                  <Text style={s.equityNote}>
                    This will be posted as your {capitalLabel} opening balance.
                  </Text>
                </View>

                <View style={s.btnRow}>
                  <TouchableOpacity
                    style={s.secondaryBtn}
                    onPress={() => animateStep(1)}
                  >
                    <Text style={s.secondaryBtnText}>← Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.primaryBtn, { flex: 1 }]}
                    onPress={() => animateStep(3)}
                  >
                    <Text style={s.primaryBtnText}>Review →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ══════════════════ STEP 3 ══════════════════ */}
            {step === 3 && (
              <View style={s.stepContent}>
                <Text style={s.stepLabel}>STEP 3 OF 3</Text>
                <Text style={s.stepTitle}>Review & Activate</Text>
                <Text style={s.stepSub}>
                  Once activated, Zaena will automatically record journal
                  entries for every transaction going forward. Review your setup
                  below.
                </Text>

                {/* Summary card */}
                <View style={s.summaryCard}>
                  <View style={s.summaryRow}>
                    <Text style={s.summaryKey}>Template</Text>
                    <Text style={s.summaryVal}>
                      {template === "nigeria_ican"
                        ? "Nigeria ICAN Standard"
                        : "Blank"}
                    </Text>
                  </View>
                  <View style={s.summaryRow}>
                    <Text style={s.summaryKey}>Fiscal Year Start</Text>
                    <Text style={s.summaryVal}>{MONTHS[fiscalMonth - 1]}</Text>
                  </View>
                  <View style={s.summaryRow}>
                    <Text style={s.summaryKey}>Activation Date</Text>
                    <Text style={s.summaryVal}>
                      {new Date().toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <View style={[s.summaryRow, { borderBottomWidth: 0 }]}>
                    <Text style={s.summaryKey}>Opening {capitalLabel}</Text>
                    <Text
                      style={[
                        s.summaryVal,
                        {
                          color: equity >= 0 ? D.green : D.red,
                          fontWeight: "700",
                        },
                      ]}
                    >
                      ₦{fmt(equity)}
                    </Text>
                  </View>
                </View>

                {/* What happens next */}
                <View style={s.whatNext}>
                  <Text style={s.whatNextTitle}>WHAT HAPPENS NEXT</Text>
                  {[
                    "An opening journal entry will be posted with your balances",
                    "All future sales, expenses, purchases and payroll will be automatically journalised",
                    "Your Chart of Accounts, Ledger, and Financial Statements will be available immediately",
                    "Historical transactions before today are not affected",
                  ].map((item, i) => (
                    <View key={i} style={s.whatNextRow}>
                      <Text style={s.whatNextBullet}>◆</Text>
                      <Text style={s.whatNextText}>{item}</Text>
                    </View>
                  ))}
                </View>

                {/* Warning */}
                <View style={s.warningBox}>
                  <Text style={s.warningText}>
                    Activation cannot be undone. Ensure your opening balances
                    are correct before proceeding. You can adjust individual
                    account balances through manual journal entries after
                    activation.
                  </Text>
                </View>

                <View style={s.btnRow}>
                  <TouchableOpacity
                    style={s.secondaryBtn}
                    onPress={() => animateStep(2)}
                  >
                    <Text style={s.secondaryBtnText}>← Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.activateBtn, loading && { opacity: 0.7 }]}
                    onPress={handleActivate}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color={D.white} />
                    ) : (
                      <Text style={s.activateBtnText}>Activate Accounting</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: D.teal,
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  backArrow: { color: D.gold, fontSize: 22, fontFamily: "Cormorant Garamond" },
  topTitle: {
    color: D.white,
    fontSize: 13,
    fontFamily: "DM Mono",
    letterSpacing: 2,
  },

  // Step indicator
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    backgroundColor: D.paperDeep,
    borderBottomWidth: 1,
    borderBottomColor: D.rule,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: D.rule,
    backgroundColor: D.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { borderColor: D.gold, backgroundColor: D.teal },
  stepNum: { fontSize: 13, fontFamily: "DM Mono", color: D.inkGhost },
  stepNumActive: { color: D.gold },
  stepLine: { width: 48, height: 2, backgroundColor: D.rule },
  stepLineActive: { backgroundColor: D.gold },

  // Scroll
  scroll: { paddingBottom: 48 },
  stepContent: { padding: 24 },
  stepLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: D.gold,
    marginBottom: 6,
  },
  stepTitle: {
    fontSize: 26,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.ink,
    marginBottom: 8,
  },
  stepSub: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
    lineHeight: 22,
    marginBottom: 24,
  },

  // Template cards
  templateCard: {
    backgroundColor: D.white,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: D.rule,
    padding: 16,
    marginBottom: 12,
  },
  templateCardActive: { borderColor: D.gold, backgroundColor: "#FFFBF4" },
  templateHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: D.rule,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: { borderColor: D.gold },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: D.gold,
  },
  templateName: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.inkMid,
  },
  templateNameActive: { color: D.teal },
  templateBadge: {
    backgroundColor: D.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  templateBadgeText: {
    fontSize: 9,
    fontFamily: "DM Mono",
    color: D.white,
    letterSpacing: 1,
  },
  templateDesc: {
    fontSize: 13,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
    lineHeight: 20,
  },
  templateMeta: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: D.rule,
  },
  templateMetaText: {
    fontSize: 11,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 0.5,
  },

  // Fiscal month
  section: { marginTop: 24 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: D.inkDim,
    marginBottom: 12,
  },
  monthScroll: { marginBottom: 8 },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: D.rule,
    marginRight: 8,
    backgroundColor: D.white,
  },
  monthChipActive: { backgroundColor: D.teal, borderColor: D.teal },
  monthText: { fontSize: 12, fontFamily: "DM Mono", color: D.inkDim },
  monthTextActive: { color: D.gold },
  hint: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
  },

  // Balance fields
  balanceGroup: {
    backgroundColor: D.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.rule,
    overflow: "hidden",
  },
  balanceGroupLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: D.gold,
    backgroundColor: D.teal,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: D.rule,
  },
  balanceLabelCol: { flex: 1 },
  balanceLabel: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    fontWeight: "600",
    color: D.ink,
  },
  balanceHint: {
    fontSize: 11,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
  },
  balanceInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: D.rule,
    borderRadius: 2,
    paddingHorizontal: 10,
    backgroundColor: D.paper,
    minWidth: 120,
  },
  balanceCurrency: {
    fontSize: 14,
    fontFamily: "DM Mono",
    color: D.inkDim,
    marginRight: 4,
  },
  balanceInput: {
    fontSize: 15,
    fontFamily: "DM Mono",
    color: D.ink,
    paddingVertical: 8,
    minWidth: 80,
    textAlign: "right",
  },

  // Equity preview
  equityPreview: {
    marginTop: 20,
    backgroundColor: D.teal,
    borderRadius: 4,
    padding: 16,
  },
  equityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  equityLabel: {
    fontSize: 13,
    fontFamily: "Cormorant Garamond",
    color: "#9BB5BE",
  },
  equityValue: { fontSize: 15, fontFamily: "DM Mono", color: D.white },
  equityDivider: { height: 1, backgroundColor: "#2A5568", marginVertical: 8 },
  equityLabelBold: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.white,
  },
  equityValueBold: { fontSize: 18, fontFamily: "DM Mono" },
  equityNote: {
    fontSize: 11,
    fontFamily: "Cormorant Garamond",
    color: "#6A9AAA",
    fontStyle: "italic",
    marginTop: 8,
  },

  // Summary card
  summaryCard: {
    backgroundColor: D.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.rule,
    marginBottom: 20,
    overflow: "hidden",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: D.rule,
  },
  summaryKey: { fontSize: 12, fontFamily: "DM Mono", color: D.inkDim },
  summaryVal: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    fontWeight: "600",
    color: D.ink,
  },

  // What next
  whatNext: {
    backgroundColor: D.paperDeep,
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  whatNextTitle: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: D.inkDim,
    marginBottom: 12,
  },
  whatNextRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  whatNextBullet: { fontSize: 8, color: D.gold, marginTop: 4 },
  whatNextText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Cormorant Garamond",
    color: D.inkMid,
    lineHeight: 19,
  },

  // Warning
  warningBox: {
    borderWidth: 1,
    borderColor: "#C9922A40",
    backgroundColor: "#FFFBF0",
    borderRadius: 4,
    padding: 14,
    marginBottom: 20,
  },
  warningText: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
    lineHeight: 18,
    fontStyle: "italic",
  },

  // Buttons
  btnRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  primaryBtn: {
    backgroundColor: D.teal,
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  primaryBtnText: {
    fontSize: 13,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 1,
  },
  secondaryBtn: {
    backgroundColor: D.paper,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.rule,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  secondaryBtnText: { fontSize: 13, fontFamily: "DM Mono", color: D.inkDim },
  activateBtn: {
    flex: 1,
    backgroundColor: D.gold,
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: "center",
  },
  activateBtnText: {
    fontSize: 13,
    fontFamily: "DM Mono",
    color: D.white,
    letterSpacing: 1,
  },
});
