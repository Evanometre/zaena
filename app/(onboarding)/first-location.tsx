// app/(onboarding)/first-location.tsx
// Step 3 of 3: Create first location with timezone, + opening stock.
// Timezone is auto-detected from device, user can change it.
// Currency is suggested from timezone, also changeable.
// Saves timezone to location, currency + org timezone to organization.

import { Button, Input, StepIndicator } from "@/components/ui";
import supabase from "@/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "@/lib/theme";
import { createStockIn } from "@/onboarding/services/inventoryService";
import { createLocation } from "@/onboarding/services/locationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
  type CurrencySuggestion,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useAuthStore } from "@/stores/authStore";
import { getTimeZones } from "@vvo/tzdb";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ALL_TIMEZONES = getTimeZones()
  .map((tz) => ({ name: tz.name, label: `${tz.name} (UTC${tz.rawFormat})` }))
  .sort((a, b) => a.name.localeCompare(b.name));

function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

export default function FirstLocationScreen() {
  const { organizationId, setOnboardingStep, refreshOrgData } = useAuthStore();

  const { product_id, product_name, default_cost_price } =
    useLocalSearchParams<{
      product_id: string;
      product_name: string;
      default_cost_price?: string;
    }>();

  const deviceTz = useMemo(() => getDeviceTimezone(), []);

  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState(deviceTz);
  const [tzSearch, setTzSearch] = useState("");
  const [tzModalOpen, setTzModalOpen] = useState(false);
  const [currency, setCurrency] = useState<CurrencySuggestion>(() =>
    getCurrencyForTimezone(deviceTz),
  );
  const [cxSearch, setCxSearch] = useState("");
  const [cxModalOpen, setCxModalOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState(default_cost_price ?? "");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    location_name?: string;
    quantity?: string;
    general?: string;
  }>({});

  useEffect(() => {
    setCurrency(getCurrencyForTimezone(timezone));
  }, [timezone]);

  const filteredTimezones = useMemo(
    () =>
      tzSearch.trim()
        ? ALL_TIMEZONES.filter((tz) =>
            tz.name.toLowerCase().includes(tzSearch.toLowerCase()),
          )
        : ALL_TIMEZONES,
    [tzSearch],
  );

  const filteredCurrencies = useMemo(
    () =>
      cxSearch.trim()
        ? ALL_CURRENCIES.filter(
            (c) =>
              c.code.toLowerCase().includes(cxSearch.toLowerCase()) ||
              c.name.toLowerCase().includes(cxSearch.toLowerCase()),
          )
        : ALL_CURRENCIES,
    [cxSearch],
  );

  function validate() {
    const e: typeof errors = {};
    if (!locationName.trim()) e.location_name = "Location name is required";
    if (!quantity.trim() || isNaN(Number(quantity)) || Number(quantity) < 0) {
      e.quantity = "Enter a valid quantity (0 or more)";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleFinish() {
    if (!validate()) return;
    if (!organizationId) {
      setErrors({ general: "Organisation not found. Please restart the app." });
      return;
    }
    if (!product_id) {
      setErrors({
        general: "Product info was lost. Please go back and re-add it.",
      });
      return;
    }

    try {
      setLoading(true);
      setErrors({});

      // Save currency + timezone to org
      const { error: orgUpdateError } = await supabase
        .from("organizations")
        .update({ currency: currency.code, timezone })
        .eq("id", organizationId);
      console.log(
        "[first-location] currency save:",
        currency.code,
        orgUpdateError?.message ?? "ok",
      );
      if (orgUpdateError)
        throw new Error("Failed to save currency: " + orgUpdateError.message);

      // Create location with its timezone
      const location = await createLocation({
        organization_id: organizationId,
        name: locationName.trim(),
        address: address.trim() || undefined,
        timezone,
      });

      // Record opening stock
      await createStockIn({
        organization_id: organizationId,
        product_id,
        location_id: location.id,
        quantity: Number(quantity),
        unit_cost: unitCost ? Number(unitCost) : 0,
      });

      // Complete onboarding via Edge Function
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/complete-onboarding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ product_id, location_id: location.id }),
        },
      );

      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Failed to complete setup.");

      setOnboardingStep("complete");
      await refreshOrgData();
      router.replace("/(onboarding)/complete" as any);
    } catch (e: any) {
      setErrors({
        general: e.message || "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.foundation} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.progressRow}>
            <StepIndicator total={3} current={2} />
            <Text style={styles.stepLabel}>Step 3 of 3</Text>
          </View>

          <View style={styles.header}>
            <Text style={styles.eyebrow}>Almost done</Text>
            <Text style={styles.title}>Where do you{"\n"}operate from?</Text>
            <Text style={styles.subtitle}>
              Set your location, local time, and currency.
            </Text>
          </View>

          {errors.general && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errors.general}</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>Location</Text>

          <Input
            label="Branch name"
            value={locationName}
            onChangeText={setLocationName}
            placeholder="e.g. Lagos Main Store"
            autoCapitalize="words"
            error={errors.location_name}
          />

          <Input
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="e.g. 14 Allen Avenue, Ikeja"
            autoCapitalize="sentences"
            hint="Optional"
            multiline
            numberOfLines={2}
          />

          <Text style={[styles.sectionLabel, { marginTop: Spacing.md }]}>
            Timezone & Currency
          </Text>
          <Text style={styles.sectionHint}>
            Auto-detected from your device. Tap to change.
          </Text>

          <TouchableOpacity
            style={styles.selectorRow}
            onPress={() => setTzModalOpen(true)}
          >
            <View style={styles.selectorLeft}>
              <Text style={styles.selectorLabel}>Timezone</Text>
              <Text style={styles.selectorValue} numberOfLines={1}>
                {timezone}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.selectorRow}
            onPress={() => setCxModalOpen(true)}
          >
            <View style={styles.selectorLeft}>
              <Text style={styles.selectorLabel}>Currency</Text>
              <Text style={styles.selectorValue}>
                {currency.symbol} · {currency.code} · {currency.name}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, { marginTop: Spacing.md }]}>
            Opening Stock
          </Text>

          <View style={styles.readonlyField}>
            <Text style={styles.readonlyLabel}>Product</Text>
            <Text style={styles.readonlyValue}>{product_name ?? "—"}</Text>
          </View>

          <View style={styles.row}>
            <View style={styles.flex}>
              <Input
                label="Quantity on hand"
                value={quantity}
                onChangeText={setQuantity}
                placeholder="0"
                keyboardType="decimal-pad"
                error={errors.quantity}
                hint="Enter 0 if none yet"
              />
            </View>
            <View style={{ width: Spacing.md }} />
            <View style={styles.flex}>
              <Input
                label="Unit cost"
                value={unitCost}
                onChangeText={setUnitCost}
                placeholder="0.00"
                keyboardType="decimal-pad"
                hint="Pre-filled from product"
              />
            </View>
          </View>

          <Button
            label="Finish setup"
            onPress={handleFinish}
            loading={loading}
            variant="signal"
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Timezone picker modal */}
      <PickerModal
        visible={tzModalOpen}
        title="Select Timezone"
        searchPlaceholder="Search timezone..."
        searchValue={tzSearch}
        onSearchChange={setTzSearch}
        onClose={() => {
          setTzModalOpen(false);
          setTzSearch("");
        }}
        data={filteredTimezones}
        keyExtractor={(item) => item.name}
        renderItem={(item) => (
          <TouchableOpacity
            style={[
              styles.modalItem,
              item.name === timezone && styles.modalItemActive,
            ]}
            onPress={() => {
              setTimezone(item.name);
              setTzModalOpen(false);
              setTzSearch("");
            }}
          >
            <Text
              style={[
                styles.modalItemText,
                item.name === timezone && styles.modalItemTextActive,
              ]}
            >
              {item.name}
            </Text>
            {item.name === timezone && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>
        )}
      />

      {/* Currency picker modal */}
      <PickerModal
        visible={cxModalOpen}
        title="Select Currency"
        searchPlaceholder="Search by code or name..."
        searchValue={cxSearch}
        onSearchChange={setCxSearch}
        onClose={() => {
          setCxModalOpen(false);
          setCxSearch("");
        }}
        data={filteredCurrencies}
        keyExtractor={(item) => item.code}
        renderItem={(item) => (
          <TouchableOpacity
            style={[
              styles.modalItem,
              item.code === currency.code && styles.modalItemActive,
            ]}
            onPress={() => {
              setCurrency(item);
              setCxModalOpen(false);
              setCxSearch("");
            }}
          >
            <Text
              style={[
                styles.modalItemText,
                item.code === currency.code && styles.modalItemTextActive,
              ]}
            >
              {item.symbol} · {item.code} · {item.name}
            </Text>
            {item.code === currency.code && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function PickerModal<T>({
  visible,
  title,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  onClose,
  data,
  keyExtractor,
  renderItem,
}: {
  visible: boolean;
  title: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (t: string) => void;
  onClose: () => void;
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactElement;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={modal.safe}>
        <View style={modal.header}>
          <Text style={modal.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Text style={modal.closeText}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={modal.searchWrap}>
          <TextInput
            style={modal.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor={Colors.muted}
            value={searchValue}
            onChangeText={onSearchChange}
            autoFocus
            autoCapitalize="none"
          />
        </View>
        <FlatList
          data={data}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => renderItem(item)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.foundation },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  progressRow: {
    paddingTop: Spacing.lg,
    marginBottom: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  stepLabel: {
    fontSize: Typography.xs,
    color: Colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  header: { marginBottom: Spacing.lg },
  eyebrow: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.signal,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.xxl,
    fontWeight: Typography.extrabold,
    color: Colors.air,
    letterSpacing: -0.5,
    lineHeight: 36,
    marginBottom: Spacing.sm,
  },
  subtitle: { fontSize: Typography.base, color: Colors.muted, lineHeight: 22 },
  errorBanner: {
    backgroundColor: "rgba(224, 92, 92, 0.12)",
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.error,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorBannerText: { color: Colors.error, fontSize: Typography.sm },
  sectionLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.air,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionHint: {
    fontSize: Typography.xs,
    color: Colors.muted,
    marginBottom: Spacing.sm,
  },
  selectorRow: {
    backgroundColor: Colors.midLayer,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  selectorLeft: { flex: 1 },
  selectorLabel: {
    fontSize: Typography.xs,
    color: Colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  selectorValue: {
    fontSize: Typography.sm,
    color: Colors.air,
    fontWeight: Typography.medium,
  },
  chevron: { fontSize: 22, color: Colors.muted, marginLeft: Spacing.sm },
  readonlyField: {
    backgroundColor: Colors.midLayer,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  readonlyLabel: {
    fontSize: Typography.xs,
    color: Colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  readonlyValue: {
    fontSize: Typography.base,
    color: Colors.air,
    fontWeight: Typography.medium,
  },
  row: { flexDirection: "row" },
  flex: { flex: 1 },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalItemActive: { backgroundColor: `${Colors.teal}18` },
  modalItemText: { flex: 1, fontSize: Typography.sm, color: Colors.air },
  modalItemTextActive: { color: Colors.teal, fontWeight: Typography.semibold },
  check: { color: Colors.teal, fontSize: 16, fontWeight: "bold" },
});

const modal = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.foundation },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    color: Colors.air,
  },
  closeBtn: { padding: Spacing.sm },
  closeText: {
    fontSize: Typography.base,
    color: Colors.teal,
    fontWeight: Typography.semibold,
  },
  searchWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    backgroundColor: Colors.midLayer,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.air,
    fontSize: Typography.base,
  },
});
