// stores/authStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import supabase from "../lib/supabase";

export type BusinessType = "business_name" | "registered_company";

export type OnboardingStep =
  | "auth_created"
  | "profile_created"
  | "org_created"
  | "employee_created"
  | "role_assigned"
  | "product_created"
  | "location_created"
  | "complete";

interface AuthState {
  user: any | null;
  session: any | null;
  organizationId: string | null;
  businessType: BusinessType | null;
  onboardingStep: OnboardingStep | null;
  loading: boolean;
  ready: boolean;

  initialize: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshOrgData: () => Promise<void>;
  setOnboardingStep: (step: OnboardingStep) => void;
}

// ── Auth listener cleanup ─────────────────────────────────────────────────────
// Kept outside the store so it survives across initialize() calls.
// Every call to initialize() tears down the previous listener before
// registering a new one — prevents listener accumulation across hot reloads
// and double-invocations from _layout.tsx.
let _authListenerUnsub: (() => void) | null = null;

// ── Initialize guard ──────────────────────────────────────────────────────────
// Prevents initialize() from running concurrently if called twice in quick
// succession (e.g. both onFinishHydration and hasHydrated() firing).
let _initializingPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:           null,
      session:        null,
      organizationId: null,
      businessType:   null,
      onboardingStep: null,
      loading:        false,
      ready:          false,

      initialize: async () => {
        // If already initializing, return the same promise — don't start a second run
        if (_initializingPromise) return _initializingPromise;

        _initializingPromise = (async () => {
          try {
            // Tear down any existing auth listener before creating a new one.
            // This is the critical fix — without this, every initialize() call
            // stacks another listener on top of the previous ones.
            if (_authListenerUnsub) {
              _authListenerUnsub();
              _authListenerUnsub = null;
            }

            const { data: { session } } = await supabase.auth.getSession();
            set({ session, user: session?.user ?? null });

            if (session?.user) {
              await get().refreshOrgData();
            }
          } catch (err) {
            console.error("[authStore] initialize error:", err);
          } finally {
            set({ ready: true });
            // Release the guard so future explicit re-initializations (e.g.
            // after sign-out) are allowed. We set it to null here so the next
            // call to initialize() starts fresh.
            _initializingPromise = null;
          }

          // Register auth listener AFTER ready is set.
          // Store the unsub so we can clean it up next time.
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
              set({ session, user: session?.user ?? null });

              if (!session?.user) {
                set({
                  organizationId: null,
                  businessType:   null,
                  onboardingStep: null,
                });
                return;
              }

              if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
                await get().refreshOrgData();
              }
            }
          );

          _authListenerUnsub = () => subscription.unsubscribe();
        })();

        return _initializingPromise;
      },

      refreshOrgData: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        set({ user });

        try {
          const { data: userRole, error: roleError } = await supabase
            .from("user_roles")
            .select("role_id, roles(id, organization_id, name)")
            .eq("user_id", user.id)
            .maybeSingle();

          if (roleError) {
            console.error("[refreshOrgData] DB error:", roleError.message);
            return;
          }

          if (!userRole?.roles) {
            set({ organizationId: null, onboardingStep: "auth_created" });
            return;
          }

          const role = userRole.roles as any;
          const orgId = role.organization_id;

          const { data: org } = await supabase
            .from("organizations")
            .select("business_type")
            .eq("id", orgId)
            .single();

          const { data: progress } = await supabase
            .from("signup_progress")
            .select("step")
            .eq("user_id", user.id)
            .single();

          set({
            organizationId: orgId,
            businessType:   (org?.business_type as BusinessType) ?? null,
            onboardingStep: (progress?.step as OnboardingStep) ?? "complete",
          });

        } catch (err) {
          console.error("[authStore] refreshOrgData error:", err);
        }
      },

      signUp: async (email, password) => {
        set({ loading: true });
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: "https://toledah.com/auth/callback" },
          });
          if (error) return { error };
          if (!data.user) return { error: new Error("No user returned") };
          return { error: null };
        } catch (err: any) {
          return { error: err };
        } finally {
          set({ loading: false });
        }
      },

      signIn: async (email, password) => {
        set({ loading: true });
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) return { error };
          set({ session: data.session, user: data.user });
          await get().refreshOrgData();
          return { error: null };
        } catch (err: any) {
          return { error: err };
        } finally {
          set({ loading: false });
        }
      },

      signOut: async () => {
        set({ loading: true });

        // Clean up the auth listener before signing out
        if (_authListenerUnsub) {
          _authListenerUnsub();
          _authListenerUnsub = null;
        }

        await supabase.auth.signOut();
        try {
          const { GoogleSignin } = await import(
            "@react-native-google-signin/google-signin"
          );
          await GoogleSignin.signOut();
        } catch {}

        set({
          user:           null,
          session:        null,
          organizationId: null,
          businessType:   null,
          onboardingStep: null,
          loading:        false,
          ready:          false,
        });
      },

      setOnboardingStep: (step) => set({ onboardingStep: step }),
    }),
    {
      name:    "zaena-auth-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        organizationId: state.organizationId,
        businessType:   state.businessType,
        onboardingStep: state.onboardingStep,
      }),
    }
  )
);