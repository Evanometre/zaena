import supabase from '@/lib/supabase';

export interface Organization {
  id: string;
  name?: string;
  timezone: string | null;
  currency: string | null;
}

export interface UpdateOrgSettingsPayload {
  timezone?: string;
  currency?: string;
  onboarding_step?: number;
  onboarding_product_id?: string;
  onboarding_location_id?: string;
}

/**
 * Fetch the organization by its ID directly.
 * Pass organizationId from useAuthStore — avoids the user_profiles
 * join that was returning multiple rows and breaking .single().
 */
export async function getOrganization(organizationId: string): Promise<Organization> {
  const { data, error } = await supabase
    .from('organizations')
      .select("id, name, business_type, currency, timezone, country_code")
    .eq('id', organizationId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update org-level settings.
 */
export async function updateOrgSettings(
  orgId: string,
  payload: Partial<{ timezone: string; currency: string }>
): Promise<Organization> {
  const { data, error } = await supabase
    .from("organizations")
    .update(payload)
    .eq("id", orgId)
    .select("id, name, timezone, currency, country_code")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not update organization settings");
  return data as Organization;
}