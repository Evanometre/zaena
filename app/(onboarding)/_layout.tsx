import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    // gestureEnabled: false prevents swiping back mid-onboarding
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="org-info" />
      <Stack.Screen name="first-product" />
      <Stack.Screen name="first-location" />
      <Stack.Screen name="complete" />
    </Stack>
  );
}
