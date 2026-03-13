// file: lib/usePermissions.ts 
import { useEffect, useState } from 'react';
import supabase from '../lib/supabase';

export function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPermissions() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // We query the view we created to get the final truth
      const { data } = await supabase
        .from('effective_user_permissions')
        .select('permission_name')
        .eq('user_id', user.id)
        .eq('has_access', true);

      if (data) {
        setPermissions(data.map(p => p.permission_name));
      }
      setLoading(false);
    }

    loadPermissions();
  }, []);

  const hasPermission = (perm: string) => permissions.includes(perm);

  return { hasPermission, loading };
}