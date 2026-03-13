// app/_layout.tsx

import { DrawerProvider } from "@/components/DrawerNavigator";
import { configureGoogleSignIn } from "@/lib/services/googleAuth";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import "@/modules/customers/syncHandler";
import "@/modules/expenses/syncHandler";
import "@/modules/inventory/syncHandler";
import "@/modules/products/syncHandler";
import "@/modules/purchases/syncHandler";
import "@/modules/sales-orders/syncHandler";
import "@/modules/sales/syncHandler";
import "@/modules/suppliers/syncHandler";
import {
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
  useFonts as useCGFonts,
} from "@expo-google-fonts/cormorant-garamond";
import {
  DMMono_400Regular,
  DMMono_500Medium,
  useFonts as useDMMonoFonts,
} from "@expo-google-fonts/dm-mono";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  useFonts as useDMSansFonts,
} from "@expo-google-fonts/dm-sans";
import NetInfo from "@react-native-community/netinfo";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Platform,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { PermissionsProvider } from "../context/PermissionsContext";
import { initLocalDb } from "../lib/localDb";
import { syncOutbox } from "../lib/syncEngine";
import { useAuthStore } from "../stores/authStore";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { user, ready, initialize } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // ── AppState: refresh Supabase session when app returns to foreground ──────
  // After idle/screen-lock the Supabase JS client's websocket drops and the
  // auth token may have silently expired. Any direct .from().select() call
  // then hangs indefinitely. Forcing a session refresh on foreground resume
  // kicks the client back into a working state before any screen queries.
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // _layout.tsx — replace the entire AppState useEffect with this
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        appState.current = nextState;
        // startAutoRefresh/stopAutoRefresh is handled in supabase.ts
        // Nothing else needed here
      },
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      initialize();
    });
    if (useAuthStore.persist.hasHydrated()) {
      initialize();
    }
    return unsub;
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      configureGoogleSignIn();
    }
  }, []);

  useEffect(() => {
    if (!ready) return;

    const inAuthGroup = (segments[0] as string) === "(auth)";
    const inOnboardingGroup = (segments[0] as string) === "(onboarding)";
    const inTabsGroup = (segments[0] as string) === "(tabs)";

    if (!user && inTabsGroup) {
      router.replace("/(auth)/login" as any);
    }
  }, [user, ready, segments]);

  useEffect(() => {
    initLocalDb().catch((err) => console.error("DB init failed:", err));
  }, []);

  useEffect(() => {
    if (!user || !ready) return;

    syncOutbox();

    const interval = setInterval(() => {
      syncOutbox();
    }, 20_000);

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        syncOutbox();
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [user, ready]);

  const [cgLoaded] = useCGFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
  });
  const [sansLoaded] = useDMSansFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });
  const [monoLoaded] = useDMMonoFonts({ DMMono_400Regular, DMMono_500Medium });

  const fontsLoaded = cgLoaded && sansLoaded && monoLoaded;

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!ready || !fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0E2931",
        }}
      >
        <ActivityIndicator size="large" color="#C9922A" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <PermissionsProvider>
        <DrawerProvider>
          <Toast />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen
              name="(onboarding)"
              options={{ headerShown: false, gestureEnabled: false }}
            />
            <Stack.Screen
              name="notifications"
              options={{ headerShown: false }}
            />
            <Stack.Screen name="settings" />
            <Stack.Screen name="locations" />
            <Stack.Screen name="devices" />
          </Stack>
        </DrawerProvider>
      </PermissionsProvider>
    </ThemeProvider>
  );
}
