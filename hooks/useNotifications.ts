// hooks/useNotifications.ts
import { adapter } from "@/lib/db/adapter.native";
import supabase from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useCallback, useEffect, useState } from "react";

export type NotificationSeverity = "critical" | "warning" | "info";

export interface AppNotification {
  id: string;
  type: "overdue_invoice" | "invoice_due_soon" | "voided_sale" | "stuck_sync";
  severity: NotificationSeverity;
  title: string;
  body: string;
  timestamp: string;
  meta?: Record<string, any>;
}

export function useNotifications() {
  const { organizationId } = useAuthStore();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);

    const results: AppNotification[] = [];
    const today = new Date().toISOString().split("T")[0];
    const soonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // ── 1. Overdue invoices ────────────────────────────────────
    const { data: overdue } = await supabase
  .from("invoices")
  .select("id, due_date, total_amount, amount_outstanding, customer_id")
  .eq("organization_id", organizationId)
  .in("status", ["sent", "partially_paid", "overdue"])
  .lt("due_date", today)
  .gt("amount_outstanding", 0);

    (overdue ?? []).forEach((inv) => {
      const daysAgo = Math.floor(
        (Date.now() - new Date(inv.due_date).getTime()) / 86_400_000
      );
      results.push({
        id: `overdue_${inv.id}`,
        type: "overdue_invoice",
        severity: daysAgo > 14 ? "critical" : "warning",
        title: "Overdue Invoice",
        body: `₦${Number(inv.amount_outstanding).toLocaleString()} outstanding — ${daysAgo} day${daysAgo !== 1 ? "s" : ""} overdue.`,

        timestamp: inv.due_date,
        meta: { invoiceId: inv.id, customerId: inv.customer_id },
      });
    });

    // ── 2. Invoices due within 3 days ─────────────────────────
    const { data: dueSoon } = await supabase
  .from("invoices")
  .select("id, due_date, total_amount, amount_outstanding, customer_id")
  .eq("organization_id", organizationId)
  .in("status", ["sent", "partially_paid"])
  .gte("due_date", today)
  .lte("due_date", soonDate)
  .gt("amount_outstanding", 0);

    (dueSoon ?? []).forEach((inv) => {
      const daysLeft = Math.ceil(
        (new Date(inv.due_date).getTime() - Date.now()) / 86_400_000
      );
      results.push({
        id: `due_soon_${inv.id}`,
        type: "invoice_due_soon",
        severity: "info",
        title: "Invoice Due Soon",
       
body: `₦${Number(inv.amount_outstanding).toLocaleString()} outstanding — due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`,
        timestamp: inv.due_date,
        meta: { invoiceId: inv.id, customerId: inv.customer_id },
      });
    });

    // ── 3. Voided sales in last 7 days ────────────────────────
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: voids } = await supabase
      .from("audit_trails")
      .select("id, action, new_data, old_data, created_at, user_id")
      .eq("organization_id", organizationId)
      .eq("action", "void")
      .eq("table_name", "sales")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    (voids ?? []).forEach((entry) => {
      const ref =
        entry.new_data?.receipt_number ??
        entry.old_data?.receipt_number ??
        "Unknown";
      const amount =
        entry.new_data?.total_amount ?? entry.old_data?.total_amount;
      results.push({
        id: `void_${entry.id}`,
        type: "voided_sale",
        severity: "warning",
        title: "Sale Voided",
        body: `Receipt ${ref}${amount ? ` — ₦${Number(amount).toLocaleString()}` : ""} was voided.`,
        timestamp: entry.created_at,
        meta: { auditId: entry.id, userId: entry.user_id },
      });
    });

    // ── 4. Stuck outbox entries ───────────────────────────────
    try {
      const stuck = await adapter.getStuckEntries(3);
      stuck.forEach((entry) => {
        results.push({
          id: `sync_${entry.id}`,
          type: "stuck_sync",
          severity: entry.sync_attempts >= 10 ? "critical" : "warning",
          title: "Sync Failed",
          body: `A ${entry.module} ${entry.operation.replace(/_/g, " ")} has failed to sync ${entry.sync_attempts} times.`,
          timestamp: entry.created_at,
          meta: { outboxId: entry.id, lastError: entry.last_error },
        });
      });
    } catch {
      // Outbox not available on web — skip silently
    }

    // Sort: critical first, then by timestamp descending
    results.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      const s = severityOrder[a.severity] - severityOrder[b.severity];
      if (s !== 0) return s;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    setNotifications(results);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { notifications, loading, refetch: fetch };
}