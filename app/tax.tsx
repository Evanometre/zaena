// FILE: app/tax.tsx
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../lib/colors";
import supabase from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";

interface TaxSetting {
  id: string;
  country_code: string;
  tax_type: "vat" | "pit" | "cit";
  rate: number | null;
  config: any;
  is_active: boolean;
}

export default function TaxSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxSettings, setTaxSettings] = useState<TaxSetting[]>([]);
  const [countryCode, setCountryCode] = useState<string>("NG");
  const [currency, setCurrency] = useState({
    symbol: "",
    code: "NGN",
    name: "Nigerian Naira",
  });
  const { user, organizationId } = useAuthStore();
  // VAT editing
  const [editingVAT, setEditingVAT] = useState(false);
  const [vatRate, setVatRate] = useState("7.5");

  useFocusEffect(
    useCallback(() => {
      fetchTaxSettings();
    }, []),
  );

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

  async function fetchTaxSettings() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      // Get organization country
      const { data: org } = await supabase
        .from("organizations")
        .select("country_code")
        .eq("id", profile.organization_id)
        .single();

      if (org) {
        setCountryCode(org.country_code || "NG");
      }

      // Get tax settings
      const { data: settings, error } = await supabase
        .from("tax_settings")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("tax_type");

      if (error) throw error;

      setTaxSettings(settings || []);

      // Set VAT rate for editing
      const vat = settings?.find((s) => s.tax_type === "vat");
      if (vat && vat.rate) {
        setVatRate(vat.rate.toString());
      }
    } catch (err: any) {
      console.error("Error fetching tax settings:", err);
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateVATRate() {
    const newRate = parseFloat(vatRate);
    if (isNaN(newRate) || newRate < 0 || newRate > 100) {
      Alert.alert("Error", "Please enter a valid VAT rate between 0 and 100");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const vatSetting = taxSettings.find((s) => s.tax_type === "vat");

      if (vatSetting) {
        // Update existing
        const { error } = await supabase
          .from("tax_settings")
          .update({ rate: newRate })
          .eq("id", vatSetting.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase.from("tax_settings").insert({
          organization_id: profile.organization_id,
          country_code: countryCode,
          tax_type: "vat",
          rate: newRate,
          is_active: true,
        });

        if (error) throw error;
      }

      Alert.alert("Success", "VAT rate updated successfully");
      setEditingVAT(false);
      fetchTaxSettings();
    } catch (err: any) {
      console.error("Error updating VAT:", err);
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  const vatSetting = taxSettings.find((s) => s.tax_type === "vat");
  const pitSetting = taxSettings.find((s) => s.tax_type === "pit");

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Tax Settings</Text>
          <View style={{ width: 60 }} />
        </View>
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: 40 }}
        />
      </View>
    );
  }

  // If no tax settings and not Nigeria
  if (taxSettings.length === 0 && countryCode !== "NG") {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Tax Settings</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.notSupportedCard}>
            <Text style={styles.notSupportedIcon}>🌍</Text>
            <Text style={styles.notSupportedTitle}>
              Tax Calculations Not Available
            </Text>
            <Text style={styles.notSupportedText}>
              Tax calculations are currently available for Nigerian businesses
              only.
            </Text>
            <Text style={styles.notSupportedSubtext}>
              Your country: {countryCode}
            </Text>
            <Text style={styles.notSupportedSubtext}>
              You can still use all other features: Sales, Inventory, Expenses,
              and Reports.
            </Text>
            <View style={styles.notSupportedFooter}>
              <Text style={styles.notSupportedFooterText}>
                Support for more countries coming soon! 🚀
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Tax Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Country Info */}
        <View style={styles.countryCard}>
          <Text style={styles.countryLabel}>Tax Jurisdiction</Text>
          <Text style={styles.countryValue}>🇳🇬 Nigeria</Text>
        </View>

        {/* VAT Settings */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>📊 Value Added Tax (VAT)</Text>
            {vatSetting?.is_active && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            )}
          </View>

          {editingVAT ? (
            <>
              <View style={styles.editRow}>
                <Text style={styles.label}>VAT Rate (%)</Text>
                <TextInput
                  style={styles.input}
                  value={vatRate}
                  onChangeText={setVatRate}
                  keyboardType="decimal-pad"
                  placeholder="7.5"
                />
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => {
                    setEditingVAT(false);
                    setVatRate(vatSetting?.rate?.toString() || "7.5");
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.saveButton]}
                  onPress={updateVATRate}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={COLORS.white} size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.rateRow}>
                <Text style={styles.rateLabel}>Current Rate:</Text>
                <Text style={styles.rateValue}>{vatSetting?.rate || 7.5}%</Text>
              </View>

              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setEditingVAT(true)}
              >
                <Text style={styles.editButtonText}>Edit Rate</Text>
              </TouchableOpacity>

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  💡 VAT is automatically calculated on all sales based on this
                  rate.
                </Text>
              </View>
            </>
          )}
        </View>

        {/* PIT Settings */}
        {pitSetting && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>👤 Personal Income Tax (PIT)</Text>
              {pitSetting.is_active && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              )}
            </View>

            <Text style={styles.description}>
              Nigerian PIT rates for 2026 tax year (progressive brackets)
            </Text>

            <View style={styles.bracketsContainer}>
              {pitSetting.config?.brackets?.map(
                (bracket: any, index: number) => (
                  <View key={index} style={styles.bracketRow}>
                    <View style={styles.bracketRange}>
                      {bracket.min === 0 && bracket.max === 800000 ? (
                        <Text style={styles.bracketText}>
                          First {currency.symbol}
                          {(800000).toLocaleString()}
                        </Text>
                      ) : bracket.max === null ? (
                        <Text style={styles.bracketText}>
                          Above {currency.symbol}
                          {(bracket.min / 1000).toFixed(0)}k
                        </Text>
                      ) : (
                        <Text style={styles.bracketText}>
                          {currency.symbol}
                          {(bracket.min / 1000).toFixed(0)}k - {currency.symbol}
                          {(bracket.max / 1000).toFixed(0)}k
                        </Text>
                      )}
                    </View>
                    <View style={styles.bracketRate}>
                      <Text
                        style={[
                          styles.bracketRateText,
                          bracket.rate === 0 && styles.taxFree,
                        ]}
                      >
                        {bracket.rate}%
                      </Text>
                      {bracket.rate === 0 && (
                        <Text style={styles.taxFreeLabel}>TAX FREE</Text>
                      )}
                    </View>
                  </View>
                ),
              )}
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 PIT is calculated automatically when processing payroll or
                calculating owner&apos;s profit distribution.
              </Text>
            </View>
          </View>
        )}

        {/* Help Section */}
        <View style={styles.helpCard}>
          <Text style={styles.helpTitle}>📚 About Tax Settings</Text>
          <Text style={styles.helpText}>
            • VAT is charged on sales and collected from customers{"\n"}• PIT is
            deducted from employee salaries and owner&apos;s profit{"\n"}• These
            rates are based on Nigerian tax law{"\n"}• Always consult with a tax
            professional for compliance
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
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
  backButton: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  content: { flex: 1, padding: 16 },

  countryCard: {
    backgroundColor: COLORS.accent + "15",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.accent + "30",
  },
  countryLabel: { fontSize: 13, color: COLORS.secondary, marginBottom: 4 },
  countryValue: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  activeBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadgeText: { fontSize: 11, fontWeight: "600", color: COLORS.white },

  description: {
    fontSize: 14,
    color: COLORS.secondary,
    marginBottom: 16,
  },

  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  rateLabel: { fontSize: 15, color: COLORS.secondary },
  rateValue: { fontSize: 24, fontWeight: "bold", color: COLORS.accent },

  editRow: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.primary,
  },

  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  saveButton: { backgroundColor: COLORS.accent },
  saveButtonText: { fontSize: 15, fontWeight: "600", color: COLORS.white },

  editButton: {
    backgroundColor: COLORS.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  editButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.white },

  bracketsContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  bracketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  bracketRange: { flex: 1 },
  bracketText: { fontSize: 14, color: COLORS.primary },
  bracketRate: { alignItems: "flex-end" },
  bracketRateText: { fontSize: 16, fontWeight: "bold", color: COLORS.accent },
  taxFree: { color: COLORS.success },
  taxFreeLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.success,
    marginTop: 2,
  },

  infoBox: {
    backgroundColor: "#E3F2FD",
    borderRadius: 8,
    padding: 12,
  },
  infoText: { fontSize: 13, color: "#1565C0", lineHeight: 18 },

  helpCard: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  helpTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },
  helpText: {
    fontSize: 14,
    color: COLORS.secondary,
    lineHeight: 22,
  },

  // Not supported state
  notSupportedCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    marginTop: 40,
  },
  notSupportedIcon: { fontSize: 64, marginBottom: 16 },
  notSupportedTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 12,
    textAlign: "center",
  },
  notSupportedText: {
    fontSize: 15,
    color: COLORS.secondary,
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 22,
  },
  notSupportedSubtext: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
    marginBottom: 8,
  },
  notSupportedFooter: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  notSupportedFooterText: {
    fontSize: 14,
    color: COLORS.accent,
    fontWeight: "600",
  },
});
