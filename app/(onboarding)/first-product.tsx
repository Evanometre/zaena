// app/(onboarding)/first-product.tsx
// Step 2 of onboarding: create first product.
// Uses existing productService — no raw Supabase queries.

import { Button, Input, StepIndicator } from "@/components/ui";
import { Colors, Radius, Spacing, Typography } from "@/lib/theme";
import { createProduct } from "@/onboarding/services/productService";
import { useAuthStore } from "@/stores/authStore";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function FirstProductScreen() {
  const organizationId = useAuthStore((state) => state.organizationId);
  const refreshOrgData = useAuthStore((state) => state.refreshOrgData);
  const setOnboardingStep = useAuthStore((state) => state.setOnboardingStep);

  const [hasFetched, setHasFetched] = useState(false);
  const [name, setName] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [sku, setSku] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    price?: string;
    general?: string;
  }>({});

  useEffect(() => {
    if (organizationId) return; // already have it
    refreshOrgData().finally(() => setHasFetched(true));
  }, []);

  if (!organizationId && !hasFetched) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.foundation,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={Colors.teal} size="large" />
      </View>
    );
  }

  if (!organizationId && hasFetched) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.foundation,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        <Text
          style={{ color: Colors.error, textAlign: "center", marginBottom: 16 }}
        >
          Organisation not found. Please go back and complete business setup.
        </Text>
        <Button
          label="Go back"
          onPress={() => router.replace("/(onboarding)/org-info" as any)}
          variant="outline"
        />
      </View>
    );
  }

  function validate() {
    const e: typeof errors = {};
    if (!name.trim()) e.name = "Product name is required";
    if (!sellingPrice.trim()) {
      e.price = "Selling price is required";
    } else if (isNaN(Number(sellingPrice)) || Number(sellingPrice) < 0) {
      e.price = "Enter a valid price";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleContinue() {
    if (!validate()) return;
    if (!organizationId) {
      setErrors({ general: "Organisation not found. Please restart the app." });
      return;
    }

    try {
      setLoading(true);
      setErrors({});

      const product = await createProduct({
        organization_id: organizationId,
        name: name.trim(),
        default_selling_price: Number(sellingPrice),
        default_cost_price: costPrice ? Number(costPrice) : 0,
        unit: unit.trim() || undefined,
        sku: sku.trim() || undefined,
      });

      setOnboardingStep("product_created");

      // Pass product info to next screen via params
      router.push({
        pathname: "/(onboarding)/first-location" as any,
        params: {
          product_id: product.id,
          product_name: product.name,
          default_cost_price: String(product.default_cost_price),
        },
      });
    } catch (e: any) {
      setErrors({
        general: e.message || "Failed to save product. Please try again.",
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
            <StepIndicator total={3} current={1} />
            <Text style={styles.stepLabel}>Step 2 of 3</Text>
          </View>

          <View style={styles.header}>
            <Text style={styles.eyebrow}>Your first product</Text>
            <Text style={styles.title}>What do you sell?</Text>
            <Text style={styles.subtitle}>
              Add one product to get started. You can add more after setup.
            </Text>
          </View>

          <View style={styles.accentCard}>
            <Text style={styles.accentIcon}>📦</Text>
            <Text style={styles.accentText}>
              This product will be ready for your first sale the moment setup is
              done.
            </Text>
          </View>

          <View style={styles.form}>
            {errors.general && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errors.general}</Text>
              </View>
            )}

            <Input
              label="Product name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Bottled Water 50cl"
              autoCapitalize="words"
              error={errors.name}
            />

            <View style={styles.row}>
              <View style={styles.flex}>
                <Input
                  label="Selling price"
                  value={sellingPrice}
                  onChangeText={setSellingPrice}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  error={errors.price}
                />
              </View>
              <View style={styles.rowSpacer} />
              <View style={styles.flex}>
                <Input
                  label="Cost price"
                  value={costPrice}
                  onChangeText={setCostPrice}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  hint="Optional"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.flex}>
                <Input
                  label="Unit"
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="e.g. pcs, kg"
                  autoCapitalize="none"
                  hint="Optional"
                />
              </View>
              <View style={styles.rowSpacer} />
              <View style={styles.flex}>
                <Input
                  label="SKU"
                  value={sku}
                  onChangeText={setSku}
                  placeholder="Optional"
                  autoCapitalize="none"
                  hint="Optional"
                />
              </View>
            </View>
          </View>

          <Button
            label="Continue"
            onPress={handleContinue}
            loading={loading}
            variant="signal"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.foundation,
  },
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
  header: {
    marginBottom: Spacing.lg,
  },
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
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.base,
    color: Colors.muted,
    lineHeight: 22,
  },
  accentCard: {
    backgroundColor: Colors.midLayer,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  accentIcon: {
    fontSize: 22,
  },
  accentText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.muted,
    lineHeight: 20,
  },
  form: {
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: "row",
  },
  flex: {
    flex: 1,
  },
  rowSpacer: {
    width: Spacing.md,
  },
  errorBanner: {
    backgroundColor: "rgba(224, 92, 92, 0.12)",
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.error,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorBannerText: {
    color: Colors.error,
    fontSize: Typography.sm,
  },
});
