// lib/services/auth.service.ts
//
// Frontend auth service for Expo / React Native.
// Handles email/password signup, SSO (Google, Apple),
// login, and onboarding resume logic.
//
// Usage:
//   import { AuthService } from '@/lib/services/auth.service'

import { supabase } from "@/lib/supabase"; // your supabase client

// ============================================================
// TYPES
// ============================================================

export type BusinessType = "business_name" | "registered_company";

export interface SignupPayload {
  email: string;
  password: string;
  full_name: string;
  org_name: string;
  business_type: BusinessType;
  country_code?: string;
  currency?: string;
  timezone?: string;
  accounting_method?: "cash" | "accrual";
}

export interface OnboardingPayload {
  product_id: string;
  location_id: string;
}

export type OnboardingStep =
  | "auth_created"
  | "profile_created"
  | "org_created"
  | "employee_created"
  | "role_assigned"
  | "product_created"
  | "location_created"
  | "complete";

// ============================================================
// AUTH SERVICE
// ============================================================

export const AuthService = {

  // ----------------------------------------------------------
  // EMAIL / PASSWORD SIGNUP
  // ----------------------------------------------------------
  async signUp(payload: SignupPayload) {
    const { email, password, ...onboardingData } = payload;

    // Step 1: Create auth record
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;
    if (!authData.session) {
      // Email confirmation required — tell the user
      return { needs_email_confirmation: true };
    }

    // Step 2: Call Edge Function to complete onboarding setup
    const result = await AuthService._callSignupFunction(onboardingData);
    return result;
  },

  // ----------------------------------------------------------
  // GOOGLE SSO
  // ----------------------------------------------------------
  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Deep link back into your Expo app
        redirectTo: "yourapp://auth/callback",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) throw error;
    return data;
    // After redirect, handleOAuthCallback() is called
  },

  // ----------------------------------------------------------
  // APPLE SSO
  // ----------------------------------------------------------
  async signInWithApple() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: "yourapp://auth/callback",
      },
    });

    if (error) throw error;
    return data;
    // After redirect, handleOAuthCallback() is called
  },

  // ----------------------------------------------------------
  // OAUTH CALLBACK HANDLER
  // Call this from your deep link handler in Expo.
  // Determines if this is a new user (needs onboarding) or
  // returning user (go to dashboard).
  // ----------------------------------------------------------
  async handleOAuthCallback(session: any) {
    if (!session) throw new Error("No session in OAuth callback");

    const step = await AuthService.getOnboardingStep();

    if (step === null) {
      // Brand new SSO user — no signup_progress record yet
      // They still need to provide org name + business type
      return { status: "new_user", needs_onboarding_info: true };
    }

    if (step === "complete") {
      return { status: "returning_user", redirect_to: "dashboard" };
    }

    // Partially onboarded — resume from where they left off
    return { status: "incomplete", current_step: step };
  },

  // ----------------------------------------------------------
  // COMPLETE SSO ONBOARDING
  // Called after new SSO user provides their org info.
  // ----------------------------------------------------------
  async completeSSOOnboarding(payload: Omit<SignupPayload, "email" | "password">) {
    return AuthService._callSignupFunction(payload);
  },

  // ----------------------------------------------------------
  // EMAIL / PASSWORD LOGIN
  // ----------------------------------------------------------
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Check onboarding status on every login
    const step = await AuthService.getOnboardingStep();

    if (!step || step !== "complete") {
      return { session: data.session, redirect_to: "onboarding", current_step: step };
    }

    return { session: data.session, redirect_to: "dashboard" };
  },

  // ----------------------------------------------------------
  // SIGN OUT
  // ----------------------------------------------------------
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // ----------------------------------------------------------
  // GET ONBOARDING STEP
  // Call this on app start / login to know where to send the user.
  // Returns null if no record exists yet (brand new SSO user).
  // ----------------------------------------------------------
  async getOnboardingStep(): Promise<OnboardingStep | null> {
    const { data, error } = await supabase
      .from("signup_progress")
      .select("step")
      .single();

    if (error || !data) return null;
    return data.step as OnboardingStep;
  },

  // ----------------------------------------------------------
  // COMPLETE ONBOARDING WIZARD
  // Called after user creates their first product + location.
  // ----------------------------------------------------------
  async completeOnboarding(payload: OnboardingPayload) {
    const session = await AuthService._getSession();

    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/complete-onboarding`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to complete onboarding");
    return result;
  },

  // ----------------------------------------------------------
  // PRIVATE: CALL SIGNUP EDGE FUNCTION
  // ----------------------------------------------------------
  async _callSignupFunction(payload: object) {
    const session = await AuthService._getSession();

    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/signup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Signup failed");
    return result;
  },

  // ----------------------------------------------------------
  // PRIVATE: GET CURRENT SESSION (throws if not authenticated)
  // ----------------------------------------------------------
  async _getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) throw new Error("Not authenticated");
    return session;
  },
};