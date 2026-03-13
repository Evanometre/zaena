// app/money/index.tsx
// Money Register — home screen
// Shows all financial accounts with live book balances.
// Entry point for unrecorded income and reconciliation.

import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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
  amber: "#C9922A",
};

type AccountSummary = {
  account_id: string;
  account_name: string;
  account_type: string;
  is_active: boolean;
  book_balance: number;
  last_event_at: string | null;
  last_reconciled_at: string | null;
  last_variance: number | null;
  unreconciled_days: number | null;
};

const ACCOUNT_TYPE_ICONS: Record<string, string> = {
  cash: "◈",
  bank: "⬡",
  pos: "▣",
  mobile: "◉",
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "CASH IN HAND",
  bank: "BANK ACCOUNT",
  pos: "POS TERMINAL",
  mobile: "MOBILE WALLET",
};

// Reconciliation health colour
function reconcileColor(days: number | null): string {
  if (days === null) return D.red; // never reconciled
  if (days <= 7) return D.green; // healthy
  if (days <= 30) return D.amber; // stale
  return D.red; // overdue
}

function reconcileLabel(days: number | null): string {
  if (days === null) return "Never reconciled";
  if (days === 0) return "Reconciled today";
  if (days === 1) return "Reconciled yesterday";
  if (days <= 7) return `Reconciled ${days}d ago`;
  if (days <= 30) return `${days} days since reconciliation`;
  return `${days} days overdue`;
}

