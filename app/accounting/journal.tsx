// app/accounting/journal.tsx
// General Journal / Ledger
// Lists all posted journal entries, filterable by source and date range.
// Tap entry to see full debit/credit lines.

import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
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

type JournalEntry = {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  source: string;
  total_debits: number;
  total_credits: number;
  status: string;
};

type JournalLine = {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  sale: "Sale",
  sale_void: "Sale Void",
  sale_payment: "Payment In",
  purchase: "Purchase",
  purchase_payment: "Supplier Pay",
  expense: "Expense",
  expense_void: "Expense Void",
  owner_drawing: "Drawing",
  payroll: "Payroll",
  opening_entry: "Opening",
  manual: "Manual",
  reconciliation: "Reconciliation",
};

const SOURCE_COLORS: Record<string, string> = {
  sale: "#1A4B6B",
  sale_void: "#8B2020",
  sale_payment: "#1A6B4A",
  purchase: "#4B3A1A",
  purchase_payment: "#6B4A1A",
  expense: "#6B1A4B",
  owner_drawing: "#8B2020",
  payroll: "#3A1A6B",
  opening_entry: "#C9922A",
  manual: "#3D2E1A",
  reconciliation: "#1A6B6B",
};

const FILTER_OPTIONS = [
  "all",
  "sale",
  "purchase",
  "expense",
  "payroll",
  "owner_drawing",
  "manual",
  "opening_entry",
];

