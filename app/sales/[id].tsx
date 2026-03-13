// FILE: app/sales/[id].tsx

import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FloatingReceiptShare from "../../components/Floatingreceiptshare";
import { usePermissions } from "../../context/PermissionsContext";
import { InvoiceData, InvoiceGenerator } from "../../lib/invoices/core";
import supabase from "../../lib/supabase";
import { useTheme } from "../../lib/theme/ThemeProvider";
import { useAuthStore } from "../../stores/authStore";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Sale {
  id: string;
  receipt_number: string;
  total_amount: number;
  subtotal: number;
  discount: number;
  tax: number;
  total_cogs: number;
  payment_status: string;
  created_at: string;
  location_id: string;
  device_id: string;
  locations: { name: string; address?: string };
  customers?: { id: string; name: string; email?: string; phone?: string };
  voided_at: string | null;
  sale_items: {
    product_id: string;
    quantity: number;
    unit_price: number;
    unit_cogs: number;
    total_cogs: number;
    products: { name: string; unit: string };
  }[];
}

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  created_at: string;
  created_by: string;
}

// ─── SECTION CARD ─────────────────────────────────────────────────────────────

function SectionCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── ROW ──────────────────────────────────────────────────────────────────────

function DataRow({
  label,
  value,
  valueColor,
  mono = false,
  bold = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
  bold?: boolean;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 7,
      }}
    >
      <Text
        style={{
          color: c.textSecondary,
          fontFamily: t.bodySm.fontFamily,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: valueColor || c.textPrimary,
          fontFamily: mono
            ? t.mono.fontFamily
            : bold
              ? t.bodyMed.fontFamily
              : t.body.fontFamily,
          fontSize: bold ? 15 : 13,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── PAYMENT STATUS ───────────────────────────────────────────────────────────

function PaymentStatusPill({ status }: { status: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;

  const config = {
    paid: {
      bg: c.positiveSoft,
      color: c.positive,
      icon: "check-circle" as const,
      label: "Fully Paid",
    },
    partial: {
      bg: c.warningSoft,
      color: c.warning,
      icon: "clock" as const,
      label: "Partially Paid",
    },
    unpaid: {
      bg: c.negativeSoft,
      color: c.negative,
      icon: "circle" as const,
      label: "Unpaid",
    },
  }[status] || {
    bg: c.surfaceOverlay,
    color: c.textMuted,
    icon: "help-circle" as const,
    label: status,
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: config.bg,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        alignSelf: "flex-start",
      }}
    >
      <Feather name={config.icon} size={13} color={config.color} />
      <Text
        style={{
          color: config.color,
          fontFamily: t.bodyMed.fontFamily,
          fontSize: 12,
        }}
      >
        {config.label}
      </Text>
    </View>
  );
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────

export default function SaleDetailScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;
  const sp = theme.spacing;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const saleId = params.id as string;
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });
  const [sale, setSale] = useState<Sale | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showReceiptShare, setShowReceiptShare] = useState(false);

  useEffect(() => {
    if (saleId) fetchSaleDetails();
  }, [saleId]);

  useEffect(() => {
    async function loadOrgCurrency() {
      if (!organizationId) return;
      try {
        const org = await getOrganization(organizationId);
        if (org.currency) {
          const match = ALL_CURRENCIES.find((cu) => cu.code === org.currency);
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
    loadOrgCurrency();
  }, [organizationId]);

  async function fetchSaleDetails() {
    setLoading(true);
    try {
      const cacheKey = `sale_detail_${saleId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { sale: cs, payments: cp } = JSON.parse(cached);
        setSale(cs);
        setPayments(cp);
        setLoading(false);
      }
      const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .select(
          `*, locations (name, address), customers (id, name, email, phone), sale_items (*, products (name, unit))`,
        )
        .eq("id", saleId)
        .single();
      if (saleError) throw saleError;
      const { data: paymentsData, error: paymentsError } = await supabase
        .from("payments")
        .select("*")
        .eq("reference_type", "sale")
        .eq("reference_id", saleId)
        .order("created_at", { ascending: false });
      if (paymentsError) throw paymentsError;
      setSale(saleData);
      setPayments(paymentsData || []);
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({ sale: saleData, payments: paymentsData || [] }),
      );
    } catch (err: any) {
      if (!sale) Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = sale ? sale.total_amount - totalPaid : 0;
  const grossProfit = sale ? sale.total_amount - sale.total_cogs : 0;
  const grossMargin =
    sale && sale.total_amount > 0 ? (grossProfit / sale.total_amount) * 100 : 0;
  const isVoided = sale?.voided_at !== null;

  // ── Receipt pipeline (unchanged logic) ────────────────────────────────────

  async function getSaleReceiptData(): Promise<{
    invoiceData: InvoiceData;
    org: any;
  } | null> {
    if (!sale || !organizationId) return null;
    try {
      const cached = await AsyncStorage.getItem(
        `org_invoice_details_${organizationId}`,
      );
      const org = cached ? JSON.parse(cached) : { name: "Your Business" };
      if (!cached) {
        const generator = new InvoiceGenerator(organizationId);
        await generator.initialize();
        const warmed = await AsyncStorage.getItem(
          `org_invoice_details_${organizationId}`,
        );
        if (warmed) Object.assign(org, JSON.parse(warmed));
      }
      const invoiceData: InvoiceData = {
        type: "sale_receipt",
        number: sale.receipt_number,
        date: new Date(sale.created_at),
        organizationId,
        customer: sale.customers
          ? {
              id: sale.customers.id,
              name: sale.customers.name,
              email: sale.customers.email,
              phone: sale.customers.phone,
            }
          : undefined,
        location: sale.locations
          ? {
              id: sale.location_id,
              name: sale.locations.name,
              address: sale.locations.address,
            }
          : undefined,
        items: sale.sale_items.map((item) => ({
          productName: item.products.name,
          quantity: item.quantity,
          unit: item.products.unit,
          unitPrice: item.unit_price,
          total: item.quantity * item.unit_price,
        })),
        subtotal: sale.subtotal,
        discount: sale.discount > 0 ? sale.discount : undefined,
        tax: sale.tax > 0 ? sale.tax : undefined,
        totalAmount: sale.total_amount,
        amountPaid: totalPaid > 0 ? totalPaid : 0,
        paymentMethod:
          payments.length > 0 ? payments[0].payment_method : undefined,
        balance: balance > 0 ? balance : undefined,
      };
      return { invoiceData, org };
    } catch {
      return null;
    }
  }

  async function generateSaleReceipt(): Promise<string | null> {
    if (!sale || !organizationId) return null;
    try {
      const result = await getSaleReceiptData();
      if (!result) return null;
      const generator = new InvoiceGenerator(organizationId);
      await generator.initialize();
      const html = generator.buildHTML(result.invoiceData);
      const Print = await import("expo-print");
      const { uri } = await Print.printToFileAsync({
        html,
        width: 595,
        height: 842,
      });
      return uri;
    } catch {
      return null;
    }
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (permLoading || loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.canvas,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={c.brandInteractive} />
      </View>
    );
  }

  if (!hasPermission("sales.read")) {
    return (
      <View style={{ flex: 1, backgroundColor: c.canvas }}>
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + sp.md,
              backgroundColor: c.canvas,
              borderBottomColor: c.borderSubtle,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Feather name="chevron-left" size={22} color={c.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[
              styles.headerTitle,
              { color: c.textPrimary, fontFamily: t.h2.fontFamily },
            ]}
          >
            Sale Details
          </Text>
          <View style={{ width: 36 }} />
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 40,
          }}
        >
          <Feather name="lock" size={40} color={c.textMuted} />
          <Text
            style={{
              color: c.textSecondary,
              fontFamily: t.h3.fontFamily,
              fontSize: 16,
              marginTop: 16,
            }}
          >
            Access Restricted
          </Text>
        </View>
      </View>
    );
  }

  if (!sale) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.canvas,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: c.textMuted, fontFamily: t.body.fontFamily }}>
          Sale not found
        </Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + sp.md,
            backgroundColor: c.canvas,
            borderBottomColor: c.borderSubtle,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={[
            styles.backBtn,
            { backgroundColor: c.surfaceRaised, borderColor: c.borderSubtle },
          ]}
        >
          <Feather name="chevron-left" size={20} color={c.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: sp.md }}>
          <Text
            style={[
              styles.headerTitle,
              { color: c.textPrimary, fontFamily: t.h2.fontFamily },
            ]}
          >
            Sale Details
          </Text>
          <Text
            style={[
              styles.headerSub,
              { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
            ]}
          >
            {sale.receipt_number}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.receiptBtn, { backgroundColor: c.brandInteractive }]}
          onPress={() => setShowReceiptShare(true)}
          activeOpacity={0.8}
        >
          <Feather name="file-text" size={14} color={c.air} />
          <Text
            style={[
              styles.receiptBtnText,
              { color: c.air, fontFamily: t.bodyMed.fontFamily },
            ]}
          >
            Receipt
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: sp.lg,
          paddingBottom: insets.bottom + sp.huge,
        }}
      >
        {/* ── Voided banner ── */}
        {isVoided && (
          <View
            style={[
              styles.voidedBanner,
              {
                backgroundColor: c.negativeSoft,
                borderColor: c.negative + "44",
              },
            ]}
          >
            <Feather name="slash" size={16} color={c.negative} />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.voidedTitle,
                  { color: c.negative, fontFamily: t.bodyMed.fontFamily },
                ]}
              >
                Voided Sale
              </Text>
              <Text
                style={[
                  styles.voidedSub,
                  { color: c.textSecondary, fontFamily: t.monoSm.fontFamily },
                ]}
              >
                {new Date(sale.voided_at!).toLocaleString("en-NG")}
              </Text>
            </View>
          </View>
        )}

        {/* ── Receipt info card ── */}
        <SectionCard>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.cardTitle,
                  { color: c.textPrimary, fontFamily: t.h2.fontFamily },
                ]}
              >
                {new Date(sale.created_at).toLocaleDateString("en-NG", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              <Text
                style={[
                  styles.cardSub,
                  { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
                ]}
              >
                {new Date(sale.created_at).toLocaleTimeString("en-NG", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {"  ·  "}
                {sale.locations.name}
              </Text>
            </View>
            <PaymentStatusPill status={sale.payment_status} />
          </View>
        </SectionCard>

        {/* ── Items ── */}
        <SectionCard>
          <Text
            style={[
              styles.sectionLabel,
              { color: c.textMuted, fontFamily: t.labelSm.fontFamily },
            ]}
          >
            ITEMS ({sale.sale_items.length})
          </Text>
          {sale.sale_items.map((item, i) => (
            <View
              key={i}
              style={[
                styles.itemRow,
                i < sale.sale_items.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: c.borderSubtle,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.itemName,
                    { color: c.textPrimary, fontFamily: t.bodyMed.fontFamily },
                  ]}
                >
                  {item.products.name}
                </Text>
                <Text
                  style={[
                    styles.itemSub,
                    { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
                  ]}
                >
                  {item.quantity} {item.products.unit} × {currency.symbol}
                  {item.unit_price.toFixed(2)}
                </Text>
              </View>
              <Text
                style={[
                  styles.itemTotal,
                  { color: c.textPrimary, fontFamily: t.mono.fontFamily },
                ]}
              >
                {currency.symbol}
                {(item.quantity * item.unit_price).toFixed(2)}
              </Text>
            </View>
          ))}
        </SectionCard>

        {/* ── Amount breakdown ── */}
        <SectionCard>
          <Text
            style={[
              styles.sectionLabel,
              { color: c.textMuted, fontFamily: t.labelSm.fontFamily },
            ]}
          >
            AMOUNT
          </Text>
          <DataRow
            label="Subtotal"
            value={`${currency.symbol}${sale.subtotal.toFixed(2)}`}
            mono
          />
          {sale.discount > 0 && (
            <DataRow
              label="Discount"
              value={`−${currency.symbol}${sale.discount.toFixed(2)}`}
              mono
              valueColor={c.negative}
            />
          )}
          {sale.tax > 0 && (
            <DataRow
              label="Tax"
              value={`${currency.symbol}${sale.tax.toFixed(2)}`}
              mono
            />
          )}
          <View
            style={[styles.totalDivider, { borderTopColor: c.borderSubtle }]}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: sp.sm,
            }}
          >
            <Text
              style={{
                color: c.textPrimary,
                fontFamily: t.bodyMed.fontFamily,
                fontSize: 14,
              }}
            >
              Total
            </Text>
            <Text
              style={{
                color: c.signal,
                fontFamily: t.monoLg.fontFamily,
                fontSize: 22,
                letterSpacing: -0.5,
              }}
            >
              {currency.symbol}
              {sale.total_amount.toFixed(2)}
            </Text>
          </View>
        </SectionCard>

        {/* ── Profit analysis ── */}
        <SectionCard style={{ borderColor: c.positive + "33" }}>
          <Text
            style={[
              styles.sectionLabel,
              { color: c.textMuted, fontFamily: t.labelSm.fontFamily },
            ]}
          >
            PROFIT ANALYSIS
          </Text>
          <DataRow
            label="Revenue"
            value={`${currency.symbol}${sale.total_amount.toFixed(2)}`}
            mono
          />
          <DataRow
            label="Cost of Goods"
            value={`${currency.symbol}${sale.total_cogs.toFixed(2)}`}
            mono
          />
          <View
            style={[styles.totalDivider, { borderTopColor: c.borderSubtle }]}
          />
          <DataRow
            label="Gross Profit"
            value={`${currency.symbol}${grossProfit.toFixed(2)}`}
            mono
            valueColor={c.positive}
            bold
          />
          <DataRow
            label="Margin"
            value={`${grossMargin.toFixed(1)}%`}
            mono
            valueColor={c.positive}
          />
        </SectionCard>

        {/* ── Payments ── */}
        <SectionCard>
          <Text
            style={[
              styles.sectionLabel,
              { color: c.textMuted, fontFamily: t.labelSm.fontFamily },
            ]}
          >
            PAYMENTS
          </Text>
          {payments.length === 0 ? (
            <Text
              style={[
                styles.noPayments,
                { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
              ]}
            >
              No payments recorded
            </Text>
          ) : (
            payments.map((payment) => (
              <View
                key={payment.id}
                style={[
                  styles.paymentRow,
                  { borderBottomColor: c.borderSubtle },
                ]}
              >
                <View>
                  <Text
                    style={[
                      styles.paymentMethod,
                      {
                        color: c.textPrimary,
                        fontFamily: t.bodyMed.fontFamily,
                      },
                    ]}
                  >
                    {payment.payment_method.toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.paymentDate,
                      { color: c.textMuted, fontFamily: t.monoSm.fontFamily },
                    ]}
                  >
                    {new Date(payment.created_at).toLocaleString("en-NG", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.paymentAmount,
                    { color: c.positive, fontFamily: t.mono.fontFamily },
                  ]}
                >
                  +{currency.symbol}
                  {payment.amount.toFixed(2)}
                </Text>
              </View>
            ))
          )}
          <View
            style={[
              styles.totalDivider,
              { borderTopColor: c.borderSubtle, marginTop: sp.sm },
            ]}
          />
          <DataRow
            label="Total Paid"
            value={`${currency.symbol}${totalPaid.toFixed(2)}`}
            mono
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: sp.xs,
            }}
          >
            <Text
              style={{
                color: c.textPrimary,
                fontFamily: t.bodyMed.fontFamily,
                fontSize: 14,
              }}
            >
              Balance
            </Text>
            <Text
              style={{
                color: balance > 0 ? c.negative : c.positive,
                fontFamily: t.mono.fontFamily,
                fontSize: 16,
              }}
            >
              {currency.symbol}
              {balance.toFixed(2)}
            </Text>
          </View>
        </SectionCard>

        {/* ── Action buttons ── */}
        <View style={styles.actionGrid}>
          {!isVoided && balance > 0 && hasPermission("payments.create") && (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { backgroundColor: c.brandInteractive },
              ]}
              onPress={() => setShowPaymentModal(true)}
              activeOpacity={0.8}
            >
              <Feather name="plus-circle" size={16} color={c.air} />
              <Text
                style={[
                  styles.actionBtnText,
                  { color: c.air, fontFamily: t.bodyMed.fontFamily },
                ]}
              >
                Add Payment
              </Text>
            </TouchableOpacity>
          )}
          {!isVoided && hasPermission("refunds.create") && (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: c.surfaceRaised,
                  borderWidth: 1,
                  borderColor: c.borderDefault,
                },
              ]}
              onPress={() =>
                router.push(
                  `/refunds/new?saleId=${sale.id}&receiptNumber=${sale.receipt_number}`,
                )
              }
              activeOpacity={0.8}
            >
              <Feather name="rotate-ccw" size={16} color={c.textSecondary} />
              <Text
                style={[
                  styles.actionBtnText,
                  { color: c.textSecondary, fontFamily: t.bodyMed.fontFamily },
                ]}
              >
                Refund
              </Text>
            </TouchableOpacity>
          )}
          {!isVoided && hasPermission("sales.void") && (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: c.negativeSoft,
                  borderWidth: 1,
                  borderColor: c.negative + "44",
                },
              ]}
              onPress={() => setShowVoidModal(true)}
              activeOpacity={0.8}
            >
              <Feather name="slash" size={16} color={c.negative} />
              <Text
                style={[
                  styles.actionBtnText,
                  { color: c.negative, fontFamily: t.bodyMed.fontFamily },
                ]}
              >
                Void Sale
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ── Payment Modal ── */}
      <PaymentModal
        visible={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        saleId={saleId}
        balance={balance}
        totalAmount={sale.total_amount}
        onPaymentAdded={fetchSaleDetails}
      />

      {/* ── Void Modal ── */}
      <VoidModal
        visible={showVoidModal}
        onClose={() => setShowVoidModal(false)}
        sale={sale}
        onVoided={() => {
          setShowVoidModal(false);
          fetchSaleDetails();
        }}
      />

      {/* ── Receipt Share ── */}
      <FloatingReceiptShare
        visible={showReceiptShare}
        onDismiss={() => setShowReceiptShare(false)}
        receiptNumber={sale.receipt_number}
        onGetReceiptData={getSaleReceiptData}
        onGeneratePDF={generateSaleReceipt}
        customerPhone={sale.customers?.phone}
        customerEmail={sale.customers?.email}
        totalAmount={sale.total_amount}
        receiptType="sale"
      />
    </View>
  );
}

// ─── VOID MODAL ───────────────────────────────────────────────────────────────

function VoidModal({
  visible,
  onClose,
  sale,
  onVoided,
}: {
  visible: boolean;
  onClose: () => void;
  sale: Sale;
  onVoided: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;
  const sp = theme.spacing;
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  useEffect(() => {
    async function load() {
      if (!organizationId) return;
      try {
        const org = await getOrganization(organizationId);
        if (org.currency) {
          const match = ALL_CURRENCIES.find((cu) => cu.code === org.currency);
          setCurrency({
            code: org.currency,
            symbol: match?.symbol ?? org.currency,
            name: match?.name ?? "",
          });
        } else if (org.timezone)
          setCurrency(getCurrencyForTimezone(org.timezone));
      } catch {}
    }
    load();
  }, [organizationId]);

  const voidReasons = [
    "Customer changed mind",
    "Wrong items scanned",
    "Pricing error",
    "Duplicate sale",
    "Training/Test transaction",
    "Other",
  ];

  async function handleVoid() {
    if (!reason.trim()) {
      Alert.alert("Error", "Please select or enter a void reason");
      return;
    }
    Alert.alert(
      "Confirm Void",
      `This will void sale ${sale.receipt_number} for ${currency.symbol}${sale.total_amount.toFixed(2)}. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Void Sale", style: "destructive", onPress: processVoid },
      ],
    );
  }

  async function processVoid() {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      Alert.alert(
        "Connection Required",
        "Voiding requires an internet connection.",
      );
      return;
    }
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.rpc("void_sale", {
        p_sale_id: sale.id,
        p_reason: reason,
        p_user_id: user.id,
      });
      if (error) throw error;
      Alert.alert("Success", "Sale voided successfully");
      onVoided();
      await AsyncStorage.removeItem(`sale_detail_${sale.id}`);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to void sale");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { backgroundColor: c.surfaceRaised }]}>
          <View
            style={[modalStyles.handle, { backgroundColor: c.borderDefault }]}
          />
          <Text
            style={[
              modalStyles.title,
              { color: c.textPrimary, fontFamily: t.h2.fontFamily },
            ]}
          >
            Void Sale
          </Text>

          <View
            style={[
              modalStyles.warning,
              {
                backgroundColor: c.negativeSoft,
                borderColor: c.negative + "44",
              },
            ]}
          >
            <Feather name="alert-triangle" size={16} color={c.negative} />
            <Text
              style={[
                modalStyles.warningText,
                { color: c.negative, fontFamily: t.bodySm.fontFamily },
              ]}
            >
              This will cancel the sale and restore inventory. Payments will be
              reversed.
            </Text>
          </View>

          <View
            style={[
              modalStyles.saleInfo,
              { backgroundColor: c.surface, borderColor: c.borderSubtle },
            ]}
          >
            <Text
              style={[
                {
                  color: c.textPrimary,
                  fontFamily: t.mono.fontFamily,
                  fontSize: 13,
                },
              ]}
            >
              {sale.receipt_number}
            </Text>
            <Text
              style={[
                {
                  color: c.negative,
                  fontFamily: t.monoLg.fontFamily,
                  fontSize: 22,
                  letterSpacing: -0.5,
                },
              ]}
            >
              {currency.symbol}
              {sale.total_amount.toFixed(2)}
            </Text>
          </View>

          <Text
            style={[
              modalStyles.label,
              { color: c.textMuted, fontFamily: t.labelSm.fontFamily },
            ]}
          >
            VOID REASON
          </Text>
          <View style={modalStyles.reasonGrid}>
            {voidReasons.map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  modalStyles.reasonChip,
                  {
                    backgroundColor: reason === r ? c.negative : c.surface,
                    borderColor: reason === r ? c.negative : c.borderSubtle,
                  },
                ]}
                onPress={() => setReason(r)}
              >
                <Text
                  style={[
                    modalStyles.reasonChipText,
                    {
                      color: reason === r ? c.air : c.textSecondary,
                      fontFamily:
                        reason === r
                          ? t.bodyMed.fontFamily
                          : t.bodySm.fontFamily,
                    },
                  ]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={[
              modalStyles.textInput,
              {
                backgroundColor: c.surface,
                borderColor: c.borderDefault,
                color: c.textPrimary,
                fontFamily: t.body.fontFamily,
              },
            ]}
            value={reason}
            onChangeText={setReason}
            placeholder="Or type a custom reason..."
            placeholderTextColor={c.textMuted}
            multiline
            numberOfLines={3}
          />

          <View style={modalStyles.actions}>
            <TouchableOpacity
              style={[
                modalStyles.cancelBtn,
                { backgroundColor: c.surface, borderColor: c.borderSubtle },
              ]}
              onPress={onClose}
            >
              <Text
                style={[
                  {
                    color: c.textSecondary,
                    fontFamily: t.bodyMed.fontFamily,
                    fontSize: 14,
                  },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                modalStyles.confirmBtn,
                { backgroundColor: c.negative, opacity: loading ? 0.6 : 1 },
              ]}
              onPress={handleVoid}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={c.air} size="small" />
              ) : (
                <Text
                  style={[
                    {
                      color: c.air,
                      fontFamily: t.bodyMed.fontFamily,
                      fontSize: 14,
                    },
                  ]}
                >
                  Void Sale
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── PAYMENT MODAL ────────────────────────────────────────────────────────────

function PaymentModal({
  visible,
  onClose,
  saleId,
  balance,
  totalAmount,
  onPaymentAdded,
}: {
  visible: boolean;
  onClose: () => void;
  saleId: string;
  balance: number;
  totalAmount: number;
  onPaymentAdded: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;
  const sp = theme.spacing;
  const [amount, setAmount] = useState(balance.toString());
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "bank" | "pos" | "mobile"
  >("cash");
  const [loading, setLoading] = useState(false);
  const { organizationId } = useAuthStore();
  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  useEffect(() => {
    async function load() {
      if (!organizationId) return;
      try {
        const org = await getOrganization(organizationId);
        if (org.currency) {
          const match = ALL_CURRENCIES.find((cu) => cu.code === org.currency);
          setCurrency({
            code: org.currency,
            symbol: match?.symbol ?? org.currency,
            name: match?.name ?? "",
          });
        } else if (org.timezone)
          setCurrency(getCurrencyForTimezone(org.timezone));
      } catch {}
    }
    load();
  }, [organizationId]);

  const PAYMENT_METHODS: {
    value: "cash" | "bank" | "pos" | "mobile";
    label: string;
    icon: React.ComponentProps<typeof Feather>["name"];
  }[] = [
    { value: "cash", label: "Cash", icon: "dollar-sign" },
    { value: "bank", label: "Bank Transfer", icon: "arrow-up-right" },
    { value: "pos", label: "POS", icon: "credit-card" },
    { value: "mobile", label: "Mobile Money", icon: "smartphone" },
  ];

  async function handleAddPayment() {
    const paymentAmount = parseFloat(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }
    if (paymentAmount > balance) {
      Alert.alert(
        "Overpayment",
        `Amount exceeds balance of ${currency.symbol}${balance.toFixed(2)}. Continue?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => processPayment(paymentAmount) },
        ],
      );
      return;
    }
    processPayment(paymentAmount);
  }

  async function processPayment(paymentAmount: number) {
    if (!organizationId) return;
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const paymentOccurredAt = new Date();
      const { data: saleData } = await supabase
        .from("sales")
        .select("created_at, location_id, device_id")
        .eq("id", saleId)
        .single();
      if (!saleData) throw new Error("Sale not found");
      const delayMinutes = Math.floor(
        (paymentOccurredAt.getTime() -
          new Date(saleData.created_at).getTime()) /
          60000,
      );
      const { data: accounts } = await supabase
        .from("financial_accounts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("account_type", paymentMethod)
        .limit(1);
      let accountId = accounts?.[0]?.id;
      if (!accountId) {
        const { data: newAccount } = await supabase
          .from("financial_accounts")
          .insert({
            organization_id: organizationId,
            name:
              paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1),
            account_type: paymentMethod,
            is_active: true,
          })
          .select("id")
          .single();
        accountId = newAccount?.id;
      }
      await supabase
        .from("payments")
        .insert({
          organization_id: organizationId,
          location_id: saleData.location_id,
          reference_type: "sale",
          reference_id: saleId,
          amount: paymentAmount,
          payment_method: paymentMethod,
          direction: "in",
          device_id: saleData.device_id,
          created_by: user.id,
          occurred_at: paymentOccurredAt.toISOString(),
          payment_delay_minutes: delayMinutes,
          is_immediate: delayMinutes < 5,
        });
      await supabase
        .from("financial_events")
        .insert({
          organization_id: organizationId,
          location_id: saleData.location_id,
          event_type: "sale_revenue",
          account_id: accountId,
          direction: "in",
          amount: paymentAmount,
          reference_type: "sale",
          reference_id: saleId,
          occurred_at: new Date().toISOString(),
        });
      Alert.alert("Success", "Payment recorded successfully");
      onPaymentAdded();
      await AsyncStorage.removeItem(`sale_detail_${saleId}`);
      onClose();
      setAmount("");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { backgroundColor: c.surfaceRaised }]}>
          <View
            style={[modalStyles.handle, { backgroundColor: c.borderDefault }]}
          />
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              style={[
                modalStyles.title,
                { color: c.textPrimary, fontFamily: t.h2.fontFamily },
              ]}
            >
              Add Payment
            </Text>

            <Text
              style={[
                modalStyles.balanceLabel,
                { color: c.textMuted, fontFamily: t.labelSm.fontFamily },
              ]}
            >
              BALANCE DUE
            </Text>
            <Text
              style={[
                modalStyles.balanceValue,
                { color: c.signal, fontFamily: t.monoLg.fontFamily },
              ]}
            >
              {currency.symbol}
              {balance.toFixed(2)}
            </Text>

            <Text
              style={[
                modalStyles.label,
                {
                  color: c.textMuted,
                  fontFamily: t.labelSm.fontFamily,
                  marginTop: sp.xl,
                },
              ]}
            >
              PAYMENT METHOD
            </Text>
            <View style={modalStyles.methodGrid}>
              {PAYMENT_METHODS.map((method) => (
                <TouchableOpacity
                  key={method.value}
                  style={[
                    modalStyles.methodBtn,
                    {
                      backgroundColor:
                        paymentMethod === method.value
                          ? c.brandInteractive
                          : c.surface,
                      borderColor:
                        paymentMethod === method.value
                          ? c.brandInteractive
                          : c.borderSubtle,
                    },
                  ]}
                  onPress={() => setPaymentMethod(method.value)}
                  activeOpacity={0.75}
                >
                  <Feather
                    name={method.icon}
                    size={18}
                    color={
                      paymentMethod === method.value ? c.air : c.textSecondary
                    }
                  />
                  <Text
                    style={[
                      modalStyles.methodLabel,
                      {
                        color:
                          paymentMethod === method.value
                            ? c.air
                            : c.textSecondary,
                        fontFamily:
                          paymentMethod === method.value
                            ? t.bodyMed.fontFamily
                            : t.bodySm.fontFamily,
                      },
                    ]}
                  >
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text
              style={[
                modalStyles.label,
                {
                  color: c.textMuted,
                  fontFamily: t.labelSm.fontFamily,
                  marginTop: sp.xl,
                },
              ]}
            >
              AMOUNT
            </Text>
            <TextInput
              style={[
                modalStyles.amountInput,
                {
                  backgroundColor: c.surface,
                  borderColor: c.borderDefault,
                  color: c.signal,
                  fontFamily: t.monoLg.fontFamily,
                },
              ]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={c.textMuted}
            />
            <View
              style={{ flexDirection: "row", gap: sp.sm, marginTop: sp.sm }}
            >
              <TouchableOpacity
                style={[
                  modalStyles.quickBtn,
                  { backgroundColor: c.surface, borderColor: c.borderSubtle },
                ]}
                onPress={() => setAmount(balance.toString())}
              >
                <Text
                  style={[
                    modalStyles.quickBtnText,
                    {
                      color: c.textSecondary,
                      fontFamily: t.bodyMed.fontFamily,
                    },
                  ]}
                >
                  Full
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  modalStyles.quickBtn,
                  { backgroundColor: c.surface, borderColor: c.borderSubtle },
                ]}
                onPress={() => setAmount((balance / 2).toFixed(2))}
              >
                <Text
                  style={[
                    modalStyles.quickBtnText,
                    {
                      color: c.textSecondary,
                      fontFamily: t.bodyMed.fontFamily,
                    },
                  ]}
                >
                  Half
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={[modalStyles.actions, { marginTop: sp.xl }]}>
            <TouchableOpacity
              style={[
                modalStyles.cancelBtn,
                { backgroundColor: c.surface, borderColor: c.borderSubtle },
              ]}
              onPress={onClose}
            >
              <Text
                style={[
                  {
                    color: c.textSecondary,
                    fontFamily: t.bodyMed.fontFamily,
                    fontSize: 14,
                  },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                modalStyles.confirmBtn,
                {
                  backgroundColor: c.brandInteractive,
                  opacity: loading ? 0.6 : 1,
                },
              ]}
              onPress={handleAddPayment}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={c.air} size="small" />
              ) : (
                <Text
                  style={[
                    {
                      color: c.air,
                      fontFamily: t.bodyMed.fontFamily,
                      fontSize: 14,
                    },
                  ]}
                >
                  Add Payment
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, lineHeight: 22, letterSpacing: 0.01 * 18 },
  headerSub: { fontSize: 10, letterSpacing: 0.2, marginTop: 2 },
  receiptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  receiptBtnText: { fontSize: 12 },
  voidedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  voidedTitle: { fontSize: 13 },
  voidedSub: { fontSize: 10, letterSpacing: 0.2, marginTop: 2 },
  cardTitle: { fontSize: 16, lineHeight: 22, marginBottom: 4 },
  cardSub: { fontSize: 10, letterSpacing: 0.2 },
  sectionLabel: { fontSize: 9, letterSpacing: 1.2, marginBottom: 10 },
  itemRow: { paddingVertical: 10 },
  itemName: { fontSize: 13, marginBottom: 2 },
  itemSub: { fontSize: 10, letterSpacing: 0.1 },
  itemTotal: { fontSize: 13, letterSpacing: -0.2 },
  totalDivider: { borderTopWidth: 1, marginVertical: 8 },
  noPayments: { fontSize: 11, letterSpacing: 0.2, paddingVertical: 8 },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  paymentMethod: { fontSize: 12, letterSpacing: 0.5 },
  paymentDate: { fontSize: 10, marginTop: 2 },
  paymentAmount: { fontSize: 14, letterSpacing: -0.2 },
  actionGrid: { flexDirection: "row", gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 8,
  },
  actionBtnText: { fontSize: 13 },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
    maxHeight: "90%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: { fontSize: 20, lineHeight: 26, marginBottom: 20 },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  warningText: { flex: 1, fontSize: 12, lineHeight: 18 },
  saleInfo: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    gap: 4,
    marginBottom: 20,
  },
  label: { fontSize: 9, letterSpacing: 1.2, marginBottom: 10 },
  reasonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  reasonChipText: { fontSize: 12 },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    minHeight: 72,
    textAlignVertical: "top",
  },
  balanceLabel: { fontSize: 9, letterSpacing: 1.2, marginBottom: 6 },
  balanceValue: { fontSize: 32, letterSpacing: -1, lineHeight: 38 },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  methodBtn: {
    flex: 1,
    minWidth: "45%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  methodLabel: { fontSize: 12 },
  amountInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    fontSize: 28,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  quickBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  quickBtnText: { fontSize: 13 },
  actions: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtn: {
    flex: 1.5,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
