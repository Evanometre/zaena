// app/accounting/chart-of-accounts.tsx
// Chart of Accounts — browse, search, view account detail
// Grouped by category. Tap account to see balance + journal history.

import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  SectionList,
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

type Account = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  normal_balance: string;
  is_system: boolean;
  is_active: boolean;
  is_reconcilable: boolean;
};

type AccountBalance = {
  opening_balance: number;
  period_debits: number;
  period_credits: number;
  closing_balance: number;
};

type JournalLine = {
  entry_number: string;
  entry_date: string;
  description: string;
  debit: number;
  credit: number;
  source: string;
};

const CATEGORY_ORDER = ["asset", "liability", "equity", "income", "expense"];
const CATEGORY_LABELS: Record<string, string> = {
  asset: "ASSETS",
  liability: "LIABILITIES",
  equity: "EQUITY",
  income: "INCOME",
  expense: "EXPENSES",
};
const CATEGORY_COLORS: Record<string, string> = {
  asset: "#1A6B4A",
  liability: "#8B2020",
  equity: "#C9922A",
  income: "#1A4B6B",
  expense: "#4B1A6B",
};

export default function ChartOfAccounts() {
  const { organizationId } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Account | null>(null);
  const [balances, setBalances] = useState<AccountBalance | null>(null);
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from("accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("code");
    if (data) setAccounts(data);
    setLoading(false);
    setRefreshing(false);
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (account: Account) => {
    setSelected(account);
    setDetailLoading(true);
    setBalances(null);
    setLines([]);

    // Get balance for current month
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];

    const { data: balData } = await supabase
      .from("account_balances")
      .select("opening_balance, period_debits, period_credits, closing_balance")
      .eq("organization_id", organizationId)
      .eq("account_id", account.id)
      .order("last_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (balData) setBalances(balData);

    // Get recent journal lines for this account
    const { data: lineData } = await supabase
      .from("journal_lines")
      .select(
        `
        debit, credit,
        journal_entries (
          entry_number, entry_date, description, source
        )
      `,
      )
      .eq("account_id", account.id)
      .eq("organization_id", organizationId)
      .order("id", { ascending: false })
      .limit(20);

    if (lineData) {
      const mapped = lineData.map((l: any) => ({
        entry_number: l.journal_entries?.entry_number ?? "",
        entry_date: l.journal_entries?.entry_date ?? "",
        description: l.journal_entries?.description ?? "",
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        source: l.journal_entries?.source ?? "",
      }));
      setLines(mapped);
    }
    setDetailLoading(false);
  };

  // Filter and group
  const filtered = accounts.filter(
    (a) =>
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.code.includes(search),
  );

  // Only show leaf accounts (those with parent — i.e. not group headers)
  // Show all for search, hide group headers when browsing
  const visible = search
    ? filtered
    : filtered
        .filter((a) => {
          // Hide pure group headers (1000, 2000, 3000, 4000, 5000, 6000, 7000)
          // These have no parent_id and end in 000
          return !a.code.endsWith("000") || a.code === "1000";
        })
        .filter(
          (a) =>
            !["1000", "2000", "3000", "4000", "5000", "6000", "7000"].includes(
              a.code,
            ),
        );

  const sections = CATEGORY_ORDER.map((cat) => ({
    title: cat,
    data: visible.filter((a) => a.category === cat),
  })).filter((s) => s.data.length > 0);

  const fmt = (n: number) =>
    Math.abs(n).toLocaleString("en-NG", { minimumFractionDigits: 2 });

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>CHART OF ACCOUNTS</Text>
        <TouchableOpacity
          onPress={() => router.push("/accounting/journal" as any)}
          style={s.topRight}
        >
          <Text style={s.topRightText}>LEDGER</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>⌕</Text>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search accounts or codes…"
          placeholderTextColor={D.inkGhost}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Text style={s.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={D.gold} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
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
          renderSectionHeader={({ section }) => (
            <View
              style={[
                s.sectionHeader,
                { borderLeftColor: CATEGORY_COLORS[section.title] },
              ]}
            >
              <Text
                style={[
                  s.sectionTitle,
                  { color: CATEGORY_COLORS[section.title] },
                ]}
              >
                {CATEGORY_LABELS[section.title]}
              </Text>
              <Text style={s.sectionCount}>{section.data.length} accounts</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.accountRow}
              onPress={() => openDetail(item)}
              activeOpacity={0.75}
            >
              <View style={s.accountCode}>
                <Text style={s.codeText}>{item.code}</Text>
              </View>
              <View style={s.accountInfo}>
                <Text style={s.accountName}>{item.name}</Text>
                {item.is_reconcilable && (
                  <Text style={s.reconcilableBadge}>RECONCILABLE</Text>
                )}
              </View>
              <View style={s.accountMeta}>
                <Text style={s.normalBalance}>
                  {item.normal_balance === "debit" ? "DR" : "CR"}
                </Text>
                {item.is_system && <Text style={s.systemBadge}>SYS</Text>}
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
        />
      )}

      {/* ── Account Detail Modal ── */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <View style={s.modal}>
            {/* Modal header */}
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalCode}>{selected.code}</Text>
                <Text style={s.modalName}>{selected.name}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelected(null)}
                style={s.modalClose}
              >
                <Text style={s.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={s.modalScroll}
              showsVerticalScrollIndicator={false}
            >
              {/* Account metadata */}
              <View style={s.metaGrid}>
                {[
                  { k: "Category", v: selected.category },
                  {
                    k: "Normal Balance",
                    v: selected.normal_balance.toUpperCase(),
                  },
                  { k: "Subcategory", v: selected.subcategory ?? "—" },
                  { k: "System Account", v: selected.is_system ? "Yes" : "No" },
                ].map((row) => (
                  <View key={row.k} style={s.metaRow}>
                    <Text style={s.metaKey}>{row.k}</Text>
                    <Text style={s.metaVal}>{row.v}</Text>
                  </View>
                ))}
              </View>

              {/* Current period balance */}
              <Text style={s.sectionLabelSm}>CURRENT PERIOD BALANCE</Text>
              {detailLoading ? (
                <ActivityIndicator color={D.gold} style={{ margin: 20 }} />
              ) : balances ? (
                <View style={s.balanceCard}>
                  <View style={s.balanceCardRow}>
                    <Text style={s.balanceCardLabel}>Opening</Text>
                    <Text style={s.balanceCardVal}>
                      ₦{fmt(balances.opening_balance)}
                    </Text>
                  </View>
                  <View style={s.balanceCardRow}>
                    <Text style={s.balanceCardLabel}>Debits</Text>
                    <Text style={[s.balanceCardVal, { color: D.inkMid }]}>
                      ₦{fmt(balances.period_debits)}
                    </Text>
                  </View>
                  <View style={s.balanceCardRow}>
                    <Text style={s.balanceCardLabel}>Credits</Text>
                    <Text style={[s.balanceCardVal, { color: D.inkMid }]}>
                      ₦{fmt(balances.period_credits)}
                    </Text>
                  </View>
                  <View style={[s.balanceCardRow, s.balanceCardTotal]}>
                    <Text style={s.balanceCardLabelBold}>Closing Balance</Text>
                    <Text
                      style={[
                        s.balanceCardValBold,
                        {
                          color:
                            balances.closing_balance >= 0 ? D.green : D.red,
                        },
                      ]}
                    >
                      ₦{fmt(balances.closing_balance)}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={s.emptyNote}>No activity this period.</Text>
              )}

              {/* Recent journal lines */}
              <Text style={[s.sectionLabelSm, { marginTop: 20 }]}>
                RECENT JOURNAL ENTRIES
              </Text>
              {lines.length === 0 && !detailLoading ? (
                <Text style={s.emptyNote}>
                  No entries for this account yet.
                </Text>
              ) : (
                lines.map((line, i) => (
                  <View key={i} style={s.lineRow}>
                    <View style={s.lineLeft}>
                      <Text style={s.lineNumber}>{line.entry_number}</Text>
                      <Text style={s.lineDesc} numberOfLines={1}>
                        {line.description}
                      </Text>
                      <Text style={s.lineDate}>
                        {new Date(line.entry_date).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                    </View>
                    <View style={s.lineRight}>
                      {line.debit > 0 && (
                        <Text style={s.lineDR}>DR ₦{fmt(line.debit)}</Text>
                      )}
                      {line.credit > 0 && (
                        <Text style={s.lineCR}>CR ₦{fmt(line.credit)}</Text>
                      )}
                    </View>
                  </View>
                ))
              )}

              <View style={{ height: 48 }} />
            </ScrollView>
          </View>
        )}
      </Modal>
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
  topRight: { alignItems: "flex-end" },
  topRightText: {
    color: D.gold,
    fontSize: 11,
    fontFamily: "DM Mono",
    letterSpacing: 1,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    backgroundColor: D.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.rule,
    paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 18, color: D.inkGhost, marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    color: D.ink,
    paddingVertical: 12,
  },
  searchClear: { fontSize: 14, color: D.inkGhost, padding: 4 },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: D.paperDeep,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderLeftWidth: 3,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    fontWeight: "700",
  },
  sectionCount: { fontSize: 11, fontFamily: "DM Mono", color: D.inkGhost },

  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: D.white,
  },
  accountCode: { width: 48, marginRight: 12 },
  codeText: { fontSize: 12, fontFamily: "DM Mono", color: D.gold },
  accountInfo: { flex: 1 },
  accountName: {
    fontSize: 15,
    fontFamily: "Cormorant Garamond",
    fontWeight: "600",
    color: D.ink,
  },
  reconcilableBadge: {
    fontSize: 9,
    fontFamily: "DM Mono",
    color: D.teal,
    marginTop: 2,
  },
  accountMeta: { alignItems: "flex-end", marginRight: 8, gap: 4 },
  normalBalance: { fontSize: 11, fontFamily: "DM Mono", color: D.inkGhost },
  systemBadge: { fontSize: 9, fontFamily: "DM Mono", color: D.gold },
  chevron: { fontSize: 20, color: D.rule },
  separator: { height: 1, backgroundColor: D.rule, marginLeft: 76 },

  // Modal
  modal: { flex: 1, backgroundColor: D.paper },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: D.teal,
    paddingTop: 52,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  modalCode: {
    fontSize: 12,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 2,
    marginBottom: 4,
  },
  modalName: {
    fontSize: 22,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.white,
    maxWidth: 260,
  },
  modalClose: { padding: 8 },
  modalCloseText: { color: D.gold, fontSize: 18 },
  modalScroll: { flex: 1, padding: 20 },

  metaGrid: {
    backgroundColor: D.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.rule,
    marginBottom: 20,
    overflow: "hidden",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: D.rule,
  },
  metaKey: { fontSize: 12, fontFamily: "DM Mono", color: D.inkDim },
  metaVal: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    fontWeight: "600",
    color: D.ink,
    textTransform: "capitalize",
  },

  sectionLabelSm: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: D.inkDim,
    marginBottom: 10,
  },

  balanceCard: {
    backgroundColor: D.teal,
    borderRadius: 4,
    padding: 16,
    marginBottom: 4,
  },
  balanceCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  balanceCardLabel: {
    fontSize: 13,
    fontFamily: "Cormorant Garamond",
    color: "#9BB5BE",
  },
  balanceCardVal: { fontSize: 15, fontFamily: "DM Mono", color: D.white },
  balanceCardTotal: {
    borderTopWidth: 1,
    borderTopColor: "#2A5568",
    paddingTop: 10,
    marginTop: 4,
  },
  balanceCardLabelBold: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.white,
  },
  balanceCardValBold: { fontSize: 18, fontFamily: "DM Mono" },

  emptyNote: {
    fontSize: 13,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
    marginBottom: 16,
  },

  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: D.rule,
  },
  lineLeft: { flex: 1, marginRight: 12 },
  lineNumber: {
    fontSize: 11,
    fontFamily: "DM Mono",
    color: D.gold,
    marginBottom: 2,
  },
  lineDesc: { fontSize: 14, fontFamily: "Cormorant Garamond", color: D.ink },
  lineDate: {
    fontSize: 11,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
    marginTop: 2,
  },
  lineRight: { alignItems: "flex-end", justifyContent: "center" },
  lineDR: { fontSize: 13, fontFamily: "DM Mono", color: D.green },
  lineCR: { fontSize: 13, fontFamily: "DM Mono", color: D.red },
});