export default function MoneyRegister() {
  const { organizationId } = useAuthStore();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const { data, error } = await supabase.rpc("get_money_register", {
      p_org_id: organizationId,
    });
    if (data) {
      setAccounts(
        data.map((a: any) => ({
          ...a,
          book_balance: parseFloat(a.book_balance) || 0,
          last_variance:
            a.last_variance != null ? parseFloat(a.last_variance) : null,
        })),
      );
    }
    setLoading(false);
    setRefreshing(false);
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalBalance = accounts.reduce((s, a) => s + a.book_balance, 0);

  const fmt = (n: number) =>
    Math.abs(n).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>MONEY REGISTER</Text>
        <TouchableOpacity
          onPress={() => router.push("/money/unrecorded-income" as any)}
          style={s.topRight}
        >
          <Text style={s.topRightText}>+ INCOME</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={D.gold}
          />
        }
      >
        {/* Total card */}
        <View style={s.totalCard}>
          <Text style={s.totalLabel}>TOTAL ACROSS ALL ACCOUNTS</Text>
          <Text style={s.totalAmount}>₦{fmt(totalBalance)}</Text>
          <Text style={s.totalSub}>Book balance as of now</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={D.gold} style={{ marginTop: 32 }} />
        ) : (
          <>
            <Text style={s.sectionLabel}>YOUR MONEY ACCOUNTS</Text>

            {accounts.map((account) => (
              <TouchableOpacity
                key={account.account_id}
                style={s.accountCard}
                onPress={() =>
                  router.push({
                    pathname: "/money/account-detail" as any,
                    params: {
                      accountId: account.account_id,
                      accountName: account.account_name,
                      accountType: account.account_type,
                    },
                  })
                }
                activeOpacity={0.85}
              >
                {/* Card header */}
                <View style={s.cardHeader}>
                  <View style={[s.iconWrap, { backgroundColor: D.teal }]}>
                    <Text style={s.icon}>
                      {ACCOUNT_TYPE_ICONS[account.account_type] ?? "◈"}
                    </Text>
                  </View>
                  <View style={s.cardTitleCol}>
                    <Text style={s.cardType}>
                      {ACCOUNT_TYPE_LABELS[account.account_type] ??
                        account.account_type.toUpperCase()}
                    </Text>
                    <Text style={s.cardName}>{account.account_name}</Text>
                  </View>
                  <Text style={s.chevron}>›</Text>
                </View>

                {/* Balance */}
                <View style={s.balanceRow}>
                  <Text style={s.balanceLabel}>Book Balance</Text>
                  <Text
                    style={[
                      s.balanceAmount,
                      account.book_balance < 0 && { color: D.red },
                    ]}
                  >
                    {account.book_balance < 0 ? "-" : ""}₦
                    {fmt(account.book_balance)}
                  </Text>
                </View>

                {/* Divider */}
                <View style={s.cardDivider} />

                {/* Footer row */}
                <View style={s.cardFooter}>
                  {/* Reconciliation health */}
                  <View style={s.reconcileStatus}>
                    <View
                      style={[
                        s.reconcileDot,
                        {
                          backgroundColor: reconcileColor(
                            account.unreconciled_days,
                          ),
                        },
                      ]}
                    />
                    <Text
                      style={[
                        s.reconcileText,
                        { color: reconcileColor(account.unreconciled_days) },
                      ]}
                    >
                      {reconcileLabel(account.unreconciled_days)}
                    </Text>
                  </View>

                  {/* Last variance indicator */}
                  {account.last_variance !== null &&
                    Math.abs(account.last_variance) > 0.01 && (
                      <View style={s.variancePill}>
                        <Text
                          style={[
                            s.varianceText,
                            {
                              color:
                                account.last_variance > 0 ? D.green : D.red,
                            },
                          ]}
                        >
                          {account.last_variance > 0 ? "+" : ""}₦
                          {fmt(account.last_variance)}
                        </Text>
                      </View>
                    )}

                  {/* Last activity */}
                  {account.last_event_at && (
                    <Text style={s.lastActivity}>
                      Last: {formatDate(account.last_event_at)}
                    </Text>
                  )}
                </View>

                {/* Reconcile CTA if overdue */}
                {(account.unreconciled_days === null ||
                  account.unreconciled_days > 7) && (
                  <TouchableOpacity
                    style={s.reconcileCta}
                    onPress={(e) => {
                      e.stopPropagation();
                      router.push({
                        pathname: "/money/reconcile" as any,
                        params: {
                          accountId: account.account_id,
                          accountName: account.account_name,
                          accountType: account.account_type,
                          bookBalance: account.book_balance.toString(),
                        },
                      });
                    }}
                  >
                    <Text style={s.reconcileCtaText}>
                      {account.unreconciled_days === null
                        ? "Set up reconciliation →"
                        : "Reconcile now →"}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}

            {/* Quick actions */}
            <Text style={s.sectionLabel}>QUICK ACTIONS</Text>
            <View style={s.quickActions}>
              <TouchableOpacity
                style={s.quickBtn}
                onPress={() => router.push("/money/unrecorded-income" as any)}
              >
                <Text style={s.quickBtnIcon}>＋</Text>
                <Text style={s.quickBtnLabel}>
                  Record{"\n"}Unrecorded Income
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.quickBtn}
                onPress={() => router.push("/money/reconcile" as any)}
              >
                <Text style={s.quickBtnIcon}>✓</Text>
                <Text style={s.quickBtnLabel}>Reconcile{"\n"}An Account</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.quickBtn}
                onPress={() => router.push("/accounting/journal" as any)}
              >
                <Text style={s.quickBtnIcon}>≡</Text>
                <Text style={s.quickBtnLabel}>View{"\n"}Journal</Text>
              </TouchableOpacity>
            </View>

            {/* Reconciliation history summary */}
            <RecentReconciliations organizationId={organizationId!} />
          </>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Recent Reconciliations component ──────────────────────────
function RecentReconciliations({ organizationId }: { organizationId: string }) {
  const [recents, setRecents] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("reconciliations")
      .select(
        `
        id, reconciliation_date, actual_balance, variance,
        status, confirmed_at,
        financial_accounts ( name, account_type )
      `,
      )
      .eq("organization_id", organizationId)
      .in("status", ["confirmed", "variance"])
      .order("reconciliation_date", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data) setRecents(data);
      });
  }, [organizationId]);

  if (recents.length === 0) return null;

  const fmt = (n: number) =>
    Math.abs(n).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
    });

  return (
    <View style={s.recentWrap}>
      <Text style={s.sectionLabel}>RECENT RECONCILIATIONS</Text>
      {recents.map((r) => (
        <View key={r.id} style={s.recentRow}>
          <View style={s.recentLeft}>
            <Text style={s.recentAccount}>
              {(r.financial_accounts as any)?.name ?? "Account"}
            </Text>
            <Text style={s.recentDate}>
              {new Date(r.reconciliation_date).toLocaleDateString("en-NG", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Text>
          </View>
          <View style={s.recentRight}>
            {Math.abs(parseFloat(r.variance)) < 0.01 ? (
              <Text style={[s.recentVariance, { color: D.green }]}>
                ✓ Balanced
              </Text>
            ) : (
              <Text
                style={[
                  s.recentVariance,
                  { color: parseFloat(r.variance) > 0 ? D.green : D.red },
                ]}
              >
                {parseFloat(r.variance) > 0 ? "+" : "-"}₦
                {fmt(parseFloat(r.variance))}
              </Text>
            )}
            <Text style={s.recentBalance}>
              ₦{fmt(parseFloat(r.actual_balance))}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
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
  topRight: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: D.gold,
  },
  topRightText: {
    fontSize: 10,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 1,
  },

  scroll: { padding: 20, paddingBottom: 60 },

  // Total card
  totalCard: {
    backgroundColor: D.teal,
    borderRadius: 4,
    padding: 24,
    marginBottom: 28,
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: "#9BB5BE",
    marginBottom: 8,
  },
  totalAmount: {
    fontSize: 36,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.white,
    marginBottom: 4,
  },
  totalSub: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: "#6A9AAA",
    fontStyle: "italic",
  },

  sectionLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: D.inkDim,
    marginBottom: 12,
    marginTop: 4,
  },

  // Account cards
  accountCard: {
    backgroundColor: D.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.rule,
    marginBottom: 12,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 20, color: D.gold },
  cardTitleCol: { flex: 1 },
  cardType: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 1,
    color: D.inkGhost,
    marginBottom: 2,
  },
  cardName: {
    fontSize: 16,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.ink,
  },
  chevron: { fontSize: 22, color: D.rule },

  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  balanceLabel: { fontSize: 12, fontFamily: "DM Mono", color: D.inkDim },
  balanceAmount: {
    fontSize: 22,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.ink,
  },

  cardDivider: { height: 1, backgroundColor: D.rule, marginHorizontal: 16 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexWrap: "wrap",
  },

  reconcileStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  reconcileDot: { width: 7, height: 7, borderRadius: 4 },
  reconcileText: { fontSize: 11, fontFamily: "DM Mono" },

  variancePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    backgroundColor: D.paperDeep,
  },
  varianceText: { fontSize: 11, fontFamily: "DM Mono" },

  lastActivity: {
    fontSize: 11,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
  },

  reconcileCta: {
    backgroundColor: D.paperDeep,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: D.rule,
  },
  reconcileCtaText: {
    fontSize: 12,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 0.5,
  },

  // Quick actions
  quickActions: { flexDirection: "row", gap: 10, marginBottom: 28 },
  quickBtn: {
    flex: 1,
    backgroundColor: D.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.rule,
    padding: 14,
    alignItems: "center",
  },
  quickBtnIcon: { fontSize: 22, color: D.gold, marginBottom: 6 },
  quickBtnLabel: {
    fontSize: 11,
    fontFamily: "DM Mono",
    color: D.inkDim,
    textAlign: "center",
    letterSpacing: 0.5,
    lineHeight: 16,
  },

  // Recent reconciliations
  recentWrap: { marginTop: 4 },
  recentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: D.rule,
  },
  recentLeft: { flex: 1 },
  recentAccount: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    fontWeight: "600",
    color: D.ink,
  },
  recentDate: {
    fontSize: 11,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
  },
  recentRight: { alignItems: "flex-end" },
  recentVariance: { fontSize: 13, fontFamily: "DM Mono", fontWeight: "700" },
  recentBalance: {
    fontSize: 11,
    fontFamily: "DM Mono",
    color: D.inkGhost,
    marginTop: 2,
  },
});
