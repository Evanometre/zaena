// FILE: app/sales-orders/_layout.tsx
import { Stack } from "expo-router";
export default function SalesOrdersLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="add" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
