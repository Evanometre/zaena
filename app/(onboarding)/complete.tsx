// app/(onboarding)/complete.tsx
// Final onboarding screen — celebrates completion, goes to dashboard.

import { Button } from "@/components/ui";
import { Colors, Radius, Shadow, Spacing, Typography } from "@/lib/theme";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OnboardingCompleteScreen() {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    // Entrance animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.foundation} />

      <View style={styles.container}>
        {/* Celebration mark */}
        <Animated.View
          style={[styles.checkContainer, { transform: [{ scale: scaleAnim }] }]}
        >
          <View style={styles.checkOuter}>
            <View style={styles.checkInner}>
              <Text style={styles.checkIcon}>✓</Text>
            </View>
          </View>
          {/* Decorative rings */}
          <View style={[styles.ring, styles.ring1]} />
          <View style={[styles.ring, styles.ring2]} />
        </Animated.View>

        {/* Text content */}
        <Animated.View
          style={[
            styles.textSection,
            {
              opacity: opacityAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.title}>You&apos;re all set.</Text>
          <Text style={styles.subtitle}>
            Your workspace is ready. Start recording your first sale right now.
          </Text>

          {/* Summary cards */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryIcon}>🏢</Text>
              <Text style={styles.summaryCardLabel}>Organisation</Text>
              <Text style={styles.summaryCardValue}>Created</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryIcon}>📦</Text>
              <Text style={styles.summaryCardLabel}>Product</Text>
              <Text style={styles.summaryCardValue}>Added</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryIcon}>📍</Text>
              <Text style={styles.summaryCardLabel}>Location</Text>
              <Text style={styles.summaryCardValue}>Set up</Text>
            </View>
          </View>
        </Animated.View>

        {/* CTA */}
        <Animated.View style={{ opacity: opacityAnim, width: "100%" }}>
          <Button
            label="Go to dashboard"
            onPress={() => router.replace("/(tabs)")}
            variant="signal"
            style={styles.cta}
          />
          <Text style={styles.hint}>
            You can customise settings, add more products, and invite your team
            from the dashboard.
          </Text>
        </Animated.View>
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
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xl,
  },

  // Check mark
  checkContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 120,
    height: 120,
  },
  checkOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.teal,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.button,
    zIndex: 2,
  },
  checkInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  checkIcon: {
    fontSize: 28,
    color: Colors.air,
    fontWeight: Typography.bold,
  },
  ring: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Colors.teal,
  },
  ring1: {
    width: 96,
    height: 96,
    opacity: 0.4,
  },
  ring2: {
    width: 116,
    height: 116,
    opacity: 0.15,
  },

  // Text
  textSection: {
    alignItems: "center",
    gap: Spacing.md,
  },
  title: {
    fontSize: Typography.xxl,
    fontWeight: Typography.extrabold,
    color: Colors.air,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: Typography.base,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: Spacing.md,
  },

  // Summary
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.midLayer,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: "center",
    gap: 4,
  },
  summaryIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  summaryCardLabel: {
    fontSize: Typography.xs,
    color: Colors.muted,
    textAlign: "center",
  },
  summaryCardValue: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.teal,
  },

  // CTA
  cta: {
    width: "100%",
    marginBottom: Spacing.md,
  },
  hint: {
    fontSize: Typography.xs,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: Spacing.sm,
  },
});
