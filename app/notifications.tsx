// app/notifications.tsx
import { AppNotification, useNotifications } from "@/hooks/useNotifications";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { useRouter } from "expo-router";
import React from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ── Severity config ───────────────────────────────────────────

const SEVERITY = {
  critical: { bar: "#C0392B", bg: "rgba(192,57,43,0.08)", label: "Critical" },
  warning: { bar: "#C9922A", bg: "rgba(201,146,42,0.08)", label: "Warning" },
  info: { bar: "#2B7574", bg: "rgba(43,117,116,0.08)", label: "Info" },
};

const TYPE_ICON: Record<AppNotification["type"], string> = {
  overdue_invoice: "₦",
  invoice_due_soon: "◷",
  voided_sale: "✕",
  stuck_sync: "⟳",
};

// ── Notification card ─────────────────────────────────────────

function NotifCard({ item }: { item: AppNotification }) {
  const { theme: t } = useTheme();
  const sev = SEVERITY[item.severity];
  const date = new Date(item.timestamp);
  const dateStr = date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  });

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: sev.bg,
          borderColor: sev.bar + "40",
        },
      ]}
    >
      {/* Left severity bar */}
      <View style={[styles.cardBar, { backgroundColor: sev.bar }]} />

      <View style={styles.cardIcon}>
        <Text style={[styles.cardIconText, { color: sev.bar }]}>
          {TYPE_ICON[item.type]}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, { color: t.colors.textPrimary }]}>
            {item.title}
          </Text>
          <Text style={[styles.cardDate, { color: t.colors.textMuted }]}>
            {dateStr}
          </Text>
        </View>
        <Text style={[styles.cardText, { color: t.colors.textSecondary }]}>
          {item.body}
        </Text>
        {item.meta?.lastError && (
          <Text style={[styles.cardError, { color: SEVERITY.critical.bar }]}>
            {item.meta.lastError}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { theme: t } = useTheme();
  const router = useRouter();
  const { notifications, loading, refetch } = useNotifications();
  const [refreshing, setRefreshing] = React.useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const critical = notifications.filter((n) => n.severity === "critical");
  const warning = notifications.filter((n) => n.severity === "warning");
  const info = notifications.filter((n) => n.severity === "info");

  const c = t.colors;
  const sp = t.spacing;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.canvas }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={[styles.backText, { color: c.textMuted }]}>← Back</Text>
        </TouchableOpacity>
        <Text
          style={[
            styles.title,
            { color: c.textPrimary, fontFamily: t.typography.h2.fontFamily },
          ]}
        >
          Notifications
        </Text>
        {notifications.length > 0 && (
          <View
            style={[styles.badge, { backgroundColor: SEVERITY.critical.bar }]}
          >
            <Text style={styles.badgeText}>{notifications.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.brandInteractive} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centre}>
          <Text style={[styles.emptyIcon, { color: c.textMuted }]}>◎</Text>
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
            All clear
          </Text>
          <Text style={[styles.emptyBody, { color: c.textMuted }]}>
            No alerts right now. Pull down to refresh.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: sp.lg, paddingBottom: sp.huge }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.brandInteractive}
            />
          }
        >
          {critical.length > 0 && (
            <Section
              label="Needs Immediate Attention"
              color={SEVERITY.critical.bar}
            >
              {critical.map((n) => (
                <NotifCard key={n.id} item={n} />
              ))}
            </Section>
          )}
          {warning.length > 0 && (
            <Section label="Warnings" color={SEVERITY.warning.bar}>
              {warning.map((n) => (
                <NotifCard key={n.id} item={n} />
              ))}
            </Section>
          )}
          {info.length > 0 && (
            <Section label="Information" color={SEVERITY.info.bar}>
              {info.map((n) => (
                <NotifCard key={n.id} item={n} />
              ))}
            </Section>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({
  label,
  color,
  children,
}: {
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionDot, { backgroundColor: color }]} />
        <Text style={[styles.sectionLabel, { color }]}>{label}</Text>
      </View>
      <View style={styles.sectionCards}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  back: { minWidth: 60 },
  backText: { fontSize: 14 },
  title: { flex: 1, fontSize: 18, fontWeight: "600" },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptyBody: { fontSize: 13, textAlign: "center", maxWidth: 260 },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionDot: { width: 7, height: 7, borderRadius: 4 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.14,
    textTransform: "uppercase",
  },
  sectionCards: { gap: 8 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardBar: { width: 3, alignSelf: "stretch" },
  cardIcon: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  cardIconText: { fontSize: 14, fontWeight: "700" },
  cardBody: { flex: 1, paddingVertical: 12, paddingRight: 14 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  cardTitle: { fontSize: 13, fontWeight: "600", flex: 1 },
  cardDate: { fontSize: 11, marginLeft: 8 },
  cardText: { fontSize: 12, lineHeight: 18 },
  cardError: { fontSize: 11, marginTop: 4, fontStyle: "italic" },
});
