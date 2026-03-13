// app/(auth)/forgot-password.tsx
import { Button, Input } from "@/components/ui";
import supabase from "@/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "@/lib/theme";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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

type Stage = "request" | "sent" | "reset";

export default function ForgotPasswordScreen() {
  const [stage, setStage] = useState<Stage>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirm?: string;
    general?: string;
  }>({});

  // When the user returns via the reset deep link, Supabase fires
  // a PASSWORD_RECOVERY event — we catch it here and switch to
  // the new password stage.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStage("reset");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleRequestReset() {
    if (!email.trim()) {
      setErrors({ email: "Email is required" });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: "novapos://auth/forgot-password" },
      );
      if (error) throw error;
      setStage("sent");
    } catch (e: any) {
      setErrors({ general: e.message || "Something went wrong. Try again." });
    } finally {
      setLoading(false);
    }
  }

  async function handleSetNewPassword() {
    const e: typeof errors = {};
    if (!password.trim()) e.password = "Password is required";
    else if (password.length < 8) e.password = "Minimum 8 characters";
    if (!confirmPassword.trim()) e.confirm = "Please confirm your password";
    else if (password !== confirmPassword) e.confirm = "Passwords do not match";
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.replace("/(tabs)" as any);
    } catch (e: any) {
      setErrors({ general: e.message || "Failed to update password." });
    } finally {
      setLoading(false);
    }
  }

  // ── SENT STAGE ──────────────────────────────────────────────
  if (stage === "sent") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={Colors.foundation}
        />
        <View style={styles.centred}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>✉</Text>
          </View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a reset link to{"\n"}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>
          <Text style={styles.hint}>
            Open the link in the email and you&apos;ll be brought back here to
            set a new password.
          </Text>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.replace("/(auth)/login" as any)}
          >
            <Text style={styles.backLinkText}>← Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── RESET STAGE ─────────────────────────────────────────────
  if (stage === "reset") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={Colors.foundation}
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
            <View style={styles.header}>
              <Text style={styles.title}>Set new password</Text>
              <Text style={styles.subtitle}>
                Choose something you&apos;ll remember.
              </Text>
            </View>

            <View style={styles.form}>
              {errors.general && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{errors.general}</Text>
                </View>
              )}

              <Input
                label="New password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                error={errors.password}
              />

              <Input
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Same password again"
                secureTextEntry
                error={errors.confirm}
              />

              <Button
                label="Update password"
                onPress={handleSetNewPassword}
                loading={loading}
                style={styles.submitButton}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── REQUEST STAGE (default) ──────────────────────────────────
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
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Forgot password?</Text>
            <Text style={styles.subtitle}>
              Enter your email and we&apos;ll send you a reset link.
            </Text>
          </View>

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

            <Button
              label="Send reset link"
              onPress={handleRequestReset}
              loading={loading}
              style={styles.submitButton}
            />
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Remember it? </Text>
            <TouchableOpacity
              onPress={() => router.replace("/(auth)/login" as any)}
            >
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
  centred: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    backgroundColor: "rgba(43,117,116,0.12)",
    borderWidth: 1,
    borderColor: "rgba(43,117,116,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  iconText: {
    fontSize: 28,
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
  backLink: {
    marginTop: Spacing.lg,
  },
  backLinkText: {
    fontSize: Typography.sm,
    color: Colors.teal,
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
    textAlign: "center",
  },
  emailHighlight: {
    color: Colors.air,
    fontWeight: Typography.semibold,
  },
  hint: {
    fontSize: Typography.sm,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
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
