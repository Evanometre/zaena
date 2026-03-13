// supabase/functions/signup/index.ts
//
// Called immediately after supabase.auth.signUp() succeeds on the frontend.
// Also called after SSO (Google/Apple) for new users.
//
// Responsibilities:
//   1. Verify the user's JWT
//   2. Create initial signup_progress record
//   3. Call complete_user_onboarding() — atomic Postgres transaction
//   4. Return org_id, employee_id, role_id to the frontend

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --------------------------------------------------------
    // 1. VERIFY USER JWT
    // --------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse(401, "Missing authorization header");
    }

    // User-scoped client — respects RLS
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Service role client — bypasses RLS for trusted writes
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return errorResponse(401, "Invalid or expired token");
    }

    // --------------------------------------------------------
    // 2. PARSE REQUEST BODY
    // --------------------------------------------------------
    const body = await req.json();
    const {
      full_name,
      org_name,
      business_type,
      country_code = "NG",
      currency = "NGN",
      timezone = "Africa/Lagos",
      accounting_method = "cash",
    } = body;

    // Validate required fields
    if (!full_name || !org_name || !business_type) {
      return errorResponse(400, "full_name, org_name, and business_type are required");
    }

    const validBusinessTypes = ["business_name", "registered_company"];
    if (!validBusinessTypes.includes(business_type)) {
      return errorResponse(400, `business_type must be one of: ${validBusinessTypes.join(", ")}`);
    }

    // --------------------------------------------------------
    // 3. CHECK IF ALREADY ONBOARDED (idempotency guard)
    // Handles cases where the user retries after a partial failure.
    // --------------------------------------------------------
    const { data: existingProgress } = await supabaseAdmin
      .from("signup_progress")
      .select("step")
      .eq("user_id", user.id)
      .single();

    if (existingProgress?.step === "complete") {
      return successResponse({ message: "Already onboarded", already_complete: true });
    }

    // --------------------------------------------------------
    // 4. CREATE INITIAL PROGRESS RECORD
    // Only insert if it doesn't exist yet.
    // For SSO users, this may already exist from a previous attempt.
    // --------------------------------------------------------
    await supabaseAdmin
      .from("signup_progress")
      .upsert(
        { user_id: user.id, step: "auth_created" },
        { onConflict: "user_id", ignoreDuplicates: true }
      );

    // --------------------------------------------------------
    // 5. CALL THE ATOMIC ONBOARDING TRANSACTION
    // This creates: user_profile, organization, organization_settings,
    // employee, Owner role, user_role assignment.
    // If anything fails, Postgres rolls back everything.
    // --------------------------------------------------------
    const { data: onboardingResult, error: onboardingError } = await supabaseAdmin
      .rpc("complete_user_onboarding", {
        p_user_id:           user.id,
        p_full_name:         full_name,
        p_org_name:          org_name,
        p_business_type:     business_type,
        p_country_code:      country_code,
        p_currency:          currency,
        p_timezone:          timezone,
        p_accounting_method: accounting_method,
      });

    if (onboardingError) {
      console.error("Onboarding transaction failed:", onboardingError);
      return errorResponse(500, "Failed to complete onboarding setup", onboardingError.message);
    }

    // --------------------------------------------------------
    // 6. RETURN SUCCESS
    // Frontend uses org_id to set up local state,
    // then navigates to the onboarding wizard
    // (create first product → create first location).
    // --------------------------------------------------------
    return successResponse({
      message:     "Onboarding initialised",
      user_id:     user.id,
      org_id:      onboardingResult.org_id,
      employee_id: onboardingResult.employee_id,
      role_id:     onboardingResult.role_id,
      next_step:   "create_product",
    });

  } catch (err) {
    console.error("Unexpected error in signup function:", err);
    return errorResponse(500, "An unexpected error occurred");
  }
});

// --------------------------------------------------------
// HELPERS
// --------------------------------------------------------
function successResponse(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, message: string, detail?: string): Response {
  return new Response(
    JSON.stringify({ error: message, ...(detail ? { detail } : {}) }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}