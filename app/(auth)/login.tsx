// app/(auth)/login.tsx

import { Button, Divider, Input, SocialButton } from "@/components/ui";
import { AuthService } from "@/lib/services/auth.service";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { useAuthStore } from "@/stores/authStore";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;
  const sp = theme.spacing;
  const r = theme.radius;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    general?: string;
  }>({});

  const { signIn } = useAuthStore();

  function validate() {
    const e: typeof errors = {};
    if (!email.trim()) e.email = "Email is required";
    if (!password.trim()) e.password = "Password is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleLogin() {
    if (!validate()) return;
    try {
      setLoading(true);
      setErrors({});
      const { error } = await signIn(email.trim(), password);
      if (error) throw error;
      const { onboardingStep } = useAuthStore.getState();
      if (!onboardingStep || onboardingStep !== "complete") {
        router.replace("/(onboarding)/org-info" as any);
      } else {
        router.replace("/(tabs)" as any);
      }
    } catch (e: any) {
      setErrors({ general: e.message || "Invalid email or password" });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (Platform.OS === "web") {
      setErrors({ general: "Google sign-in is not available on web yet." });
      return;
    }
    try {
      setGoogleLoading(true);
      await AuthService.signInWithGoogle();
    } catch {
      setErrors({ general: "Google sign-in failed. Please try again." });
    } finally {
      setGoogleLoading(false);
    }
  }

  const styles = StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.canvas,
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: sp.lg,
      paddingBottom: sp.xxl,
      ...(Platform.OS === "web"
        ? { maxWidth: 480, width: "100%", alignSelf: "center" as const }
        : {}),
    },
    back: {
      paddingTop: sp.md,
      paddingBottom: sp.lg,
      alignSelf: "flex-start",
    },
    header: {
      marginBottom: sp.xl,
    },
    title: {
      ...t.h1,
      color: c.textPrimary,
      letterSpacing: -0.5,
      marginBottom: sp.xs,
    },
    subtitle: {
      ...t.body,
      color: c.textSecondary,
    },
    socialRow: {
      flexDirection: "row",
      marginBottom: sp.xs,
    },
    form: {
      gap: sp.xs,
    },
    errorBanner: {
      backgroundColor: c.negativeSoft,
      borderRadius: r.sm,
      borderWidth: 1,
      borderColor: c.negative,
      padding: sp.md,
      marginBottom: sp.sm,
    },
    errorBannerText: {
      ...t.bodySm,
      color: c.negative,
    },
    forgotRow: {
      alignSelf: "flex-end",
      marginTop: -sp.xs,
      marginBottom: sp.sm,
    },
    forgotText: {
      ...t.bodySm,
      color: c.brandInteractive,
    },
    submitButton: {
      marginTop: sp.sm,
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: sp.xl,
    },
    footerText: {
      ...t.bodySm,
      color: c.textMuted,
    },
    footerLink: {
      ...t.bodySm,
      color: c.signal,
      fontFamily: t.bodyMed.fontFamily,
    },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={c.canvas}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={c.textSecondary} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Welcome back.</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>
          </View>

          {/* SSO */}
          <View style={styles.socialRow}>
            <SocialButton
              label="Google"
              icon="G"
              onPress={handleGoogle}
              loading={googleLoading}
            />
          </View>

          <Divider label="or sign in with email" />

          {/* Form */}
          <View style={styles.form}>
            {errors.general && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errors.general}</Text>
              </View>
            )}

            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={errors.email}
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              autoComplete="password"
              error={errors.password}
            />

            <TouchableOpacity
              style={styles.forgotRow}
              onPress={() => router.push("/(auth)/forgot-password" as any)}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <Button
              label="Sign in"
              onPress={handleLogin}
              loading={loading}
              style={styles.submitButton}
            />
          </View>

          {/* Footer */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Don&apos;t have an account? </Text>
            <TouchableOpacity
              onPress={() => router.replace("/(auth)/signup" as any)}
            >
              <Text style={styles.footerLink}>Create one</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
