// FILE: app/suppliers/_layout.tsx
import { Stack } from 'expo-router';

export default function SuppliersLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}