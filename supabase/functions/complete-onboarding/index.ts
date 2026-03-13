// supabase/functions/complete-onboarding/index.ts
//
// Called after the user creates their first product and first location
// in the onboarding wizard. This is the final step before the dashboard.
//
// Responsibilities:
//   1. Verify the user's JWT
//   2. Validate that the product and location belong to the user's org
//   3. Call complete_onboarding_setup() — marks signup as complete
//   4. Return confirmation to redirect to dashboard

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
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

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return errorResponse(401, "Invalid or expired token");
    }

    // --------------------------------------------------------
    // 2. PARSE AND VALIDATE REQUEST BODY
    // --------------------------------------------------------
    const body = await req.json();
    const { product_id, location_id } = body;

    if (!product_id || !location_id) {
      return errorResponse(400, "product_id and location_id are required");
    }

    // --------------------------------------------------------
    // 3. CHECK SIGNUP PROGRESS
    // Must be in a state where onboarding has started but not finished.
    // Prevents this endpoint being called out of order.
    // --------------------------------------------------------
    const { data: progress, error: progressError } = await supabaseAdmin
      .from("signup_progress")
      .select("step")
      .eq("user_id", user.id)
      .single();

    if (progressError || !progress) {
      return errorResponse(400, "No onboarding session found. Complete signup first.");
    }

    if (progress.step === "complete") {
      return successResponse({ message: "Already complete", already_complete: true });
    }

    const validStates = ["role_assigned", "product_created", "location_created"];
    if (!validStates.includes(progress.step)) {
      return errorResponse(400, `Cannot complete onboarding from step: ${progress.step}. Complete signup first.`);
    }

    // --------------------------------------------------------
    // 4. VERIFY PRODUCT AND LOCATION BELONG TO USER'S ORG
    // Security check — prevents a user passing in IDs from
    // another organisation.
    // --------------------------------------------------------
    const { data: userRole } = await supabaseAdmin
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (!userRole) {
      return errorResponse(400, "User has no organisation assigned.");
    }

    const orgId = userRole.organization_id;

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("id", product_id)
      .eq("organization_id", orgId)
      .single();

    if (!product) {
      return errorResponse(403, "Product does not belong to your organisation.");
    }

    const { data: location } = await supabaseAdmin
      .from("locations")
      .select("id")
      .eq("id", location_id)
      .eq("organization_id", orgId)
      .single();

    if (!location) {
      return errorResponse(403, "Location does not belong to your organisation.");
    }

    // --------------------------------------------------------
    // 5. COMPLETE ONBOARDING
    // Saves product + location references, grants location access,
    // marks signup_progress as 'complete'.
    // --------------------------------------------------------
    const { error: completeError } = await supabaseAdmin
      .rpc("complete_onboarding_setup", {
        p_user_id:     user.id,
        p_product_id:  product_id,
        p_location_id: location_id,
      });

    if (completeError) {
      console.error("Failed to complete onboarding:", completeError);
      return errorResponse(500, "Failed to finalise onboarding", completeError.message);
    }

    // --------------------------------------------------------
    // 6. RETURN SUCCESS → FRONTEND NAVIGATES TO DASHBOARD
    // --------------------------------------------------------
    return successResponse({
      message:      "Onboarding complete",
      org_id:       orgId,
      redirect_to:  "dashboard",
    });

  } catch (err) {
    console.error("Unexpected error in complete-onboarding function:", err);
    return errorResponse(500, "An unexpected error occurred");
  }
});

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