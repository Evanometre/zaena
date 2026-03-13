// FILE: components/InvoiceButton.tsx
// Drop this button into any screen that needs to generate an invoice.
//
// The `buildInvoice` prop accepts any builder function (or a custom async function
// that returns InvoiceData). The component handles loading state, errors, and
// initialising the generator — the screen doesn't need to think about any of that.
//
// Examples:
//
//   // From a sales screen
//   <InvoiceButton
//     organizationId={orgId}
//     buildInvoice={() => buildSaleInvoice(saleId, orgId)}
//   />
//
//   // From a payment screen with custom delivery options
//   <InvoiceButton
//     organizationId={orgId}
//     buildInvoice={() => buildPaymentInvoice(paymentId, orgId)}
//     deliveryOptions={{ whatsapp: true, email: false, pdf: true }}
//     label="Send Receipt"
//   />
//
//   // Fully manual (no Supabase fetch needed)
//   <InvoiceButton
//     organizationId={orgId}
//     buildInvoice={async () => ({
//       type: 'invoice',
//       number: 'INV-001',
//       date: new Date(),
//       organizationId: orgId,
//       items: [{ productName: 'Consulting', quantity: 1, unit: 'hr', unitPrice: 50000, total: 50000 }],
//       subtotal: 50000,
//       totalAmount: 50000,
//     })}
//   />

import { DeliveryOptions, InvoiceData, InvoiceGenerator } from "@/lib/invoices";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    ViewStyle,
} from "react-native";

interface InvoiceButtonProps {
  /** Organization ID used to load org details and delivery settings. */
  organizationId: string;

  /**
   * Async function that returns InvoiceData (or null on failure).
   * Use any builder from lib/invoices/builders, or supply your own.
   */
  buildInvoice: () => Promise<InvoiceData | null>;

  /**
   * Override delivery options. If omitted, the generator reads from
   * organization_settings in Supabase.
   */
  deliveryOptions?: DeliveryOptions;

  /**
   * When true, skips the share dialog even if pdf delivery is enabled.
   * Defaults to true (silent background save).
   */
  silentMode?: boolean;

  /** Button label. Defaults to "Generate Invoice". */
  label?: string;

  /** Called after a successful generation. */
  onSuccess?: () => void;

  /** Called if generation fails. */
  onError?: (error: string) => void;

  /** Optional style overrides for the button container. */
  style?: ViewStyle;
}

export function InvoiceButton({
  organizationId,
  buildInvoice,
  deliveryOptions,
  silentMode = true,
  label = "Generate Invoice",
  onSuccess,
  onError,
  style,
}: InvoiceButtonProps) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const invoiceData = await buildInvoice();

      if (!invoiceData) {
        const msg = "Could not load invoice data. Please try again.";
        Alert.alert("Invoice Error", msg);
        onError?.(msg);
        return;
      }

      const generator = new InvoiceGenerator(organizationId);
      await generator.initialize();

      const result = await generator.generate(
        invoiceData,
        deliveryOptions,
        silentMode,
      );

      if (result.success) {
        onSuccess?.();
      } else {
        const msg = result.errors?.join(", ") || "Invoice generation failed.";
        Alert.alert("Invoice Error", msg);
        onError?.(msg);
      }
    } catch (err: any) {
      const msg = err?.message || "Unexpected error generating invoice.";
      console.error("InvoiceButton error:", err);
      Alert.alert("Invoice Error", msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, style, loading && styles.buttonDisabled]}
      onPress={handlePress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#ffffff" />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    minWidth: 160,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  label: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
