// app/imports/ImportCustomersScreen.tsx
import { useAuthStore } from "@/stores/authStore";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  [key: string]: string | undefined;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface DuplicateCustomer {
  row: number;
  phone: string;
  existing_name: string;
  incoming_name: string;
}

type ImportStatus =
  | "idle"
  | "parsing"
  | "preview"
  | "validation_errors"
  | "duplicates_found"
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

const EXPECTED_COLUMNS = ["name", "phone", "email", "address", "notes"];
const REQUIRED_COLUMNS = ["name"];

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ImportCustomersScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();

  const [status, setStatus] = useState<ImportStatus>("idle");
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    [],
  );
  const { hasPermission, loading: permLoading } = usePermissions();
  const [duplicates, setDuplicates] = useState<DuplicateCustomer[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [importResult, setImportResult] = useState<{
    insertedCount: number;
    updatedCount: number;
    skippedCount: number;
  } | null>(null);

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

  const handleImport = async (duplicateStrategy?: "skip" | "overwrite") => {
    if (!organizationId) {
      Alert.alert(
        "Error",
        "Organization ID missing. Please log out and back in.",
      );
      return;
    }

    setShowDuplicateModal(false);
    setStatus("importing");

    try {
      const { data, error } = await supabase.functions.invoke(
        "import-customers",
        {
          body: {
            rows,
            organizationId,
            duplicateStrategy: duplicateStrategy || null,
          },
        },
      );

      if (error) throw error;
      if (!data) throw new Error("No response from import function");

      console.log("Import response:", data);

      if (data.status === "validation_errors") {
        setValidationErrors(data.errors);
        setStatus("validation_errors");
        return;
      }

      if (data.status === "duplicates_found") {
        setDuplicates(data.duplicates);
        setStatus("duplicates_found");
        setShowDuplicateModal(true);
        return;
      }

      if (data.status === "success") {
        setImportResult({
          insertedCount: data.insertedCount,
          updatedCount: data.updatedCount,
          skippedCount: data.skippedCount,
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
        "John Smith,+1234567890,john@example.com,123 Main St,VIP customer\n" +
        "Jane Doe,+0987654321,jane@example.com,,\n" +
        "Walk-in Customer,,,,";
      const content = `${header}\n${example}`;
      const templateFile = new File(
        Paths.document,
        "customers_import_template.csv",
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
        <Text style={styles.uploadIcon}>👥</Text>
        <Text style={styles.uploadTitle}>Import Customers</Text>
        <Text style={styles.uploadSubtitle}>
          Upload a CSV file to bulk import customers into your records.
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

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, { flex: 1 }]}
            onPress={() => setStatus("idle")}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, { flex: 1 }]}
            onPress={() => handleImport()}
          >
            <Text style={styles.primaryButtonText}>
              Import {rows.length} Customers
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ============================================================
  // RENDER: Validation Errors
  // ============================================================

  const renderValidationErrors = () => (
    <ScrollView style={styles.container}>
      <View style={styles.errorHeader}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Fix These Errors</Text>
        <Text style={styles.errorSubtitle}>
          {validationErrors.length} error
          {validationErrors.length > 1 ? "s" : ""} found. Fix your CSV and try
          again.
        </Text>
      </View>
      {validationErrors.map((err, i) => (
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
        Importing {rows.length} customers...
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
    <View style={styles.centerContent}>
      <View style={styles.successBox}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.successTitle}>Import Complete!</Text>
        <View style={styles.statsRow}>
          {importResult!.insertedCount > 0 && (
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {importResult!.insertedCount}
              </Text>
              <Text style={styles.statLabel}>Added</Text>
            </View>
          )}
          {importResult!.updatedCount > 0 && (
            <View style={[styles.statCard, styles.statCardBlue]}>
              <Text style={styles.statNumber}>
                {importResult!.updatedCount}
              </Text>
              <Text style={styles.statLabel}>Updated</Text>
            </View>
          )}
          {importResult!.skippedCount > 0 && (
            <View style={[styles.statCard, styles.statCardGray]}>
              <Text style={styles.statNumber}>
                {importResult!.skippedCount}
              </Text>
              <Text style={styles.statLabel}>Skipped</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.primaryButton}
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
    </View>
  );

  // ============================================================
  // RENDER: Duplicate Modal
  // ============================================================

  const renderDuplicateModal = () => (
    <Modal
      visible={showDuplicateModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowDuplicateModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Duplicates Found</Text>
          <Text style={styles.modalSubtitle}>
            {duplicates.length} customer{duplicates.length > 1 ? "s" : ""}{" "}
            already exist. What would you like to do?
          </Text>
          <ScrollView style={styles.duplicateList}>
            {duplicates.slice(0, 10).map((dup, i) => (
              <View key={i} style={styles.duplicateCard}>
                <Text style={styles.duplicatePhone}>📞 {dup.phone}</Text>
                <Text style={styles.duplicateNames}>
                  Existing: {dup.existing_name}
                </Text>
                <Text style={styles.duplicateNames}>
                  Incoming: {dup.incoming_name}
                </Text>
              </View>
            ))}
            {duplicates.length > 10 && (
              <Text style={styles.remainingText}>
                + {duplicates.length - 10} more duplicates
              </Text>
            )}
          </ScrollView>
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: 16 }]}
            onPress={() => handleImport("skip")}
          >
            <Text style={styles.primaryButtonText}>
              Skip Duplicates ({duplicates.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dangerButton, { marginTop: 12 }]}
            onPress={() =>
              Alert.alert(
                "Overwrite Duplicates?",
                `This will update ${duplicates.length} existing customer${duplicates.length > 1 ? "s" : ""} with new data. This cannot be undone.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Overwrite",
                    style: "destructive",
                    onPress: () => handleImport("overwrite"),
                  },
                ],
              )
            }
          >
            <Text style={styles.dangerButtonText}>
              Overwrite Duplicates ({duplicates.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { marginTop: 12 }]}
            onPress={() => {
              setShowDuplicateModal(false);
              setStatus("preview");
            }}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
          <Text style={styles.headerTitle}>Import Customers</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  if (!hasPermission("customers.create")) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import Customers</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centerContent}>
          <View style={styles.uploadBox}>
            <Text style={styles.uploadIcon}>🔐</Text>
            <Text style={styles.uploadTitle}>Access Restricted</Text>
            <Text style={styles.uploadSubtitle}>
              You don&apos;t have permission to import customers.
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
        <Text style={styles.headerTitle}>Import Customers</Text>
        <View style={{ width: 60 }} />
      </View>

      {(status === "idle" || status === "parsing") && renderIdle()}
      {status === "preview" && renderPreview()}
      {status === "validation_errors" && renderValidationErrors()}
      {status === "importing" && renderImporting()}
      {status === "success" && renderSuccess()}

      {renderDuplicateModal()}

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
  centerContent: { flex: 1, padding: 16, justifyContent: "center" },
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
  infoBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
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
  dangerButton: {
    backgroundColor: "#FFF0F0",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  dangerButtonText: { color: "#FF3B30", fontSize: 16, fontWeight: "600" },
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
  errorHeader: { alignItems: "center", marginBottom: 24, paddingTop: 8 },
  errorIcon: { fontSize: 40, marginBottom: 8 },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  errorSubtitle: { fontSize: 14, color: "#6C6C70", textAlign: "center" },
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
  },
  successIcon: { fontSize: 56, marginBottom: 12 },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 20,
  },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: "#E8F8EF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  statCardBlue: { backgroundColor: "#E8F4FF" },
  statCardGray: { backgroundColor: "#F2F2F7" },
  statNumber: { fontSize: 28, fontWeight: "700", color: "#1C1C1E" },
  statLabel: { fontSize: 12, color: "#6C6C70", marginTop: 2 },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#6C6C70",
    marginBottom: 16,
    lineHeight: 20,
  },
  duplicateList: { maxHeight: 200 },
  duplicateCard: {
    backgroundColor: "#F9F9F9",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  duplicatePhone: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 4,
  },
  duplicateNames: { fontSize: 13, color: "#1C1C1E" },
  parsingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
});
