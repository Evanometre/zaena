// FILE: app/sales-orders/[id].tsx
import { queueOperation } from "@/lib/localDb";
import { getOrganization } from "@/onboarding/services/organizationService";
import {
    ALL_CURRENCIES,
    getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalesOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  product_unit: string;
  quantity_ordered: number;
  quantity_delivered: number;
  unit_price: number;
  discount: number;
  line_total: number;
}

interface SalesOrder {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  expected_delivery_date: string | null;
  requires_production: boolean;
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
  notes: string | null;
  created_at: string;
  customer: { id: string; name: string; phone: string | null } | null;
  location: { id: string; name: string } | null;
  items: SalesOrderItem[];
}

interface DeliveryItem {
  id: string;
  sales_order_item_id: string;
  product_id: string;
  product_name: string;
  product_unit: string;
  quantity_delivered: number;
  unit_cost: number;
}

interface Delivery {
  id: string;
  delivery_number: string;
  status: string;
  scheduled_date: string | null;
  dispatched_at: string | null;
  notes: string | null;
  items: DeliveryItem[];
  has_invoice: boolean;
}

interface InvoicePayment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  amount_outstanding: number;
  notes: string | null;
  payments: InvoicePayment[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#e2e8f0", text: "#475569" },
  confirmed: { bg: "#dbeafe", text: "#1d4ed8" },
  in_fulfillment: { bg: "#fef9c3", text: "#92400e" },
  fulfilled: { bg: "#dcfce7", text: "#15803d" },
  invoiced: { bg: "#ede9fe", text: "#6d28d9" },
  closed: { bg: "#d4edda", text: "#155724" },
  cancelled: { bg: "#fee2e2", text: "#991b1b" },
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  in_fulfillment: "In Fulfillment",
  fulfilled: "Fulfilled",
  invoiced: "Invoiced",
  closed: "Closed",
  cancelled: "Cancelled",
};

const INVOICE_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#e2e8f0", text: "#475569" },
  sent: { bg: "#dbeafe", text: "#1d4ed8" },
  partially_paid: { bg: "#fef9c3", text: "#92400e" },
  paid: { bg: "#dcfce7", text: "#15803d" },
  overdue: { bg: "#fee2e2", text: "#991b1b" },
};

