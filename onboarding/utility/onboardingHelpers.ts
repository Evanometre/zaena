import type { Organization } from '../services/organizationService';

/**
 * onboarding/utility/onboardingHelpers.ts
 * The total number of onboarding steps (not counting the complete screen).
 */
export const ONBOARDING_TOTAL_STEPS = 4;

/**
 * Maps an onboarding_step value to the Expo Router path to redirect to.
 * Step 0 → not started → send to step 1
 * Step 1 → timezone done → send to step 2
 * etc.
 * Step 5 → complete → send to the main app
 */
export function getOnboardingRedirectPath(
  onboardingStep: number
): string {
  if (onboardingStep >= 5) return '/(tabs)';        // main app — adjust to your actual home route
  if (onboardingStep === 4) return '/(onboarding)/complete';
  if (onboardingStep >= 1) return `/(onboarding)/step-${onboardingStep + 1}`;
  return '/(onboarding)/step-1';
}

/**
 * Returns true if the org has fully completed onboarding.
 */
export function isOnboardingComplete(org: Organization): boolean {
  return org.onboarding_step >= 5;
}

/**
 * Returns true if the org has started but not finished onboarding.
 */
export function isOnboardingInProgress(org: Organization): boolean {
  return org.onboarding_step > 0 && org.onboarding_step < 5;
}

/**
 * Returns true if the org has never started onboarding.
 */
export function isOnboardingPristine(org: Organization): boolean {
  return org.onboarding_step === 0;
}

/**
 * Returns the display number for the current onboarding step (1-indexed).
 * e.g. step-2 screen → user sees "Step 2 of 4"
 */
export function getStepDisplayNumber(routeStep: number): string {
  return `Step ${routeStep} of ${ONBOARDING_TOTAL_STEPS}`;
}