export default function Journal() {
  const { organizationId } = useAuthStore();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [lineLoading, setLineLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 30;

  const load = useCallback(
    async (reset = false) => {
      if (!organizationId) return;
      const currentPage = reset ? 0 : page;

      let query = supabase
        .from("journal_entries")
        .select(
          "id, entry_number, entry_date, description, source, total_debits, total_credits, status",
        )
        .eq("organization_id", organizationId)
        .eq("status", "posted")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (filter !== "all") {
        query = query.eq("source", filter);
      }

      const { data } = await query;

      if (data) {
        const mapped = data.map((e) => ({
          ...e,
          total_debits: parseFloat(e.total_debits) || 0,
          total_credits: parseFloat(e.total_credits) || 0,
        }));

        if (reset) {
          setEntries(mapped);
          setPage(1);
        } else {
          setEntries((prev) => [...prev, ...mapped]);
          setPage((p) => p + 1);
        }
        setHasMore(data.length === PAGE_SIZE);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [organizationId, filter, page],
  );

  useEffect(() => {
    setLoading(true);
    setPage(0);
    setEntries([]);
    setHasMore(true);
    load(true);
  }, [filter, organizationId]);

  const openEntry = async (entry: JournalEntry) => {
    setSelected(entry);
    setLineLoading(true);
    setLines([]);

    const { data } = await supabase
      .from("journal_lines")
      .select(
        `
        id, debit, credit, description,
        accounts ( code, name )
      `,
      )
      .eq("journal_entry_id", entry.id)
      .order("debit", { ascending: false });

    if (data) {
      setLines(
        data.map((l: any) => ({
          id: l.id,
          account_code: l.accounts?.code ?? "",
          account_name: l.accounts?.name ?? "",
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          description: l.description,
        })),
      );
    }
    setLineLoading(false);
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>GENERAL JOURNAL</Text>
        <TouchableOpacity
          onPress={() => router.push("/accounting/financial-statements" as any)}
          style={s.topRight}
        >
          <Text style={s.topRightText}>REPORTS</Text>
        </TouchableOpacity>
      </View>

      {/* Source filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterContent}
      >
        {FILTER_OPTIONS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filter === f && s.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f === "all"
                ? "ALL"
                : (SOURCE_LABELS[f]?.toUpperCase() ?? f.toUpperCase())}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={D.gold} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No Entries</Text>
          <Text style={s.emptySub}>
            Journal entries will appear here once transactions are recorded
            after your accounting activation date.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(true);
              }}
              tintColor={D.gold}
            />
          }
          onEndReached={() => {
            if (hasMore && !loading) load();
          }}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.entryRow}
              onPress={() => openEntry(item)}
              activeOpacity={0.8}
            >
              {/* Source badge */}
              <View
                style={[
                  s.sourceBadge,
                  { backgroundColor: SOURCE_COLORS[item.source] || D.inkMid },
                ]}
              >
                <Text style={s.sourceText}>
                  {(SOURCE_LABELS[item.source] || item.source)
                    .toUpperCase()
                    .slice(0, 4)}
                </Text>
              </View>

              <View style={s.entryMid}>
                <View style={s.entryTopRow}>
                  <Text style={s.entryNumber}>{item.entry_number}</Text>
                  <Text style={s.entryDate}>{formatDate(item.entry_date)}</Text>
                </View>
                <Text style={s.entryDesc} numberOfLines={1}>
                  {item.description}
                </Text>
              </View>

              <View style={s.entryAmounts}>
                <Text style={s.entryDebit}>₦{fmt(item.total_debits)}</Text>
                {item.status === "reversed" && (
                  <Text style={s.reversedTag}>REVERSED</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            hasMore ? (
              <ActivityIndicator color={D.gold} style={{ padding: 20 }} />
            ) : null
          }
        />
      )}

      {/* ── Entry Detail Modal ── */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalEntryNum}>{selected.entry_number}</Text>
                <Text style={s.modalDesc}>{selected.description}</Text>
                <Text style={s.modalDate}>
                  {formatDate(selected.entry_date)}
                </Text>
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
              {/* Source + status */}
              <View style={s.modalMeta}>
                <View
                  style={[
                    s.sourceBadgeLg,
                    {
                      backgroundColor:
                        SOURCE_COLORS[selected.source] || D.inkMid,
                    },
                  ]}
                >
                  <Text style={s.sourceBadgeLgText}>
                    {SOURCE_LABELS[selected.source] || selected.source}
                  </Text>
                </View>
                {selected.status === "reversed" && (
                  <View style={s.reversedBadge}>
                    <Text style={s.reversedBadgeText}>REVERSED</Text>
                  </View>
                )}
              </View>

              {/* Lines header */}
              <View style={s.linesHeader}>
                <Text style={[s.linesCol, { flex: 1 }]}>ACCOUNT</Text>
                <Text style={[s.linesCol, s.linesRight]}>DEBIT</Text>
                <Text style={[s.linesCol, s.linesRight]}>CREDIT</Text>
              </View>

              {lineLoading ? (
                <ActivityIndicator color={D.gold} style={{ margin: 20 }} />
              ) : (
                <>
                  {lines.map((line, i) => (
                    <View
                      key={line.id}
                      style={[
                        s.lineRow,
                        i === lines.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <View style={s.lineAcct}>
                        <Text style={s.lineAcctCode}>{line.account_code}</Text>
                        <Text style={s.lineAcctName}>{line.account_name}</Text>
                        {line.description && (
                          <Text style={s.lineAcctMemo} numberOfLines={1}>
                            {line.description}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={[
                          s.lineAmt,
                          { color: line.debit > 0 ? D.green : D.inkGhost },
                        ]}
                      >
                        {line.debit > 0 ? `₦${fmt(line.debit)}` : "—"}
                      </Text>
                      <Text
                        style={[
                          s.lineAmt,
                          { color: line.credit > 0 ? D.red : D.inkGhost },
                        ]}
                      >
                        {line.credit > 0 ? `₦${fmt(line.credit)}` : "—"}
                      </Text>
                    </View>
                  ))}

                  {/* Totals row */}
                  <View style={s.totalsRow}>
                    <Text style={s.totalsLabel}>TOTALS</Text>
                    <Text style={s.totalsDebit}>
                      ₦{fmt(selected.total_debits)}
                    </Text>
                    <Text style={s.totalsCredit}>
                      ₦{fmt(selected.total_credits)}
                    </Text>
                  </View>

                  {/* Balance check */}
                  <View
                    style={[
                      s.balanceCheck,
                      Math.abs(selected.total_debits - selected.total_credits) <
                      0.01
                        ? s.balanceCheckOk
                        : s.balanceCheckErr,
                    ]}
                  >
                    <Text style={s.balanceCheckText}>
                      {Math.abs(
                        selected.total_debits - selected.total_credits,
                      ) < 0.01
                        ? "✓ Entry is balanced"
                        : "⚠ Entry is unbalanced"}
                    </Text>
                  </View>
                </>
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

  filterScroll: {
    maxHeight: 52,
    backgroundColor: D.paperDeep,
    borderBottomWidth: 1,
    borderBottomColor: D.rule,
  },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: D.rule,
    backgroundColor: D.white,
  },
  filterChipActive: { backgroundColor: D.teal, borderColor: D.teal },
  filterText: {
    fontSize: 10,
    fontFamily: "DM Mono",
    color: D.inkDim,
    letterSpacing: 1,
  },
  filterTextActive: { color: D.gold },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.inkDim,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    textAlign: "center",
    lineHeight: 22,
    fontStyle: "italic",
  },

  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: D.white,
  },
  sourceBadge: {
    width: 40,
    height: 40,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  sourceText: {
    fontSize: 9,
    fontFamily: "DM Mono",
    color: D.white,
    letterSpacing: 0.5,
  },
  entryMid: { flex: 1 },
  entryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  entryNumber: { fontSize: 11, fontFamily: "DM Mono", color: D.gold },
  entryDate: { fontSize: 11, fontFamily: "DM Mono", color: D.inkGhost },
  entryDesc: { fontSize: 14, fontFamily: "Cormorant Garamond", color: D.ink },
  entryAmounts: { alignItems: "flex-end", marginLeft: 8 },
  entryDebit: { fontSize: 13, fontFamily: "DM Mono", color: D.ink },
  reversedTag: {
    fontSize: 9,
    fontFamily: "DM Mono",
    color: D.red,
    marginTop: 2,
  },
  separator: { height: 1, backgroundColor: D.rule },

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
  modalEntryNum: {
    fontSize: 12,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 2,
    marginBottom: 4,
  },
  modalDesc: {
    fontSize: 20,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.white,
    maxWidth: 260,
    marginBottom: 4,
  },
  modalDate: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: "#9BB5BE",
    fontStyle: "italic",
  },
  modalClose: { padding: 8 },
  modalCloseText: { color: D.gold, fontSize: 18 },
  modalScroll: { flex: 1, padding: 20 },
  modalMeta: { flexDirection: "row", gap: 8, marginBottom: 20 },
  sourceBadgeLg: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 2 },
  sourceBadgeLgText: {
    fontSize: 11,
    fontFamily: "DM Mono",
    color: D.white,
    letterSpacing: 1,
  },
  reversedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 2,
    backgroundColor: D.red,
  },
  reversedBadgeText: { fontSize: 11, fontFamily: "DM Mono", color: D.white },

  linesHeader: {
    flexDirection: "row",
    paddingHorizontal: 0,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: D.teal,
    marginBottom: 4,
  },
  linesCol: {
    fontSize: 10,
    fontFamily: "DM Mono",
    color: D.inkDim,
    letterSpacing: 1,
  },
  linesRight: { width: 100, textAlign: "right" },

  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: D.rule,
  },
  lineAcct: { flex: 1, paddingRight: 8 },
  lineAcctCode: {
    fontSize: 11,
    fontFamily: "DM Mono",
    color: D.gold,
    marginBottom: 2,
  },
  lineAcctName: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    fontWeight: "600",
    color: D.ink,
  },
  lineAcctMemo: {
    fontSize: 11,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
    fontStyle: "italic",
  },
  lineAmt: {
    width: 100,
    textAlign: "right",
    fontSize: 13,
    fontFamily: "DM Mono",
  },

  totalsRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderTopWidth: 2,
    borderTopColor: D.teal,
    marginTop: 4,
  },
  totalsLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: "DM Mono",
    color: D.inkDim,
    letterSpacing: 1,
  },
  totalsDebit: {
    width: 100,
    textAlign: "right",
    fontSize: 13,
    fontFamily: "DM Mono",
    color: D.green,
    fontWeight: "700",
  },
  totalsCredit: {
    width: 100,
    textAlign: "right",
    fontSize: 13,
    fontFamily: "DM Mono",
    color: D.red,
    fontWeight: "700",
  },

  balanceCheck: { padding: 10, borderRadius: 4, marginTop: 12 },
  balanceCheckOk: { backgroundColor: "#E8F5EE" },
  balanceCheckErr: { backgroundColor: "#F5E8E8" },
  balanceCheckText: {
    fontSize: 13,
    fontFamily: "DM Mono",
    textAlign: "center",
  },
});
