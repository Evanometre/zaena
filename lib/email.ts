// lib/email.ts
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

interface SendInviteEmailParams {
  to: string;
  organizationName: string;
  inviterName: string;
  inviteUrl: string;
  personalMessage?: string;
  expiresInDays?: number;
}

export async function sendInviteEmail(params: SendInviteEmailParams) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/send-invite-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(params),
      }
    );

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to send email');
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error sending invite email:', error);
    return { success: false, error: error.message };
  }
}