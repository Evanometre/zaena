//file: app/settingsg/users.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import { sendInviteEmail } from "../../lib/email";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

// 1. Fix the User interface — remove organization_id, it doesn't exist
interface User {
  id: string;
  full_name: string;
  created_at: string;
  user_roles: {
    roles: {
      id: string;
      name: string;
    } | null;
  }[];
  overrides?: PermissionOverride[];
}

interface Role {
  id: string;
  name: string;
  description: string;
  is_system_role: boolean;
}

interface PermissionOverride {
  permission_name: string;
  override_type: "add" | "subtract";
}

interface Location {
  id: string;
  name: string;
}

interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string;
}

interface PermissionGroup {
  resource: string;
  permissions: Permission[];
}

export default function UsersManagementScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionGroup[]>([]);
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();

  // Modal states
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);

  // Invite form states
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<
    {
      locationId: string;
      accessType: "read" | "write" | "admin";
    }[]
  >([]);
  const [personalMessage, setPersonalMessage] = useState("");
  const [processingPermission, setProcessingPermission] = useState<
    string | null
  >(null);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  // 2. Fix fetchData — query users via user_roles → user_profiles
  async function fetchData() {
    if (!organizationId) return;
    setLoading(true);
    try {
      // Get all user_roles for this org, with the user profile joined
      const { data: userRolesData, error: urError } = await supabase
        .from("user_roles")
        .select(
          `
        user_id,
        roles!inner ( id, name, organization_id ),
        user_profiles!user_roles_user_id_fkey ( id, full_name, created_at )
      `,
        )
        .eq("roles.organization_id", organizationId);

      if (urError) throw urError;

      // Deduplicate by user_id and group roles per user
      const userMap = new Map<string, User>();
      for (const ur of userRolesData || []) {
        const profile = ur.user_profiles as any;
        if (!profile) continue;
        const userId = profile.id;

        if (!userMap.has(userId)) {
          userMap.set(userId, {
            id: userId,
            full_name: profile.full_name || "Unnamed User",
            created_at: profile.created_at,
            user_roles: [],
            overrides: [],
          });
        }
        userMap.get(userId)!.user_roles.push({ roles: ur.roles as any });
      }

      // Fetch overrides for this org
      const { data: overridesData } = await supabase
        .from("user_permission_overrides")
        .select("user_id, permission_name, override_type")
        .eq("organization_id", organizationId);

      // Attach overrides to users
      const usersArray = Array.from(userMap.values()).map((u) => ({
        ...u,
        overrides: (overridesData || [])
          .filter((o) => o.user_id === u.id)
          .map(({ permission_name, override_type }) => ({
            permission_name,
            override_type,
          })),
      }));

      // Sort by created_at descending
      usersArray.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      setUsers(usersArray);

      const { data: rolesData, error: rolesError } = await supabase
        .from("roles")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");
      if (rolesError) throw rolesError;

      const { data: locationsData, error: locationsError } = await supabase
        .from("locations")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name");
      if (locationsError) throw locationsError;

      const { data: permissionsData, error: permError } = await supabase
        .from("permissions")
        .select("*")
        .order("resource, action");
      if (permError) throw permError;

      const grouped: { [key: string]: Permission[] } = {};
      permissionsData?.forEach((perm) => {
        if (!grouped[perm.resource]) grouped[perm.resource] = [];
        grouped[perm.resource].push(perm);
      });

      setRoles(rolesData || []);
      setLocations(locationsData || []);
      setAllPermissions(
        Object.entries(grouped).map(([resource, permissions]) => ({
          resource,
          permissions,
        })),
      );
    } catch (err: any) {
      console.error("Error fetching users:", err);
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchData();
  }

  function openPermissionsModal(user: User) {
    setSelectedUser(user);
    setShowPermissionsModal(true);
  }

  function openInviteModal() {
    setInviteEmail("");
    setSelectedRoleId(null);
    setSelectedLocations([]);
    setPersonalMessage("");
    setShowInviteModal(true);
  }

  async function toggleUserRole(roleId: string) {
    if (!selectedUser || updatingRole) return;

    const hasRole = selectedUser.user_roles?.some(
      (ur) => ur.roles?.id === roleId,
    );

    const roleName = roles.find((r) => r.id === roleId)?.name || "role";

    setUpdatingRole(true);
    try {
      if (hasRole) {
        const { data, error } = await supabase.rpc("remove_role_from_user", {
          p_user_id: selectedUser.id,
          p_role_id: roleId,
        });

        if (error) throw error;
        if (data && !data.success) throw new Error(data.error);

        Alert.alert("Success", `Removed ${roleName} role`);
      } else {
        const { data, error } = await supabase.rpc("assign_role_to_user", {
          p_user_id: selectedUser.id,
          p_role_id: roleId,
        });

        if (error) throw error;
        if (data && !data.success) throw new Error(data.error);

        Alert.alert("Success", `Assigned ${roleName} role`);
      }

      await fetchData();

      const updatedUser = users.find((u) => u.id === selectedUser.id);
      if (updatedUser) {
        setSelectedUser(updatedUser);
      }
    } catch (err: any) {
      console.error("Role toggle error:", err);
      Alert.alert("Error", err.message || "Failed to update role");
    } finally {
      setUpdatingRole(false);
    }
  }

  async function handleInviteUser() {
    if (!inviteEmail.trim()) {
      Alert.alert("Error", "Please enter an email address");
      return;
    }
    if (!selectedRoleId) {
      Alert.alert("Error", "Please select a role");
      return;
    }
    if (!organizationId) return;

    setInviting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get inviter name and org name separately
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single();

      const { data: rpcResponse, error: rpcError } = await supabase.rpc(
        "invite_user_to_organization",
        {
          p_email: inviteEmail.trim().toLowerCase(),
          p_role_ids: [selectedRoleId],
          p_location_access:
            selectedLocations.length > 0
              ? selectedLocations.map((loc) => ({
                  location_id: loc.locationId,
                  access_type: loc.accessType,
                }))
              : null,
          p_personal_message: personalMessage.trim() || null,
        },
      );

      if (rpcError) throw rpcError;
      const inviteData = rpcResponse[0];
      if (!inviteData.success) throw new Error(inviteData.error);

      const inviteUrl = `https://toledah.com/register?token=${inviteData.token}`;
      const expiresAt = new Date(inviteData.expires_at);
      const daysValid = Math.ceil(
        (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      const emailResult = await sendInviteEmail({
        to: inviteEmail.trim().toLowerCase(),
        organizationName: org?.name || "your organization",
        inviterName: profile?.full_name || "A team member",
        inviteUrl,
        personalMessage: personalMessage.trim() || undefined,
        expiresInDays: daysValid,
      });

      if (!emailResult.success) {
        Alert.alert(
          "Invite Created",
          `Email delivery failed. Share this link manually:\n\n${inviteUrl}\n\nExpires in ${daysValid} days.`,
          [
            {
              text: "Copy Link",
              onPress: () => {
                Clipboard.setString(inviteUrl);
                Alert.alert("Copied", "Invite link copied to clipboard.");
              },
            },
            { text: "OK" },
          ],
        );
      } else {
        Alert.alert(
          "Invite Sent!",
          `Invitation sent to ${inviteEmail}. Expires in ${daysValid} days.`,
        );
      }

      setInviteEmail("");
      setSelectedRoleId(null);
      setSelectedLocations([]);
      setPersonalMessage("");
      setShowInviteModal(false);
      await fetchData();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to send invite");
    } finally {
      setInviting(false);
    }
  }

  function getUserRoleNames(user: User): string {
    if (!user.user_roles || user.user_roles.length === 0) {
      return "No roles assigned";
    }

    const roleNames = user.user_roles
      .map((ur) => ur.roles?.name)
      .filter(Boolean);

    return roleNames.length > 0 ? roleNames.join(", ") : "No roles assigned";
  }

  async function toggleOverride(
    permissionName: string,
    action: "add" | "subtract",
  ) {
    if (!selectedUser || processingPermission) return;

    setProcessingPermission(permissionName);

    try {
      const existing = selectedUser.overrides?.find(
        (o) => o.permission_name === permissionName,
      );
      const finalAction = existing?.override_type === action ? "clear" : action;

      // Optimistically update the UI
      setSelectedUser((prev) => {
        if (!prev) return prev;

        let newOverrides = [...(prev.overrides || [])];

        if (finalAction === "clear") {
          // Remove the override
          newOverrides = newOverrides.filter(
            (o) => o.permission_name !== permissionName,
          );
        } else {
          // Add or update the override
          const existingIndex = newOverrides.findIndex(
            (o) => o.permission_name === permissionName,
          );
          if (existingIndex >= 0) {
            newOverrides[existingIndex] = {
              permission_name: permissionName,
              override_type: action,
            };
          } else {
            newOverrides.push({
              permission_name: permissionName,
              override_type: action,
            });
          }
        }

        return { ...prev, overrides: newOverrides };
      });

      // 3. Fix toggleOverride — selectedUser.organization_id doesn't exist, use store value
      const { data, error } = await supabase.rpc("toggle_permission_override", {
        p_user_id: selectedUser.id,
        p_organization_id: organizationId, // ← was selectedUser.organization_id
        p_permission_name: permissionName,
        p_action: finalAction,
      });

      if (error) throw error;

      // Show success message
      const permissionLabel =
        allPermissions
          .flatMap((g) => g.permissions)
          .find((p) => p.name === permissionName)?.action || permissionName;

      if (finalAction === "clear") {
        Alert.alert(
          "Override Removed",
          `Cleared override for ${permissionLabel}`,
        );
      } else if (action === "add") {
        Alert.alert("Permission Granted", `Force-allowed ${permissionLabel}`);
      } else {
        Alert.alert("Permission Denied", `Force-denied ${permissionLabel}`);
      }

      // Refresh in background to ensure consistency
      await fetchData();
      const updatedUser = users.find((u) => u.id === selectedUser.id);
      if (updatedUser) setSelectedUser(updatedUser);
    } catch (err: any) {
      // Revert the optimistic update on error
      await fetchData();
      const revertedUser = users.find((u) => u.id === selectedUser.id);
      if (revertedUser) setSelectedUser(revertedUser);

      Alert.alert("Error", err.message || "Failed to update override");
    } finally {
      setProcessingPermission(null);
    }
  }

  function getResourceIcon(resource: string) {
    const icons: { [key: string]: string } = {
      sales: "💰",
      inventory: "📦",
      products: "🏷️",
      purchases: "📥",
      expenses: "💸",
      payments: "💳",
      payroll: "👨‍💼",
      reports: "📊",
      users: "👥",
      settings: "⚙️",
    };
    return icons[resource] || "📄";
  }

  function getResourceLabel(resource: string) {
    return resource.charAt(0).toUpperCase() + resource.slice(1);
  }

  // Helper to check if user has permission (either from role or override)
  async function getUserEffectivePermissions(
    userId: string,
  ): Promise<Set<string>> {
    try {
      const { data, error } = await supabase.rpc("get_user_permissions", {
        p_user_id: userId,
      });

      if (error) {
        console.error("Error fetching effective permissions:", error);
        return new Set();
      }

      return new Set(data?.map((p: any) => p.permission_name) || []);
    } catch (err) {
      console.error("Error in getUserEffectivePermissions:", err);
      return new Set();
    }
  }

  // Simpler version: check based on roles and overrides we already have
  function hasEffectivePermission(permission: Permission): boolean {
    if (!selectedUser) return false;

    // Check for override first
    const override = selectedUser.overrides?.find(
      (o) => o.permission_name === permission.name,
    );

    if (override) {
      return override.override_type === "add";
    }

    // If no override, we'd need to check if any of their roles have this permission
    // For now, we'll show "Unknown" - this would require fetching role permissions
    return false;
  }

  const inviteRoles = roles.filter((role) => role.name !== "Owner");

  if (permLoading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!hasPermission("users.manage")) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Users & Roles</Text>
          <View style={{ width: 60 }} />
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 40,
          }}
        >
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔐</Text>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "600",
              color: COLORS.primary,
              marginBottom: 8,
            }}
          >
            Access Restricted
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: COLORS.secondary,
              textAlign: "center",
            }}
          >
            You don&apos;t have permission to manage users.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Users & Roles</Text>
        {hasPermission("invites.manage") ? (
          <TouchableOpacity onPress={openInviteModal}>
            <Text style={styles.addButton}>+ Invite</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing ? (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 40 }}
          />
        ) : (
          <>
            {/* Users List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Team Members ({users.length})
              </Text>

              {users.map((user) => (
                <View key={user.id} style={styles.userCard}>
                  <View style={styles.userInfo}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {user.full_name?.charAt(0).toUpperCase() || "?"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>
                        {user.full_name || "Unnamed User"}
                      </Text>
                      <Text style={styles.userRoles}>
                        {getUserRoleNames(user)}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.manageButton}
                    onPress={() => openPermissionsModal(user)}
                  >
                    <Text style={styles.manageButtonText}>
                      Manage Permissions
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}

              {users.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>👥</Text>
                  <Text style={styles.emptyText}>No users yet</Text>
                  <Text style={styles.emptySubtext}>
                    Invite team members to get started
                  </Text>
                </View>
              )}
            </View>

            {/* Available Roles */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Available Roles ({roles.length})
                </Text>
              </View>

              {roles.map((role) => (
                <View key={role.id} style={styles.roleCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roleName}>{role.name}</Text>
                    <Text style={styles.roleDescription}>
                      {role.description}
                    </Text>
                  </View>
                  {role.is_system_role && (
                    <View style={styles.systemBadge}>
                      <Text style={styles.systemBadgeText}>System</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Invite User Modal */}
      <Modal visible={showInviteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScrollView}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Invite Team Member</Text>
                <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Email */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Email Address *</Text>
                <TextInput
                  style={styles.input}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="john@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              {/* Role Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Select Role *</Text>
                <Text style={styles.helpText}>
                  Choose the role for this user
                </Text>

                {inviteRoles.map((role) => (
                  <TouchableOpacity
                    key={role.id}
                    style={styles.checkboxItem}
                    onPress={() => {
                      setSelectedRoleId(
                        role.id === selectedRoleId ? null : role.id,
                      );
                    }}
                    disabled={inviting}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        selectedRoleId === role.id && styles.checkboxChecked,
                      ]}
                    >
                      {selectedRoleId === role.id && (
                        <Text style={styles.checkmark}>✓</Text>
                      )}
                    </View>
                    <View style={styles.checkboxLabel}>
                      <Text style={styles.roleOptionName}>{role.name}</Text>
                      <Text style={styles.roleOptionDescription}>
                        {role.description}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Location Access Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Location Access (Optional)</Text>
                <Text style={styles.helpText}>
                  Select which locations this user can access
                </Text>

                {locations.length === 0 ? (
                  <Text style={styles.emptyText}>No locations created yet</Text>
                ) : (
                  locations.map((location) => {
                    const selected = selectedLocations.find(
                      (loc) => loc.locationId === location.id,
                    );
                    return (
                      <View key={location.id} style={styles.locationItem}>
                        <TouchableOpacity
                          style={styles.checkboxItem}
                          onPress={() => {
                            setSelectedLocations((prev) => {
                              const exists = prev.find(
                                (loc) => loc.locationId === location.id,
                              );
                              if (exists) {
                                return prev.filter(
                                  (loc) => loc.locationId !== location.id,
                                );
                              } else {
                                return [
                                  ...prev,
                                  {
                                    locationId: location.id,
                                    accessType: "write" as const,
                                  },
                                ];
                              }
                            });
                          }}
                          disabled={inviting}
                        >
                          <View
                            style={[
                              styles.checkbox,
                              selected && styles.checkboxChecked,
                            ]}
                          >
                            {selected && (
                              <Text style={styles.checkmark}>✓</Text>
                            )}
                          </View>
                          <Text style={styles.locationName}>
                            {location.name}
                          </Text>
                        </TouchableOpacity>

                        {selected && (
                          <View style={styles.accessTypeSelector}>
                            {(["read", "write", "admin"] as const).map(
                              (type) => (
                                <TouchableOpacity
                                  key={type}
                                  style={[
                                    styles.accessTypeButton,
                                    selected.accessType === type &&
                                      styles.accessTypeButtonActive,
                                  ]}
                                  onPress={() => {
                                    setSelectedLocations((prev) =>
                                      prev.map((loc) =>
                                        loc.locationId === location.id
                                          ? { ...loc, accessType: type }
                                          : loc,
                                      ),
                                    );
                                  }}
                                  disabled={inviting}
                                >
                                  <Text
                                    style={[
                                      styles.accessTypeText,
                                      selected.accessType === type &&
                                        styles.accessTypeTextActive,
                                    ]}
                                  >
                                    {type.charAt(0).toUpperCase() +
                                      type.slice(1)}
                                  </Text>
                                </TouchableOpacity>
                              ),
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>

              {/* Personal Message */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Personal Message (Optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={personalMessage}
                  onChangeText={setPersonalMessage}
                  placeholder="Add a note to the invitation..."
                  placeholderTextColor={COLORS.secondary}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (inviting || !selectedRoleId) && styles.submitButtonDisabled,
                ]}
                onPress={handleInviteUser}
                disabled={inviting || !selectedRoleId}
              >
                {inviting ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.submitButtonText}>Send Invitation</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Manage User Permissions Modal */}
      <Modal visible={showPermissionsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Permissions: {selectedUser?.full_name}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Assign roles and manage permission overrides
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPermissionsModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Section: Base Roles */}
              <Text style={styles.permissionGroupTitle}>Base Roles</Text>
              <Text style={styles.helpText}>
                Roles define the default permissions for this user
              </Text>
              <View style={styles.roleTagContainer}>
                {roles.map((role) => {
                  const hasRole = selectedUser?.user_roles?.some(
                    (ur) => ur.roles?.id === role.id,
                  );
                  return (
                    <TouchableOpacity
                      key={role.id}
                      onPress={() => toggleUserRole(role.id)}
                      style={[styles.roleTag, hasRole && styles.roleTagActive]}
                      disabled={updatingRole}
                    >
                      <Text
                        style={[
                          styles.roleTagText,
                          hasRole && styles.roleTagTextActive,
                        ]}
                      >
                        {role.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.divider} />

              {/* Section: Granular Permission Overrides */}
              <Text style={styles.permissionGroupTitle}>
                Permission Overrides
              </Text>
              <Text style={styles.helpText}>
                Override specific permissions for this user. Use + to grant a
                permission they don&apos;t have, or - to revoke one they do
                have.
              </Text>

              {allPermissions.map((group) => (
                <View key={group.resource} style={styles.permissionGroup}>
                  <View style={styles.resourceHeaderCompact}>
                    <Text style={styles.resourceIcon}>
                      {getResourceIcon(group.resource)}
                    </Text>
                    <Text style={styles.resourceName}>
                      {getResourceLabel(group.resource)}
                    </Text>
                  </View>

                  {group.permissions.map((permission) => {
                    const currentOverride = selectedUser?.overrides?.find(
                      (o) => o.permission_name === permission.name,
                    );

                    const isProcessing =
                      processingPermission === permission.name;

                    return (
                      <View key={permission.id} style={styles.permissionRow}>
                        <View style={styles.permissionInfo}>
                          <Text style={styles.permissionName}>
                            {permission.action}
                          </Text>
                          <Text style={styles.permissionDescription}>
                            {permission.description}
                          </Text>

                          {/* Show override status */}
                          {currentOverride && (
                            <View style={styles.statusBadgeContainer}>
                              <View
                                style={[
                                  styles.statusBadge,
                                  currentOverride.override_type === "add"
                                    ? styles.statusBadgeAllow
                                    : styles.statusBadgeDeny,
                                ]}
                              >
                                <Text style={styles.statusBadgeText}>
                                  {currentOverride.override_type === "add"
                                    ? "⚡ Forced Allow"
                                    : "🚫 Forced Deny"}
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>

                        <View style={styles.actionGroup}>
                          {/* Subtract Button (-) */}
                          <TouchableOpacity
                            onPress={() =>
                              toggleOverride(permission.name, "subtract")
                            }
                            style={[
                              styles.actionBtn,
                              styles.btnMinus,
                              currentOverride?.override_type === "subtract" &&
                                styles.btnMinusActive,
                            ]}
                            disabled={isProcessing}
                          >
                            {isProcessing &&
                            currentOverride?.override_type === "subtract" ? (
                              <ActivityIndicator
                                size="small"
                                color={COLORS.white}
                              />
                            ) : (
                              <Text
                                style={[
                                  styles.actionBtnText,
                                  currentOverride?.override_type ===
                                    "subtract" && styles.actionBtnTextActive,
                                ]}
                              >
                                −
                              </Text>
                            )}
                          </TouchableOpacity>

                          {/* Add Button (+) */}
                          <TouchableOpacity
                            onPress={() =>
                              toggleOverride(permission.name, "add")
                            }
                            style={[
                              styles.actionBtn,
                              styles.btnPlus,
                              currentOverride?.override_type === "add" &&
                                styles.btnPlusActive,
                            ]}
                            disabled={isProcessing}
                          >
                            {isProcessing &&
                            currentOverride?.override_type === "add" ? (
                              <ActivityIndicator
                                size="small"
                                color={COLORS.white}
                              />
                            ) : (
                              <Text
                                style={[
                                  styles.actionBtnText,
                                  currentOverride?.override_type === "add" &&
                                    styles.actionBtnTextActive,
                                ]}
                              >
                                +
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 48,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  addButton: { fontSize: 16, fontWeight: "600", color: COLORS.accent },

  content: { flex: 1, padding: 16 },

  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: COLORS.primary },

  userCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfo: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { fontSize: 20, fontWeight: "bold", color: COLORS.white },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 2,
  },
  userEmail: { fontSize: 13, color: COLORS.secondary, marginBottom: 4 },
  userRoles: { fontSize: 12, color: COLORS.accent, fontWeight: "500" },

  manageButton: {
    backgroundColor: COLORS.background,
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  manageButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.primary },

  roleCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  roleName: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  roleDescription: { fontSize: 13, color: COLORS.secondary },
  systemBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  systemBadgeText: { fontSize: 10, fontWeight: "600", color: COLORS.white },

  emptyState: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 8,
  },
  emptySubtext: { fontSize: 14, color: COLORS.secondary, textAlign: "center" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalScrollView: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: "80%",
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.primary,
    flex: 1,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.secondary,
    marginTop: 2,
  },
  modalClose: { fontSize: 24, color: COLORS.secondary },

  formGroup: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
  },
  helpText: {
    fontSize: 12,
    color: COLORS.secondary,
    marginBottom: 12,
    fontStyle: "italic",
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.primary,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },

  checkboxItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  checkmark: { fontSize: 14, fontWeight: "bold", color: COLORS.white },
  checkboxLabel: {
    flex: 1,
  },

  locationItem: {
    marginBottom: 12,
  },
  locationName: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.primary,
  },
  accessTypeSelector: {
    flexDirection: "row",
    marginTop: 8,
    marginLeft: 36,
    gap: 8,
  },
  accessTypeButton: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
  },
  accessTypeButtonActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  accessTypeText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  accessTypeTextActive: {
    color: COLORS.white,
  },

  submitButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 16, fontWeight: "600", color: COLORS.white },

  roleOptionName: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  roleOptionDescription: { fontSize: 13, color: COLORS.secondary },

  permissionGroupTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.secondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },
  roleTagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  roleTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  roleTagActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleTagText: {
    fontSize: 13,
    color: COLORS.primary,
  },
  roleTagTextActive: {
    color: COLORS.white,
    fontWeight: "600",
  },

  permissionGroup: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  resourceHeaderCompact: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resourceIcon: { fontSize: 18, marginRight: 8 },
  resourceName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },

  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  permissionInfo: {
    flex: 1,
    marginRight: 12,
  },
  permissionName: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
    textTransform: "capitalize",
  },
  permissionDescription: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 2,
  },
  permissionStatus: {
    fontSize: 10,
    color: COLORS.accent,
    fontWeight: "600",
    marginTop: 4,
  },
  statusBadgeContainer: {
    marginTop: 6,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeAllow: {
    backgroundColor: "#D1FAE5",
  },
  statusBadgeDeny: {
    backgroundColor: "#FEE2E2",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primary,
  },
  actionGroup: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  btnPlus: {
    borderColor: "#10B981",
    backgroundColor: "#ECFDF5",
  },
  btnPlusActive: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  btnMinus: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  btnMinusActive: {
    backgroundColor: "#EF4444",
    borderColor: "#EF4444",
  },
  actionBtnText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  actionBtnTextActive: {
    color: COLORS.white,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
});
