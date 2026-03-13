// ============================================
// FILE: app/purchases/_layout.tsx
// ============================================
import { Stack } from 'expo-router';

export default function PurchasesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}