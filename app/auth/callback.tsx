// app/auth/callback.tsx

import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [status, setStatus] = useState("Verifying your email...");
  const handled = useRef(false);
  const { organizationId, user } = useAuthStore();

  useEffect(() => {
    if (user && organizationId) {
      router.replace("/(tabs)");
    }
  }, [user, organizationId]);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) processCallbackUrl(url);
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      processCallbackUrl(url);
    });

    return () => subscription.remove();
  }, []);

  async function processCallbackUrl(url: string) {
    // Guard: only process once even if both listeners fire
    if (handled.current) return;

    // Only process URLs that are actually our auth callback
    if (!url.includes("auth/callback")) return;

    handled.current = true;

    try {
      const { queryParams } = Linking.parse(url);
      const code = queryParams?.code as string | undefined;

      const accessToken = queryParams?.access_token as string | undefined;
      const refreshToken = queryParams?.refresh_token as string | undefined;

      if (code) {
        // ── PKCE flow (primary path) ─────────────────────────
        setStatus("Confirming your email...");
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else if (accessToken && refreshToken) {
        setStatus("Establishing session...");
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          // Genuinely nothing to work with
          router.replace("/(auth)/login");
          return;
        }
      }
      setStatus("Setting up your workspace...");
      router.replace("/(tabs)");
    } catch (err: any) {
      console.error("[callback] Error:", err?.message ?? err);
      router.replace("/(auth)/login");
    }
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#e85a2a" />
      <Text style={styles.statusText}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    gap: 16,
  },
  statusText: {
    fontSize: 15,
    color: "#6b7280",
  },
});
