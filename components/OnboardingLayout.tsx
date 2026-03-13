import React from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { ONBOARDING_TOTAL_STEPS } from "../onboarding/utility/onboardingHelpers";
import { StepIndicator } from "./StepIndicator";

interface OnboardingLayoutProps {
  /** Current step number (1-indexed) */
  step: number;
  /** Main heading shown at the top of the step */
  title: string;
  /** Optional supporting text below the title */
  subtitle?: string;
  /** The form/content for this step */
  children: React.ReactNode;
  /** Primary action button (Next / Save / Finish) */
  primaryAction: React.ReactNode;
  /** Optional secondary action (Back / Skip) */
  secondaryAction?: React.ReactNode;
  /** When true, dims content and shows a loading overlay on the primary action */
  isSubmitting?: boolean;
  /**
   * When true, hides the step indicator.
   * Use this when the layout is opened from Settings in edit mode.
   */
  hideStepIndicator?: boolean;
}

/**
 * Wraps each onboarding step in a consistent layout:
 * - Step indicator (optional)
 * - Title + subtitle
 * - Scrollable form content
 * - Sticky bottom action buttons
 */
export function OnboardingLayout({
  step,
  title,
  subtitle,
  children,
  primaryAction,
  secondaryAction,
  isSubmitting = false,
  hideStepIndicator = false,
}: OnboardingLayoutProps) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.container}>
        {/* Top: step indicator + header */}
        <View style={styles.header}>
          {!hideStepIndicator && (
            <StepIndicator
              totalSteps={ONBOARDING_TOTAL_STEPS}
              currentStep={step}
            />
          )}
          <Text style={styles.stepLabel}>
            {hideStepIndicator
              ? ""
              : `Step ${step} of ${ONBOARDING_TOTAL_STEPS}`}
          </Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        {/* Middle: scrollable form content */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>

        {/* Bottom: sticky actions */}
        <View style={styles.actions}>
          {isSubmitting && (
            <ActivityIndicator
              size="small"
              color="#6366F1"
              style={styles.loadingIndicator}
            />
          )}
          {primaryAction}
          {secondaryAction ?? null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  stepLabel: {
    fontSize: 12,
    color: "#9CA3AF", // gray-400
    fontWeight: "500",
    marginTop: 12,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827", // gray-900
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: "#6B7280", // gray-500
    lineHeight: 22,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  actions: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6", // gray-100
    gap: 10,
  },
  loadingIndicator: {
    marginBottom: 4,
  },
});
