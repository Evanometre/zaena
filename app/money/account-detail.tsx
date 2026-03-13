// app/money/account-detail.tsx
// Account Detail — transaction history + unrecorded income entry
// Accessed from Money Register by tapping an account card.

import { supabase } from "@/lib/supabase";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
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

type AccountEvent = {
  id: string;
  event_type: string;
  direction: string;
  amount: number;
  reference_type: string | null;
  reference_id: string | null;
  category: string | null;
  notes: string | null;
  occurred_at: string;
  running_balance: number;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  sale_revenue: "Sale",
  purchase_payment: "Supplier Payment",
  operating_expense: "Expense",
  refund: "Refund",
  owner_contribution: "Owner Contribution",
  owner_withdrawal: "Owner Withdrawal",
};

const COMMON_SOURCES = [
  "Market sales",
  "Side business",
  "Personal contribution",
  "Loan received",
  "Asset sale",
  "Rental income",
  "Commission",
  "Consulting fee",
  "Other",
];

export default function AccountDetail() {
  const { organizationId, user } = useAuthStore();
  const { accountId, accountName, accountType, bookBalance } =
    useLocalSearchParams<{
      accountId: string;
      accountName: string;
      accountType: string;
      bookBalance?: string;
    }>();

  const [events, setEvents] = useState<AccountEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentBalance, setCurrentBalance] = useState(
    bookBalance ? parseFloat(bookBalance) : 0,
  );
  const [showIncome, setShowIncome] = useState(false);

  // Unrecorded income form state
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeSource, setIncomeSource] = useState("");
  const [incomeNotes, setIncomeNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const PAGE_SIZE = 30;
  const offsetRef = useRef(0);

  const loadEvents = useCallback(
    async (reset = false) => {
      if (!organizationId || !accountId) return;
      const offset = reset ? 0 : offsetRef.current;

      const { data } = await supabase.rpc("get_account_events", {
        p_account_id: accountId,
        p_org_id: organizationId,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });

      if (data) {
        const mapped = data.map((e: any) => ({
          ...e,
          amount: parseFloat(e.amount) || 0,
          running_balance: parseFloat(e.running_balance) || 0,
        }));

        if (reset) {
          setEvents(mapped);
          offsetRef.current = PAGE_SIZE;
        } else {
          setEvents((prev) => [...prev, ...mapped]);
          offsetRef.current += PAGE_SIZE;
        }
        setHasMore(data.length === PAGE_SIZE);
      }

      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    },
    [organizationId, accountId],
  );

  // Refresh balance from DB
  const refreshBalance = useCallback(async () => {
    if (!organizationId || !accountId) return;
    const { data } = await supabase.rpc("get_account_book_balance", {
      p_account_id: accountId,
      p_org_id: organizationId,
    });
    if (data !== null) setCurrentBalance(parseFloat(data) || 0);
  }, [organizationId, accountId]);

  useEffect(() => {
    loadEvents(true);
    refreshBalance();
  }, []);

  const handleLoadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    loadEvents(false);
  };

  const openIncomeSheet = () => {
    setShowIncome(true);
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeIncomeSheet = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowIncome(false);
      setIncomeAmount("");
      setIncomeSource("");
      setIncomeNotes("");
    });
  };

  const handleRecordIncome = async () => {
    const amount = parseFloat(incomeAmount);
    if (!amount || amount <= 0) {
      Alert.alert(
        "Invalid Amount",
        "Please enter a valid amount greater than zero.",
      );
      return;
    }
    if (!incomeSource.trim()) {
      Alert.alert(
        "Source Required",
        "Please describe where this income came from.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("record_unrecorded_income", {
        p_org_id: organizationId,
        p_account_id: accountId,
        p_amount: amount,
        p_source: incomeSource.trim(),
        p_notes: incomeNotes.trim() || null,
        p_occurred_at: new Date().toISOString(),
        p_created_by: user ?? null,
      });

      if (error) throw error;

      closeIncomeSheet();
      // Reload events and balance
      setLoading(true);
      await Promise.all([loadEvents(true), refreshBalance()]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to record income.");
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n: number) =>
    Math.abs(n).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const getEventLabel = (event: AccountEvent) => {
    if (event.reference_type === "unrecorded_income")
      return "Unrecorded Income";
    if (event.reference_type === "reconciliation")
      return "Reconciliation Adjustment";
    return EVENT_TYPE_LABELS[event.event_type] ?? event.event_type;
  };

  const slideStyle = {
    transform: [
      {
        translateY: slideAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [400, 0],
        }),
      },
    ],
  };

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topName}>{accountName}</Text>
          <Text style={s.topType}>{accountType?.toUpperCase()}</Text>
        </View>
        <TouchableOpacity
          style={s.reconcileBtn}
          onPress={() =>
            router.push({
              pathname: "/money/reconcile" as any,
              params: {
                accountId,
                accountName,
                accountType,
                bookBalance: currentBalance.toString(),
              },
            })
          }
        >
          <Text style={s.reconcileBtnText}>RECONCILE</Text>
        </TouchableOpacity>
      </View>

      {/* Balance header */}
      <View style={s.balanceHeader}>
        <View style={s.balanceLeft}>
          <Text style={s.balanceCaption}>BOOK BALANCE</Text>
          <Text
            style={[s.balanceAmount, currentBalance < 0 && { color: D.red }]}
          >
            {currentBalance < 0 ? "-" : ""}₦{fmt(currentBalance)}
          </Text>
        </View>
        <TouchableOpacity style={s.addIncomeBtn} onPress={openIncomeSheet}>
          <Text style={s.addIncomeBtnText}>+ Unrecorded Income</Text>
        </TouchableOpacity>
      </View>

      {/* Events list */}
      {loading ? (
        <ActivityIndicator color={D.gold} style={{ marginTop: 40 }} />
      ) : events.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No Transactions</Text>
          <Text style={s.emptySub}>
            Transactions on this account will appear here as they are recorded.
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                Promise.all([loadEvents(true), refreshBalance()]);
              }}
              tintColor={D.gold}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={D.gold} style={{ padding: 20 }} />
            ) : null
          }
          renderItem={({ item }) => (
            <View style={s.eventRow}>
              {/* Direction indicator */}
              <View
                style={[
                  s.directionBar,
                  {
                    backgroundColor: item.direction === "in" ? D.green : D.red,
                  },
                ]}
              />

              <View style={s.eventContent}>
                <View style={s.eventTopRow}>
                  <Text style={s.eventLabel}>{getEventLabel(item)}</Text>
                  <Text
                    style={[
                      s.eventAmount,
                      { color: item.direction === "in" ? D.green : D.red },
                    ]}
                  >
                    {item.direction === "in" ? "+" : "-"}₦{fmt(item.amount)}
                  </Text>
                </View>

                {item.notes && (
                  <Text style={s.eventNotes} numberOfLines={1}>
                    {item.notes}
                  </Text>
                )}
                {item.category && !item.notes && (
                  <Text style={s.eventNotes} numberOfLines={1}>
                    {item.category}
                  </Text>
                )}

                <View style={s.eventBottomRow}>
                  <Text style={s.eventDate}>
                    {formatDateTime(item.occurred_at)}
                  </Text>
                  <Text style={s.eventRunning}>
                    Balance: ₦{fmt(item.running_balance)}
                  </Text>
                </View>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      )}

      {/* ── Unrecorded Income Bottom Sheet ── */}
      {showIncome && (
        <KeyboardAvoidingView
          style={StyleSheet.absoluteFill}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          pointerEvents="box-none"
        >
          {/* Backdrop */}
          <TouchableOpacity
            style={s.backdrop}
            activeOpacity={1}
            onPress={closeIncomeSheet}
          />

          <Animated.View style={[s.sheet, slideStyle]}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Record Unrecorded Income</Text>
            <Text style={s.sheetSub}>
              Declare income that was received but not recorded in Zaena. This
              keeps your book balance accurate.
            </Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Amount */}
              <Text style={s.fieldLabel}>AMOUNT</Text>
              <View style={s.amountWrap}>
                <Text style={s.currencySymbol}>₦</Text>
                <TextInput
                  style={s.amountInput}
                  value={incomeAmount}
                  onChangeText={(v) =>
                    setIncomeAmount(v.replace(/[^0-9.]/g, ""))
                  }
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={D.inkGhost}
                  autoFocus
                />
              </View>

              {/* Source */}
              <Text style={[s.fieldLabel, { marginTop: 16 }]}>SOURCE</Text>
              <TextInput
                style={s.textInput}
                value={incomeSource}
                onChangeText={setIncomeSource}
                placeholder="Where did this money come from?"
                placeholderTextColor={D.inkGhost}
                maxLength={100}
              />

              {/* Common source chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.chipScroll}
              >
                {COMMON_SOURCES.map((src) => (
                  <TouchableOpacity
                    key={src}
                    style={[
                      s.sourceChip,
                      incomeSource === src && s.sourceChipActive,
                    ]}
                    onPress={() => setIncomeSource(src)}
                  >
                    <Text
                      style={[
                        s.sourceChipText,
                        incomeSource === src && s.sourceChipTextActive,
                      ]}
                    >
                      {src}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Notes */}
              <Text style={[s.fieldLabel, { marginTop: 16 }]}>
                NOTES (OPTIONAL)
              </Text>
              <TextInput
                style={[s.textInput, { height: 72, textAlignVertical: "top" }]}
                value={incomeNotes}
                onChangeText={setIncomeNotes}
                placeholder="Any additional details…"
                placeholderTextColor={D.inkGhost}
                multiline
              />

              {/* Receiving account info */}
              <View style={s.accountInfo}>
                <Text style={s.accountInfoText}>
                  Recording into:{" "}
                  <Text style={{ color: D.gold }}>{accountName}</Text>
                </Text>
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[s.submitBtn, submitting && { opacity: 0.7 }]}
                onPress={handleRecordIncome}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={D.white} />
                ) : (
                  <Text style={s.submitBtnText}>Record Income</Text>
                )}
              </TouchableOpacity>

              <View style={{ height: 32 }} />
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      )}
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
  topCenter: { alignItems: "center" },
  topName: {
    fontSize: 16,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.white,
  },
  topType: {
    fontSize: 10,
    fontFamily: "DM Mono",
    color: "#9BB5BE",
    letterSpacing: 1,
  },
  reconcileBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: D.gold,
  },
  reconcileBtnText: {
    fontSize: 10,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 1,
  },

  balanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: D.tealMid,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  balanceLeft: { flex: 1 },
  balanceCaption: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: "#9BB5BE",
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 28,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.white,
  },
  addIncomeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 2,
    backgroundColor: D.gold,
  },
  addIncomeBtnText: {
    fontSize: 11,
    fontFamily: "DM Mono",
    color: D.white,
    letterSpacing: 0.5,
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
  },
  emptyTitle: {
    fontSize: 20,
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

  // Event rows
  eventRow: { flexDirection: "row", backgroundColor: D.white },
  directionBar: { width: 4 },
  eventContent: { flex: 1, paddingHorizontal: 16, paddingVertical: 13 },
  eventTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  eventLabel: {
    fontSize: 14,
    fontFamily: "Cormorant Garamond",
    fontWeight: "600",
    color: D.ink,
    flex: 1,
  },
  eventAmount: { fontSize: 15, fontFamily: "DM Mono", fontWeight: "700" },
  eventNotes: {
    fontSize: 12,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
    fontStyle: "italic",
    marginBottom: 4,
  },
  eventBottomRow: { flexDirection: "row", justifyContent: "space-between" },
  eventDate: {
    fontSize: 11,
    fontFamily: "Cormorant Garamond",
    color: D.inkGhost,
  },
  eventRunning: { fontSize: 11, fontFamily: "DM Mono", color: D.inkGhost },
  separator: { height: 1, backgroundColor: D.rule },

  // Bottom sheet
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: D.paper,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 0,
    maxHeight: "90%",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: D.rule,
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontFamily: "Cormorant Garamond",
    fontWeight: "700",
    color: D.ink,
    marginBottom: 6,
  },
  sheetSub: {
    fontSize: 13,
    fontFamily: "Cormorant Garamond",
    color: D.inkDim,
    lineHeight: 20,
    marginBottom: 20,
    fontStyle: "italic",
  },

  fieldLabel: {
    fontSize: 10,
    fontFamily: "DM Mono",
    letterSpacing: 2,
    color: D.inkDim,
    marginBottom: 8,
  },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: D.gold,
    borderRadius: 4,
    paddingHorizontal: 14,
    backgroundColor: D.white,
  },
  currencySymbol: {
    fontSize: 20,
    fontFamily: "DM Mono",
    color: D.inkDim,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontFamily: "Cormorant Garamond",
    color: D.ink,
    paddingVertical: 12,
  },
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
  },
  chipScroll: { marginTop: 10, marginBottom: 4 },
  sourceChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: D.rule,
    backgroundColor: D.white,
    marginRight: 8,
  },
  sourceChipActive: { backgroundColor: D.teal, borderColor: D.teal },
  sourceChipText: { fontSize: 12, fontFamily: "DM Mono", color: D.inkDim },
  sourceChipTextActive: { color: D.gold },

  accountInfo: {
    backgroundColor: D.paperDeep,
    borderRadius: 4,
    padding: 12,
    marginTop: 16,
    marginBottom: 4,
  },
  accountInfoText: {
    fontSize: 13,
    fontFamily: "Cormorant Garamond",
    color: D.inkMid,
  },

  submitBtn: {
    backgroundColor: D.teal,
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 16,
  },
  submitBtnText: {
    fontSize: 13,
    fontFamily: "DM Mono",
    color: D.gold,
    letterSpacing: 1,
  },
});
