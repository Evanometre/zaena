// onboarding/hooks/useOrganization.ts
import { useAuthStore } from '@/stores/authStore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getOrganization,
  updateOrgSettings,
  type Organization,
  type UpdateOrgSettingsPayload,
} from '../services/organizationService';

interface UseOrganizationResult {
  org: Organization | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  update: (payload: UpdateOrgSettingsPayload) => Promise<Organization>;
}

export function useOrganization(): UseOrganizationResult {
  const { organizationId } = useAuthStore();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchOrg = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await getOrganization(organizationId);
      if (mountedRef.current) setOrg(data);
    } catch (err) {
      if (mountedRef.current)
        setError(err instanceof Error ? err.message : 'Failed to load organization');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const update = useCallback(
    async (payload: UpdateOrgSettingsPayload): Promise<Organization> => {
      if (!org) throw new Error('Organization not loaded');
      const optimistic: Organization = { ...org, ...payload };
      setOrg(optimistic);
      try {
        const updated = await updateOrgSettings(org.id, payload);
        setOrg(updated);
        return updated;
      } catch (err) {
        setOrg(org);
        throw err;
      }
    },
    [org]
  );

  return { org, loading, error, refresh: fetchOrg, update };
}