// components/ui/index.tsx
// Reusable primitive components used across all auth screens.

import { Colors, Radius, Shadow, Spacing, Typography } from "@/lib/theme";
import React, { useState } from "react";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    TouchableOpacity,
    View,
    ViewStyle
} from "react-native";

// ============================================================
// PRIMARY BUTTON
// ============================================================
interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "signal" | "ghost" | "outline";
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const containerStyle = [
    styles.button,
    variant === "primary" && styles.buttonPrimary,
    variant === "signal" && styles.buttonSignal,
    variant === "ghost" && styles.buttonGhost,
    variant === "outline" && styles.buttonOutline,
    isDisabled && styles.buttonDisabled,
    variant === "primary" && !isDisabled && Shadow.button,
    variant === "signal" && !isDisabled && Shadow.signal,
    style,
  ];

  const labelStyle = [
    styles.buttonLabel,
    variant === "ghost" && styles.buttonLabelGhost,
    variant === "outline" && styles.buttonLabelOutline,
    isDisabled && styles.buttonLabelDisabled,
  ];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "ghost" || variant === "outline"
              ? Colors.air
              : Colors.foundation
          }
          size="small"
        />
      ) : (
        <Text style={labelStyle}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

// ============================================================
// TEXT INPUT
// ============================================================
interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  hint,
  containerStyle,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.inputContainer, containerStyle]}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
        ]}
        placeholderTextColor={Colors.muted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {error && <Text style={styles.inputErrorText}>{error}</Text>}
      {hint && !error && <Text style={styles.inputHint}>{hint}</Text>}
    </View>
  );
}

// ============================================================
// DIVIDER WITH LABEL
// ============================================================
export function Divider({ label }: { label?: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      {label && <Text style={styles.dividerLabel}>{label}</Text>}
      {label && <View style={styles.dividerLine} />}
    </View>
  );
}

// ============================================================
// SOCIAL BUTTON (Google / Apple)
// ============================================================
interface SocialButtonProps {
  label: string;
  icon: string;
  onPress: () => void;
  loading?: boolean;
}

export function SocialButton({
  label,
  icon,
  onPress,
  loading,
}: SocialButtonProps) {
  return (
    <TouchableOpacity
      style={styles.socialButton}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color={Colors.air} size="small" />
      ) : (
        <>
          <Text style={styles.socialIcon}>{icon}</Text>
          <Text style={styles.socialLabel}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ============================================================
// STEP INDICATOR
// ============================================================
interface StepIndicatorProps {
  total: number;
  current: number;
}

export function StepIndicator({ total, current }: StepIndicatorProps) {
  return (
    <View style={styles.stepContainer}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i < current && styles.stepDotComplete,
            i === current && styles.stepDotActive,
          ]}
        />
      ))}
    </View>
  );
}

// ============================================================
// SCREEN WRAPPER
// ============================================================
export function ScreenCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.screenCard, style]}>{children}</View>;
}

// ============================================================
// SELECT OPTION CARD
// ============================================================
interface OptionCardProps {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}

export function OptionCard({
  label,
  description,
  selected,
  onPress,
}: OptionCardProps) {
  return (
    <TouchableOpacity
      style={[styles.optionCard, selected && styles.optionCardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.optionCardInner}>
        <View
          style={[styles.optionRadio, selected && styles.optionRadioSelected]}
        >
          {selected && <View style={styles.optionRadioDot} />}
        </View>
        <View style={styles.optionCardText}>
          <Text
            style={[styles.optionLabel, selected && styles.optionLabelSelected]}
          >
            {label}
          </Text>
          <Text style={styles.optionDescription}>{description}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  // Button
  button: {
    height: 54,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  buttonPrimary: {
    backgroundColor: Colors.teal,
  },
  buttonSignal: {
    backgroundColor: Colors.signal,
  },
  buttonGhost: {
    backgroundColor: Colors.transparent,
  },
  buttonOutline: {
    backgroundColor: Colors.transparent,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonLabel: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.air,
    letterSpacing: 0.3,
  },
  buttonLabelGhost: {
    color: Colors.muted,
  },
  buttonLabelOutline: {
    color: Colors.air,
  },
  buttonLabelDisabled: {
    opacity: 0.6,
  },

  // Input
  inputContainer: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.muted,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    height: 52,
    backgroundColor: Colors.midLayer,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.base,
    color: Colors.air,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputFocused: {
    borderColor: Colors.teal,
    backgroundColor: Colors.surfaceLight,
  },
  inputError: {
    borderColor: Colors.error,
  },
  inputErrorText: {
    fontSize: Typography.xs,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  inputHint: {
    fontSize: Typography.xs,
    color: Colors.muted,
    marginTop: Spacing.xs,
  },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerLabel: {
    fontSize: Typography.xs,
    color: Colors.muted,
    marginHorizontal: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // Social Button
  socialButton: {
    flex: 1,
    height: 52,
    backgroundColor: Colors.midLayer,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  socialIcon: {
    fontSize: 18,
  },
  socialLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.air,
  },

  // Step Indicator
  stepContainer: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  stepDotActive: {
    width: 20,
    backgroundColor: Colors.teal,
    borderRadius: 3,
  },
  stepDotComplete: {
    backgroundColor: Colors.teal,
    opacity: 0.5,
  },

  // Screen Card
  screenCard: {
    backgroundColor: Colors.midLayer,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Option Card
  optionCard: {
    backgroundColor: Colors.midLayer,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  optionCardSelected: {
    borderColor: Colors.teal,
    backgroundColor: Colors.surfaceLight,
  },
  optionCardInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  optionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  optionRadioSelected: {
    borderColor: Colors.teal,
  },
  optionRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.teal,
  },
  optionCardText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.air,
    marginBottom: 2,
  },
  optionLabelSelected: {
    color: Colors.air,
  },
  optionDescription: {
    fontSize: Typography.sm,
    color: Colors.muted,
    lineHeight: 18,
  },
});
