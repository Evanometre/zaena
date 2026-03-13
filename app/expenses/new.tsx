// ============================================
// FILE: app/expenses/new.tsx
// ============================================
import { queueOperation } from "@/lib/localDb";
import { computeWHT, getWHTRate } from "@/lib/whtCategories";
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

// Common expense categories
const EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities",
  "Salaries",
  "Transportation",
  "Marketing",
  "Supplies",
  "Insurance",
  "Maintenance",
  "Equipment",
  "Professional Fees",
  "Contract Services",
  "Management Fees",
  "Commission",
  "Technical Fees",
  "Other",
];

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank Transfer" },
  { value: "pos", label: "POS" },
  { value: "mobile", label: "Mobile Money" },
];

export default function NewExpenseScreen() {
  const [locationId, setLocationId] = useState<string | null>(null);
  const router = useRouter();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [whtRate, setWhtRate] = useState(0);
  const [whtAmount, setWhtAmount] = useState(0);
  // Form state
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseType, setExpenseType] = useState<"operating" | "capital">(
    "operating",
  );
  const { organizationId } = useAuthStore();

  const [currency, setCurrency] = useState({
    symbol: "",
    code: "NGN",
    name: "Nigerian Naira",
  });

  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().split("T")[0],
  );

  // Redirect if user doesn't have permission
  useEffect(() => {
    if (!permissionsLoading && !hasPermission("expenses.create")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to create expenses",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ],
      );
    }
  }, [permissionsLoading, hasPermission]);

  useEffect(() => {
    const rate = getWHTRate(category === "Other" ? customCategory : category);
    const gross = parseFloat(amount) || 0;
    setWhtRate(rate);
    setWhtAmount(rate > 0 ? computeWHT(gross, rate) : 0);
  }, [category, customCategory, amount]);

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

  useEffect(() => {
    async function loadLocation() {
      if (!organizationId) return;

      // Try cache first
      const cached = await AsyncStorage.getItem(
        `default_location_${organizationId}`,
      );
      if (cached) setLocationId(cached);

      // Fetch fresh
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("user_location_access")
          .select("location_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (data?.location_id) {
          setLocationId(data.location_id);
          await AsyncStorage.setItem(
            `default_location_${organizationId}`,
            data.location_id,
          );
        }
      } catch {
        // Cache already shown above — silent fail
      }
    }
    loadLocation();
  }, [organizationId]);

  async function handleSubmit() {
    if (!hasPermission("expenses.create")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to create expenses",
      );
      return;
    }

    const finalCategory = category === "Other" ? customCategory : category;
    if (!finalCategory.trim()) {
      Alert.alert("Error", "Please select or enter a category");
      return;
    }
    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }
    if (!locationId) {
      Alert.alert(
        "Error",
        "Could not determine your location. Please check your connection.",
      );
      return;
    }
    if (!organizationId) {
      Alert.alert("Error", "Organization not found.");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get name for audit trail — best effort
      let createdByName: string | null = null;
      try {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        createdByName = profile?.full_name ?? null;
      } catch {}

      await queueOperation({
        module: "expenses",
        operation: "create_expense",
        payload: {
          organizationId,
          locationId,
          userId: user.id,
          category: finalCategory,
          amount: Number(amount),
          expenseType,
          paymentMethod,
          notes: notes.trim() || null,
          occurredAt,
          createdByName,
          whtRate, // ← add
          whtAmount,
        },
      });

      // Optimistically update list cache
      try {
        for (const filter of ["all", expenseType]) {
          const cacheKey = `expenses_${organizationId}_${filter}`;
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            const items = JSON.parse(cached);
            items.unshift({
              id: `pending_${Date.now()}`,
              category: finalCategory,
              amount: Number(amount),
              expense_type: expenseType,
              payment_method: paymentMethod,
              notes: notes.trim() || null,
              occurred_at: occurredAt,
              created_at: new Date().toISOString(),
              locations: { name: "Syncing..." },
            });
            await AsyncStorage.setItem(cacheKey, JSON.stringify(items));
          }
        }
      } catch {}

      Alert.alert(
        "Expense Queued ✓",
        "Your expense has been saved and will sync automatically when online.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err: any) {
      console.error("Error queuing expense:", err);
      Alert.alert("Error", err.message || "Failed to save expense");
    } finally {
      setLoading(false);
    }
  }

  // Show loading while checking permissions
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

  // Don't render if no permission (will redirect in useEffect)
  if (!hasPermission("expenses.create")) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Expense</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        {/* Expense Type */}
        <View style={styles.section}>
          <Text style={styles.label}>Expense Type *</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                expenseType === "operating" && styles.typeButtonActive,
              ]}
              onPress={() => setExpenseType("operating")}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  expenseType === "operating" && styles.typeButtonTextActive,
                ]}
              >
                Operating
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeButton,
                expenseType === "capital" && styles.typeButtonActive,
              ]}
              onPress={() => setExpenseType("capital")}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  expenseType === "capital" && styles.typeButtonTextActive,
                ]}
              >
                Capital
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Category */}
        <View style={styles.section}>
          <Text style={styles.label}>Category *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.categoryRow}>
              {EXPENSE_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    category === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      category === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {category === "Other" && (
            <TextInput
              style={styles.input}
              placeholder="Enter custom category"
              value={customCategory}
              onChangeText={setCustomCategory}
              placeholderTextColor={COLORS.secondary}
            />
          )}
        </View>

        {/* Amount */}
        <View style={styles.section}>
          <Text style={styles.label}>Amount ({currency.symbol}) *</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholderTextColor={COLORS.secondary}
          />
        </View>

        {whtRate > 0 && parseFloat(amount) > 0 && (
          <View style={styles.whtCard}>
            <Text style={styles.whtTitle}>
              ⚖️ Withholding Tax Applies ({whtRate}%)
            </Text>
            <View style={styles.whtRow}>
              <Text style={styles.whtLabel}>Gross Amount:</Text>
              <Text style={styles.whtValue}>
                {currency.symbol}
                {parseFloat(amount).toFixed(2)}
              </Text>
            </View>
            <View style={styles.whtRow}>
              <Text style={styles.whtLabel}>WHT Deducted ({whtRate}%):</Text>
              <Text style={[styles.whtValue, { color: COLORS.danger }]}>
                − {currency.symbol}
                {whtAmount.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.whtRow, styles.whtNetRow]}>
              <Text style={styles.whtNetLabel}>Net Payable to Vendor:</Text>
              <Text style={styles.whtNetValue}>
                {currency.symbol}
                {(parseFloat(amount) - whtAmount).toFixed(2)}
              </Text>
            </View>
            <Text style={styles.whtHint}>
              Deduct WHT when paying — remit the {currency.symbol}
              {whtAmount.toFixed(2)} to FIRS separately.
            </Text>
          </View>
        )}

        {/* Payment Method */}
        <View style={styles.section}>
          <Text style={styles.label}>Payment Method *</Text>
          <View style={styles.methodGrid}>
            {PAYMENT_METHODS.map((method) => (
              <TouchableOpacity
                key={method.value}
                style={[
                  styles.methodButton,
                  paymentMethod === method.value && styles.methodButtonActive,
                ]}
                onPress={() => setPaymentMethod(method.value)}
              >
                <Text
                  style={[
                    styles.methodButtonText,
                    paymentMethod === method.value &&
                      styles.methodButtonTextActive,
                  ]}
                >
                  {method.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Date */}
        <View style={styles.section}>
          <Text style={styles.label}>Date *</Text>
          <TextInput
            style={styles.input}
            value={occurredAt}
            onChangeText={setOccurredAt}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.secondary}
          />
          <Text style={styles.hint}>Format: YYYY-MM-DD</Text>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Notes (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add any additional details..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor={COLORS.secondary}
          />
        </View>

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
            <Text style={styles.submitButtonText}>Record Expense</Text>
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
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  hint: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 4,
  },
  typeRow: {
    flexDirection: "row",
    gap: 12,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
  },
  typeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  whtCard: {
    backgroundColor: "#FFF9E6",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
  },
  whtTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E",
    marginBottom: 10,
  },
  whtRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  whtLabel: { fontSize: 13, color: COLORS.secondary },
  whtValue: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
  whtNetRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#FDE68A",
  },
  whtNetLabel: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  whtNetValue: { fontSize: 16, fontWeight: "bold", color: COLORS.primary },
  whtHint: {
    fontSize: 11,
    color: "#92400E",
    marginTop: 8,
    lineHeight: 16,
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  typeButtonTextActive: {
    color: COLORS.white,
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 8,
  },
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
  categoryChipText: {
    fontSize: 14,
    color: COLORS.secondary,
  },
  categoryChipTextActive: {
    color: COLORS.white,
    fontWeight: "600",
  },
  methodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  methodButton: {
    flex: 1,
    minWidth: "45%",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
  },
  methodButtonActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  methodButtonTextActive: {
    color: COLORS.white,
  },
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
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.white,
  },
});
