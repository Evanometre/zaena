import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      to,
      organizationName,
      inviterName,
      inviteUrl,
      personalMessage,
      expiresInDays = 7,
    } = await req.json();

    // Input validation
    if (!to || !organizationName || !inviterName || !inviteUrl) {
      return Response.json(
        { success: false, error: "Missing required fields" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return Response.json(
        { success: false, error: "Invalid email address" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate inviteUrl starts with your domain (prevents abuse)
    if (!inviteUrl.startsWith("https://toledah.com/register?token=")) {
      return Response.json(
        { success: false, error: "Invalid invite URL" },
        { status: 400, headers: corsHeaders }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY secret is not set");
      return Response.json(
        { success: false, error: "Email service not configured" },
        { status: 500, headers: corsHeaders }
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "ZAENA <hello@toledah.com>",
        to: [to],
        subject: `${inviterName} invited you to join ${organizationName} on ZAENA`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join ${organizationName} on ZAENA</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

  <div style="background: #e85a2a; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px; letter-spacing: -0.5px;">ZAENA</h1>
  </div>

  <div style="background: #ffffff; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">You've been invited!</h2>

    <p style="font-size: 16px; color: #4b5563;">
      <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on ZAENA.
    </p>

    ${personalMessage ? `
      <div style="background: #fdf2ee; padding: 15px; border-left: 3px solid #e85a2a; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0; color: #6b7280; font-style: italic;">"${personalMessage}"</p>
      </div>
    ` : ""}

    <p style="font-size: 16px; color: #4b5563;">
      ZAENA is a modern point-of-sale and inventory management system. Get started by creating your account:
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}"
         style="background: #e85a2a; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
        Accept Invitation
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
      Or copy and paste this link into your browser:<br>
      <a href="${inviteUrl}" style="color: #e85a2a; word-break: break-all;">
        ${inviteUrl}
      </a>
    </p>

    <p style="font-size: 13px; color: #9ca3af;">
      This invite expires in ${expiresInDays} day${expiresInDays !== 1 ? "s" : ""}.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
      This invitation was sent to ${to}. If you didn't expect this email, you can safely ignore it.
    </p>
  </div>

</body>
</html>`,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Resend error:", error);
      return Response.json(
        { success: false, error: error.message || "Failed to send email" },
        { status: 502, headers: corsHeaders }
      );
    }

    return Response.json(
      { success: true },
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    console.error("Unexpected error in send-invite-email:", err);
    return Response.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500, headers: corsHeaders }
    );
  }
});