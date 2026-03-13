// FILE: app/settings/_layout.tsx
import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="locations" />
      <Stack.Screen name="devices" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}