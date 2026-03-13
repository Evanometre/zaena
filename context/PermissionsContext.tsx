//app/context/PermissionsContext.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import supabase from "../lib/supabase";

const PERMISSIONS_CACHE_KEY = "zaena-permissions-cache";

interface PermissionsContextType {
  permissions: string[];
  hasPermission: (perm: string) => boolean;
  loading: boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(
  undefined,
);

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCachedPermissions = async () => {
    try {
      const cached = await AsyncStorage.getItem(PERMISSIONS_CACHE_KEY);
      if (cached) {
        setPermissions(JSON.parse(cached));
        setLoading(false); // ← unblocks the UI immediately from cache
      }
    } catch {}
  };

  const fetchPermissions = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setPermissions([]);
        await AsyncStorage.removeItem(PERMISSIONS_CACHE_KEY);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("effective_user_permissions")
        .select("permission_name")
        .eq("user_id", user.id)
        .eq("has_access", true);

      if (error) throw error;

      const perms = data?.map((p) => p.permission_name) || [];
      setPermissions(perms);
      // Cache to AsyncStorage for offline use
      await AsyncStorage.setItem(PERMISSIONS_CACHE_KEY, JSON.stringify(perms));

      console.log("[permissions] fetched & cached:", perms.length);
    } catch (e) {
      console.warn("[permissions] fetch failed, using cache:", e);
      // Don't clear permissions — keep cached ones if network fails
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Load cache immediately (unblocks UI)
    loadCachedPermissions().then(() => {
      // 2. Then refresh from network in background
      fetchPermissions();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        fetchPermissions();
      }
      if (event === "SIGNED_OUT") {
        setPermissions([]);
        AsyncStorage.removeItem(PERMISSIONS_CACHE_KEY);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const hasPermission = (perm: string) => permissions.includes(perm);

  return (
    <PermissionsContext.Provider
      value={{
        permissions,
        hasPermission,
        loading,
        refreshPermissions: fetchPermissions,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context)
    throw new Error("usePermissions must be used within a PermissionsProvider");
  return context;
};
