// FILE: components/FloatingReceiptShare.tsx
//
// WhatsApp → JPEG image via ReceiptImageCapture (native RN view snapshot)
// Email    → PDF via expo-print
// Share    → PDF via native share sheet

import * as Sharing from "expo-sharing";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../lib/colors";
import { InvoiceData } from "../lib/invoices/core";
import {
  OrgDetails,
  ReceiptImageCapture,
  ReceiptImageCaptureHandle,
} from "./ReceiptImageCapture";

interface FloatingReceiptShareProps {
  visible: boolean;
  onDismiss: () => void;
  receiptNumber: string;

  /**
   * Returns the InvoiceData and OrgDetails needed to render the receipt card.
   * Built from in-memory state — no Supabase fetch — so works offline.
   */
  onGetReceiptData?: () => Promise<{
    invoiceData: InvoiceData;
    org: OrgDetails;
  } | null>;

  /**
   * Returns a PDF URI for Email and Share PDF buttons.
   */
  onGeneratePDF?: () => Promise<string | null>;

  customerPhone?: string;
  customerEmail?: string;
  totalAmount?: number;
  receiptType?: "sale" | "payment" | "purchase" | "stock" | "withdrawal";
}

export default function FloatingReceiptShare({
  visible,
  onDismiss,
  receiptNumber,
  onGetReceiptData,
  onGeneratePDF,
  customerEmail,
  receiptType = "sale",
}: FloatingReceiptShareProps) {
  const [slideAnim] = useState(new Animated.Value(-300));
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const imageCaptureRef = useRef<ReceiptImageCaptureHandle>(null);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (visible) {
      setImageUri(null);
      setPdfUri(null);

      Animated.spring(slideAnim, {
        toValue: 16,
        useNativeDriver: true,
        friction: 8,
        tension: 65,
      }).start();

      // Pre-generate image in background immediately
      if (onGetReceiptData) {
        generateImage();
      }

      const timer = setTimeout(handleDismiss, 20000);
      return () => clearTimeout(timer);
    } else {
      Animated.timing(slideAnim, {
        toValue: -300,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // ── Image generation ───────────────────────────────────────────────────────

  async function generateImage(): Promise<string | null> {
    if (imageUri) return imageUri;
    if (!onGetReceiptData) return null;

    setGeneratingImage(true);
    try {
      const result = await onGetReceiptData();
      if (!result) return null;

      const uri =
        (await imageCaptureRef.current?.capture(
          result.invoiceData,
          result.org,
        )) ?? null;

      if (uri) setImageUri(uri);
      return uri;
    } catch (err) {
      console.error("Image generation failed:", err);
      return null;
    } finally {
      setGeneratingImage(false);
    }
  }

  // ── PDF generation ─────────────────────────────────────────────────────────

  async function generatePDF(): Promise<string | null> {
    if (pdfUri) return pdfUri;
    if (!onGeneratePDF) return null;

    setGeneratingPdf(true);
    try {
      const uri = await onGeneratePDF();
      if (uri) setPdfUri(uri);
      return uri;
    } catch (err) {
      console.error("PDF generation failed:", err);
      return null;
    } finally {
      setGeneratingPdf(false);
    }
  }

  // ── Button handlers ────────────────────────────────────────────────────────

  async function handleWhatsApp() {
    // Ensure image is ready (may already be from pre-generation)
    let uri = imageUri ?? (await generateImage());
    console.log("WhatsApp sharing URI:", uri);

    if (!uri) {
      Alert.alert(
        "Error",
        "Could not generate receipt image. Please try Share PDF instead.",
      );
      return;
    }

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          "Sharing Not Available",
          "Cannot share files on this device.",
        );
        return;
      }
      // JPEG shares into WhatsApp as an inline photo — opens instantly, no tapping needed.
      await Sharing.shareAsync(uri, {
        mimeType: "image/jpeg",
        dialogTitle: `Receipt ${receiptNumber}`,
        UTI: "public.jpeg",
      });
    } catch (err) {
      console.error("WhatsApp share failed:", err);
      Alert.alert("Error", "Failed to share receipt.");
    }
  }

  async function handleEmail() {
    let uri = pdfUri ?? (await generatePDF());

    if (!uri) {
      Alert.alert("Not Ready", "Could not generate receipt PDF.");
      return;
    }

    try {
      const MailComposer = await import("expo-mail-composer");
      const isAvailable = await MailComposer.isAvailableAsync();

      if (!isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `Receipt ${receiptNumber}`,
          UTI: "com.adobe.pdf",
        });
        return;
      }

      const typeLabels: Record<string, string> = {
        sale: "Sales Receipt",
        payment: "Payment Receipt",
        purchase: "Purchase Order",
        stock: "Goods Received Note",
        withdrawal: "Withdrawal Receipt",
      };

      await MailComposer.composeAsync({
        recipients: customerEmail ? [customerEmail] : [],
        subject: `${typeLabels[receiptType] || "Receipt"} #${receiptNumber}`,
        body: `Please find attached your receipt.`,
        attachments: [uri],
      });
    } catch (err) {
      console.error("Email failed:", err);
      Alert.alert("Error", "Failed to open email composer.");
    }
  }

  async function handleSharePDF() {
    let uri = pdfUri ?? (await generatePDF());

    if (!uri) {
      Alert.alert("Not Ready", "Could not generate receipt PDF.");
      return;
    }

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          "Sharing Not Available",
          "Cannot share files on this device.",
        );
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Receipt ${receiptNumber}`,
        UTI: "com.adobe.pdf",
      });
    } catch (err) {
      console.error("Share PDF failed:", err);
      Alert.alert("Error", "Failed to share receipt.");
    }
  }

  // ── Dismiss ────────────────────────────────────────────────────────────────

  function handleDismiss() {
    Animated.timing(slideAnim, {
      toValue: -300,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onDismiss());
  }

  if (!visible) return null;

  const isGenerating = generatingImage || generatingPdf;

  return (
    <>
      {/* Off-screen receipt renderer — must be in tree when visible */}
      <ReceiptImageCapture ref={imageCaptureRef} />

      <Animated.View
        style={[styles.container, { transform: [{ translateX: slideAnim }] }]}
      >
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.emoji}>🧾</Text>
            <View style={styles.headerText}>
              <Text style={styles.title}>Receipt Ready</Text>
              <Text style={styles.subtitle}>#{receiptNumber}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleDismiss} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {isGenerating ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.loadingText}>
              {generatingImage ? "Creating receipt..." : "Creating PDF..."}
            </Text>
          </View>
        ) : (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleWhatsApp}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, styles.whatsappCircle]}>
                <Text style={styles.actionIcon}>💬</Text>
              </View>
              <View>
                <Text style={styles.actionText}>WhatsApp</Text>
                <Text style={styles.actionSubtext}>
                  {imageUri ? "✓ Image ready" : "Sends as image"}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleEmail}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, styles.emailCircle]}>
                <Text style={styles.actionIcon}>📧</Text>
              </View>
              <View>
                <Text style={styles.actionText}>Email</Text>
                <Text style={styles.actionSubtext}>Sends as PDF</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleSharePDF}
              activeOpacity={0.7}
            >
              <View style={styles.iconCircle}>
                <Text style={styles.actionIcon}>📤</Text>
              </View>
              <View>
                <Text style={styles.actionText}>Share PDF</Text>
                <Text style={styles.actionSubtext}>More options</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Tap ✕ to dismiss</Text>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    bottom: 60,
    width: 150,
    backgroundColor: COLORS.white,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 9999,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerContent: { flexDirection: "row", alignItems: "center", flex: 1 },
  emoji: { fontSize: 24, marginRight: 10 },
  headerText: { flex: 1 },
  title: { fontSize: 15, fontWeight: "700", color: COLORS.primary },
  subtitle: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },
  closeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  closeText: { fontSize: 14, color: COLORS.secondary, fontWeight: "600" },
  loadingContainer: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: { fontSize: 12, color: COLORS.secondary, marginTop: 8 },
  actionsContainer: { padding: 12, paddingTop: 16, gap: 10 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  whatsappCircle: { backgroundColor: "#25D36615" },
  emailCircle: { backgroundColor: "#0066CC15" },
  actionIcon: { fontSize: 18 },
  actionText: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
  actionSubtext: { fontSize: 10, color: COLORS.secondary, marginTop: 1 },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
    alignItems: "center",
  },
  footerText: { fontSize: 10, color: COLORS.secondary, fontStyle: "italic" },
});
