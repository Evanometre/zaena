// app/(onboarding)/org-info.tsx
// Step 1 of onboarding.
// Called after auth record is created (email/password or SSO).
// Calls the signup Edge Function which atomically creates:
//   user_profile, organization, organization_settings,
//   employee, Owner role, user_role assignment.

import { Button, Input, OptionCard, StepIndicator } from "@/components/ui";
import { usePermissions } from "@/context/PermissionsContext";
import supabase from "@/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "@/lib/theme";
import { useAuthStore, type BusinessType } from "@/stores/authStore";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const BUSINESS_TYPES: {
  value: BusinessType;
  label: string;
  description: string;
}[] = [
  {
    value: "business_name",
    label: "Business Name/Sole Proprietorship",
    description:
      "Registered trading name, or unregistered sole proprietorship.",
  },
  {
    value: "registered_company",
    label: "Registered Company",
    description: "Incorporated company.",
  },
];

export default function OrgInfoScreen() {
  const params = useLocalSearchParams<{ full_name?: string }>();
  const { refreshOrgData, setOnboardingStep } = useAuthStore();
  const { refreshPermissions } = usePermissions();
  const [fullName, setFullName] = useState(params.full_name ?? "");
  const [orgName, setOrgName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    full_name?: string;
    org_name?: string;
    business_type?: string;
    general?: string;
  }>({});

  function validate() {
    const e: typeof errors = {};
    if (!fullName.trim()) e.full_name = "Your name is required";
    if (!orgName.trim()) e.org_name = "Business name is required";
    if (!businessType) e.business_type = "Please select a business type";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleContinue() {
    if (!validate()) return;

    try {
      setLoading(true);
      setErrors({});

      // Get current session token to pass to Edge Function
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated. Please sign in again.");

      // Call the signup Edge Function
      // This is the single atomic operation that creates everything
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/signup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            full_name: fullName.trim(),
            org_name: orgName.trim(),
            business_type: businessType,
          }),
        },
      );

      const result = await response.json();
      console.log("Edge Function response:", JSON.stringify(result, null, 2));

      if (!response.ok) {
        if (
          result.detail?.includes("duplicate key") ||
          result.message === "Already onboarded"
        ) {
          // Already created — just sync and continue
          await refreshOrgData();
          router.replace("/(onboarding)/first-product" as any);
          return;
        }
        throw new Error(result.error || "Setup failed. Please try again.");
      }

      // Set org directly from Edge Function response — no async gap
      useAuthStore.setState({
        organizationId: result.org_id,
        onboardingStep: "role_assigned",
      });

      await refreshPermissions();

      router.replace("/(onboarding)/first-product" as any);
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
            <StepIndicator total={3} current={0} />
            <Text style={styles.stepLabel}>Step 1 of 3</Text>
          </View>

          <View style={styles.header}>
            <Text style={styles.eyebrow}>Let&apos;s get started</Text>
            <Text style={styles.title}>Tell us about{"\n"}your business.</Text>
            <Text style={styles.subtitle}>
              This helps us set up your workspace correctly.
            </Text>
          </View>

          <View style={styles.form}>
            {errors.general && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errors.general}</Text>
              </View>
            )}

            <Input
              label="Your full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Ada Okonkwo"
              autoCapitalize="words"
              error={errors.full_name}
            />

            <Input
              label="Business name"
              value={orgName}
              onChangeText={setOrgName}
              placeholder="Okonkwo Ventures"
              autoCapitalize="words"
              error={errors.org_name}
            />

            <View style={styles.typeSection}>
              <Text style={styles.typeLabel}>Business Type</Text>
              {errors.business_type && (
                <Text style={styles.typeError}>{errors.business_type}</Text>
              )}
              {BUSINESS_TYPES.map((type) => (
                <OptionCard
                  key={type.value}
                  label={type.label}
                  description={type.description}
                  selected={businessType === type.value}
                  onPress={() => setBusinessType(type.value)}
                />
              ))}
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
    marginBottom: Spacing.xl,
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
    lineHeight: 36,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.base,
    color: Colors.muted,
    lineHeight: 22,
  },
  form: {
    marginBottom: Spacing.lg,
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
  typeSection: {
    marginTop: Spacing.sm,
  },
  typeLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  typeError: {
    fontSize: Typography.xs,
    color: Colors.error,
    marginBottom: Spacing.sm,
  },
});
