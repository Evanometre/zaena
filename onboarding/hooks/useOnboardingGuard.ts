import { useAuthStore } from '@/stores/authStore';
import { useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import supabase from '../../lib/supabase';
import {
  getOnboardingRedirectPath
} from '../utility/onboardingHelpers';

type GuardState = 'loading' | 'onboarding' | 'app';

// Singleton so any component can trigger a re-fetch
let externalRefresh: (() => void) | null = null;

/**
 * Call this before navigating to /(onboarding) from outside the guard
 * (e.g. from the Settings "Redo Setup" button) to force the guard to
 * re-read onboarding_step from the DB instead of using its cached value.
 */
export function refreshOnboardingGuard() {
  externalRefresh?.();
}

export function useOnboardingGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { user, initialized, hydrated, organizationId } = useAuthStore();
  const [guardState, setGuardState] = useState<GuardState>('loading');
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const lastRedirect = useRef<string | null>(null);
  const segmentsKey = segments.join('/');

  const fetchStep = useCallback(async () => {
    if (!organizationId) return;
    const { data, error } = await supabase
      .from('organizations')
      .select('onboarding_step')
      .eq('id', organizationId)
      .single();
    if (!error && data) {
      setOnboardingStep(data.onboarding_step ?? 0);
      // Reset last redirect so the guard will act on the new step
      lastRedirect.current = null;
    }
  }, [organizationId]);

  // Register the refresh function so Settings can call it
  useEffect(() => {
    externalRefresh = fetchStep;
    return () => { externalRefresh = null; };
  }, [fetchStep]);

  // Fetch on mount and whenever organizationId changes
  useEffect(() => {
    fetchStep();
  }, [fetchStep]);

  useEffect(() => {
  if (!hydrated || !initialized) return;
    if (!user) {
      setGuardState('loading');
      return;
    }
    if (onboardingStep === null) return;

    const currentSegment = segments[0] as string;
    const inAuthGroup = currentSegment === 'auth';
    const inOnboardingGroup = currentSegment === '(onboarding)';
    const complete = onboardingStep >= 5;

    if (complete) {
      if (inAuthGroup || inOnboardingGroup) {
        const target = '/(tabs)';
        if (lastRedirect.current !== target) {
          lastRedirect.current = target;
          router.replace(target);
        }
      }
      setGuardState('app');
    } else {
      const targetPath = getOnboardingRedirectPath(onboardingStep);
      const currentPath = '/' + segmentsKey;
      if (currentPath !== targetPath && lastRedirect.current !== targetPath) {
        lastRedirect.current = targetPath;
        router.replace(targetPath as any);
      }
      setGuardState('onboarding');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, hydrated, user, onboardingStep, segmentsKey]);

  return { guardState };
}
