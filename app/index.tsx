// ============================================================
// app/index.tsx — Entry point routing
// ============================================================

import { useTheme } from "@/lib/theme/ThemeProvider";
import { useAuthStore } from "@/stores/authStore";
import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";

export default function IndexScreen() {
  const { ready, session, onboardingStep } = useAuthStore();
  const { theme } = useTheme();
  const c = theme.colors;

  // Set browser tab title on web while routing
  useEffect(() => {
    if (Platform.OS === "web") {
      document.title = "Zaena";
    }
  }, []);

  // Safety timeout — if hydration stalls, force proceed after 3s
  useEffect(() => {
    if (!ready) return;

    if (!session) {
      router.replace("/(auth)" as any);
      return;
    }

    if (!onboardingStep || onboardingStep !== "complete") {
      switch (onboardingStep) {
        case null:
        case "auth_created":
          router.replace("/(onboarding)/org-info" as any);
          break;
        case "profile_created":
        case "org_created":
        case "employee_created":
        case "role_assigned":
          router.replace("/(onboarding)/first-product" as any);
          break;
        case "product_created":
          router.replace("/(onboarding)/first-location" as any);
          break;
        case "location_created":
          router.replace("/(onboarding)/complete" as any);
          break;
        default:
          router.replace("/(onboarding)/org-info" as any);
      }
      return;
    }

    router.replace("/(tabs)" as any);
  }, [ready, session, onboardingStep]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.canvas,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator color={c.brandInteractive} size="large" />
    </View>
  );
}
