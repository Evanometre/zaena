// FILE: app/inventory/_layout.tsx
// ============================================
import { Stack } from 'expo-router';

export default function InventoryLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="adjust" />
      <Stack.Screen name="bulk-adjust" />
    </Stack>
  );
}