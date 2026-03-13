// components/ui/PremiumInput.tsx
import { useTheme } from "@/lib/theme/useTheme";
import React from "react";
import { Text, TextInput, TextInputProps, View } from "react-native";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export const PremiumInput: React.FC<InputProps> = ({
  label,
  error,
  style,
  ...props
}) => {
  const theme = useTheme();

  return (
    <View style={{ marginBottom: theme.spacing.lg }}>
      {label && (
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.typography.bodySmall.fontSize,
            marginBottom: theme.spacing.xs,
          }}
        >
          {label}
        </Text>
      )}
      <TextInput
        style={[
          {
            backgroundColor: theme.colors.surface,
            color: theme.colors.textPrimary,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: error
              ? theme.colors.danger
              : theme.colors.borderSubtle,
            fontSize: theme.typography.body.fontSize,
            ...theme.shadows.soft,
          },
          style, // merge any external style safely
        ]}
        placeholderTextColor={theme.colors.textMuted}
        {...props}
      />
      {error && (
        <Text
          style={{
            color: theme.colors.danger,
            fontSize: theme.typography.bodySmall.fontSize,
            marginTop: theme.spacing.xs,
          }}
        >
          {error}
        </Text>
      )}
    </View>
  );
};
