//components/ui/PremiumCard.tsx
import { useTheme } from "@/lib/theme/useTheme";
import React from "react";
import { View, ViewProps } from "react-native";

interface CardProps extends ViewProps {
  elevated?: boolean;
  glass?: boolean;
}

export const PremiumCard: React.FC<CardProps> = ({
  children,
  elevated = true,
  glass = false,
  style,
  ...props
}) => {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: glass
            ? theme.glass.backgroundColor
            : theme.colors.surfaceElevated,
          borderColor: glass ? theme.glass.borderColor : "transparent",
          borderWidth: glass ? 1 : 0,
          borderRadius: theme.radius.xl,
          padding: theme.spacing.lg,
          ...(elevated && !glass ? theme.shadows.medium : {}),
        },
        style, // merge safely
      ]}
      {...props}
    >
      {children}
    </View>
  );
};
