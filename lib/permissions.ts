// lib/permission.ts
import supabase from "./supabase";

/**
 * Check if current user has a specific permission
 */
export async function hasPermission(permissionName: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase.rpc("user_has_permission", {
      p_user_id: user.id,
      p_permission_name: permissionName,
    });

    if (error) {
      console.error("Permission check error:", error);
      return false;
    }

    return data || false;
  } catch (error) {
    console.error("Permission check error:", error);
    return false;
  }
}

/**
 * Get all permissions for current user
 */
export async function getUserPermissions(): Promise<string[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase.rpc("get_user_permissions", {
      p_user_id: user.id,
    });

    if (error) {
      console.error("Get permissions error:", error);
      return [];
    }

    return data?.map((row: any) => row.permission_name) || [];
  } catch (error) {
    console.error("Get permissions error:", error);
    return [];
  }
}

/**
 * Check if current user is Owner
 */
export async function isOwner(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);

    return roles?.some((r: any) => r.roles?.name === "Owner") || false;
  } catch (error) {
    console.error("Owner check error:", error);
    return false;
  }
}

/**
 * Get user's accessible location IDs
 */
export async function getUserLocations(
  accessType: "read" | "write" = "write",
): Promise<string[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase.rpc("get_user_locations", {
      p_user_id: user.id,
      p_access_type: accessType,
    });

    if (error) {
      console.error("Get user locations error:", error);
      return [];
    }

    return data?.map((row: any) => row.location_id) || [];
  } catch (error) {
    console.error("Get user locations error:", error);
    return [];
  }
}

/**
 * Check if user can access a specific location
 */
export async function canAccessLocation(
  locationId: string,
  accessType: "read" | "write" = "write",
): Promise<boolean> {
  const locations = await getUserLocations(accessType);
  return locations.includes(locationId);
}
