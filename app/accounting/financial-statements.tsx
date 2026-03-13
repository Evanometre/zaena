// app/accounting/financial-statements.tsx
// Financial Statements — Income Statement, Balance Sheet, Cash Flow
// Tabbed. Date range picker. Export to PDF via expo-print.

import { supabase } from "@/lib/supabase";
import * as Print from "expo-print";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
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
};

type Tab = "pl" | "bs" | "cf";

type ISRow = {
  section: string;
  account_code: string | null;
  account_name: string;
  amount: number;
  is_subtotal: boolean;
  sort_order: number;
};
type BSRow = {
  section: string;
  account_code: string | null;
  account_name: string;
  balance: number;
  is_subtotal: boolean;
  sort_order: number;
};
type CFRow = {
  section: string;
  label: string;
  amount: number;
  is_subtotal: boolean;
  sort_order: number;
};

const SECTION_LABELS: Record<string, string> = {
  revenue: "REVENUE",
  cogs: "COST OF SALES",
  gross: "",
  opex: "OPERATING EXPENSES",
  ebit: "",
  finance: "FINANCE COSTS",
  pbt: "",
  tax: "TAXATION",
  pat: "",
  assets: "ASSETS",
  liabilities: "LIABILITIES",
  equity: "EQUITY",
  check: "",
  operating: "OPERATING ACTIVITIES",
  investing: "INVESTING ACTIVITIES",
  financing: "FINANCING ACTIVITIES",
  summary: "",
};