const DELIVERY_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#fef9c3", text: "#92400e" },
  dispatched: { bg: "#dbeafe", text: "#1d4ed8" },
  delivered: { bg: "#dcfce7", text: "#15803d" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SalesOrderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { organizationId } = useAuthStore();
  const { hasPermission } = usePermissions();

  const orderId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // ── Delivery creation modal ─────────────────────────────────────────────────
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryQtys, setDeliveryQtys] = useState<Record<string, string>>({});
  const [deliveryNotes, setDeliveryNotes] = useState("");

  // ── Dispatch confirmation modal ─────────────────────────────────────────────
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [pendingDispatchDelivery, setPendingDispatchDelivery] =
    useState<Delivery | null>(null);

  // ── Invoice creation modal ──────────────────────────────────────────────────
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [pendingInvoiceDelivery, setPendingInvoiceDelivery] =
    useState<Delivery | null>(null);
  const [invoiceDueDays, setInvoiceDueDays] = useState("30");
  const [invoiceNotes, setInvoiceNotes] = useState("");

  // ── Payment modal ───────────────────────────────────────────────────────────
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingPaymentInvoice, setPendingPaymentInvoice] =
    useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadCurrency();
    loadDevice();
    fetchAll();
  }, [orderId]);

  async function loadCurrency() {
    if (!organizationId) return;
    try {
      const org = await getOrganization(organizationId);
      if (org.currency) {
        const match = ALL_CURRENCIES.find((c) => c.code === org.currency);
        setCurrency({
          code: org.currency,
          symbol: match?.symbol ?? org.currency,
          name: match?.name ?? "",
        });
      } else if (org.timezone) {
        setCurrency(getCurrencyForTimezone(org.timezone));
      }
    } catch {}
  }

  async function loadDevice() {
    try {
      const cached = await AsyncStorage.getItem("checkout_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        setDeviceId(parsed.deviceId ?? null);
      }
    } catch {}
  }

  async function fetchAll() {
    if (!orderId) return;
    try {
      setLoading(true);
      await Promise.all([fetchOrder(), fetchDeliveries(), fetchInvoices()]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOrder() {
    const { data, error } = await supabase
      .from("sales_orders")
      .select(
        `
        id, order_number, status, order_date, expected_delivery_date,
        requires_production, subtotal, discount, tax, total_amount,
        notes, created_at,
        customer:customers ( id, name, phone ),
        location:locations ( id, name ),
        items:sales_order_items (
          id, product_id, quantity_ordered, quantity_delivered,
          unit_price, discount, line_total,
          product:products ( name, unit )
        )
      `,
      )
      .eq("id", orderId)
      .single();

    if (error) {
      console.error("fetchOrder error:", error);
      return;
    }

    const normalised: SalesOrder = {
      ...data,
      customer: Array.isArray(data.customer)
        ? (data.customer[0] ?? null)
        : data.customer,
      location: Array.isArray(data.location)
        ? (data.location[0] ?? null)
        : data.location,
      items: (data.items ?? []).map((item: any) => {
        const p = Array.isArray(item.product) ? item.product[0] : item.product;
        return {
          id: item.id,
          product_id: item.product_id,
          product_name: p?.name ?? "Unknown",
          product_unit: p?.unit ?? "",
          quantity_ordered: item.quantity_ordered,
          quantity_delivered: item.quantity_delivered,
          unit_price: item.unit_price,
          discount: item.discount,
          line_total: item.line_total,
        };
      }),
    };
    setOrder(normalised);
  }

  async function fetchDeliveries() {
    const { data, error } = await supabase
      .from("deliveries")
      .select(
        `
        id, delivery_number, status, scheduled_date, dispatched_at, notes,
        items:delivery_items (
          id, sales_order_item_id, product_id, quantity_delivered, unit_cost,
          product:products ( name, unit )
        )
      `,
      )
      .eq("sales_order_id", orderId)
      .order("created_at", { ascending: true });

    if (error || !data) return;

    // For each delivery, check if an invoice exists
    const deliveryIds = data.map((d: any) => d.id);
    let invoicedDeliveryIds: string[] = [];
    if (deliveryIds.length > 0) {
      // invoices don't have delivery_id directly — check via delivery_items join
      // Instead we check the invoices table for this order and cross-reference
      const { data: invData } = await supabase
        .from("invoices")
        .select("id")
        .eq("sales_order_id", orderId);
      // Simpler: an invoice exists per dispatched delivery if we follow one-invoice-per-delivery
      // We'll track this by checking if a delivery already has a matching invoice via notes or a
      // dedicated column. Since schema doesn't have delivery_id on invoices, we store it in notes
      // For now: a dispatched delivery without an invoice shows "Create Invoice"
      // We'll use a query on invoice notes containing delivery id as a fallback
      // Better: query invoice count for this order and compare with dispatched deliveries
      // Actually cleanest: add delivery_id to invoice at creation time via notes field JSON
      // We'll handle this in create invoice below — store delivery_id in invoice notes as JSON
      if (invData) {
        // We'll refine has_invoice after fetching invoices below
        invoicedDeliveryIds = [];
      }
    }

    const normalised: Delivery[] = data.map((d: any) => ({
      id: d.id,
      delivery_number: d.delivery_number,
      status: d.status,
      scheduled_date: d.scheduled_date,
      dispatched_at: d.dispatched_at,
      notes: d.notes,
      has_invoice: false, // refined after fetchInvoices
      items: (d.items ?? []).map((item: any) => {
        const p = Array.isArray(item.product) ? item.product[0] : item.product;
        return {
          id: item.id,
          sales_order_item_id: item.sales_order_item_id,
          product_id: item.product_id,
          product_name: p?.name ?? "Unknown",
          product_unit: p?.unit ?? "",
          quantity_delivered: item.quantity_delivered,
          unit_cost: item.unit_cost,
        };
      }),
    }));
    setDeliveries(normalised);
  }

  async function fetchInvoices() {
    const { data, error } = await supabase
      .from("invoices")
      .select(
        `
        id, invoice_number, status, invoice_date, due_date,
        total_amount, amount_paid, amount_outstanding, notes,
        payments:invoice_payments (
          id, amount, payment_date, payment_method, reference
        )
      `,
      )
      .eq("sales_order_id", orderId)
      .order("created_at", { ascending: true });

    if (error || !data) return;

    const normalised: Invoice[] = data.map((inv: any) => ({
      ...inv,
      payments: inv.payments ?? [],
    }));
    setInvoices(normalised);

    // Refine has_invoice on deliveries: parse delivery_id from invoice notes JSON
    setDeliveries((prev) =>
      prev.map((d) => ({
        ...d,
        has_invoice: normalised.some((inv) => {
          try {
            const meta = JSON.parse(inv.notes ?? "{}");
            return meta.delivery_id === d.id;
          } catch {
            return false;
          }
        }),
      })),
    );
  }

  // ── Generate delivery number ────────────────────────────────────────────────

  async function generateDeliveryNumber(): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const seqKey = `dn_seq_${organizationId}_${dateStr}`;
    let seq = Number(await AsyncStorage.getItem(seqKey)) || 0;
    seq += 1;
    await AsyncStorage.setItem(seqKey, seq.toString());
    const locCode = (order?.location?.name ?? "LOC")
      .substring(0, 3)
      .toUpperCase()
      .padEnd(3, "X");
    return `DN-${dateStr}-${locCode}-${seq.toString().padStart(4, "0")}`;
  }

  async function generateInvoiceNumber(): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const seqKey = `inv_seq_${organizationId}_${dateStr}`;
    let seq = Number(await AsyncStorage.getItem(seqKey)) || 0;
    seq += 1;
    await AsyncStorage.setItem(seqKey, seq.toString());
    return `INV-${dateStr}-${seq.toString().padStart(4, "0")}`;
  }

  // ── Format helpers ──────────────────────────────────────────────────────────

  function fmt(n: number) {
    return (
      currency.symbol +
      n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function fmtDate(iso: string | null | undefined) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleConfirmOrder() {
    Alert.alert(
      "Confirm Order",
      order?.requires_production
        ? "This is Make-to-Order. Stock will not be reserved. Confirm?"
        : "Stock will be reserved from inventory. Confirm?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setActionLoading(true);
            try {
              await queueOperation({
                module: "sales_orders",
                operation: "confirm_sales_order",
                payload: { orderId },
              });
              await invalidateAndRefresh();
              Alert.alert(
                "Queued ✓",
                "Order confirmation will sync when online.",
              );
            } catch (err: any) {
              Alert.alert("Error", err.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  }

  async function handleCancelOrder() {
    Alert.alert(
      "Cancel Order",
      "This will release any reserved stock and cannot be undone. Cancel this order?",
      [
        { text: "Keep Order", style: "cancel" },
        {
          text: "Cancel Order",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            try {
              await queueOperation({
                module: "sales_orders",
                operation: "cancel_sales_order",
                payload: { orderId },
              });
              await invalidateAndRefresh();
              Alert.alert(
                "Queued ✓",
                "Order cancellation will sync when online.",
              );
            } catch (err: any) {
              Alert.alert("Error", err.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  }

  // ── Create delivery ─────────────────────────────────────────────────────────

  function openDeliveryModal() {
    // Pre-fill remaining quantities
    const qtys: Record<string, string> = {};
    order?.items.forEach((item) => {
      const remaining = item.quantity_ordered - item.quantity_delivered;
      if (remaining > 0) qtys[item.id] = remaining.toString();
    });
    setDeliveryQtys(qtys);
    setDeliveryNotes("");
    setShowDeliveryModal(true);
  }

  async function handleCreateDelivery() {
    if (!order) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert("Error", "Not authenticated");
      return;
    }

    // Validate at least one item has qty > 0
    const validItems = order.items.filter((item) => {
      const qty = parseFloat(deliveryQtys[item.id] ?? "0");
      const remaining = item.quantity_ordered - item.quantity_delivered;
      return qty > 0 && qty <= remaining;
    });

    if (validItems.length === 0) {
      Alert.alert(
        "No Items",
        "Enter a delivery quantity of at least 1 for one or more items.",
      );
      return;
    }

    // Check no qty exceeds remaining
    for (const item of order.items) {
      const qty = parseFloat(deliveryQtys[item.id] ?? "0");
      const remaining = item.quantity_ordered - item.quantity_delivered;
      if (qty > remaining) {
        Alert.alert(
          "Invalid Quantity",
          `${item.product_name}: max deliverable is ${remaining} ${item.product_unit}.`,
        );
        return;
      }
    }

    setShowDeliveryModal(false);
    setActionLoading(true);

    try {
      const deliveryId = Crypto.randomUUID();
      const deliveryNumber = await generateDeliveryNumber();

      await queueOperation({
        module: "sales_orders",
        operation: "create_delivery",
        payload: {
          deliveryId,
          salesOrderId: orderId,
          organizationId,
          locationId: order.location?.id,
          deliveryNumber,
          notes: deliveryNotes.trim() || null,
          createdBy: user.id,
          items: validItems.map((item) => ({
            salesOrderItemId: item.id,
            productId: item.product_id,
            quantityDelivered: parseFloat(deliveryQtys[item.id]),
            unitCost: item.unit_price, // use selling price as proxy; COGS from WAC at dispatch
          })),
        },
      });

      await invalidateAndRefresh();
      Alert.alert(
        "Delivery Created ✓",
        "Delivery note created and will sync when online.",
      );
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // ── Dispatch delivery ───────────────────────────────────────────────────────

  function openDispatchModal(delivery: Delivery) {
    setPendingDispatchDelivery(delivery);
    setShowDispatchModal(true);
  }

  async function handleDispatch() {
    if (!pendingDispatchDelivery || !deviceId) {
      Alert.alert(
        "Error",
        "Device ID not found. Please ensure you have connected at least once.",
      );
      return;
    }
    setShowDispatchModal(false);
    setActionLoading(true);

    try {
      await queueOperation({
        module: "sales_orders",
        operation: "dispatch_delivery",
        payload: {
          deliveryId: pendingDispatchDelivery.id,
          deviceId,
        },
      });

      await invalidateAndRefresh();
      Alert.alert(
        "Dispatched ✓",
        "Delivery dispatched and inventory deduction will sync when online.",
      );
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setActionLoading(false);
      setPendingDispatchDelivery(null);
    }
  }

  // ── Create invoice ──────────────────────────────────────────────────────────

  function openInvoiceModal(delivery: Delivery) {
    setPendingInvoiceDelivery(delivery);
    const terms = order?.customer ? 30 : 30; // could pull from customer.credit_terms
    setInvoiceDueDays(terms.toString());
    setInvoiceNotes("");
    setShowInvoiceModal(true);
  }

  async function handleCreateInvoice() {
    if (!pendingInvoiceDelivery || !order) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert("Error", "Not authenticated");
      return;
    }

    const dueDays = parseInt(invoiceDueDays) || 30;
    const invoiceDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);

    // Calculate invoice total from delivery items using order item unit prices
    let invoiceTotal = 0;
    pendingInvoiceDelivery.items.forEach((dItem) => {
      const soItem = order.items.find(
        (i) => i.id === dItem.sales_order_item_id,
      );
      if (soItem) {
        const linePrice =
          dItem.quantity_delivered * soItem.unit_price - soItem.discount;
        invoiceTotal += linePrice;
      }
    });

    // Apply proportional tax
    const taxRate =
      order.total_amount > 0
        ? order.tax / (order.subtotal - order.discount)
        : 0;
    const invoiceTax = invoiceTotal * taxRate;
    const invoiceTotalWithTax = invoiceTotal + invoiceTax;

    setShowInvoiceModal(false);
    setActionLoading(true);

    try {
      const invoiceId = Crypto.randomUUID();
      const invoiceNumber = await generateInvoiceNumber();

      await queueOperation({
        module: "sales_orders",
        operation: "create_invoice",
        payload: {
          invoiceId,
          salesOrderId: orderId,
          customerId: order.customer?.id,
          organizationId,
          invoiceNumber,
          invoiceDate: invoiceDate.toISOString(),
          dueDate: dueDate.toISOString(),
          subtotal: invoiceTotal,
          tax: invoiceTax,
          totalAmount: invoiceTotalWithTax,
          notes: JSON.stringify({
            delivery_id: pendingInvoiceDelivery.id,
            delivery_number: pendingInvoiceDelivery.delivery_number,
            user_notes: invoiceNotes.trim() || null,
          }),
          createdBy: user.id,
        },
      });

      await invalidateAndRefresh();
      Alert.alert(
        "Invoice Created ✓",
        `${invoiceNumber} created and will sync when online.`,
      );
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setActionLoading(false);
      setPendingInvoiceDelivery(null);
    }
  }

  // ── Record payment ──────────────────────────────────────────────────────────

  function openPaymentModal(invoice: Invoice) {
    setPendingPaymentInvoice(invoice);
    setPaymentAmount(invoice.amount_outstanding.toFixed(2));
    setPaymentMethod("transfer");
    setPaymentReference("");
    setPaymentNotes("");
    setShowPaymentModal(true);
  }

  async function handleRecordPayment() {
    if (!pendingPaymentInvoice) return;
    const parsed = parseFloat(paymentAmount);
    if (!parsed || parsed <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount.");
      return;
    }
    if (parsed > pendingPaymentInvoice.amount_outstanding) {
      Alert.alert(
        "Overpayment",
        `Maximum payable is ${fmt(pendingPaymentInvoice.amount_outstanding)}.`,
      );
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert("Error", "Not authenticated");
      return;
    }

    setShowPaymentModal(false);
    setActionLoading(true);

    try {
      await queueOperation({
        module: "sales_orders",
        operation: "record_invoice_payment",
        payload: {
          invoiceId: pendingPaymentInvoice.id,
          amount: parsed,
          paymentDate: new Date().toISOString(),
          paymentMethod,
          reference: paymentReference.trim() || null,
          notes: paymentNotes.trim() || null,
          recordedBy: user.id,
        },
      });

      await invalidateAndRefresh();
      Alert.alert("Payment Recorded ✓", "Payment will sync when online.");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setActionLoading(false);
      setPendingPaymentInvoice(null);
    }
  }

  async function invalidateAndRefresh() {
    await AsyncStorage.removeItem(`sales_orders_${organizationId}`);
    await fetchAll();
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const canConfirm =
    hasPermission("sales_orders.edit") && order?.status === "draft";
  const canCancel =
    hasPermission("sales_orders.edit") &&
    ["draft", "confirmed"].includes(order?.status ?? "");
  const canCreateDelivery =
    hasPermission("deliveries.manage") &&
    ["confirmed", "in_fulfillment"].includes(order?.status ?? "");
  const hasUndeliveredItems =
    order?.items.some((i) => i.quantity_delivered < i.quantity_ordered) ??
    false;
  const totalOutstanding = invoices.reduce(
    (sum, inv) => sum + inv.amount_outstanding,
    0,
  );

  // ── Loading / not found ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>{"<"} Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Order Not Found</Text>
          <View style={{ width: 60 }} />
        </View>
      </View>
    );
  }

  const statusStyle = STATUS_STYLE[order.status] ?? {
    bg: "#eee",
    text: "#333",
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>{"<"} Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{order.order_number}</Text>
          <View
            style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}
          >
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {STATUS_LABEL[order.status] ?? order.status}
            </Text>
          </View>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* ── Order Summary Card ── */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Customer</Text>
              <Text style={styles.cardValue}>
                {order.customer?.name ?? "—"}
              </Text>
              {order.customer?.phone && (
                <Text style={styles.cardSub}>{order.customer.phone}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Location</Text>
              <Text style={styles.cardValue}>
                {order.location?.name ?? "—"}
              </Text>
            </View>
          </View>

          <View style={[styles.cardRow, { marginTop: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Order Date</Text>
              <Text style={styles.cardValue}>{fmtDate(order.order_date)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Expected Delivery</Text>
              <Text style={styles.cardValue}>
                {fmtDate(order.expected_delivery_date)}
              </Text>
            </View>
          </View>

          {order.requires_production && (
            <View style={styles.mtoBadge}>
              <Text style={styles.mtoBadgeText}>⚙ Make-to-Order</Text>
            </View>
          )}

          {order.notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesText}>{order.notes}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Outstanding Balance ── */}
        {totalOutstanding > 0 && (
          <View style={styles.outstandingBar}>
            <Text style={styles.outstandingLabel}>Outstanding Balance</Text>
            <Text style={styles.outstandingValue}>{fmt(totalOutstanding)}</Text>
          </View>
        )}

        {/* ── Line Items ── */}
        <Text style={styles.sectionTitle}>Line Items</Text>
        <View style={styles.card}>
          {order.items.map((item, idx) => {
            const remaining = item.quantity_ordered - item.quantity_delivered;
            const fullyDelivered = remaining <= 0;
            return (
              <View
                key={item.id}
                style={[
                  styles.lineItem,
                  idx < order.items.length - 1 && styles.lineItemBorder,
                ]}
              >
                <View style={styles.lineItemHeader}>
                  <Text style={styles.lineItemName}>{item.product_name}</Text>
                  {fullyDelivered && (
                    <View style={styles.fulfilledBadge}>
                      <Text style={styles.fulfilledBadgeText}>✓ Delivered</Text>
                    </View>
                  )}
                </View>
                <View style={styles.lineItemRow}>
                  <Text style={styles.lineItemDetail}>
                    Ordered: {item.quantity_ordered} {item.product_unit}
                  </Text>
                  <Text style={styles.lineItemDetail}>
                    Delivered: {item.quantity_delivered} {item.product_unit}
                  </Text>
                  {!fullyDelivered && (
                    <Text
                      style={[
                        styles.lineItemDetail,
                        { color: "#f59e0b", fontWeight: "600" },
                      ]}
                    >
                      Remaining: {remaining} {item.product_unit}
                    </Text>
                  )}
                </View>
                <View style={styles.lineItemRow}>
                  <Text style={styles.lineItemPrice}>
                    {fmt(item.unit_price)} / {item.product_unit}
                  </Text>
                  <Text style={styles.lineItemTotal}>
                    {fmt(item.line_total)}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Totals */}
          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{fmt(order.subtotal)}</Text>
            </View>
            {order.discount > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Discount</Text>
                <Text style={[styles.totalValue, { color: COLORS.danger }]}>
                  -{fmt(order.discount)}
                </Text>
              </View>
            )}
            {order.tax > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>VAT</Text>
                <Text style={styles.totalValue}>{fmt(order.tax)}</Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>
                {fmt(order.total_amount)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Deliveries ── */}
        {deliveries.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Deliveries</Text>
            {deliveries.map((delivery) => {
              const dStyle = DELIVERY_STATUS_STYLE[delivery.status] ?? {
                bg: "#eee",
                text: "#333",
              };
              return (
                <View key={delivery.id} style={styles.card}>
                  <View style={styles.cardRow}>
                    <Text style={styles.deliveryNumber}>
                      {delivery.delivery_number}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: dStyle.bg },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: dStyle.text }]}>
                        {delivery.status.charAt(0).toUpperCase() +
                          delivery.status.slice(1)}
                      </Text>
                    </View>
                  </View>

                  {delivery.dispatched_at && (
                    <Text style={styles.cardSub}>
                      Dispatched {fmtDate(delivery.dispatched_at)}
                    </Text>
                  )}

                  {delivery.items.map((dItem) => (
                    <View key={dItem.id} style={styles.deliveryItemRow}>
                      <Text style={styles.deliveryItemName}>
                        {dItem.product_name}
                      </Text>
                      <Text style={styles.deliveryItemQty}>
                        {dItem.quantity_delivered} {dItem.product_unit}
                      </Text>
                    </View>
                  ))}

                  {/* Dispatch button */}
                  {delivery.status === "pending" &&
                    hasPermission("deliveries.manage") && (
                      <TouchableOpacity
                        style={styles.dispatchButton}
                        onPress={() => openDispatchModal(delivery)}
                      >
                        <Text style={styles.dispatchButtonText}>Dispatch</Text>
                      </TouchableOpacity>
                    )}

                  {/* Create Invoice button */}
                  {delivery.status === "dispatched" &&
                    !delivery.has_invoice &&
                    hasPermission("invoices.manage") && (
                      <TouchableOpacity
                        style={styles.invoiceButton}
                        onPress={() => openInvoiceModal(delivery)}
                      >
                        <Text style={styles.invoiceButtonText}>
                          Create Invoice
                        </Text>
                      </TouchableOpacity>
                    )}

                  {delivery.has_invoice && (
                    <Text style={styles.invoicedNote}>✓ Invoice created</Text>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* ── Invoices ── */}
        {invoices.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Invoices</Text>
            {invoices.map((invoice) => {
              const iStyle = INVOICE_STATUS_STYLE[invoice.status] ?? {
                bg: "#eee",
                text: "#333",
              };
              const isOverdue =
                new Date(invoice.due_date) < new Date() &&
                !["paid"].includes(invoice.status);
              return (
                <View key={invoice.id} style={styles.card}>
                  <View style={styles.cardRow}>
                    <Text style={styles.deliveryNumber}>
                      {invoice.invoice_number}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: iStyle.bg },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: iStyle.text }]}>
                        {invoice.status
                          .replace("_", " ")
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.cardRow, { marginTop: 8 }]}>
                    <View>
                      <Text style={styles.cardLabel}>Invoice Date</Text>
                      <Text style={styles.cardValue}>
                        {fmtDate(invoice.invoice_date)}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.cardLabel}>Due Date</Text>
                      <Text
                        style={[
                          styles.cardValue,
                          isOverdue && { color: COLORS.danger },
                        ]}
                      >
                        {isOverdue ? "⚠ " : ""}
                        {fmtDate(invoice.due_date)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.invoiceAmounts}>
                    <View style={styles.invoiceAmountItem}>
                      <Text style={styles.invoiceAmountLabel}>Total</Text>
                      <Text style={styles.invoiceAmountValue}>
                        {fmt(invoice.total_amount)}
                      </Text>
                    </View>
                    <View style={styles.invoiceAmountItem}>
                      <Text style={styles.invoiceAmountLabel}>Paid</Text>
                      <Text
                        style={[
                          styles.invoiceAmountValue,
                          { color: COLORS.success },
                        ]}
                      >
                        {fmt(invoice.amount_paid)}
                      </Text>
                    </View>
                    <View style={styles.invoiceAmountItem}>
                      <Text style={styles.invoiceAmountLabel}>Outstanding</Text>
                      <Text
                        style={[
                          styles.invoiceAmountValue,
                          invoice.amount_outstanding > 0 && {
                            color: COLORS.danger,
                          },
                        ]}
                      >
                        {fmt(invoice.amount_outstanding)}
                      </Text>
                    </View>
                  </View>

                  {/* Payment history */}
                  {invoice.payments.length > 0 && (
                    <View style={styles.paymentsSection}>
                      <Text style={styles.paymentsTitle}>Payments</Text>
                      {invoice.payments.map((pmt) => (
                        <View key={pmt.id} style={styles.paymentRow}>
                          <View>
                            <Text style={styles.paymentMethod}>
                              {pmt.payment_method.charAt(0).toUpperCase() +
                                pmt.payment_method.slice(1)}
                            </Text>
                            {pmt.reference && (
                              <Text style={styles.paymentRef}>
                                Ref: {pmt.reference}
                              </Text>
                            )}
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={styles.paymentAmount}>
                              {fmt(pmt.amount)}
                            </Text>
                            <Text style={styles.paymentDate}>
                              {fmtDate(pmt.payment_date)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Record Payment button */}
                  {invoice.amount_outstanding > 0 &&
                    hasPermission("payments.manage") && (
                      <TouchableOpacity
                        style={styles.paymentButton}
                        onPress={() => openPaymentModal(invoice)}
                      >
                        <Text style={styles.paymentButtonText}>
                          Record Payment
                        </Text>
                      </TouchableOpacity>
                    )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* ── Action Bar ── */}
      <View style={styles.actionBar}>
        {actionLoading ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <>
            {/* Draft actions */}
            {order.status === "draft" && (
              <>
                {canCancel && (
                  <TouchableOpacity
                    style={styles.cancelOrderBtn}
                    onPress={handleCancelOrder}
                  >
                    <Text style={styles.cancelOrderBtnText}>Cancel Order</Text>
                  </TouchableOpacity>
                )}
                {canConfirm && (
                  <TouchableOpacity
                    style={styles.primaryActionBtn}
                    onPress={handleConfirmOrder}
                  >
                    <Text style={styles.primaryActionBtnText}>
                      Confirm Order
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Confirmed / In Fulfillment actions */}
            {["confirmed", "in_fulfillment"].includes(order.status) && (
              <>
                {canCancel && order.status === "confirmed" && (
                  <TouchableOpacity
                    style={styles.cancelOrderBtn}
                    onPress={handleCancelOrder}
                  >
                    <Text style={styles.cancelOrderBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}
                {canCreateDelivery && hasUndeliveredItems && (
                  <TouchableOpacity
                    style={styles.primaryActionBtn}
                    onPress={openDeliveryModal}
                  >
                    <Text style={styles.primaryActionBtnText}>
                      Create Delivery
                    </Text>
                  </TouchableOpacity>
                )}
                {!hasUndeliveredItems && (
                  <Text style={styles.allDeliveredNote}>
                    All items delivered
                  </Text>
                )}
              </>
            )}

            {/* Fulfilled / Invoiced / Closed */}
            {["fulfilled", "invoiced", "closed"].includes(order.status) && (
              <Text style={styles.allDeliveredNote}>
                {order.status === "closed"
                  ? "Order closed"
                  : "Manage invoices above"}
              </Text>
            )}

            {/* Cancelled */}
            {order.status === "cancelled" && (
              <Text style={styles.cancelledNote}>
                This order has been cancelled
              </Text>
            )}
          </>
        )}
      </View>

      {/* ══ Modals ══════════════════════════════════════════════════════════════ */}

      {/* Create Delivery Modal */}
      <Modal
        visible={showDeliveryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeliveryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Create Delivery Note</Text>
            <Text style={styles.modalSubtitle}>
              Enter quantities to deliver. Leave blank or 0 to skip an item.
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {order.items.map((item) => {
                const remaining =
                  item.quantity_ordered - item.quantity_delivered;
                if (remaining <= 0) return null;
                return (
                  <View key={item.id} style={styles.deliveryQtyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deliveryQtyName}>
                        {item.product_name}
                      </Text>
                      <Text style={styles.deliveryQtySub}>
                        Remaining: {remaining} {item.product_unit}
                      </Text>
                    </View>
                    <TextInput
                      style={styles.deliveryQtyInput}
                      value={deliveryQtys[item.id] ?? ""}
                      onChangeText={(v) =>
                        setDeliveryQtys({ ...deliveryQtys, [item.id]: v })
                      }
                      keyboardType="decimal-pad"
                      placeholder="0"
                    />
                  </View>
                );
              })}
            </ScrollView>
            <TextInput
              style={[styles.modalInput, { marginTop: 12 }]}
              value={deliveryNotes}
              onChangeText={setDeliveryNotes}
              placeholder="Delivery notes (optional)"
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowDeliveryModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleCreateDelivery}
              >
                <Text style={styles.modalConfirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Dispatch Confirmation Modal */}
      <Modal
        visible={showDispatchModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDispatchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: 400 }]}>
            <Text style={styles.modalTitle}>Confirm Dispatch</Text>
            <Text style={styles.modalSubtitle}>
              Dispatching {pendingDispatchDelivery?.delivery_number} will deduct
              the following from {order.location?.name ?? "inventory"}:
            </Text>
            {pendingDispatchDelivery?.items.map((item) => (
              <View key={item.id} style={styles.dispatchItemRow}>
                <Text style={styles.dispatchItemName}>{item.product_name}</Text>
                <Text style={styles.dispatchItemQty}>
                  {item.quantity_delivered} {item.product_unit}
                </Text>
              </View>
            ))}
            <Text style={styles.dispatchWarning}>
              This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowDispatchModal(false);
                  setPendingDispatchDelivery(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDispatchBtn}
                onPress={handleDispatch}
              >
                <Text style={styles.modalConfirmText}>Dispatch</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Invoice Modal */}
      <Modal
        visible={showInvoiceModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInvoiceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: 420 }]}>
            <Text style={styles.modalTitle}>Create Invoice</Text>
            <Text style={styles.modalSubtitle}>
              Invoice for delivery {pendingInvoiceDelivery?.delivery_number}
            </Text>
            <Text style={styles.fieldLabel}>Payment Terms (days)</Text>
            <TextInput
              style={styles.modalInput}
              value={invoiceDueDays}
              onChangeText={setInvoiceDueDays}
              keyboardType="number-pad"
              placeholder="30"
              placeholderTextColor="#9CA3AF"
            />
            <TextInput
              style={[styles.modalInput, { marginTop: 10 }]}
              value={invoiceNotes}
              onChangeText={setInvoiceNotes}
              placeholder="Invoice notes (optional)"
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowInvoiceModal(false);
                  setPendingInvoiceDelivery(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleCreateInvoice}
              >
                <Text style={styles.modalConfirmText}>Create Invoice</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: 520 }]}>
            <Text style={styles.modalTitle}>Record Payment</Text>
            {pendingPaymentInvoice && (
              <Text style={styles.modalSubtitle}>
                {pendingPaymentInvoice.invoice_number} · Outstanding:{" "}
                {fmt(pendingPaymentInvoice.amount_outstanding)}
              </Text>
            )}

            <Text style={styles.fieldLabel}>Amount ({currency.symbol})</Text>
            <TextInput
              style={styles.paymentAmountInput}
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
              selectTextOnFocus
            />

            <Text style={styles.fieldLabel}>Payment Method</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              {["cash", "transfer", "cheque", "other"].map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.methodChip,
                    paymentMethod === method && styles.methodChipActive,
                  ]}
                  onPress={() => setPaymentMethod(method)}
                >
                  <Text
                    style={[
                      styles.methodChipText,
                      paymentMethod === method && styles.methodChipTextActive,
                    ]}
                  >
                    {method.charAt(0).toUpperCase() + method.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={styles.modalInput}
              value={paymentReference}
              onChangeText={setPaymentReference}
              placeholder="Reference / transaction ID (optional)"
              placeholderTextColor="#9CA3AF"
            />
            <TextInput
              style={[styles.modalInput, { marginTop: 8 }]}
              value={paymentNotes}
              onChangeText={setPaymentNotes}
              placeholder="Notes (optional)"
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowPaymentModal(false);
                  setPendingPaymentInvoice(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleRecordPayment}
              >
                <Text style={styles.modalConfirmText}>Record Payment</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 48,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { fontSize: 16, color: COLORS.primary, minWidth: 60 },
  headerCenter: { alignItems: "center", gap: 4 },
  title: { fontSize: 18, fontWeight: "700", color: COLORS.primary },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },

  content: { flex: 1, padding: 16 },

  // Cards
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardLabel: {
    fontSize: 11,
    color: COLORS.secondary,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  cardValue: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  cardSub: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },

  mtoBadge: {
    marginTop: 10,
    backgroundColor: "#0E2931",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  mtoBadgeText: { fontSize: 12, fontWeight: "700", color: "#C9922A" },

  notesBox: {
    marginTop: 10,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 10,
  },
  notesText: { fontSize: 13, color: COLORS.secondary, lineHeight: 20 },

  // Outstanding bar
  outstandingBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fdecea",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f5c6cb",
  },
  outstandingLabel: { fontSize: 13, fontWeight: "600", color: COLORS.danger },
  outstandingValue: { fontSize: 16, fontWeight: "700", color: COLORS.danger },

  // Section title
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8E8E93",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },

  // Line items
  lineItem: { paddingVertical: 12 },
  lineItemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  lineItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  lineItemName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primary,
    flex: 1,
  },
  lineItemRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 3,
  },
  lineItemDetail: { fontSize: 12, color: COLORS.secondary },
  lineItemPrice: { fontSize: 12, color: COLORS.secondary, flex: 1 },
  lineItemTotal: { fontSize: 14, fontWeight: "700", color: COLORS.primary },
  fulfilledBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  fulfilledBadgeText: { fontSize: 11, fontWeight: "700", color: "#15803d" },

  // Totals
  totalsSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  totalLabel: { fontSize: 13, color: COLORS.secondary },
  totalValue: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
  grandTotalRow: {
    borderTopWidth: 2,
    borderTopColor: COLORS.primary,
    paddingTop: 10,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 15, fontWeight: "700", color: COLORS.primary },
  grandTotalValue: { fontSize: 18, fontWeight: "700", color: COLORS.primary },

  // Deliveries
  deliveryNumber: { fontSize: 15, fontWeight: "700", color: COLORS.primary },
  deliveryItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  deliveryItemName: { fontSize: 13, color: COLORS.primary },
  deliveryItemQty: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
  dispatchButton: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  dispatchButtonText: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
  invoiceButton: {
    marginTop: 8,
    backgroundColor: "#ede9fe",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  invoiceButtonText: { color: "#6d28d9", fontSize: 14, fontWeight: "700" },
  invoicedNote: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.success,
    fontWeight: "600",
    textAlign: "center",
  },

  // Invoices
  invoiceAmounts: {
    flexDirection: "row",
    marginTop: 12,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  invoiceAmountItem: { flex: 1, alignItems: "center" },
  invoiceAmountLabel: {
    fontSize: 11,
    color: COLORS.secondary,
    marginBottom: 4,
  },
  invoiceAmountValue: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primary,
  },
  paymentsSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  paymentsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.secondary,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  paymentMethod: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
  paymentRef: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },
  paymentAmount: { fontSize: 14, fontWeight: "700", color: COLORS.success },
  paymentDate: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },
  paymentButton: {
    marginTop: 12,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  paymentButtonText: { color: COLORS.white, fontSize: 14, fontWeight: "700" },

  // Action bar
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: 16,
    paddingBottom: 32,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  primaryActionBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
  },
  cancelOrderBtn: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: COLORS.danger,
  },
  cancelOrderBtnText: { color: COLORS.danger, fontSize: 16, fontWeight: "700" },
  allDeliveredNote: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
    flex: 1,
  },
  cancelledNote: {
    fontSize: 14,
    color: COLORS.danger,
    textAlign: "center",
    flex: 1,
    fontWeight: "600",
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.secondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: COLORS.primary,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 6,
    marginTop: 4,
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 16 },
  modalCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: COLORS.secondary },
  modalConfirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  modalDispatchBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    alignItems: "center",
  },
  modalConfirmText: { fontSize: 15, fontWeight: "700", color: COLORS.white },

  // Delivery creation modal
  deliveryQtyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  deliveryQtyName: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  deliveryQtySub: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  deliveryQtyInput: {
    width: 72,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    color: COLORS.primary,
    backgroundColor: COLORS.background,
  },

  // Dispatch modal
  dispatchItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dispatchItemName: { fontSize: 14, color: COLORS.primary },
  dispatchItemQty: { fontSize: 14, fontWeight: "700", color: COLORS.primary },
  dispatchWarning: {
    marginTop: 12,
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: "600",
    textAlign: "center",
  },

  // Payment modal
  paymentAmountInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    color: COLORS.primary,
    marginBottom: 16,
  },
  methodChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  methodChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  methodChipText: { fontSize: 13, fontWeight: "600", color: COLORS.secondary },
  methodChipTextActive: { color: COLORS.white },
});
