// FILE: app/sales/_layout.tsx
import { Stack } from "expo-router";

export default function SalesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="new" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="aging" />
    </Stack>
  );
}
