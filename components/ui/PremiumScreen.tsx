// components/ui/PremiumScreen.tsx
import { useTheme } from "@/lib/theme/useTheme";
import React from "react";
import { ScrollView, ScrollViewProps, ViewStyle } from "react-native";

interface ScreenProps extends ScrollViewProps {
  padding?: boolean;
  style?: ViewStyle;
}

export const PremiumScreen: React.FC<ScreenProps> = ({
  children,
  padding = true,
  style,
  ...props
}) => {
  const theme = useTheme();

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        padding: padding ? theme.spacing.lg : 0,
        ...style,
      }}
      {...props}
    >
      {children}
    </ScrollView>
  );
};
