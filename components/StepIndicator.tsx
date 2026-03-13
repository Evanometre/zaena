import React from "react";
import { StyleSheet, View } from "react-native";

interface StepIndicatorProps {
  totalSteps: number;
  currentStep: number; // 1-indexed
}

/**
 * Renders a row of dots/segments indicating onboarding progress.
 * Completed steps are filled, the current step is accented, future steps are dim.
 */
export function StepIndicator({ totalSteps, currentStep }: StepIndicatorProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNumber = i + 1;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;

        return (
          <View
            key={stepNumber}
            style={[
              styles.segment,
              isCompleted && styles.segmentCompleted,
              isCurrent && styles.segmentCurrent,
              stepNumber < totalSteps && styles.segmentWithGap,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  segment: {
    height: 4,
    flex: 1,
    borderRadius: 2,
    backgroundColor: "#E5E7EB", // gray-200 — future step
  },
  segmentWithGap: {
    marginRight: 6,
  },
  segmentCompleted: {
    backgroundColor: "#6366F1", // indigo-500 — completed
  },
  segmentCurrent: {
    backgroundColor: "#6366F1", // indigo-500 — current (same color, can animate if desired)
    opacity: 0.85,
  },
});
