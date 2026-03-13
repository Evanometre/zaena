// ============================================
// FILE: app/finance/allocations/new-rule.tsx
// ============================================
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { usePermissions } from "../../../context/PermissionsContext";
import { COLORS } from "../../../lib/colors";
import supabase from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

// Business name mode: personal finance framing
const BUSINESS_NAME_CATEGORIES = [
  "Owner Salary",
  "Reinvestment",
  "Savings",
  "Emergency Fund",
  "Expansion",
  "Tax Reserve",
  "Other",
];

// Company mode: corporate appropriation framing
const COMPANY_CATEGORIES = [
  "CIT Provision",
  "Retained Earnings",
  "Dividend Reserve",
  "Capital Reserve",
  "Expansion Fund",
  "Director Remuneration Reserve",
  "Other",
];

export default function NewAllocationRuleScreen() {
  const router = useRouter();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [percentage, setPercentage] = useState("");
  // REPLACE WITH:
  const { organizationId } = useAuthStore();
  const businessType = useAuthStore((s) => s.businessType);
  const company = businessType === "registered_company";
  const categories = company ? COMPANY_CATEGORIES : BUSINESS_NAME_CATEGORIES;

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  React.useEffect(() => {
    if (!permissionsLoading && !hasPermission("strategy.manage")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to create allocation rules",
        [{ text: "OK", onPress: () => router.back() }],
      );
    }
  }, [permissionsLoading, hasPermission]);

  useEffect(() => {
    async function loadOrgCurrency() {
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
      } catch (err) {
        console.error("Failed to load org currency:", err);
      }
    }
    loadOrgCurrency();
  }, [organizationId]);

  async function handleSubmit() {
    if (!hasPermission("strategy.manage")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to create allocation rules",
      );
      return;
    }

    const finalCategory =
      categoryName === "Other" ? customCategory : categoryName;

    if (!finalCategory.trim()) {
      Alert.alert("Error", "Please select or enter a category");
      return;
    }

    const percentageNum = parseFloat(percentage);
    if (isNaN(percentageNum) || percentageNum <= 0 || percentageNum > 100) {
      Alert.alert("Error", "Please enter a valid percentage (0–100)");
      return;
    }

    setLoading(true);

    try {
      const { data: existingRules, error: rulesError } = await supabase
        .from("profit_allocation_rules")
        .select("allocation_percentage")
        .eq("organization_id", organizationId)
        .eq("is_active", true);

      if (rulesError) throw rulesError;

      const currentTotal =
        existingRules?.reduce(
          (sum, rule) => sum + rule.allocation_percentage,
          0,
        ) || 0;
      const newTotal = currentTotal + percentageNum;

      if (!organizationId) {
        Alert.alert("Error", "Organization not found");
        return;
      }

      if (newTotal > 100) {
        Alert.alert(
          "Warning",
          `Adding ${percentageNum}% would make the total ${newTotal}% (exceeds 100%).\n\nContinue anyway?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Continue",
              onPress: async () => {
                await createRule(organizationId, finalCategory, percentageNum);
              },
            },
          ],
        );
        setLoading(false);
        return;
      }

      await createRule(organizationId, finalCategory, percentageNum);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to create rule");
      setLoading(false);
    }
  }

  async function createRule(orgId: string, category: string, pct: number) {
    try {
      const { data: maxRule } = await supabase
        .from("profit_allocation_rules")
        .select("sort_order")
        .eq("organization_id", orgId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();

      const nextSortOrder = maxRule ? maxRule.sort_order + 1 : 0;

      const { error } = await supabase.from("profit_allocation_rules").insert({
        organization_id: orgId,
        category_name: category,
        allocation_percentage: pct,
        is_active: true,
        sort_order: nextSortOrder,
      });

      if (error) throw error;

      Alert.alert("Success", "Rule created", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      throw err;
    } finally {
      setLoading(false);
    }
  }

  if (permissionsLoading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!hasPermission("strategy.manage")) return null;

  // ── Mode-aware copy ──────────────────────────────────────────────────────
  const screenTitle = company
    ? "New Appropriation Rule"
    : "New Allocation Rule";
  const infoText = company
    ? "Appropriation rules distribute post-tax profit across corporate categories like retained earnings, CIT provision, and dividend reserves."
    : "Allocation rules distribute net profit after all expenses. Rules only apply when profit > 0.";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{screenTitle}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>💡 {infoText}</Text>
        </View>

        {/* Category */}
        <View style={styles.section}>
          <Text style={styles.label}>Category *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.categoryRow}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    categoryName === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setCategoryName(cat)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      categoryName === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {categoryName === "Other" && (
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              placeholder="Enter custom category"
              value={customCategory}
              onChangeText={setCustomCategory}
              placeholderTextColor={COLORS.secondary}
            />
          )}
        </View>

        {/* Percentage */}
        <View style={styles.section}>
          <Text style={styles.label}>Allocation Percentage (%) *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 30"
            value={percentage}
            onChangeText={setPercentage}
            keyboardType="decimal-pad"
            placeholderTextColor={COLORS.secondary}
          />
          <Text style={styles.hint}>
            {company
              ? "Percentage of post-tax distributable profit for this category"
              : "Percentage of distributable profit to allocate to this category"}
          </Text>
        </View>

        {/* Preview */}
        {percentage && parseFloat(percentage) > 0 && (
          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>Example Calculation</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>
                If {company ? "distributable profit" : "net profit"} is:
              </Text>
              <Text style={styles.previewValue}>{currency.symbol}100,000</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>This category gets:</Text>
              <Text style={[styles.previewValue, { color: COLORS.accent }]}>
                {currency.symbol}
                {((parseFloat(percentage) / 100) * 100000).toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.submitButtonText}>Create Rule</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

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
  cancelButton: { fontSize: 16, color: COLORS.secondary },
  title: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  form: { flex: 1, padding: 16 },
  infoBox: {
    backgroundColor: "#E3F2FD",
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  infoText: { fontSize: 14, color: "#1565C0", lineHeight: 20 },
  section: { marginBottom: 24 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.primary,
  },
  hint: { fontSize: 12, color: COLORS.secondary, marginTop: 4 },
  categoryRow: { flexDirection: "row", gap: 8, paddingBottom: 8 },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  categoryChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  categoryChipText: { fontSize: 14, color: COLORS.secondary },
  categoryChipTextActive: { color: COLORS.white, fontWeight: "600" },
  previewBox: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  previewLabel: { fontSize: 13, color: COLORS.secondary },
  previewValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  footer: {
    padding: 16,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  submitButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 16, fontWeight: "600", color: COLORS.white },
});
