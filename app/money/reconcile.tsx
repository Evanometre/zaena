// app/money/reconcile.tsx
// Reconciliation screen
// User selects account, enters actual balance, system shows variance.
// On confirm: saves reconciliation, posts journal entry if accounting active.

import { supabase } from "@/lib/supabase";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const D = {
  teal: "#0E2931",
  tealMid: "#1A3D4A",
  gold: "#C9922A",
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

type FinancialAccount = {
  id: string;
  name: string;
  account_type: string;
};

const ACCOUNT_TYPE_ICONS: Record<string, string> = {
  cash: "◈",
  bank: "⬡",
  pos: "▣",
  mobile: "◉",
};

const VARIANCE_EXPLANATIONS = [
  "Counted correctly, books were wrong",
  "Forgot to record a sale",
  "Forgot to record an expense",
  "Cash given to staff not recorded",
  "Bank charges not recorded",
  "Transfer between accounts not recorded",
  "Rounding difference",
  "Other",
];

export default function Reconcile() {
  const { organizationId, user } = useAuthStore();
  const params = useLocalSearchParams<{
    accountId?: string;
    accountName?: string;
    accountType?: string;
    bookBalance?: string;
  }>();

  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [selectedId, setSelectedId] = useState(params.accountId ?? "");
  const [selectedName, setSelectedName] = useState(params.accountName ?? "");
  const [bookBalance, setBookBalance] = useState(
    params.bookBalance ? parseFloat(params.bookBalance) : 0,
  );
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [actualInput, setActualInput] = useState("");
  const [explanation, setExplanation] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reconResult, setReconResult] = useState<any>(null);

  // Load accounts if no accountId passed in
  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("financial_accounts")
      .select("id, name, account_type")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) setAccounts(data);
      });
  }, [organizationId]);

  // Load book balance when account changes
  const loadBookBalance = useCallback(
    async (acctId: string) => {
      if (!organizationId || !acctId) return;
      setLoadingBalance(true);
      const { data } = await supabase.rpc("get_account_book_balance", {
        p_account_id: acctId,
        p_org_id: organizationId,
      });
      if (data !== null) setBookBalance(parseFloat(data) || 0);
      setLoadingBalance(false);
    },
    [organizationId],
  );

  useEffect(() => {
    if (selectedId && !params.bookBalance) {
      loadBookBalance(selectedId);
    }
  }, [selectedId]);

  const actualBalance = parseFloat(actualInput) || 0;
  const variance = actualBalance - bookBalance;
  const hasInput = actualInput.length > 0;
  const isBalanced = hasInput && Math.abs(variance) < 0.01;

  const fmt = (n: number) =>
    Math.abs(n).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleSelectAccount = (acct: FinancialAccount) => {
    setSelectedId(acct.id);
    setSelectedName(acct.name);
    setActualInput("");
    setExplanation("");
  };

  const handleConfirm = async () => {
    if (!selectedId) {
      Alert.alert("Select Account", "Please select an account to reconcile.");
      return;
    }
    if (!hasInput) {
      Alert.alert(
        "Enter Balance",
        "Please enter the actual balance you counted.",
      );
      return;
    }
    if (!isBalanced && !explanation.trim()) {
      Alert.alert(
        "Explain Variance",
        "There is a variance between your book and actual balance. Please explain it.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("confirm_reconciliation", {
        p_org_id: organizationId,
        p_account_id: selectedId,
        p_actual_balance: actualBalance,
        p_variance_explanation: explanation.trim() || null,
        p_notes: notes.trim() || null,
        p_created_by: user ?? null,
      });

      if (error) throw error;

      setReconResult({
        id: data,
        bookBalance,
        actualBalance,
        variance,
        isBalanced,
        accountName: selectedName,
      });
      setConfirmed(true);
    } catch (err: any) {
      Alert.alert("Reconciliation Failed", err.message || "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────
  if (confirmed && reconResult) {
    return (
      <View style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>RECONCILIATION</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={s.successScroll}>
          <View style={s.successIcon}>
            <Text style={s.successIconText}>
              {reconResult.isBalanced ? "✓" : "⚠"}
            </Text>
          </View>

          <Text style={s.successTitle}>
            {reconResult.isBalanced ? "Reconciled" : "Reconciled with Variance"}
          </Text>
          <Text style={s.successSub}>
            {reconResult.isBalanced
              ? `${reconResult.accountName} is balanced. Your books match reality.`
              : `${reconResult.accountName} has been reconciled. A journal entry has been posted for the variance.`}
          </Text>

          {/* Result card */}
          <View style={s.resultCard}>
            <View style={s.resultRow}>
              <Text style={s.resultKey}>Book Balance</Text>
              <Text style={s.resultVal}>₦{fmt(reconResult.bookBalance)}</Text>
            </View>
            <View style={s.resultRow}>
              <Text style={s.resultKey}>Actual Balance</Text>
              <Text style={s.resultVal}>₦{fmt(reconResult.actualBalance)}</Text>
            </View>
            <View style={[s.resultRow, { borderBottomWidth: 0 }]}>
              <Text style={s.resultKey}>Variance</Text>
              <Text
                style={[
                  s.resultVal,
                  {
                    color:
                      Math.abs(reconResult.variance) < 0.01
                        ? D.green
                        : reconResult.variance > 0
                          ? D.green
                          : D.red,
                    fontWeight: "700",
                  },
                ]}
              >
                {Math.abs(reconResult.variance) < 0.01
                  ? "₦0.00 — Balanced"
                  : `${reconResult.variance > 0 ? "+" : "-"}₦${fmt(reconResult.variance)}`}
              </Text>
            </View>
          </View>

          {!reconResult.isBalanced && (
            <View style={s.varianceNote}>
              <Text style={s.varianceNoteText}>
                The variance has been posted as an adjustment entry in your
                journal. Your book balance now matches your actual balance.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={s.doneBtn}
            onPress={() => router.replace("/money" as any)}
          >
            <Text style={s.doneBtnText}>Back to Money Register</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.journalBtn}
            onPress={() => router.push("/accounting/journal" as any)}
          >
            <Text style={s.journalBtnText}>View Journal Entry →</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Main reconciliation form ────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={s.root}>
        {/* Top bar */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>RECONCILE ACCOUNT</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Explainer */}
          <View style={s.explainer}>
            <Text style={s.explainerText}>
              Count your physical cash or check your bank statement. Enter the
              actual balance you see. Zaena will compare it to the book balance
              and record the difference.
            </Text>
          </View>

          {/* Account selector (only shown if no account pre-selected) */}
          {!params.accountId && (
            <>
              <Text style={s.sectionLabel}>SELECT ACCOUNT</Text>
              <View style={s.accountGrid}>
                {accounts.map((acct) => (
                  <TouchableOpacity
                    key={acct.id}
                    style={[
                      s.accountChip,
                      selectedId === acct.id && s.accountChipActive,
                    ]}
                    onPress={() => handleSelectAccount(acct)}
                  >
                    <Text style={s.accountChipIcon}>
                      {ACCOUNT_TYPE_ICONS[acct.account_type] ?? "◈"}
                    </Text>
                    <Text
                      style={[
                        s.accountChipText,
                        selectedId === acct.id && s.accountChipTextActive,
                      ]}
                    >
                      {acct.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Selected account + book balance */}
          {selectedId && (
            <>
              <Text style={s.sectionLabel}>BOOK BALANCE</Text>
              <View style={s.bookBalanceCard}>
                <Text style={s.bookBalanceAccountName}>{selectedName}</Text>
                {loadingBalance ? (
                  <ActivityIndicator color={D.gold} />
                ) : (
                  <Text style={s.bookBalanceAmount}>₦{fmt(bookBalance)}</Text>
                )}
                <Text style={s.bookBalanceNote}>
                  This is what Zaena thinks you have based on all recorded
                  transactions.
                </Text>
              </View>

              {/* Actual balance input */}
              <Text style={[s.sectionLabel, { marginTop: 20 }]}>
                ACTUAL BALANCE (WHAT YOU COUNT / SEE)
              </Text>
              <View style={s.actualInputWrap}>
                <Text style={s.currencySymbol}>₦</Text>
                <TextInput
                  style={s.actualInput}
                  value={actualInput}
                  onChangeText={(v) =>
                    setActualInput(v.replace(/[^0-9.]/g, ""))
                  }
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={D.inkGhost}
                />
              </View>

              {/* Live variance display */}
              {hasInput && (
                <View
                  style={[
                    s.varianceCard,
                    isBalanced ? s.varianceCardGood : s.varianceCardBad,
                  ]}
                >
                  <View style={s.varianceRow}>
                    <Text style={s.varianceLabel}>Book Balance</Text>
                    <Text style={s.varianceValue}>₦{fmt(bookBalance)}</Text>
                  </View>
                  <View style={s.varianceRow}>
                    <Text style={s.varianceLabel}>Actual Balance</Text>
                    <Text style={s.varianceValue}>₦{fmt(actualBalance)}</Text>
                  </View>
                  <View style={s.varianceDivider} />
                  <View style={s.varianceRow}>
                    <Text style={s.varianceLabelBold}>Variance</Text>
                    <Text
                      style={[
                        s.varianceValueBold,
                        {
                          color: isBalanced
                            ? D.green
                            : variance > 0
                              ? D.green
                              : D.red,
                        },
                      ]}
                    >
                      {isBalanced
                        ? "₦0.00 — Balanced ✓"
                        : `${variance > 0 ? "+" : "-"}₦${fmt(variance)}`}
                    </Text>
                  </View>

                  {!isBalanced && (
                    <Text style={s.varianceHint}>
                      {variance > 0
                        ? "You have more money than the books show. Something was not recorded."
                        : "You have less money than the books show. Something was spent and not recorded."}
                    </Text>
                  )}
                </View>
              )}

              {/* Variance explanation (required if unbalanced) */}
              {hasInput && !isBalanced && (
                <>
                  <Text style={[s.sectionLabel, { marginTop: 20 }]}>
                    EXPLAIN THE VARIANCE *
                  </Text>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={s.chipScroll}
                  >
                    {VARIANCE_EXPLANATIONS.map((exp) => (
                      <TouchableOpacity
                        key={exp}
                        style={[
                          s.expChip,
                          explanation === exp && s.expChipActive,
                        ]}
                        onPress={() => setExplanation(exp)}
                      >
                        <Text
                          style={[
                            s.expChipText,
                            explanation === exp && s.expChipTextActive,
                          ]}
                        >
                          {exp}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <TextInput
                    style={s.textInput}
                    value={explanation}
                    onChangeText={setExplanation}
                    placeholder="Or describe the variance in your own words…"
                    placeholderTextColor={D.inkGhost}
                    multiline
                  />
                </>
              )}

              {/* Notes */}
              <Text style={[s.sectionLabel, { marginTop: 20 }]}>
                NOTES (OPTIONAL)
              </Text>
              <TextInput
                style={s.textInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any additional notes for this reconciliation…"
                placeholderTextColor={D.inkGhost}
                multiline
              />

              {/* Confirm button */}
              <TouchableOpacity
                style={[
                  s.confirmBtn,
                  (!hasInput || submitting) && s.confirmBtnDisabled,
                ]}
                onPress={handleConfirm}
                disabled={!hasInput || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={D.white} />
                ) : (
                  <Text style={s.confirmBtnText}>
                    {isBalanced
                      ? "Confirm — Books Balanced"
                      : "Confirm & Adjust Books"}
                  </Text>
                )}
              </TouchableOpacity>

              {!isBalanced && hasInput && (
                <Text style={s.adjustNote}>
                  Confirming will post an adjusting entry to bring your books in
                  line with the actual balance.
                </Text>
              )}
            </>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: D.teal,
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backBtn: { width: 40 },
  backArrow: { color: D.gold, fontSize: 22, fontFamily: "Cormorant Garamond" },
  topTitle: {
    color: D.white,
    fontSize: 13,
    fontFamily: "DM Mono",
    letterSpacing: 2,
  },

  scroll: { padding: 20 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: D.inkDim,
    marginBottom: 10,
  },

  explainer: {
    backgroundColor: D.paperDeep,
    borderRadius: 4,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: D.gold,
  },
  explainerText: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    color: D.inkMid,
    lineHeight: 22,
  },

  accountGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  accountChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: D.rule,
    backgroundColor: D.white,
  },
  accountChipActive: { borderColor: D.gold, backgroundColor: "#FFFBF4" },
  accountChipIcon: { fontSize: 18, color: D.gold },
  accountChipText: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    fontWeight: "600",
    color: D.inkMid,
  },
  accountChipTextActive: { color: D.teal },

  bookBalanceCard: {
    backgroundColor: D.teal,
    borderRadius: 4,
    padding: 20,
    marginBottom: 4,
  },
  bookBalanceAccountName: {
    fontSize: 12,
    fontFamily: "DM Mono",
    color: "#9BB5BE",
    letterSpacing: 1,
    marginBottom: 6,
  },
  bookBalanceAmount: {
    fontSize: 32,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.white,
    marginBottom: 8,
  },
  bookBalanceNote: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: "#6A9AAA",
    fontStyle: "italic",
  },

  actualInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: D.gold,
    borderRadius: 4,
    paddingHorizontal: 16,
    backgroundColor: D.white,
    marginBottom: 16,
  },
  currencySymbol: {
    fontSize: 24,
    fontFamily: "DM Mono",
    color: D.inkDim,
    marginRight: 8,
  },
  actualInput: {
    flex: 1,
    fontSize: 36,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.ink,
    paddingVertical: 14,
  },

  varianceCard: { borderRadius: 4, padding: 16, marginBottom: 4 },
  varianceCardGood: {
    backgroundColor: "#E8F5EE",
    borderWidth: 1,
    borderColor: "#A8D5B8",
  },
  varianceCardBad: {
    backgroundColor: "#F5E8E8",
    borderWidth: 1,
    borderColor: "#D5A8A8",
  },
  varianceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  varianceLabel: {
    fontSize: 13,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
  },
  varianceValue: { fontSize: 14, fontFamily: "DM Mono", color: D.ink },
  varianceDivider: { height: 1, backgroundColor: D.rule, marginVertical: 8 },
  varianceLabelBold: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.ink,
  },
  varianceValueBold: { fontSize: 18, fontFamily: "DM Mono", fontWeight: "700" },
  varianceHint: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
    fontStyle: "italic",
    marginTop: 8,
  },

  chipScroll: { marginBottom: 10 },
  expChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: D.rule,
    backgroundColor: D.white,
    marginRight: 8,
  },
  expChipActive: { backgroundColor: D.teal, borderColor: D.teal },
  expChipText: { fontSize: 12, fontFamily: "DM Mono", color: D.inkDim },
  expChipTextActive: { color: D.gold },

  textInput: {
    borderWidth: 1,
    borderColor: D.rule,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: D.white,
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    color: D.ink,
    minHeight: 80,
    textAlignVertical: "top",
  },

  confirmBtn: {
    backgroundColor: D.teal,
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: {
    fontSize: 13,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 1,
  },
  adjustNote: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 10,
  },

  // Success screen
  successScroll: { padding: 32, alignItems: "center" },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: D.teal,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  successIconText: { fontSize: 36, color: D.gold },
  successTitle: {
    fontSize: 28,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.ink,
    marginBottom: 8,
    textAlign: "center",
  },
  successSub: {
    fontSize: 15,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
    textAlign: "center",
    lineHeight: 24,
    fontStyle: "italic",
    marginBottom: 28,
  },
  resultCard: {
    backgroundColor: D.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.rule,
    width: "100%",
    marginBottom: 16,
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: D.rule,
  },
  resultKey: { fontSize: 13, fontFamily: "DM Mono", color: D.inkDim },
  resultVal: {
    fontSize: 16,
    fontFamily: "Cormorant Garamond",
    fontWeight: "600",
    color: D.ink,
  },
  varianceNote: {
    backgroundColor: D.paperDeep,
    borderRadius: 4,
    padding: 16,
    width: "100%",
    marginBottom: 24,
  },
  varianceNoteText: {
    fontSize: 13,
    fontFamily: "Cormorant Garamond",
    color: D.inkMid,
    lineHeight: 20,
    fontStyle: "italic",
  },
  doneBtn: {
    backgroundColor: D.teal,
    borderRadius: 4,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },
  doneBtnText: {
    fontSize: 13,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 1,
  },
  journalBtn: { paddingVertical: 12 },
  journalBtnText: {
    fontSize: 13,
    fontFamily: "DM Mono",
    color: D.inkDim,
    letterSpacing: 1,
  },
});
