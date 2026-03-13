//lib/services/googleAuth.ts
// Handles Google Sign In on native platforms.
// On web, the Supabase client handles everything via the "google" provider, so this module is a no-op.
import supabase from "@/lib/supabase";
import { Platform, TurboModuleRegistry } from "react-native";

// TurboModuleRegistry.get returns null if not found (safe)
// TurboModuleRegistry.getEnforcing throws — that's what's crashing you
const isGoogleSignInAvailable = (): boolean =>
  !!TurboModuleRegistry.get("RNGoogleSignin");

export function configureGoogleSignIn() {
  if (!isGoogleSignInAvailable()) {
    console.warn("[googleAuth] Native Google Sign In not available in this build");
    return;
  }
  const { GoogleSignin } = require("@react-native-google-signin/google-signin");
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
    offlineAccess: true,
  });
}

export type GoogleSignInResult =
  | { success: true; isNewUser: boolean; userId: string }
  | { success: false; error: string; cancelled?: boolean };

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
    if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) return { success: false, error: error.message };
    // Page will redirect — no return value needed
    return { success: true, isNewUser: false, userId: '' };
  }
  
  if (!isGoogleSignInAvailable()) {
    console.warn("[googleAuth] Native Google Sign In not available in this build");
    return { success: false, error: "Google Sign In not available", cancelled: true };
  }

  const { GoogleSignin, statusCodes } =
    require("@react-native-google-signin/google-signin");

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();

    const idToken = userInfo.data?.idToken;
    if (!idToken) return { success: false, error: "No ID token returned from Google" };

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });

    if (error) return { success: false, error: error.message };
    if (!data.user) return { success: false, error: "No user returned from Supabase" };

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("id", data.user.id)
      .single();

    return { success: true, isNewUser: !profile, userId: data.user.id };

  } catch (error: any) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      return { success: false, error: "Sign in cancelled", cancelled: true };
    }
    if (error.code === statusCodes.IN_PROGRESS) {
      return { success: false, error: "Sign in already in progress" };
    }
    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { success: false, error: "Google Play Services not available" };
    }
    return { success: false, error: error.message ?? "Google sign in failed" };
  }
}

export async function signOutGoogle() {
  if (!isGoogleSignInAvailable()) return;
  const { GoogleSignin } = require("@react-native-google-signin/google-signin");
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
}