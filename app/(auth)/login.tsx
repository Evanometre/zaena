// app/(auth)/login.tsx

import { Button, Divider, Input, SocialButton } from "@/components/ui";
import { AuthService } from "@/lib/services/auth.service";
import { Colors, Radius, Spacing, Typography } from "@/lib/theme";
import { router } from "expo-router";
import React, { useState } from "react";

import { useAuthStore } from "@/stores/authStore";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    general?: string;
  }>({});

  const { signIn } = useAuthStore();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

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

      // Read the updated store state after signIn
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
    try {
      setGoogleLoading(true);
      await AuthService.signInWithGoogle();
    } catch (e) {
      setErrors({ general: "Google sign-in failed. Please try again." });
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleApple() {
    try {
      setAppleLoading(true);
      await AuthService.signInWithApple();
    } catch (e) {
      setErrors({ general: "Apple sign-in failed. Please try again." });
    } finally {
      setAppleLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.foundation} />
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
            <Text style={styles.backText}>← Back</Text>
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
            {/*
            <View style={{ width: Spacing.sm }} />
            <SocialButton
              label="Apple"
              icon=""
              onPress={handleApple}
              loading={appleLoading}
            />*/}
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.foundation,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  back: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    alignSelf: "flex-start",
  },
  backText: {
    fontSize: Typography.sm,
    color: Colors.muted,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: Typography.xxl,
    fontWeight: Typography.extrabold,
    color: Colors.air,
    letterSpacing: -0.5,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.base,
    color: Colors.muted,
  },
  socialRow: {
    flexDirection: "row",
    marginBottom: Spacing.xs,
  },
  form: {
    gap: Spacing.xs,
  },
  errorBanner: {
    backgroundColor: "rgba(224, 92, 92, 0.12)",
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.error,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  errorBannerText: {
    color: Colors.error,
    fontSize: Typography.sm,
  },
  forgotRow: {
    alignSelf: "flex-end",
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
  },
  forgotText: {
    fontSize: Typography.sm,
    color: Colors.teal,
  },
  submitButton: {
    marginTop: Spacing.sm,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.xl,
  },
  footerText: {
    fontSize: Typography.sm,
    color: Colors.muted,
  },
  footerLink: {
    fontSize: Typography.sm,
    color: Colors.signal,
    fontWeight: Typography.semibold,
  },
});