// Period presets
const getPeriodPresets = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return [
    {
      label: "This Month",
      from: new Date(y, m, 1).toISOString().split("T")[0],
      to: new Date(y, m + 1, 0).toISOString().split("T")[0],
    },
    {
      label: "Last Month",
      from: new Date(y, m - 1, 1).toISOString().split("T")[0],
      to: new Date(y, m, 0).toISOString().split("T")[0],
    },
    {
      label: "This Quarter",
      from: new Date(y, Math.floor(m / 3) * 3, 1).toISOString().split("T")[0],
      to: now.toISOString().split("T")[0],
    },
    {
      label: `YTD ${y}`,
      from: `${y}-01-01`,
      to: now.toISOString().split("T")[0],
    },
    { label: `${y - 1}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ];
};

export default function FinancialStatements() {
  const { organizationId } = useAuthStore();
  const presets = getPeriodPresets();
  const [tab, setTab] = useState<Tab>("pl");
  const [preset, setPreset] = useState(0);
  const [from, setFrom] = useState(presets[0].from);
  const [to, setTo] = useState(presets[0].to);
  const [isData, setISData] = useState<ISRow[]>([]);
  const [bsData, setBSData] = useState<BSRow[]>([]);
  const [cfData, setCFData] = useState<CFRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [orgName, setOrgName] = useState("");
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId!)
      .single()
      .then(({ data }) => {
        if (data) setOrgName(data.name);
      });
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!organizationId) return;

    const asOf = to;

    const [isRes, bsRes, cfRes] = await Promise.all([
      supabase.rpc("get_income_statement", {
        p_org_id: organizationId,
        p_from_date: from,
        p_to_date: to,
      }),
      supabase.rpc("get_balance_sheet", {
        p_org_id: organizationId,
        p_as_of: asOf,
      }),
      supabase.rpc("get_cash_flow_statement", {
        p_org_id: organizationId,
        p_from_date: from,
        p_to_date: to,
      }),
    ]);

    if (isRes.data)
      setISData(
        isRes.data.map((r: any) => ({
          ...r,
          amount: parseFloat(r.amount) || 0,
        })),
      );
    if (bsRes.data)
      setBSData(
        bsRes.data.map((r: any) => ({
          ...r,
          balance: parseFloat(r.balance) || 0,
        })),
      );
    if (cfRes.data)
      setCFData(
        cfRes.data.map((r: any) => ({
          ...r,
          amount: parseFloat(r.amount) || 0,
        })),
      );

    setLoading(false);
    setRefreshing(false);

    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [organizationId, from, to]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [from, to, organizationId]);

  const selectPreset = (i: number) => {
    setPreset(i);
    setFrom(presets[i].from);
    setTo(presets[i].to);
  };

  const fmt = (n: number, showSign = false) => {
    const abs = Math.abs(n).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
    });
    if (showSign && n < 0) return `(${abs})`;
    return abs;
  };

  const formatPeriod = () => {
    const f = new Date(from).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const t = new Date(to).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${f} — ${t}`;
  };

  // ── PDF Export ──────────────────────────────────────────────
  const buildPDF = () => {
    const title =
      tab === "pl"
        ? "Income Statement"
        : tab === "bs"
          ? "Balance Sheet"
          : "Cash Flow Statement";
    const rows =
      tab === "pl"
        ? isData.map(
            (r) => `
          <tr class="${r.is_subtotal ? "subtotal" : ""}">
            <td>${r.account_name}</td>
            <td class="amount ${r.amount < 0 ? "neg" : ""}">${r.amount !== 0 ? `₦${fmt(r.amount, true)}` : ""}</td>
          </tr>`,
          )
        : tab === "bs"
          ? bsData.map(
              (r) => `
          <tr class="${r.is_subtotal ? "subtotal" : ""}">
            <td>${r.account_name}</td>
            <td class="amount ${r.balance < 0 ? "neg" : ""}">${r.balance !== 0 ? `₦${fmt(r.balance, true)}` : ""}</td>
          </tr>`,
            )
          : cfData.map(
              (r) => `
          <tr class="${r.is_subtotal ? "subtotal" : ""}">
            <td>${r.label}</td>
            <td class="amount ${r.amount < 0 ? "neg" : ""}">${r.amount !== 0 ? `₦${fmt(r.amount, true)}` : ""}</td>
          </tr>`,
            );

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>
      body { font-family: 'Georgia', serif; color: #1A1008; padding: 40px; max-width: 700px; margin: 0 auto; }
      .header { border-bottom: 3px solid #0E2931; padding-bottom: 20px; margin-bottom: 30px; }
      .org { font-size: 24px; font-weight: bold; color: #0E2931; }
      .title { font-size: 18px; color: #C9922A; margin: 4px 0; }
      .period { font-size: 13px; color: #7A6A52; font-style: italic; }
      table { width: 100%; border-collapse: collapse; }
      tr { border-bottom: 1px solid #D4C9B0; }
      td { padding: 9px 4px; font-size: 14px; }
      .amount { text-align: right; font-family: 'Courier New', monospace; }
      .neg { color: #8B2020; }
      .subtotal td { font-weight: bold; border-top: 2px solid #0E2931; border-bottom: 2px solid #0E2931;
                     background: #F5F0E8; font-size: 15px; }
      .footer { margin-top: 40px; font-size: 11px; color: #B8A98C; text-align: center; }
    </style></head><body>
    <div class="header">
      <div class="org">${orgName}</div>
      <div class="title">${title}</div>
      <div class="period">${formatPeriod()}</div>
    </div>
    <table>${rows.join("")}</table>
    <div class="footer">Generated by Zaena · ${new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</div>
    </body></html>`;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const html = buildPDF();
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  // ── Render helpers ──────────────────────────────────────────

  const renderISSection = (sectionKey: string) => {
    const rows = isData.filter((r) => r.section === sectionKey);
    if (rows.length === 0) return null;
    const label = SECTION_LABELS[sectionKey];
    return (
      <View key={sectionKey} style={s.statSection}>
        {label ? <Text style={s.statSectionLabel}>{label}</Text> : null}
        {rows.map((row, i) => (
          <View key={i} style={[s.statRow, row.is_subtotal && s.subtotalRow]}>
            <Text style={[s.statLabel, row.is_subtotal && s.subtotalLabel]}>
              {row.account_name}
            </Text>
            <Text
              style={[
                s.statAmount,
                row.is_subtotal && s.subtotalAmount,
                row.amount < 0 && s.negAmount,
              ]}
            >
              {row.amount !== 0 ? `₦${fmt(row.amount, true)}` : "—"}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderBSSection = (sectionKey: string) => {
    const rows = bsData.filter((r) => r.section === sectionKey);
    if (rows.length === 0) return null;
    const label = SECTION_LABELS[sectionKey];
    return (
      <View key={sectionKey} style={s.statSection}>
        {label ? <Text style={s.statSectionLabel}>{label}</Text> : null}
        {rows.map((row, i) => (
          <View key={i} style={[s.statRow, row.is_subtotal && s.subtotalRow]}>
            <Text style={[s.statLabel, row.is_subtotal && s.subtotalLabel]}>
              {row.account_name}
            </Text>
            <Text
              style={[
                s.statAmount,
                row.is_subtotal && s.subtotalAmount,
                row.balance < 0 && s.negAmount,
              ]}
            >
              {row.balance !== 0 ? `₦${fmt(row.balance, true)}` : "—"}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderCFSection = (sectionKey: string) => {
    const rows = cfData.filter((r) => r.section === sectionKey);
    if (rows.length === 0) return null;
    const label = SECTION_LABELS[sectionKey];
    return (
      <View key={sectionKey} style={s.statSection}>
        {label ? <Text style={s.statSectionLabel}>{label}</Text> : null}
        {rows.map((row, i) => (
          <View key={i} style={[s.statRow, row.is_subtotal && s.subtotalRow]}>
            <Text style={[s.statLabel, row.is_subtotal && s.subtotalLabel]}>
              {row.label}
            </Text>
            <Text
              style={[
                s.statAmount,
                row.is_subtotal && s.subtotalAmount,
                row.amount < 0 && s.negAmount,
              ]}
            >
              {row.amount !== 0 ? `₦${fmt(row.amount, true)}` : "—"}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>FINANCIAL STATEMENTS</Text>
        <TouchableOpacity
          style={[s.exportBtn, exporting && { opacity: 0.6 }]}
          onPress={handleExport}
          disabled={exporting || loading}
        >
          {exporting ? (
            <ActivityIndicator color={D.gold} size="small" />
          ) : (
            <Text style={s.exportText}>EXPORT</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Period presets */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.presetScroll}
        contentContainerStyle={s.presetContent}
      >
        {presets.map((p, i) => (
          <TouchableOpacity
            key={i}
            style={[s.presetChip, preset === i && s.presetChipActive]}
            onPress={() => selectPreset(i)}
          >
            <Text style={[s.presetText, preset === i && s.presetTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Period label */}
      <View style={s.periodBar}>
        <Text style={s.periodText}>{formatPeriod()}</Text>
      </View>

      {/* Tab switcher */}
      <View style={s.tabRow}>
        {(
          [
            { key: "pl", label: "Income Statement" },
            { key: "bs", label: "Balance Sheet" },
            { key: "cf", label: "Cash Flow" },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, tab === t.key && s.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
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
          {/* Statement header */}
          <View style={s.stmtHeader}>
            <Text style={s.stmtOrg}>{orgName}</Text>
            <Text style={s.stmtTitle}>
              {tab === "pl"
                ? "Income Statement"
                : tab === "bs"
                  ? "Balance Sheet"
                  : "Cash Flow Statement"}
            </Text>
            <Text style={s.stmtPeriod}>{formatPeriod()}</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={D.gold} style={{ marginTop: 40 }} />
          ) : (
            <>
              {tab === "pl" && (
                <>
                  {renderISSection("revenue")}
                  {renderISSection("cogs")}
                  {renderISSection("gross")}
                  {renderISSection("opex")}
                  {renderISSection("ebit")}
                  {renderISSection("finance")}
                  {renderISSection("pbt")}
                  {renderISSection("tax")}
                  {renderISSection("pat")}
                </>
              )}

              {tab === "bs" && (
                <>
                  {renderBSSection("assets")}
                  {renderBSSection("liabilities")}
                  {renderBSSection("equity")}
                  {renderBSSection("check")}
                </>
              )}

              {tab === "cf" && (
                <>
                  {renderCFSection("operating")}
                  {renderCFSection("investing")}
                  {renderCFSection("financing")}
                  {renderCFSection("summary")}
                </>
              )}
            </>
          )}

          {/* Footer note */}
          <Text style={s.footerNote}>
            Prepared by Zaena ·{" "}
            {new Date().toLocaleDateString("en-NG", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Text>
        </ScrollView>
      </Animated.View>
    </View>
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
  exportBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: D.gold,
  },
  exportText: {
    fontSize: 10,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 1,
  },

  presetScroll: { maxHeight: 52, backgroundColor: D.tealMid },
  presetContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#2A5568",
  },
  presetChipActive: { backgroundColor: D.gold, borderColor: D.gold },
  presetText: { fontSize: 11, fontFamily: "DM Mono", color: "#9BB5BE" },
  presetTextActive: { color: D.white },

  periodBar: {
    backgroundColor: D.paperDeep,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: D.rule,
  },
  periodText: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
    fontStyle: "italic",
  },

  tabRow: {
    flexDirection: "row",
    backgroundColor: D.white,
    borderBottomWidth: 2,
    borderBottomColor: D.rule,
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: D.gold },
  tabText: {
    fontSize: 12,
    fontFamily: "DM Mono",
    color: D.inkGhost,
    letterSpacing: 0.5,
  },
  tabTextActive: { color: D.teal },

  scroll: { padding: 20, paddingBottom: 60 },

  stmtHeader: {
    borderLeftWidth: 4,
    borderLeftColor: D.gold,
    paddingLeft: 16,
    marginBottom: 24,
  },
  stmtOrg: {
    fontSize: 18,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.teal,
  },
  stmtTitle: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
    marginTop: 2,
  },
  stmtPeriod: {
    fontSize: 12,
    fontFamily: "DM Mono",
    color: D.inkGhost,
    marginTop: 4,
  },

  statSection: { marginBottom: 4 },
  statSectionLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: D.inkDim,
    paddingTop: 16,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: D.rule,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#EDE7D9",
  },
  subtotalRow: {
    backgroundColor: D.teal,
    paddingHorizontal: 12,
    borderRadius: 2,
    marginVertical: 4,
    borderBottomWidth: 0,
  },
  statLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    color: D.inkMid,
  },
  subtotalLabel: { color: D.white, fontWeight: "700" },
  statAmount: {
    fontSize: 14,
    fontFamily: "DM Mono",
    color: D.ink,
    minWidth: 120,
    textAlign: "right",
  },
  subtotalAmount: { color: D.gold, fontWeight: "700" },
  negAmount: { color: D.red },

  footerNote: {
    fontSize: 11,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 32,
  },
});
