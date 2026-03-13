// FILE: components/InlinePaymentModal.tsx
//
// Self-contained payment modal for use directly after checkout in new.tsx.
// Uses data already available in memory — no Supabase fetch for the sale.
// This means it works even before the sale has synced to the server.
//
// Only shown in solo workflowMode. Team mode records payments from [id].tsx.

import { AntDesign } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
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
import { COLORS } from "../lib/colors";
import {
  addPaymentToPendingSale,
  queueStandalonePayment,
} from "../lib/localDb";
import { syncPendingSales } from "../lib/syncEngine";

type PaymentMethod = "cash" | "bank" | "pos" | "mobile";

interface InlinePaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onPaymentRecorded: () => void;

  // All sourced from in-memory state after checkout — no Supabase fetch needed
  saleId: string;
  receiptNumber: string;
  totalAmount: number;
  organizationId: string;
  locationId: string;
  deviceId: string;
  userId: string;
  saleCreatedAt: string; // ISO string — for payment_delay_minutes calculation
  currencySymbol: string;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank Transfer" },
  { value: "pos", label: "POS" },
  { value: "mobile", label: "Mobile Money" },
];

export default function InlinePaymentModal({
  visible,
  onClose,
  onPaymentRecorded,
  saleId,
  receiptNumber,
  totalAmount,
  organizationId,
  locationId,
  deviceId,
  userId,
  saleCreatedAt,
  currencySymbol,
}: InlinePaymentModalProps) {
  const [amount, setAmount] = useState(totalAmount.toFixed(2));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [loading, setLoading] = useState(false);

  // Reset amount when a new sale comes in
  useEffect(() => {
    if (visible) {
      setAmount(totalAmount.toFixed(2));
      setPaymentMethod("cash");
    }
  }, [visible, totalAmount]);

  async function handleSubmit() {
    const paymentAmount = parseFloat(amount);

    if (!paymentAmount || paymentAmount <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }

    if (paymentAmount > totalAmount) {
      Alert.alert(
        "Overpayment",
        `Amount (${currencySymbol}${paymentAmount.toFixed(2)}) exceeds total (${currencySymbol}${totalAmount.toFixed(2)}). Continue?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => processPayment(paymentAmount) },
        ],
      );
      return;
    }

    await processPayment(paymentAmount);
  }

  async function processPayment(paymentAmount: number) {
    setLoading(true);
    try {
      const paymentOccurredAt = new Date();
      const delayMinutes = Math.floor(
        (paymentOccurredAt.getTime() - new Date(saleCreatedAt).getTime()) /
          60000,
      );

      const idempotencyKey = `${saleId}-${paymentMethod}-${paymentAmount}-${paymentOccurredAt.getTime()}`;

      const paymentPayload = {
        organization_id: organizationId,
        location_id: locationId,
        reference_type: "sale",
        reference_id: saleId,
        amount: paymentAmount,
        payment_method: paymentMethod,
        direction: "in",
        device_id: deviceId,
        created_by: userId,
        occurred_at: paymentOccurredAt.toISOString(),
        payment_delay_minutes: delayMinutes,
        is_immediate: delayMinutes < 5,
        idempotency_key: idempotencyKey,
      };

      // Always write to SQLite first — works offline, prevents data loss
      const bundled = addPaymentToPendingSale(saleId, paymentPayload);

      if (!bundled) {
        // Sale already synced — queue as standalone for sync engine
        queueStandalonePayment(saleId, receiptNumber, paymentPayload);
      }

      // Optimistically close modal immediately — user sees success
      onPaymentRecorded();
      onClose();

      // Attempt to sync right now in background — fire and forget
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        syncPendingSales().catch((err) =>
          console.error("Background sync after payment failed:", err),
        );
      }
    } catch (err: any) {
      console.error("Payment failed:", err);
      Alert.alert("Error", err.message || "Failed to record payment");
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
      <View style={styles.overlay}>
        <View style={styles.content}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Record Payment</Text>
                <Text style={styles.subtitle}>#{receiptNumber}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <AntDesign name="close" size={20} color={COLORS.secondary} />
              </TouchableOpacity>
            </View>

            {/* Total */}
            <View style={styles.totalSection}>
              <Text style={styles.totalLabel}>Amount Due</Text>
              <Text style={styles.totalAmount}>
                {currencySymbol}
                {totalAmount.toFixed(2)}
              </Text>
            </View>

            {/* Payment method */}
            <Text style={styles.sectionLabel}>Payment Method</Text>
            <View style={styles.methodGrid}>
              {PAYMENT_METHODS.map((method) => (
                <TouchableOpacity
                  key={method.value}
                  style={[
                    styles.methodBtn,
                    paymentMethod === method.value && styles.methodBtnActive,
                  ]}
                  onPress={() => setPaymentMethod(method.value)}
                >
                  <Text
                    style={[
                      styles.methodLabel,
                      paymentMethod === method.value &&
                        styles.methodLabelActive,
                    ]}
                  >
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Amount input */}
            <Text style={styles.sectionLabel}>Amount ({currencySymbol})</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0.00"
              selectTextOnFocus
            />
            <View style={styles.quickAmounts}>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => setAmount(totalAmount.toFixed(2))}
              >
                <Text style={styles.quickBtnText}>Full amount</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => setAmount((totalAmount / 2).toFixed(2))}
              >
                <Text style={styles.quickBtnText}>Half</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.skipBtn} onPress={onClose}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, loading && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.confirmText}>Confirm Payment</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  totalSection: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  totalLabel: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  methodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  methodBtn: {
    flex: 1,
    minWidth: "45%",
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  methodBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  methodLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  methodLabelActive: {
    color: COLORS.white,
  },
  amountInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    color: COLORS.primary,
    marginBottom: 12,
  },
  quickAmounts: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  quickBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  skipBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  skipText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  confirmBtn: {
    flex: 2,
    padding: 16,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: "center",
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.white,
  },
  btnDisabled: {
    backgroundColor: COLORS.gray[400],
  },
});
