// app/(auth)/signup.tsx

import { Button, Divider, Input, SocialButton } from "@/components/ui";
import { AuthService } from "@/lib/services/auth.service";
import supabase from "@/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "@/lib/theme";
import { useAuthStore } from "@/stores/authStore";
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

export default function SignupScreen() {
  const [fullName, setFullName] = useState("");

  const { signUp } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [errors, setErrors] = useState<{
    full_name?: string;
    email?: string;
    password?: string;
    general?: string;
  }>({});

  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  function validate() {
    const e: typeof errors = {};
    if (!fullName.trim()) e.full_name = "Full name is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = "Enter a valid email";
    if (!password.trim()) e.password = "Password is required";
    else if (password.length < 8)
      e.password = "Password must be at least 8 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSignup() {
    if (!validate()) return;
    try {
      setLoading(true);
      setErrors({});

      const { error } = await signUp(email.trim(), password);
      if (error) throw error;

      // Check if session exists (no email confirmation required)
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setEmailSent(true);
        return;
      }

      // Session exists immediately — go straight to org setup
      router.push({
        pathname: "/(onboarding)/org-info" as any,
        params: { full_name: fullName.trim() },
      });
    } catch (e: any) {
      setErrors({
        general: e.message || "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      setGoogleLoading(true);
      await AuthService.signInWithGoogle();
    } catch {
      setErrors({ general: "Google sign-in failed. Please try again." });
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleApple() {
    try {
      setAppleLoading(true);
      await AuthService.signInWithApple();
    } catch {
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
        {emailSent && (
          <View style={styles.emailSentBanner}>
            <Text style={styles.emailSentTitle}>Check your email</Text>
            <Text style={styles.emailSentText}>
              We sent a confirmation link to {email}. Click it then come back to
              sign in.
            </Text>
            <Button
              label="Go to sign in"
              onPress={() => router.replace("/(auth)/login" as any)}
              variant="outline"
              style={{ marginTop: Spacing.md }}
            />
          </View>
        )}
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Create your account.</Text>
            <Text style={styles.subtitle}>
              Get started — it only takes a minute.
            </Text>
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
            /> */}
          </View>

          <Divider label="or sign up with email" />

          {/* Form */}
          <View style={styles.form}>
            {errors.general && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errors.general}</Text>
              </View>
            )}

            <Input
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Ada Okonkwo"
              autoCapitalize="words"
              autoComplete="name"
              error={errors.full_name}
            />

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
              placeholder="Minimum 8 characters"
              secureTextEntry
              autoComplete="new-password"
              error={errors.password}
              hint="Use a strong password you don't use elsewhere."
            />

            <Button
              label="Continue"
              onPress={handleSignup}
              loading={loading}
              variant="signal"
              style={styles.submitButton}
            />
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
              <Text style={styles.footerLink}>Sign in</Text>
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
  emailSentBanner: {
    backgroundColor: Colors.midLayer,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.teal,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  emailSentTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    color: Colors.air,
    marginBottom: Spacing.xs,
  },
  emailSentText: {
    fontSize: Typography.sm,
    color: Colors.muted,
    lineHeight: 20,
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
    color: Colors.teal,
    fontWeight: Typography.semibold,
  },
});
