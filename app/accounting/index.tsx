// app/accounting/index.tsx
// Accounting Home — entry point for the full accounting module.
// On mount: checks accounting_settings.is_activated.
//   → Not activated: redirects to setup.tsx
//   → Activated: shows this dashboard
//
// Summary cards from get_accounting_summary() RPC.
// Navigation to all Track A screens + Money Register.

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

type AccountingSummary = {
  activated: boolean;
  activation_date: string | null;
  cash_balance: number;
  receivables: number;
  payables: number;
  month_revenue: number;
  month_expenses: number;
  month_profit: number;
  ytd_revenue: number;
};

type QuickNavItem = {
  label: string;
  caption: string;
  icon: string;
  route: string;
  accent?: string;
};

const NAV_ITEMS: QuickNavItem[] = [
  {
    label: "Money Register",
    caption: "Cash · Bank · POS · Mobile",
    icon: "◈",
    route: "/money",
  },
  {
    label: "Chart of Accounts",
    caption: "All accounts & balances",
    icon: "⬡",
    route: "/accounting/chart-of-accounts",
  },
  {
    label: "Journal",
    caption: "Posted entries",
    icon: "≡",
    route: "/accounting/journal",
  },
  {
    label: "Financials",
    caption: "P&L · Balance Sheet · Cash Flow",
    icon: "▦",
    route: "/accounting/financial-statements",
  },
];

