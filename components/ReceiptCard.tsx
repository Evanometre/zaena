// FILE: components/ReceiptCard.tsx
//
// Premium receipt card — rendered off-screen and captured as JPEG for WhatsApp.
// Design language matches the PDF template in lib/invoices/core.ts exactly:
// white background, thin rule grid, DM Sans typography, accent orange.
//
// Props mirror InvoiceData but keep it self-contained for the RN renderer.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { INVOICE_TYPE_LABELS, InvoiceData } from "../lib/invoices/types";

interface ReceiptCardProps {
  data: InvoiceData;
  orgName: string;
  orgPhone?: string;
  orgEmail?: string;
  orgAddress?: string;
  currencySymbol?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, symbol = "₦") {
  return `${symbol}${n.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function getStatus(data: InvoiceData) {
  if (data.amountPaid === undefined) return null;
  if (data.amountPaid >= data.totalAmount)
    return { label: "PAID", color: "#10b981", bg: "#f0fdf4" };
  if (data.amountPaid > 0)
    return { label: "PARTIAL", color: "#e85a2a", bg: "#fff7f4" };
  return { label: "UNPAID", color: "#ef4444", bg: "#fef2f2" };
}

function partyLabel(data: InvoiceData) {
  return data.type === "purchase_order" || data.type === "stock_receipt"
    ? "SUPPLIER"
    : "CUSTOMER";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Label({ children }: { children: string }) {
  return <Text style={s.label}>{children}</Text>;
}

function Rule() {
  return <View style={s.rule} />;
}

function TotalLine({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View style={s.totalLine}>
      <Text style={[s.totalLineLabel, danger && { color: C.danger }]}>
        {label}
      </Text>
      <Text style={[s.totalLineValue, danger && { color: C.danger }]}>
        {value}
      </Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReceiptCard({
  data,
  orgName,
  orgPhone,
  orgEmail,
  orgAddress,
  currencySymbol = "₦",
}: ReceiptCardProps) {
  const title = INVOICE_TYPE_LABELS[data.type] || "Receipt";
  const status = getStatus(data);
  const balance =
    data.balance ??
    (data.amountPaid !== undefined
      ? Math.max(0, data.totalAmount - data.amountPaid)
      : undefined);
  const showSubtotal =
    data.subtotal !== data.totalAmount || data.discount || data.tax;

  return (
    <View style={s.card}>
      {/* ── Top accent bar ────────────────────────────────────────────── */}
      <View style={s.accentBar} />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <View style={s.header}>
        {/* Left: org details */}
        <View style={s.headerLeft}>
          <Text style={s.orgName} numberOfLines={1}>
            {orgName}
          </Text>
          {orgAddress ? (
            <Text style={s.orgDetail} numberOfLines={1}>
              {orgAddress}
            </Text>
          ) : null}
          {orgPhone ? <Text style={s.orgDetail}>Tel: {orgPhone}</Text> : null}
          {orgEmail ? (
            <Text style={s.orgDetail} numberOfLines={1}>
              {orgEmail}
            </Text>
          ) : null}
        </View>

        {/* Right: document meta */}
        <View style={s.headerRight}>
          <Text style={s.docType}>{title}</Text>
          <Text style={s.docNumber}>#{data.number}</Text>
          <Text style={s.docDate}>
            {data.date.toLocaleDateString("en-NG", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Text>
          {status ? (
            <View
              style={[
                s.statusPill,
                {
                  backgroundColor: status.bg,
                  borderColor: status.color + "40",
                },
              ]}
            >
              <Text style={[s.statusText, { color: status.color }]}>
                {status.label}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Parties ──────────────────────────────────────────────────── */}
      {(data.customer || data.location) && (
        <View style={s.parties}>
          {data.customer && (
            <View
              style={[s.party, data.location ? s.partyBorderRight : undefined]}
            >
              <Label>{partyLabel(data)}</Label>
              <Text style={s.partyName}>{data.customer.name}</Text>
              {data.customer.phone ? (
                <Text style={s.partyDetail}>{data.customer.phone}</Text>
              ) : null}
              {data.customer.email ? (
                <Text style={s.partyDetail} numberOfLines={1}>
                  {data.customer.email}
                </Text>
              ) : null}
            </View>
          )}
          {data.location && (
            <View style={s.party}>
              <Label>LOCATION</Label>
              <Text style={s.partyName}>{data.location.name}</Text>
              {data.location.address ? (
                <Text style={s.partyDetail}>{data.location.address}</Text>
              ) : null}
            </View>
          )}
        </View>
      )}

      {/* ── Items table header ────────────────────────────────────────── */}
      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderCell, { flex: 2.6 }]}>DESCRIPTION</Text>
        <Text style={[s.tableHeaderCell, s.right, { flex: 0.8 }]}>QTY</Text>
        <Text style={[s.tableHeaderCell, s.right, { flex: 1.2 }]}>PRICE</Text>
        <Text style={[s.tableHeaderCell, s.right, { flex: 1.2 }]}>AMOUNT</Text>
      </View>

      {/* ── Items ────────────────────────────────────────────────────── */}
      {data.items.map((item, i) => (
        <View
          key={i}
          style={[s.tableRow, i < data.items.length - 1 && s.tableRowBorder]}
        >
          <View style={{ flex: 2.6 }}>
            <Text style={s.itemName}>{item.productName}</Text>
            {item.description ? (
              <Text style={s.itemDesc}>{item.description}</Text>
            ) : null}
          </View>
          <Text style={[s.itemCell, s.right, s.mono, { flex: 0.8 }]}>
            {item.quantity}
            {"\n"}
            <Text style={s.itemUnit}>{item.unit}</Text>
          </Text>
          <Text style={[s.itemCell, s.right, s.mono, { flex: 1.2 }]}>
            {fmt(item.unitPrice, currencySymbol)}
          </Text>
          <Text
            style={[
              s.itemCell,
              s.right,
              s.mono,
              { flex: 1.2, fontWeight: "600", color: C.ink },
            ]}
          >
            {fmt(item.total, currencySymbol)}
          </Text>
        </View>
      ))}

      {/* ── Totals ───────────────────────────────────────────────────── */}
      <View style={s.totals}>
        {showSubtotal && (
          <TotalLine
            label="Subtotal"
            value={fmt(data.subtotal, currencySymbol)}
          />
        )}
        {data.discount && data.discount > 0 ? (
          <TotalLine
            label="Discount"
            value={`−${fmt(data.discount, currencySymbol)}`}
            danger
          />
        ) : null}
        {data.tax && data.tax > 0 ? (
          <TotalLine label="Tax" value={fmt(data.tax, currencySymbol)} />
        ) : null}

        {/* Grand total */}
        <View style={s.grandTotalRow}>
          <Text style={s.grandTotalLabel}>TOTAL</Text>
          <Text style={s.grandTotalValue}>
            {fmt(data.totalAmount, currencySymbol)}
          </Text>
        </View>
      </View>

      {/* ── Payment ──────────────────────────────────────────────────── */}
      {data.amountPaid !== undefined && (
        <View style={s.paymentSection}>
          <Label>PAYMENT</Label>
          {data.paymentMethod ? (
            <View style={s.paymentRow}>
              <Text style={s.paymentRowLabel}>Method</Text>
              <Text style={s.paymentRowValue}>
                {data.paymentMethod.charAt(0).toUpperCase() +
                  data.paymentMethod.slice(1)}
              </Text>
            </View>
          ) : null}
          <View style={s.paymentRow}>
            <Text style={s.paymentRowLabel}>Amount Paid</Text>
            <Text style={[s.paymentRowValue, s.mono, { color: C.success }]}>
              {fmt(data.amountPaid, currencySymbol)}
            </Text>
          </View>
          {balance !== undefined && balance > 0 && (
            <View style={s.balanceBlock}>
              <Text style={s.balanceLabel}>BALANCE DUE</Text>
              <Text style={[s.balanceValue, s.mono]}>
                {fmt(balance, currencySymbol)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Notes ────────────────────────────────────────────────────── */}
      {data.notes ? (
        <View style={s.notesSection}>
          <Label>NOTES</Label>
          <Text style={s.notesText}>{data.notes}</Text>
        </View>
      ) : null}

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <View style={s.footer}>
        <View>
          <Text style={s.footerBrand}>{orgName}</Text>
          <Text style={s.footerTagline}>Thank you for your business</Text>
        </View>
        <Text style={s.footerDate}>
          {new Date().toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </Text>
      </View>

      {/* ── Bottom accent bar ─────────────────────────────────────────── */}
      <View style={s.accentBar} />
    </View>
  );
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  ink: "#111111",
  ink2: "#444444",
  ink3: "#888888",
  ink4: "#bbbbbb",
  accent: "#e85a2a",
  success: "#10b981",
  danger: "#ef4444",
  surface: "#fafafa",
  border: "#ebebeb",
  white: "#ffffff",
};

// ── Styles ────────────────────────────────────────────────────────────────────

const PAD = 24; // horizontal padding throughout

const s = StyleSheet.create({
  card: {
    width: 390,
    backgroundColor: C.white,
    overflow: "hidden",
  },

  // Accent bars
  accentBar: {
    height: 3,
    backgroundColor: C.accent,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: PAD,
    paddingVertical: 22,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeft: { flex: 1, marginRight: 16 },
  orgName: {
    fontSize: 17,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: -0.3,
    marginBottom: 5,
  },
  orgDetail: {
    fontSize: 11,
    color: C.ink3,
    lineHeight: 16,
  },
  headerRight: { alignItems: "flex-end" },
  docType: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: C.accent,
    marginBottom: 5,
  },
  docNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  docDate: {
    fontSize: 11,
    color: C.ink3,
    marginBottom: 8,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 8.5,
    fontWeight: "700",
    letterSpacing: 0.8,
  },

  // Parties
  parties: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  party: {
    flex: 1,
    paddingHorizontal: PAD,
    paddingVertical: 14,
  },
  partyBorderRight: {
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: C.accent,
    marginBottom: 5,
  },
  partyName: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
    marginBottom: 2,
  },
  partyDetail: {
    fontSize: 11,
    color: C.ink3,
    lineHeight: 16,
  },

  // Table
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: PAD,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: C.ink3,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: PAD,
    paddingVertical: 12,
    alignItems: "flex-start",
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  itemName: {
    fontSize: 12.5,
    fontWeight: "500",
    color: C.ink,
    lineHeight: 17,
  },
  itemDesc: {
    fontSize: 10.5,
    color: C.ink3,
    marginTop: 2,
    lineHeight: 15,
  },
  itemCell: {
    fontSize: 12,
    color: C.ink2,
    lineHeight: 17,
  },
  itemUnit: {
    fontSize: 10,
    color: C.ink4,
  },
  right: { textAlign: "right" },
  mono: { fontVariant: ["tabular-nums"] },

  // Totals
  totals: {
    paddingHorizontal: PAD,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  totalLineLabel: {
    fontSize: 12,
    color: C.ink3,
  },
  totalLineValue: {
    fontSize: 12,
    color: C.ink2,
    fontVariant: ["tabular-nums"],
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: C.ink,
  },
  grandTotalLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: C.ink,
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: "500",
    color: C.accent,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },

  // Payment
  paymentSection: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: PAD,
    paddingVertical: 14,
    backgroundColor: C.surface,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  paymentRowLabel: {
    fontSize: 12,
    color: C.ink3,
  },
  paymentRowValue: {
    fontSize: 12,
    color: C.ink2,
    fontVariant: ["tabular-nums"],
  },
  balanceBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    padding: 12,
    backgroundColor: "#fff5f5",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  balanceLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: C.danger,
  },
  balanceValue: {
    fontSize: 17,
    fontWeight: "600",
    color: C.danger,
    fontVariant: ["tabular-nums"],
  },

  // Notes
  notesSection: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: PAD,
    paddingVertical: 14,
  },
  notesText: {
    fontSize: 11.5,
    color: C.ink2,
    lineHeight: 17,
    marginTop: 4,
  },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: PAD,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  footerBrand: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
    marginBottom: 2,
  },
  footerTagline: {
    fontSize: 10.5,
    color: C.ink4,
  },
  footerDate: {
    fontSize: 10,
    color: C.ink4,
    fontVariant: ["tabular-nums"],
  },

  // Utility
  rule: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 8,
  },
});
