import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { invite_token, full_name, password } = await req.json();

    // --- Input validation ---
    if (!invite_token || typeof invite_token !== "string" || invite_token.length !== 64) {
      return Response.json(
        { success: false, error: "Invalid invite token" },
        { status: 400, headers: corsHeaders }
      );
    }
    if (!full_name || full_name.trim().length < 2) {
      return Response.json(
        { success: false, error: "Full name is required" },
        { status: 400, headers: corsHeaders }
      );
    }
    if (!password || password.length < 8) {
      return Response.json(
        { success: false, error: "Password must be at least 8 characters" },
        { status: 400, headers: corsHeaders }
      );
    }

    // --- Admin client (service role — never exposed to browser) ---
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // --- Pre-flight: check invite is valid BEFORE creating the auth user ---
    // This avoids creating orphaned auth users for bad tokens
    const { data: invite, error: inviteCheckError } = await adminClient
      .from("user_invites")
      .select("id, email, expires_at, status")
      .eq("invite_token", invite_token)
      .single();

    if (inviteCheckError || !invite) {
      return Response.json(
        { success: false, error: "Invite not found" },
        { status: 404, headers: corsHeaders }
      );
    }
    if (invite.status !== "pending") {
      return Response.json(
        { success: false, error: "This invite has already been used or revoked" },
        { status: 409, headers: corsHeaders }
      );
    }
    if (new Date(invite.expires_at) < new Date()) {
      return Response.json(
        { success: false, error: "This invite has expired. Please ask your admin to resend it." },
        { status: 410, headers: corsHeaders }
      );
    }

    // --- Create auth user via admin API (bypasses email confirmation) ---
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true, // Mark as confirmed — invite email proved ownership
      user_metadata: { full_name: full_name.trim() },
    });

    if (authError) {
      // Handle the case where they already have an account
      if (authError.message?.includes("already been registered")) {
        return Response.json(
          { success: false, error: "An account with this email already exists. Please sign in to your existing account." },
          { status: 409, headers: corsHeaders }
        );
      }
      return Response.json(
        { success: false, error: authError.message },
        { status: 400, headers: corsHeaders }
      );
    }

    const newUserId = authData.user.id;

    // --- Call accept_user_invite RPC ---
    // This atomically: claims the token, creates profile, assigns roles + locations
    const { data: rpcData, error: rpcError } = await adminClient.rpc("accept_user_invite", {
      p_invite_token: invite_token,
      p_user_id: newUserId,
      p_full_name: full_name.trim(),
    });

    if (rpcError || !rpcData?.[0]?.success) {
      // ORPHAN CLEANUP: RPC failed after user was created — delete the auth user
      await adminClient.auth.admin.deleteUser(newUserId);

      const errorMessage = rpcData?.[0]?.error || rpcError?.message || "Failed to link account to organization";
      return Response.json(
        { success: false, error: errorMessage },
        { status: 500, headers: corsHeaders }
      );
    }

    // --- All good ---
    return Response.json(
      { success: true },
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    console.error("Unexpected error in accept-invite:", err);
    return Response.json(
      { success: false, error: "An unexpected error occurred. Please try again." },
      { status: 500, headers: corsHeaders }
    );
  }
});