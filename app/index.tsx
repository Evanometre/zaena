// ============================================================
// app/index.tsx — Entry point routing
// ============================================================

import { Colors } from "@/lib/theme";
import { useAuthStore } from "@/stores/authStore";
import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function IndexScreen() {
  const { ready, session, onboardingStep } = useAuthStore();

  // Safety timeout — if hydration stalls, force proceed after 3s
  useEffect(() => {
    if (!ready) return; // ← one flag, no race

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
        backgroundColor: Colors.foundation,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator color={Colors.teal} size="large" />
    </View>
  );
}
