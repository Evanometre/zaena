// app/settings/index.tsx
// Settings — main settings screen.
// Sections: Business, Accounting & Books, Money Register, Tax & Compliance, Account.

import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuthStore } from "../stores/authStore";

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

type OrgInfo = {
  name: string;
  business_type: string | null;
  currency: string;
  country_code: string;
  tin: string | null;
  rc_number: string | null;
};

type AccountingStatus = {
  is_activated: boolean;
  activation_date: string | null;
};

type ReconciliationHealth = {
  total_accounts: number;
  reconciled_30d: number;
};

// ── Row components ─────────────────────────────────────────────

function SettingRow({
  label,
  caption,
  value,
  onPress,
  showArrow = true,
  badge,
}: {
  label: string;
  caption?: string;
  value?: string;
  onPress?: () => void;
  showArrow?: boolean;
  badge?: { text: string; color: string };
}) {
  return (
    <TouchableOpacity
      style={r.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      disabled={!onPress}
    >
      <View style={r.rowLeft}>
        <Text style={r.rowLabel}>{label}</Text>
        {caption && <Text style={r.rowCaption}>{caption}</Text>}
      </View>
      <View style={r.rowRight}>
        {badge && (
          <View
            style={[
              r.badge,
              { backgroundColor: badge.color + "22", borderColor: badge.color },
            ]}
          >
            <Text style={[r.badgeText, { color: badge.color }]}>
              {badge.text}
            </Text>
          </View>
        )}
        {value && <Text style={r.rowValue}>{value}</Text>}
        {showArrow && onPress && <Text style={r.rowArrow}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <View style={r.sectionHeader}>
      <Text style={r.sectionTitle}>{title}</Text>
      {note && <Text style={r.sectionNote}>{note}</Text>}
    </View>
  );
}

function Divider() {
  return <View style={r.divider} />;
}

export default function Settings() {
  const { organizationId, signOut } = useAuthStore();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [accountingStatus, setAccountingStatus] =
    useState<AccountingStatus | null>(null);
  const [reconHealth, setReconHealth] = useState<ReconciliationHealth | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;

    const [orgRes, acctRes, acctCountRes, reconRes] = await Promise.all([
      supabase
        .from("organizations")
        .select("name, business_type, currency, country_code, tin, rc_number")
        .eq("id", organizationId)
        .single(),
      supabase
        .from("accounting_settings")
        .select("is_activated, activation_date")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("financial_accounts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_active", true),
      supabase
        .from("reconciliations")
        .select("account_id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("status", ["confirmed", "variance"])
        .gte(
          "reconciliation_date",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
        ),
    ]);

    if (orgRes.data) setOrg(orgRes.data);
    if (acctRes.data) setAccountingStatus(acctRes.data);
    else setAccountingStatus({ is_activated: false, activation_date: null });

    setReconHealth({
      total_accounts: acctCountRes.count ?? 0,
      reconciled_30d: reconRes.count ?? 0,
    });

    setRefreshing(false);
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Reconciliation health badge
  const reconBadge = () => {
    if (!reconHealth || reconHealth.total_accounts === 0) return null;
    const { reconciled_30d, total_accounts } = reconHealth;
    if (reconciled_30d === 0) return { text: "Not reconciled", color: D.red };
    if (reconciled_30d < total_accounts)
      return {
        text: `${reconciled_30d}/${total_accounts} reconciled`,
        color: D.gold,
      };
    return { text: "All reconciled", color: D.green };
  };

  const businessTypeLabel = (t: string | null) => {
    if (t === "registered_company") return "Registered Company";
    if (t === "business_name") return "Business Name";
    return t ?? "—";
  };

  async function handleLogout() {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
            router.replace("/(auth)/login" as any);
          } catch (err: any) {
            Alert.alert("Error", "Failed to logout. Please try again.");
          }
        },
      },
    ]);
  }

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>SETTINGS</Text>
        <View style={{ width: 40 }} />
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
        {/* ── BUSINESS ── */}
        <SectionHeader
          title="BUSINESS"
          note="Your organisation profile and registration details"
        />
        <View style={s.card}>
          <SettingRow
            label="Business Name"
            value={org?.name ?? "—"}
            onPress={() => router.push("/settingsg/organization")}
          />
          <Divider />
          <SettingRow
            label="Business Type"
            value={businessTypeLabel(org?.business_type ?? null)}
            onPress={() => router.push("/settingsg/organization")}
          />
          <Divider />
          <SettingRow
            label="TIN"
            caption="Tax Identification Number"
            value={org?.tin ?? "Not set"}
            badge={org?.tin ? undefined : { text: "Missing", color: D.gold }}
            onPress={() => router.push("/settingsg/organization")}
          />
          <Divider />
          <SettingRow
            label="RC Number"
            caption="CAC Registration Number"
            value={org?.rc_number ?? "Not set"}
            badge={
              org?.rc_number
                ? undefined
                : { text: "Optional", color: D.inkGhost }
            }
            onPress={() => router.push("/settingsg/organization")}
          />
          <Divider />
          <SettingRow
            label="Currency"
            value={org?.currency ?? "NGN"}
            onPress={() => router.push("/settingsg/organization")}
          />
        </View>

        {/* ── ACCOUNTING & BOOKS ── */}
        <SectionHeader
          title="ACCOUNTING & BOOKS"
          note="Double-entry accounting, chart of accounts, and financial statements"
        />
        <View style={s.card}>
          {accountingStatus?.is_activated ? (
            <>
              {/* Activated state */}
              <SettingRow
                label="Accounting"
                caption={
                  accountingStatus.activation_date
                    ? `Active since ${new Date(
                        accountingStatus.activation_date,
                      ).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`
                    : "Active"
                }
                badge={{ text: "Active", color: D.green }}
                onPress={() => router.push("/accounting" as any)}
              />
              <Divider />
              <SettingRow
                label="Chart of Accounts"
                caption="View and manage your accounts"
                onPress={() =>
                  router.push("/accounting/chart-of-accounts" as any)
                }
              />
              <Divider />
              <SettingRow
                label="Journal Entries"
                caption="All posted accounting entries"
                onPress={() => router.push("/accounting/journal" as any)}
              />
              <Divider />
              <SettingRow
                label="Financial Statements"
                caption="P&L, Balance Sheet, Cash Flow"
                onPress={() =>
                  router.push("/accounting/financial-statements" as any)
                }
              />
            </>
          ) : (
            /* Not activated state */
            <TouchableOpacity
              style={s.activatePrompt}
              onPress={() => router.push("/accounting/setup" as any)}
              activeOpacity={0.85}
            >
              <View style={s.activateLeft}>
                <Text style={s.activateIcon}>⬡</Text>
              </View>
              <View style={s.activateCenter}>
                <Text style={s.activateTitle}>Set Up Accounting</Text>
                <Text style={s.activateCaption}>
                  Activate double-entry accounting to unlock full financial
                  statements and a higher Trust Score.
                </Text>
              </View>
              <Text style={s.activateArrow}>→</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── MONEY REGISTER ── */}
        <SectionHeader
          title="MONEY REGISTER"
          note="Cash, bank, POS, and mobile money account management"
        />
        <View style={s.card}>
          <SettingRow
            label="Money Register"
            caption="View balances and transaction history"
            onPress={() => router.push("/money" as any)}
          />
          <Divider />
          <SettingRow
            label="Reconciliation"
            caption="Count cash and reconcile your accounts"
            badge={reconBadge() ?? undefined}
            onPress={() => router.push("/money/reconcile" as any)}
          />
          <Divider />
          <SettingRow
            label="Record Unrecorded Income"
            caption="Declare income not entered in Zaena"
            onPress={() => router.push("/money/unrecorded-income" as any)}
          />
        </View>

        {/* ── TAX & COMPLIANCE ── */}
        <SectionHeader
          title="TAX & COMPLIANCE"
          note="VAT, PIT, CIT, Development Levy, and PAYE"
        />
        <View style={s.card}>
          <SettingRow
            label="Tax Calculator"
            caption="Nigerian Tax Act 2025 parameters"
            onPress={() => router.push("/tax" as any)}
          />
          <Divider />
          <SettingRow
            label="Tax Remittances"
            caption="Track and record tax payments"
            onPress={() => router.push("/tax/dashboard")}
          />
        </View>

        {/* ── TRUST SCORE ── */}
        <SectionHeader
          title="TRUST SCORE"
          note="Your Zaena Business Health Report"
        />
        <View style={s.card}>
          <SettingRow
            label="Business Trust Score"
            caption="See your score and how to improve it"
            onPress={() => router.push("/trust/TrustDashboard")}
          />
          <Divider />
          <SettingRow
            label="Trust Report"
            caption="Full institutional report for banks and partners"
            onPress={() => router.push("/trust/institutionalReport")}
          />
        </View>

        {/* ── TEAM ── */}
        <SectionHeader title="TEAM" />
        <View style={s.card}>
          <SettingRow
            label="Team Members"
            caption="Invite and manage staff access"
            onPress={() => router.push("/settingsg/users")}
          />
          <Divider />
          <SettingRow
            label="Roles & Permissions"
            onPress={() => router.push("/settingsg/roles")}
          />
        </View>

        {/* ── ACCOUNT ── */}
        <SectionHeader title="ACCOUNT" />
        <View style={s.card}>
          <SettingRow label="Profile" onPress={() => router.push("/profile")} />
          {/* <Divider />
          <SettingRow
            label="Notifications"
            onPress={() => router.push("/settings/notifications")}
          /> */}
          <Divider />
          <SettingRow
            label="Sign Out"
            showArrow={false}
            onPress={async () => {
              await signOut?.();
              router.replace("/(auth)/login");
            }}
          />
        </View>

        {/* Version */}
        <Text style={s.version}>Zaena by Toledah · v1.0.0-beta</Text>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Row sub-styles ────────────────────────────────────────────
const r = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: { flex: 1, marginRight: 12 },
  rowLabel: {
    fontSize: 15,
    fontFamily: "Cormorant Garamond",
    fontWeight: "600",
    color: D.ink,
  },
  rowCaption: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
    marginTop: 2,
  },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowValue: { fontSize: 13, fontFamily: "DM Mono", color: D.inkDim },
  rowArrow: { fontSize: 20, color: D.rule, marginLeft: 4 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontFamily: "DM Mono" },
  divider: { height: 1, backgroundColor: D.rule, marginHorizontal: 16 },
  sectionHeader: { marginTop: 28, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: D.inkDim,
  },
  sectionNote: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
    marginTop: 3,
  },
});

// ── Screen styles ─────────────────────────────────────────────
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

  scroll: { padding: 20, paddingTop: 12 },

  card: {
    backgroundColor: D.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.rule,
    overflow: "hidden",
    marginBottom: 4,
  },

  // Activate prompt (shown when accounting not yet set up)
  activatePrompt: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  activateLeft: {
    width: 44,
    height: 44,
    backgroundColor: D.teal,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  activateIcon: { fontSize: 22, color: D.gold },
  activateCenter: { flex: 1 },
  activateTitle: {
    fontSize: 15,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.ink,
    marginBottom: 3,
  },
  activateCaption: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
    lineHeight: 18,
  },
  activateArrow: { fontSize: 18, fontFamily: "DM Mono", color: D.gold },

  version: {
    textAlign: "center",
    fontSize: 11,
    fontFamily: "DM Mono",
    color: D.inkGhost,
    marginTop: 24,
    letterSpacing: 1,
  },
});
