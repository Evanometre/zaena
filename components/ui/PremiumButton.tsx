import { useTheme } from "@/lib/theme/useTheme";
import React from "react";
import { GestureResponderEvent, Text, TouchableOpacity } from "react-native";

interface ButtonProps {
  title: string;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: "primary" | "secondary" | "outline";
  disabled?: boolean;
  fullWidth?: boolean;
}

export const PremiumButton: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  fullWidth = false,
}) => {
  const theme = useTheme();

  let backgroundColor = theme.colors.accent;
  let textColor = theme.colors.textInverse;
  let borderColor = "transparent";

  if (variant === "secondary") {
    backgroundColor = theme.colors.surfaceElevated;
    textColor = theme.colors.textPrimary;
    borderColor = theme.colors.borderSubtle;
  }

  if (variant === "outline") {
    backgroundColor = "transparent";
    textColor = theme.colors.accent;
    borderColor = theme.colors.accent;
  }

  if (disabled) {
    backgroundColor = theme.colors.borderSubtle;
    textColor = theme.colors.textMuted;
    borderColor = theme.colors.borderSubtle;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor,
        width: fullWidth ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        ...theme.shadows.soft,
      }}
    >
      <Text
        style={{
          color: textColor,
          fontSize: theme.typography.button.fontSize,
          fontWeight: theme.typography.button.fontWeight,
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
};
