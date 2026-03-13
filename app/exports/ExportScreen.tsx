// app/exports/ExportScreen.tsx
import { useAuthStore } from "@/stores/authStore";
import DateTimePicker from "@react-native-community/datetimepicker";
import { File, Paths } from "expo-file-system";
import { useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import { EXPORT_TEMPLATES, ExportTemplate } from "../../lib/exportTemplates";
import { supabase } from "../../lib/supabase";

interface ExportScreenProps {
  organizationId?: string;
  onClose?: () => void;
}

// Map each template category to the permission required to see it
const TEMPLATE_PERMISSIONS: Record<string, string> = {
  Sales: "sales.detail.read",
  Inventory: "inventory.levels.read",
  Purchases: "purchases.detail.read",
  Customers: "customers.summary.read",
  Suppliers: "suppliers.summary.read",
  Finance: "payments.history.read",
  Expenses: "expenses.export",
  Tax: "tax.summary.read",
};

export default function ExportScreen({
  organizationId: orgIdProp,
  onClose,
}: ExportScreenProps) {
  const { organizationId: authOrgId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();
  const params = useLocalSearchParams();

  // Single source of truth for org ID
  const organizationId =
    orgIdProp ||
    (typeof params.organizationId === "string" && params.organizationId.trim()
      ? params.organizationId
      : authOrgId);

  const [step, setStep] = useState<"template" | "filters" | "columns">(
    "template",
  );
  const [selectedTemplate, setSelectedTemplate] =
    useState<ExportTemplate | null>(null);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  //Data States
  const [locations, setLocations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Modal and DatePicker States
  const [activeModalFilter, setActiveModalFilter] = useState<any | null>(null);
  const [datePickerConfig, setDatePickerConfig] = useState<{
    filterId: string;
    field: "start" | "end";
    date: Date;
  } | null>(null);

  useEffect(() => {
    if (selectedTemplate) {
      loadFilterData();
      const defaultCols = selectedTemplate.availableColumns
        .filter((col) => col.defaultSelected)
        .map((col) => col.id);
      setSelectedColumns(defaultCols);
      setFilters({});
    }
  }, [selectedTemplate]);

  const loadFilterData = async () => {
    if (!organizationId) return;
    try {
      const { data: locData } = await supabase
        .from("locations")
        .select("id, name")
        .eq("organization_id", organizationId);

      setLocations(locData || []);

      if (selectedTemplate?.filters.some((f) => f.dataSource === "customers")) {
        const { data: custData } = await supabase
          .from("customers")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .limit(100);
        setCustomers(custData || []);
      }

      if (selectedTemplate?.filters.some((f) => f.dataSource === "suppliers")) {
        const { data: suppData } = await supabase
          .from("suppliers")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .limit(100);
        setSuppliers(suppData || []);
      }

      if (selectedTemplate?.filters.some((f) => f.dataSource === "products")) {
        const { data: prodData } = await supabase
          .from("products")
          .select("id, name, sku")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .limit(100);
        setProducts(prodData || []);
      }
    } catch (error) {
      console.error("Error loading filter data:", error);
    }
  };

  const handleExport = async () => {
    if (!selectedTemplate) return;

    if (!organizationId) {
      Alert.alert("Error", "Organization ID is missing. Please try again.");
      return;
    }

    setIsExporting(true);
    try {
      const requestBody = {
        templateId: selectedTemplate.id,
        organizationId,
        filters,
        columns: selectedColumns,
        format: "csv",
      };

      const { data, error } = await supabase.functions.invoke("export-data", {
        body: requestBody,
      });

      if (error) throw error;
      if (!data?.downloadUrl) throw new Error("No download URL returned");

      if (Platform.OS === "web") {
        window.open(data.downloadUrl, "_blank");
      } else {
        const downloadedFile = await File.downloadFileAsync(
          data.downloadUrl,
          Paths.document,
        );
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadedFile.uri, {
            mimeType: "text/csv",
            dialogTitle: "Export CSV",
            UTI: "public.comma-separated-values-text",
          });
        } else {
          Alert.alert("Success", `File saved to: ${downloadedFile.uri}`);
        }
      }

      Alert.alert(
        "Success",
        `Export completed! ${data.rowCount} rows exported.`,
      );
      if (onClose) onClose();
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Error", "Failed to export data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // ── Helpers for UI ─────────────────────────
  const getDataSourceOptions = (dataSource: string) => {
    let sourceData: any[] = [];
    switch (dataSource) {
      case "locations":
        sourceData = locations;
        break;
      case "customers":
        sourceData = customers;
        break;
      case "suppliers":
        sourceData = suppliers;
        break;
      case "products":
        sourceData = products;
        break;
    }
    // Map remote data to value/label format
    return sourceData.map((item) => ({ value: item.id, label: item.name }));
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (!datePickerConfig) return;
    const { filterId, field } = datePickerConfig;

    // Close picker on Android after selection
    if (Platform.OS === "android") {
      setDatePickerConfig(null);
    }

    if (selectedDate) {
      const currentDates = filters[filterId] || {};
      setFilters({
        ...filters,
        [filterId]: { ...currentDates, [field]: selectedDate.toISOString() },
      });
    }
  };

  // ── Permission loading state ───────────────
  if (permLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // ── No export permissions at all ──────────
  const hasAnyExportPermission = Object.values(TEMPLATE_PERMISSIONS).some(
    (perm) => hasPermission(perm),
  );

  if (!hasAnyExportPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.restrictedIcon}>🔐</Text>
        <Text style={styles.restrictedTitle}>Access Restricted</Text>
        <Text style={styles.restrictedSubtitle}>
          You don&apos;t have permission to export any data.
        </Text>
      </View>
    );
  }

  // ============================================================
  // STEP 1: Template Selection — filter by permission
  // ============================================================
  const renderTemplateSelection = () => {
    const visibleTemplates = EXPORT_TEMPLATES.filter((t) => {
      const requiredPerm = TEMPLATE_PERMISSIONS[t.category];
      if (!requiredPerm) return true; // no permission required
      return hasPermission(requiredPerm);
    });

    const categories = Array.from(
      new Set(visibleTemplates.map((t) => t.category)),
    );

    return (
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Select Export Template</Text>
        {categories.map((category) => (
          <View key={category} style={styles.categorySection}>
            <Text style={styles.categoryTitle}>{category.toUpperCase()}</Text>
            {visibleTemplates
              .filter((t) => t.category === category)
              .map((template) => (
                <TouchableOpacity
                  key={template.id}
                  style={styles.templateCard}
                  onPress={() => {
                    setSelectedTemplate(template);
                    setStep("filters");
                  }}
                >
                  <Text style={styles.templateName}>{template.name}</Text>
                  <Text style={styles.templateDescription}>
                    {template.description}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>
        ))}
      </ScrollView>
    );
  };

  // ============================================================
  // STEP 2: Filters
  // ============================================================
  const renderFilters = () => {
    if (!selectedTemplate) return null;
    return (
      <ScrollView style={styles.container}>
        <Text style={styles.title}>{selectedTemplate.name}</Text>
        <Text style={styles.subtitle}>Set Filters</Text>
        {selectedTemplate.filters.map((filter) => {
          const currentFilterValues = filters[filter.id] || [];

          return (
            <View key={filter.id} style={styles.filterSection}>
              <Text style={styles.filterLabel}>
                {filter.label}{" "}
                {filter.required && <Text style={styles.required}>*</Text>}
              </Text>
              {/* DATE RANGE PICKER */}
              {filter.type === "dateRange" && (
                <View style={styles.dateRangeContainer}>
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() =>
                      setDatePickerConfig({
                        filterId: filter.id,
                        field: "start",
                        date: filters[filter.id]?.start
                          ? new Date(filters[filter.id].start)
                          : new Date(),
                      })
                    }
                  >
                    <Text style={styles.dateButtonText}>
                      Start:{" "}
                      {filters[filter.id]?.start
                        ? new Date(
                            filters[filter.id].start,
                          ).toLocaleDateString()
                        : "Select Date"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() =>
                      setDatePickerConfig({
                        filterId: filter.id,
                        field: "end",
                        date: filters[filter.id]?.end
                          ? new Date(filters[filter.id].end)
                          : new Date(),
                      })
                    }
                  >
                    <Text style={styles.dateButtonText}>
                      End:{" "}
                      {filters[filter.id]?.end
                        ? new Date(filters[filter.id].end).toLocaleDateString()
                        : "Select Date"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* MULTI-SELECT WITH REMOTE DATA */}
              {filter.type === "multiSelect" && filter.dataSource && (
                <View>
                  <TouchableOpacity
                    style={styles.modalTriggerButton}
                    onPress={() => setActiveModalFilter(filter)}
                  >
                    <Text style={styles.modalTriggerText}>
                      {currentFilterValues.length > 0
                        ? `${currentFilterValues.length} ${filter.label} selected`
                        : `Select ${filter.label}...`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* MULTI-SELECT WITH STATIC OPTIONS */}
              {filter.type === "multiSelect" && filter.options && (
                <View>
                  {filter.options.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={styles.checkbox}
                      onPress={() => {
                        const updated = currentFilterValues.includes(
                          option.value,
                        )
                          ? currentFilterValues.filter(
                              (v: string) => v !== option.value,
                            )
                          : [...currentFilterValues, option.value];
                        setFilters({ ...filters, [filter.id]: updated });
                      }}
                    >
                      <Text style={styles.checkboxText}>
                        {currentFilterValues.includes(option.value) ? "☑" : "☐"}{" "}
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={() => setStep("template")}
          >
            <Text style={styles.buttonTextSecondary}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={() => setStep("columns")}
          >
            <Text style={styles.buttonText}>Next: Select Columns</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ============================================================
  // STEP 3: Column Selection — unchanged
  // ============================================================
  const renderColumnSelection = () => {
    if (!selectedTemplate) return null;

    const toggleColumn = (columnId: string) => {
      setSelectedColumns((prev) =>
        prev.includes(columnId)
          ? prev.filter((c) => c !== columnId)
          : [...prev, columnId],
      );
    };

    const toggleAll = () => {
      if (selectedColumns.length === selectedTemplate.availableColumns.length) {
        setSelectedColumns([]);
      } else {
        setSelectedColumns(selectedTemplate.availableColumns.map((c) => c.id));
      }
    };

    return (
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Select Columns to Export</Text>
        <Text style={styles.subtitle}>
          {selectedColumns.length} of {selectedTemplate.availableColumns.length}{" "}
          selected
        </Text>
        <TouchableOpacity style={styles.toggleAllButton} onPress={toggleAll}>
          <Text style={styles.buttonText}>
            {selectedColumns.length === selectedTemplate.availableColumns.length
              ? "Deselect All"
              : "Select All"}
          </Text>
        </TouchableOpacity>
        {selectedTemplate.availableColumns.map((column) => (
          <TouchableOpacity
            key={column.id}
            style={styles.columnCheckbox}
            onPress={() => toggleColumn(column.id)}
          >
            <Text style={styles.checkboxText}>
              {selectedColumns.includes(column.id) ? "☑" : "☐"} {column.label}
            </Text>
            {column.description && (
              <Text style={styles.columnDescription}>{column.description}</Text>
            )}
          </TouchableOpacity>
        ))}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={() => setStep("filters")}
          >
            <Text style={styles.buttonTextSecondary}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.buttonPrimary,
              selectedColumns.length === 0 && styles.buttonDisabled,
            ]}
            onPress={handleExport}
            disabled={selectedColumns.length === 0 || isExporting}
          >
            {isExporting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Export CSV</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.screen}>
      {step === "template" && renderTemplateSelection()}
      {step === "filters" && renderFilters()}
      {step === "columns" && renderColumnSelection()}

      {/* RENDER DATE PICKER OVERLAY */}
      {datePickerConfig && (
        <DateTimePicker
          value={datePickerConfig.date}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={handleDateChange}
        />
      )}
      {/* iOS needs a close button if using inline picker */}
      {datePickerConfig && Platform.OS === "ios" && (
        <TouchableOpacity
          style={styles.iosDateDoneButton}
          onPress={() => setDatePickerConfig(null)}
        >
          <Text style={styles.iosDateDoneText}>Done</Text>
        </TouchableOpacity>
      )}

      {/* RENDER MULTI-SELECT MODAL */}
      <Modal
        visible={!!activeModalFilter}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setActiveModalFilter(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Select {activeModalFilter?.label}
            </Text>

            <FlatList
              data={
                activeModalFilter
                  ? getDataSourceOptions(activeModalFilter.dataSource)
                  : []
              }
              keyExtractor={(item) => item.value.toString()}
              renderItem={({ item }) => {
                const isSelected = (
                  filters[activeModalFilter?.id] || []
                ).includes(item.value);
                return (
                  <TouchableOpacity
                    style={styles.modalOption}
                    onPress={() => {
                      const current = filters[activeModalFilter?.id] || [];
                      const updated = isSelected
                        ? current.filter((v: string) => v !== item.value)
                        : [...current, item.value];
                      setFilters({
                        ...filters,
                        [activeModalFilter?.id]: updated,
                      });
                    }}
                  >
                    <Text style={styles.checkboxText}>
                      {isSelected ? "☑" : "☐"} {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.helperText}>No options available.</Text>
              }
            />

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setActiveModalFilter(null)}
            >
              <Text style={styles.buttonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, padding: 16 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  restrictedIcon: { fontSize: 40 },
  restrictedTitle: { fontSize: 17, fontWeight: "600", color: COLORS.primary },
  restrictedSubtitle: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
    lineHeight: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    color: COLORS.primary,
  },
  subtitle: { fontSize: 16, color: COLORS.secondary, marginBottom: 16 },

  categorySection: { marginBottom: 24 },
  categoryTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.gray[500],
    marginBottom: 8,
    letterSpacing: 1,
  },

  templateCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  templateName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  templateDescription: { fontSize: 14, color: COLORS.secondary },

  filterSection: { marginBottom: 20 },
  filterLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
  },
  required: { color: COLORS.danger },
  helperText: {
    fontSize: 14,
    color: COLORS.gray[500],
    fontStyle: "italic",
    textAlign: "center",
    padding: 20,
  },

  // Date Picker Styles
  dateRangeContainer: { flexDirection: "row", gap: 12 },
  dateButton: {
    flex: 1,
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  dateButtonText: { fontSize: 14, color: COLORS.primary },
  iosDateDoneButton: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  iosDateDoneText: { color: COLORS.white, fontWeight: "bold" },

  // Checkbox / Multi-select Styles
  checkbox: {
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  columnCheckbox: {
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  checkboxText: { fontSize: 14, color: COLORS.primary },
  columnDescription: { fontSize: 12, color: COLORS.secondary, marginTop: 4 },

  modalTriggerButton: {
    padding: 14,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTriggerText: { fontSize: 14, color: COLORS.primary },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 16,
  },
  modalOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalCloseButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },

  toggleAllButton: {
    backgroundColor: COLORS.gray[700],
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },

  // Bottom Buttons
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    gap: 12,
    marginBottom: 40,
  },
  buttonPrimary: {
    flex: 1,
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: COLORS.gray[200],
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: COLORS.gray[400] },
  buttonText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
  buttonTextSecondary: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "600",
  },
});
