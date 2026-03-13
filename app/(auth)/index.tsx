// app/(auth)/index.tsx  ← Welcome / Landing screen

import { Button, Divider, SocialButton } from "@/components/ui";
import { AuthService } from "@/lib/services/auth.service";
import { signInWithGoogle } from "@/lib/services/googleAuth";
import supabase from "@/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "@/lib/theme";
import { useAuthStore } from "@/stores/authStore";
import { router } from "expo-router";
import React from "react";
import { Dimensions, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

export default function WelcomeScreen() {
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [appleLoading, setAppleLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{ general?: string }>({});
  async function handleGoogle() {
    try {
      setGoogleLoading(true);

      const result = await signInWithGoogle();

      if (!result.success) {
        if (!result.cancelled) {
          setErrors({ general: result.error });
        }
        return;
      }

      if (result.isNewUser) {
        // New Google user — needs to complete org setup
        // Get their display name from the Google profile
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const fullName =
          user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? "";

        router.replace({
          pathname: "/(onboarding)/org-info" as any,
          params: { full_name: fullName },
        });
      } else {
        // Existing user — check onboarding state
        await useAuthStore.getState().refreshOrgData();
        const { onboardingStep } = useAuthStore.getState();

        if (!onboardingStep || onboardingStep !== "complete") {
          router.replace("/(onboarding)/org-info" as any);
        } else {
          router.replace("/(tabs)" as any);
        }
      }
    } catch (e: any) {
      setErrors({ general: "Google sign in failed. Please try again." });
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleApple() {
    try {
      setAppleLoading(true);
      await AuthService.signInWithApple();
    } catch (e) {
      console.error(e);
    } finally {
      setAppleLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.foundation} />

      <View style={styles.container}>
        {/* Logo / Brand mark */}
        <View style={styles.heroSection}>
          <View style={styles.logoMark}>
            <View style={styles.logoInner} />
          </View>
          <Text style={styles.brandName}>Zaena</Text>
          <Text style={styles.tagline}>
            Manage your business{"\n"}scale with ease.
          </Text>
        </View>

        {/* Decorative accent bar */}
        <View style={styles.accentBar}>
          <View
            style={[
              styles.accentSegment,
              { flex: 3, backgroundColor: Colors.teal },
            ]}
          />
          <View
            style={[
              styles.accentSegment,
              { flex: 1, backgroundColor: Colors.signal },
            ]}
          />
          <View
            style={[
              styles.accentSegment,
              { flex: 2, backgroundColor: Colors.midLayer },
            ]}
          />
        </View>

        {/* Auth actions */}
        <View style={styles.actionsSection}>
          <Button
            label="Create an account"
            onPress={() => router.push("/(auth)/signup" as any)}
            variant="signal"
            style={styles.primaryCta}
          />

          <Button
            label="Sign in"
            onPress={() => router.push("/(auth)/login" as any)}
            variant="outline"
          />

          <Divider label="or continue with" />

          <View style={styles.socialRow}>
            <SocialButton
              label="Google"
              icon="G"
              onPress={handleGoogle}
              loading={googleLoading}
            />

            {/*<View style={{ width: Spacing.sm }} />
            <SocialButton
              label="Apple"
              icon=""
              onPress={handleApple}
              loading={appleLoading}
            />*/}
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          By continuing, you agree to our{" "}
          <Text style={styles.footerLink}>Terms</Text> and{" "}
          <Text style={styles.footerLink}>Privacy Policy</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.foundation,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.lg,
    justifyContent: "space-between",
  },

  // Hero
  heroSection: {
    alignItems: "flex-start",
  },
  logoMark: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.teal,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  logoInner: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: Colors.signal,
    transform: [{ rotate: "15deg" }],
  },
  brandName: {
    fontSize: Typography.hero,
    fontWeight: Typography.extrabold,
    color: Colors.air,
    letterSpacing: -1,
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontSize: Typography.lg,
    fontWeight: Typography.regular,
    color: Colors.muted,
    lineHeight: 28,
  },

  // Accent bar
  accentBar: {
    flexDirection: "row",
    height: 3,
    borderRadius: Radius.full,
    overflow: "hidden",
    gap: 3,
    marginVertical: Spacing.xl,
  },
  accentSegment: {
    borderRadius: Radius.full,
  },

  // Actions
  actionsSection: {
    flex: 1,
    justifyContent: "flex-end",
    gap: Spacing.sm,
  },
  primaryCta: {
    marginBottom: Spacing.xs,
  },
  socialRow: {
    flexDirection: "row",
  },

  // Footer
  footer: {
    fontSize: Typography.xs,
    color: Colors.muted,
    textAlign: "center",
    marginTop: Spacing.lg,
    lineHeight: 18,
  },
  footerLink: {
    color: Colors.teal,
    fontWeight: Typography.medium,
  },
});