export default function AccountingHome() {
  const { organizationId } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState("");

  const checkAndLoad = useCallback(
    async (isRefresh = false) => {
      if (!organizationId) return;

      // 1. Check activation status
      const { data: settings } = await supabase
        .from("accounting_settings")
        .select("is_activated, activation_date")
        .eq("organization_id", organizationId)
        .single();

      if (!settings?.is_activated) {
        // Not activated — send to setup
        router.replace("/accounting/setup" as any);
        return;
      }

      // 2. Load summary
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase.rpc("get_accounting_summary", {
        p_org_id: organizationId,
        p_date: today,
      });

      if (data) {
        setSummary({
          activated: data.activated ?? true,
          activation_date: data.activation_date ?? null,
          cash_balance: parseFloat(data.cash_balance) || 0,
          receivables: parseFloat(data.receivables) || 0,
          payables: parseFloat(data.payables) || 0,
          month_revenue: parseFloat(data.month_revenue) || 0,
          month_expenses: parseFloat(data.month_expenses) || 0,
          month_profit: parseFloat(data.month_profit) || 0,
          ytd_revenue: parseFloat(data.ytd_revenue) || 0,
        });
      }

      // Set current period label
      setCurrentPeriod(
        new Date().toLocaleDateString("en-NG", {
          month: "long",
          year: "numeric",
        }),
      );

      setChecking(false);
      setRefreshing(false);
    },
    [organizationId],
  );

  useEffect(() => {
    checkAndLoad();
  }, [checkAndLoad]);

  const fmt = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `₦${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `₦${(abs / 1_000).toFixed(1)}K`;
    return `₦${abs.toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
  };

  const fmtFull = (n: number) =>
    `₦${Math.abs(n).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  if (checking) {
    return (
      <View
        style={[s.root, { alignItems: "center", justifyContent: "center" }]}
      >
        <ActivityIndicator color={D.gold} size="large" />
        <Text style={s.checkingText}>Loading accounting…</Text>
      </View>
    );
  }

  const profit = summary?.month_profit ?? 0;
  const profitColor = profit >= 0 ? D.green : D.red;
  const profitSign = profit >= 0 ? "+" : "-";

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>ACCOUNTING</Text>
          <Text style={s.topPeriod}>{currentPeriod}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/accounting/journal" as any)}
          style={s.topRight}
        >
          <Text style={s.topRightText}>JOURNAL</Text>
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
              checkAndLoad(true);
            }}
            tintColor={D.gold}
          />
        }
      >
        {/* ── Hero profit card ── */}
        <View style={s.heroCard}>
          <Text style={s.heroLabel}>THIS MONTH&apos;S PROFIT / (LOSS)</Text>
          <Text style={[s.heroAmount, { color: profitColor }]}>
            {profitSign}
            {fmt(profit)}
          </Text>
          <View style={s.heroRow}>
            <View style={s.heroStat}>
              <Text style={s.heroStatLabel}>Revenue</Text>
              <Text style={s.heroStatValue}>
                {fmt(summary?.month_revenue ?? 0)}
              </Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatLabel}>Expenses</Text>
              <Text style={[s.heroStatValue, { color: "#FF9999" }]}>
                {fmt(summary?.month_expenses ?? 0)}
              </Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatLabel}>YTD Revenue</Text>
              <Text style={s.heroStatValue}>
                {fmt(summary?.ytd_revenue ?? 0)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Balance snapshot ── */}
        <Text style={s.sectionLabel}>BALANCE SNAPSHOT</Text>
        <View style={s.balanceGrid}>
          <View style={[s.balanceCard, { flex: 1 }]}>
            <Text style={s.balanceCardIcon}>◈</Text>
            <Text style={s.balanceCardLabel}>Cash & Bank</Text>
            <Text style={s.balanceCardAmount}>
              {fmt(summary?.cash_balance ?? 0)}
            </Text>
            <TouchableOpacity onPress={() => router.push("/money" as any)}>
              <Text style={s.balanceCardLink}>View register →</Text>
            </TouchableOpacity>
          </View>

          <View style={s.balanceCardGap} />

          <View style={s.balanceCardCol}>
            <View style={[s.balanceCardSmall, { marginBottom: 10 }]}>
              <Text style={s.balanceCardSmallLabel}>Receivables</Text>
              <Text style={[s.balanceCardSmallAmount, { color: D.green }]}>
                {fmt(summary?.receivables ?? 0)}
              </Text>
              <Text style={s.balanceCardSmallNote}>Owed to you</Text>
            </View>
            <View style={s.balanceCardSmall}>
              <Text style={s.balanceCardSmallLabel}>Payables</Text>
              <Text style={[s.balanceCardSmallAmount, { color: D.red }]}>
                {fmt(summary?.payables ?? 0)}
              </Text>
              <Text style={s.balanceCardSmallNote}>You owe</Text>
            </View>
          </View>
        </View>

        {/* ── Net position bar ── */}
        {(() => {
          const recv = summary?.receivables ?? 0;
          const pay = summary?.payables ?? 0;
          const net = recv - pay;
          return (
            <View style={s.netPositionCard}>
              <View style={s.netPositionRow}>
                <Text style={s.netPositionLabel}>Net Position</Text>
                <Text
                  style={[
                    s.netPositionAmount,
                    { color: net >= 0 ? D.green : D.red },
                  ]}
                >
                  {net >= 0 ? "+" : "-"}
                  {fmtFull(net)}
                </Text>
              </View>
              <Text style={s.netPositionSub}>
                {net >= 0
                  ? "Customers owe you more than you owe suppliers."
                  : "You owe suppliers more than customers owe you."}
              </Text>
            </View>
          );
        })()}

        {/* ── Quick navigation ── */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>
          ACCOUNTING TOOLS
        </Text>
        <View style={s.navGrid}>
          {NAV_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={s.navCard}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.85}
            >
              <View style={s.navIconWrap}>
                <Text style={s.navIcon}>{item.icon}</Text>
              </View>
              <Text style={s.navLabel}>{item.label}</Text>
              <Text style={s.navCaption}>{item.caption}</Text>
              <Text style={s.navArrow}>→</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Activation info ── */}
        {summary?.activation_date && (
          <View style={s.activationNote}>
            <Text style={s.activationNoteText}>
              Accounting active since{" "}
              {new Date(summary.activation_date).toLocaleDateString("en-NG", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </Text>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  checkingText: {
    marginTop: 16,
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
  },

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
  topCenter: { alignItems: "center" },
  topTitle: {
    color: D.white,
    fontSize: 13,
    fontFamily: "DM Mono",
    letterSpacing: 2,
  },
  topPeriod: {
    fontSize: 11,
    fontFamily: "Cormorant Garamond",
    color: "#9BB5BE",
    fontStyle: "italic",
    marginTop: 2,
  },
  topRight: {
    paddingHorizontal: 10,
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

  scroll: { padding: 20 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: D.inkDim,
    marginBottom: 12,
  },

  // Hero card
  heroCard: {
    backgroundColor: D.teal,
    borderRadius: 4,
    padding: 24,
    marginBottom: 28,
  },
  heroLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: "#9BB5BE",
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 40,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    marginBottom: 20,
  },
  heroRow: { flexDirection: "row", alignItems: "center" },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    color: "#9BB5BE",
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroStatValue: {
    fontSize: 16,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.white,
  },
  heroStatDivider: { width: 1, height: 32, backgroundColor: D.tealLight },

  // Balance grid
  balanceGrid: { flexDirection: "row", marginBottom: 10 },
  balanceCard: { backgroundColor: D.teal, borderRadius: 4, padding: 20 },
  balanceCardIcon: { fontSize: 22, color: D.gold, marginBottom: 8 },
  balanceCardLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 1,
    color: "#9BB5BE",
    marginBottom: 6,
  },
  balanceCardAmount: {
    fontSize: 26,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.white,
    marginBottom: 10,
  },
  balanceCardLink: {
    fontSize: 11,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 0.5,
  },
  balanceCardGap: { width: 10 },
  balanceCardCol: { width: 130 },
  balanceCardSmall: {
    flex: 1,
    backgroundColor: D.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.rule,
    padding: 14,
  },
  balanceCardSmallLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 1,
    color: D.inkGhost,
    marginBottom: 4,
  },
  balanceCardSmallAmount: {
    fontSize: 18,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.ink,
    marginBottom: 2,
  },
  balanceCardSmallNote: {
    fontSize: 11,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
  },

  netPositionCard: {
    backgroundColor: D.paperDeep,
    borderRadius: 4,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: D.gold,
    marginBottom: 4,
  },
  netPositionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  netPositionLabel: {
    fontSize: 12,
    fontFamily: "DM Mono",
    color: D.inkDim,
    letterSpacing: 1,
  },
  netPositionAmount: { fontSize: 18, fontFamily: "DM Mono", fontWeight: "700" },
  netPositionSub: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
    fontStyle: "italic",
  },

  // Nav grid
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  navCard: {
    width: "47.5%",
    backgroundColor: D.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.rule,
    padding: 16,
  },
  navIconWrap: {
    width: 36,
    height: 36,
    backgroundColor: D.teal,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  navIcon: { fontSize: 18, color: D.gold },
  navLabel: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.ink,
    marginBottom: 2,
  },
  navCaption: {
    fontSize: 11,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
    marginBottom: 8,
  },
  navArrow: { fontSize: 14, fontFamily: "DM Mono", color: D.gold },

  activationNote: { alignItems: "center", paddingVertical: 8 },
  activationNoteText: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
  },
});
