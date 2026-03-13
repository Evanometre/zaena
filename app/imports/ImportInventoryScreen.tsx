// app/imports/ImportInventoryScreen.tsx
import { useAuthStore } from "@/stores/authStore";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { usePermissions } from "../../context/PermissionsContext";
import { supabase } from "../../lib/supabase";

// ============================================================
// TYPES
// ============================================================

interface ImportRow {
  product_name?: string;
  sku?: string;
  location_name?: string;
  quantity?: string;
  unit_cost?: string;
  [key: string]: string | undefined;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ImportFailure {
  row: number;
  product: string;
  location: string;
  reason: string;
}

type ImportStatus =
  | "idle"
  | "parsing"
  | "preview"
  | "validation_errors"
  | "resolution_errors"
  | "importing"
  | "success";

// ============================================================
// CSV PARSER
// ============================================================

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: ImportRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim().replace(/^["']|["']$/g, "") || "";
    });
    rows.push(row);
  }
  return rows;
}

// ============================================================
// COLUMNS
// ============================================================

const EXPECTED_COLUMNS = [
  "product_name",
  "sku",
  "location_name",
  "quantity",
  "unit_cost",
];
const REQUIRED_COLUMNS = ["product_name", "location_name", "quantity"];

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ImportInventoryScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();

  const [status, setStatus] = useState<ImportStatus>("idle");
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    failedCount: number;
    failures?: ImportFailure[];
  } | null>(null);
  const { hasPermission, loading: permLoading } = usePermissions();

  // ============================================================
  // PICK FILE
  // ============================================================

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      setFileName(asset.name);
      setStatus("parsing");

      const pickedFile = new File(asset.uri);
      const content = await pickedFile.text();
      const parsed = parseCSV(content);

      if (parsed.length === 0) {
        Alert.alert("Error", "The CSV file appears to be empty or invalid.");
        setStatus("idle");
        return;
      }

      const presentColumns = Object.keys(parsed[0]);
      const missing = REQUIRED_COLUMNS.filter(
        (col) => !presentColumns.includes(col),
      );
      if (missing.length > 0) {
        Alert.alert(
          "Missing Required Columns",
          `Your CSV is missing: ${missing.join(", ")}\n\nPlease download the template and try again.`,
        );
        setStatus("idle");
        return;
      }

      setRows(parsed);
      setStatus("preview");
    } catch (error) {
      console.error("File pick error:", error);
      Alert.alert("Error", "Failed to read the file. Please try again.");
      setStatus("idle");
    }
  };

  // ============================================================
  // IMPORT
  // ============================================================

  const handleImport = async () => {
    if (!organizationId) {
      Alert.alert(
        "Error",
        "Organization ID missing. Please log out and back in.",
      );
      return;
    }

    setStatus("importing");

    try {
      const { data, error } = await supabase.functions.invoke(
        "import-inventory",
        {
          body: { rows, organizationId },
        },
      );

      if (error) throw error;
      if (!data) throw new Error("No response from import function");

      console.log("Import response:", data);

      if (
        data.status === "validation_errors" ||
        data.status === "resolution_errors"
      ) {
        setErrors(data.errors);
        setStatus(
          data.status === "resolution_errors"
            ? "resolution_errors"
            : "validation_errors",
        );
        return;
      }

      if (data.status === "success") {
        setImportResult({
          importedCount: data.importedCount,
          failedCount: data.failedCount,
          failures: data.failures,
        });
        setStatus("success");
        return;
      }

      throw new Error(`Unexpected status: ${data.status}`);
    } catch (error: any) {
      console.error("Import error:", error);
      Alert.alert(
        "Import Failed",
        error.message || "An unexpected error occurred.",
      );
      setStatus("preview");
    }
  };

  // ============================================================
  // TEMPLATE DOWNLOAD
  // ============================================================

  const handleDownloadTemplate = async () => {
    try {
      const header = EXPECTED_COLUMNS.join(",");
      const example =
        "Widget A,WGT-001,Main Store,50,10.00\n" +
        "Widget B,WGT-002,Main Store,30,8.50\n" +
        "Coffee Mug,,Warehouse,100,3.00";
      const content = `${header}\n${example}`;
      const templateFile = new File(
        Paths.document,
        "inventory_import_template.csv",
      );
      templateFile.write(content);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(templateFile.uri, {
          mimeType: "text/csv",
          dialogTitle: "Save Template",
        });
      }
    } catch (error) {
      console.error("Template download error:", error);
      Alert.alert("Error", "Failed to generate template.");
    }
  };

  // ============================================================
  // RENDER: Idle
  // ============================================================

  const renderIdle = () => (
    <View style={styles.centerContent}>
      <View style={styles.uploadBox}>
        <Text style={styles.uploadIcon}>📦</Text>
        <Text style={styles.uploadTitle}>Import Inventory</Text>
        <Text style={styles.uploadSubtitle}>
          Set opening stock levels by uploading a CSV. Product and location
          names must exactly match what&apos;s already in your system.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handlePickFile}>
          <Text style={styles.primaryButtonText}>Choose CSV File</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.templateButton}
          onPress={handleDownloadTemplate}
        >
          <Text style={styles.templateButtonText}>📄 Download Template</Text>
        </TouchableOpacity>
      </View>

      {/* Warning box */}
      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>⚠️ Important</Text>
        <Text style={styles.warningText}>
          • Import your products first before importing inventory.{"\n"}•
          Product and location names must match exactly (case-insensitive).
          {"\n"}• If stock already exists, quantities will be added to existing
          stock using weighted average cost.{"\n"}• Use SKU column to avoid name
          ambiguity.
        </Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Expected Columns</Text>
        {EXPECTED_COLUMNS.map((col) => (
          <View key={col} style={styles.infoRow}>
            <Text style={styles.infoRequired}>
              {REQUIRED_COLUMNS.includes(col) ? "✱" : " "}
            </Text>
            <Text style={styles.infoCol}>{col}</Text>
            {REQUIRED_COLUMNS.includes(col) && (
              <Text style={styles.infoTag}>required</Text>
            )}
          </View>
        ))}
        <Text style={styles.infoNote}>✱ Required fields</Text>
      </View>
    </View>
  );

  // ============================================================
  // RENDER: Preview
  // ============================================================

  const renderPreview = () => {
    const previewRows = rows.slice(0, 5);
    const remaining = rows.length - 5;

    return (
      <ScrollView style={styles.container}>
        <View style={styles.previewHeader}>
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>
              {rows.length} rows found
            </Text>
          </View>
          <Text style={styles.previewFileName}>📄 {fileName}</Text>
        </View>

        <Text style={styles.sectionTitle}>Preview (first 5 rows)</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={styles.tableRow}>
              {EXPECTED_COLUMNS.map((col) => (
                <Text key={col} style={styles.tableHeader}>
                  {col}
                </Text>
              ))}
            </View>
            {previewRows.map((row, i) => (
              <View
                key={i}
                style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}
              >
                {EXPECTED_COLUMNS.map((col) => (
                  <Text key={col} style={styles.tableCell}>
                    {row[col] || "—"}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>

        {remaining > 0 && (
          <Text style={styles.remainingText}>
            + {remaining} more rows not shown
          </Text>
        )}

        <View style={styles.infoCallout}>
          <Text style={styles.infoCalloutText}>
            📋 Product and location names will be matched against your existing
            records. Any that don&apos;t match will be shown as errors before
            any data is saved.
          </Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, { flex: 1 }]}
            onPress={() => setStatus("idle")}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, { flex: 1 }]}
            onPress={handleImport}
          >
            <Text style={styles.primaryButtonText}>
              Import {rows.length} Rows
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ============================================================
  // RENDER: Errors (validation or resolution)
  // ============================================================

  const renderErrors = (isResolution: boolean) => (
    <ScrollView style={styles.container}>
      <View style={styles.errorHeader}>
        <Text style={styles.errorIcon}>{isResolution ? "🔍" : "⚠️"}</Text>
        <Text style={styles.errorTitle}>
          {isResolution ? "Products/Locations Not Found" : "Fix These Errors"}
        </Text>
        <Text style={styles.errorSubtitle}>
          {isResolution
            ? "These names don't match any records in your system. Fix the CSV and try again."
            : `${errors.length} error${errors.length > 1 ? "s" : ""} found. Fix your CSV and try again.`}
        </Text>
      </View>
      {errors.map((err, i) => (
        <View key={i} style={styles.errorCard}>
          <View style={styles.errorCardRow}>
            <Text style={styles.errorRowBadge}>Row {err.row}</Text>
            <Text style={styles.errorFieldBadge}>{err.field}</Text>
          </View>
          <Text style={styles.errorMessage}>{err.message}</Text>
        </View>
      ))}
      <TouchableOpacity
        style={[styles.primaryButton, { marginTop: 24 }]}
        onPress={() => setStatus("idle")}
      >
        <Text style={styles.primaryButtonText}>Upload Fixed File</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ============================================================
  // RENDER: Importing
  // ============================================================

  const renderImporting = () => (
    <View style={styles.centerContent}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.importingText}>
        Importing {rows.length} inventory rows...
      </Text>
      <Text style={styles.importingSubtext}>
        Please don&apos;t close the app
      </Text>
    </View>
  );

  // ============================================================
  // RENDER: Success
  // ============================================================

  const renderSuccess = () => (
    <ScrollView style={styles.container}>
      <View style={styles.successBox}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.successTitle}>Import Complete!</Text>
        <View style={styles.statsRow}>
          {importResult!.importedCount > 0 && (
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {importResult!.importedCount}
              </Text>
              <Text style={styles.statLabel}>Imported</Text>
            </View>
          )}
          {importResult!.failedCount > 0 && (
            <View style={[styles.statCard, styles.statCardRed]}>
              <Text style={styles.statNumber}>{importResult!.failedCount}</Text>
              <Text style={styles.statLabel}>Failed</Text>
            </View>
          )}
        </View>

        {/* Show partial failures if any */}
        {importResult!.failures && importResult!.failures.length > 0 && (
          <View style={styles.failuresBox}>
            <Text style={styles.failuresTitle}>Failed Rows</Text>
            {importResult!.failures.map((f, i) => (
              <View key={i} style={styles.failureCard}>
                <Text style={styles.failureProduct}>
                  {f.product} @ {f.location}
                </Text>
                <Text style={styles.failureReason}>
                  Row {f.row}: {f.reason}
                </Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, { marginTop: 16 }]}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryButtonText}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, { marginTop: 12 }]}
          onPress={() => {
            setStatus("idle");
            setRows([]);
            setFileName("");
            setImportResult(null);
          }}
        >
          <Text style={styles.secondaryButtonText}>Import Another File</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ============================================================
  // MAIN RENDER
  // ============================================================
  if (permLoading) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import Inventory</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  if (!hasPermission("inventory.adjust")) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import Inventory</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centerContent}>
          <View style={styles.uploadBox}>
            <Text style={styles.uploadIcon}>🔐</Text>
            <Text style={styles.uploadTitle}>Access Restricted</Text>
            <Text style={styles.uploadSubtitle}>
              You don&apos;t have permission to import inventory.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import Inventory</Text>
        <View style={{ width: 60 }} />
      </View>

      {(status === "idle" || status === "parsing") && renderIdle()}
      {status === "preview" && renderPreview()}
      {status === "validation_errors" && renderErrors(false)}
      {status === "resolution_errors" && renderErrors(true)}
      {status === "importing" && renderImporting()}
      {status === "success" && renderSuccess()}

      {status === "parsing" && (
        <View style={styles.parsingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.importingText}>Reading file...</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  backButton: { width: 60 },
  backButtonText: { fontSize: 17, color: "#007AFF" },
  headerTitle: { fontSize: 17, fontWeight: "600", color: "#1C1C1E" },
  container: { flex: 1, padding: 16 },
  centerContent: { flex: 1, padding: 16 },
  uploadBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  uploadIcon: { fontSize: 48, marginBottom: 12 },
  uploadTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  uploadSubtitle: {
    fontSize: 14,
    color: "#6C6C70",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  warningBox: {
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E",
    marginBottom: 8,
  },
  warningText: { fontSize: 13, color: "#78350F", lineHeight: 20 },
  infoBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  infoRequired: { width: 16, fontSize: 12, color: "#FF3B30" },
  infoCol: { flex: 1, fontSize: 14, color: "#1C1C1E", fontFamily: "monospace" },
  infoTag: {
    fontSize: 11,
    color: "#FF3B30",
    backgroundColor: "#FFF0F0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  infoNote: { fontSize: 12, color: "#8E8E93", marginTop: 8 },
  primaryButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
    marginBottom: 8,
  },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButton: {
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
  },
  secondaryButtonText: { color: "#1C1C1E", fontSize: 16, fontWeight: "600" },
  templateButton: { paddingVertical: 10, alignItems: "center" },
  templateButtonText: { color: "#007AFF", fontSize: 14 },
  buttonRow: { flexDirection: "row", gap: 12, marginTop: 24, marginBottom: 40 },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  previewBadge: {
    backgroundColor: "#E8F4FF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewBadgeText: { fontSize: 13, color: "#007AFF", fontWeight: "600" },
  previewFileName: { fontSize: 13, color: "#6C6C70", flex: 1 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  tableRowAlt: { backgroundColor: "#F9F9F9" },
  tableHeader: {
    width: 130,
    padding: 10,
    fontSize: 12,
    fontWeight: "700",
    color: "#8E8E93",
    textTransform: "uppercase",
    backgroundColor: "#F2F2F7",
  },
  tableCell: { width: 130, padding: 10, fontSize: 13, color: "#1C1C1E" },
  remainingText: {
    fontSize: 13,
    color: "#8E8E93",
    textAlign: "center",
    marginVertical: 12,
  },
  infoCallout: {
    backgroundColor: "#E8F4FF",
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  infoCalloutText: { fontSize: 13, color: "#0055AA", lineHeight: 20 },
  errorHeader: { alignItems: "center", marginBottom: 24, paddingTop: 8 },
  errorIcon: { fontSize: 40, marginBottom: 8 },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  errorSubtitle: {
    fontSize: 14,
    color: "#6C6C70",
    textAlign: "center",
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#FF3B30",
  },
  errorCardRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  errorRowBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FF3B30",
    backgroundColor: "#FFF0F0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  errorFieldBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6C6C70",
    backgroundColor: "#F2F2F7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontFamily: "monospace",
  },
  errorMessage: { fontSize: 14, color: "#1C1C1E" },
  importingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    marginTop: 16,
    textAlign: "center",
  },
  importingSubtext: {
    fontSize: 13,
    color: "#8E8E93",
    marginTop: 4,
    textAlign: "center",
  },
  successBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 40,
  },
  successIcon: { fontSize: 56, marginBottom: 12 },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 20,
  },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 24, width: "100%" },
  statCard: {
    flex: 1,
    backgroundColor: "#E8F8EF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  statCardRed: { backgroundColor: "#FFF0F0" },
  statNumber: { fontSize: 28, fontWeight: "700", color: "#1C1C1E" },
  statLabel: { fontSize: 12, color: "#6C6C70", marginTop: 2 },
  failuresBox: {
    width: "100%",
    backgroundColor: "#FFF8F0",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  failuresTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400E",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  failureCard: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
  },
  failureProduct: { fontSize: 13, fontWeight: "600", color: "#1C1C1E" },
  failureReason: { fontSize: 12, color: "#92400E", marginTop: 2 },
  parsingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
});
