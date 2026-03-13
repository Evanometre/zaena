// onboarding/services/locationService.ts
import { supabase } from '@/lib/supabase';

export interface Location {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  timezone: string;
  created_at?: string;
}

export interface CreateLocationPayload {
  organization_id: string;
  name: string;
  address?: string;
  timezone: string;
}

/**
 * Create a new location for the given organization.
 *
 * Note: the `auto_grant_location_access` trigger fires automatically on INSERT,
 * so the creating user is granted access without any extra steps here.
 *
 * RLS requires `locations.create` permission on the org.
 */
export async function createLocation(
  payload: CreateLocationPayload
): Promise<Location> {
  const { data, error } = await supabase
    .from('locations')
    .insert({
      organization_id: payload.organization_id,
      name: payload.name.trim(),
      address: payload.address?.trim() ?? null,
      timezone: payload.timezone,
    })
    .select('id, organization_id, name, address, timezone, created_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Could not create location');
  }

  return data as Location;
}

/**
 * Fetch all locations for the current user's org.
 * Useful for pre-populating selectors after onboarding.
 */
export async function getLocations(organizationId: string): Promise<Location[]> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, organization_id, name, address, timezone, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Location[];
}