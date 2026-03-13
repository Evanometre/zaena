// app/settingsg/roles.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface Role {
  id: string;
  name: string;
  description: string;
  is_system_role: boolean;
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

export default function RolesManagementScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionGroup[]>([]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  async function fetchData() {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data: rolesData, error: rolesError } = await supabase
        .from("roles")
        .select("*")
        .eq("organization_id", organizationId) // ← store value
        .order("name");

      if (rolesError) throw rolesError;

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
      setAllPermissions(
        Object.entries(grouped).map(([resource, permissions]) => ({
          resource,
          permissions,
        })),
      );
    } catch (err: any) {
      console.error("Error fetching data:", err);
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

  function openCreateModal() {
    setRoleName("");
    setRoleDescription("");
    setSelectedPermissions([]);
    setShowCreateModal(true);
  }

  async function openEditModal(role: Role) {
    setSelectedRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description || "");

    // Fetch role's current permissions
    const { data: rolePerms } = await supabase
      .from("role_permissions")
      .select("permission_id")
      .eq("role_id", role.id);

    setSelectedPermissions(rolePerms?.map((rp) => rp.permission_id) || []);
    setShowEditModal(true);
  }

  function togglePermission(permissionId: string) {
    setSelectedPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId],
    );
  }

  function toggleAllInResource(resource: string) {
    const resourcePerms = allPermissions.find((g) => g.resource === resource);
    if (!resourcePerms) return;

    const resourcePermIds = resourcePerms.permissions.map((p) => p.id);
    const allSelected = resourcePermIds.every((id) =>
      selectedPermissions.includes(id),
    );

    if (allSelected) {
      // Deselect all
      setSelectedPermissions((prev) =>
        prev.filter((id) => !resourcePermIds.includes(id)),
      );
    } else {
      // Select all
      setSelectedPermissions((prev) => [
        ...new Set([...prev, ...resourcePermIds]),
      ]);
    }
  }

  async function handleCreateRole() {
    if (!roleName.trim()) {
      Alert.alert("Error", "Please enter a role name");
      return;
    }
    if (selectedPermissions.length === 0) {
      Alert.alert("Error", "Please select at least one permission");
      return;
    }
    if (!organizationId) return;

    setSaving(true);
    try {
      const { data: newRole, error: roleError } = await supabase
        .from("roles")
        .insert({
          organization_id: organizationId, // ← store value
          name: roleName.trim(),
          description: roleDescription.trim() || null,
          is_system_role: false,
        })
        .select()
        .single();

      if (roleError) throw roleError;

      const { error: permError } = await supabase
        .from("role_permissions")
        .insert(
          selectedPermissions.map((permId) => ({
            role_id: newRole.id,
            permission_id: permId,
          })),
        );

      if (permError) throw permError;

      Alert.alert("Success", "Role created successfully");
      setShowCreateModal(false);
      fetchData();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateRole() {
    if (!selectedRole) return;

    setSaving(true);
    try {
      // Update role details
      const { error: updateError } = await supabase
        .from("roles")
        .update({
          name: roleName.trim(),
          description: roleDescription.trim() || null,
        })
        .eq("id", selectedRole.id);

      if (updateError) throw updateError;

      // Delete existing permissions
      await supabase
        .from("role_permissions")
        .delete()
        .eq("role_id", selectedRole.id);

      // Add new permissions
      if (selectedPermissions.length > 0) {
        const rolePermissions = selectedPermissions.map((permId) => ({
          role_id: selectedRole.id,
          permission_id: permId,
        }));

        const { error: permError } = await supabase
          .from("role_permissions")
          .insert(rolePermissions);

        if (permError) throw permError;
      }

      Alert.alert("Success", "Role updated successfully");
      setShowEditModal(false);
      fetchData();
    } catch (err: any) {
      console.error("Error updating role:", err);
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRole(role: Role) {
    if (role.is_system_role) {
      Alert.alert("Error", "Cannot delete system roles");
      return;
    }

    Alert.alert(
      "Delete Role",
      `Are you sure you want to delete "${role.name}"? Users with this role will lose their permissions.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("roles")
                .delete()
                .eq("id", role.id);

              if (error) throw error;
              fetchData();
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ],
    );
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

  if (!hasPermission("roles.read")) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Manage Roles</Text>
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
            You don&apos;t have permission to manage roles.
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
        <Text style={styles.title}>Manage Roles</Text>
        {hasPermission("roles.create") ? (
          <TouchableOpacity onPress={openCreateModal}>
            <Text style={styles.addButton}>+ Create</Text>
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
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Roles ({roles.length})</Text>

              {roles.map((role) => (
                <View key={role.id} style={styles.roleCard}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.roleHeader}>
                      <Text style={styles.roleName}>{role.name}</Text>
                      {role.is_system_role && (
                        <View style={styles.systemBadge}>
                          <Text style={styles.systemBadgeText}>System</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.roleDescription}>
                      {role.description}
                    </Text>
                  </View>
                  <View style={styles.roleActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => openEditModal(role)}
                    >
                      <Text style={styles.actionButtonText}>Edit</Text>
                    </TouchableOpacity>
                    {!role.is_system_role && (
                      <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleDeleteRole(role)}
                      >
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}

              {roles.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🔐</Text>
                  <Text style={styles.emptyText}>No roles yet</Text>
                  <TouchableOpacity
                    style={styles.emptyButton}
                    onPress={openCreateModal}
                  >
                    <Text style={styles.emptyButtonText}>
                      Create First Role
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Create/Edit Role Modal */}
      <Modal
        visible={showCreateModal || showEditModal}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {showCreateModal ? "Create Role" : "Edit Role"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                }}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Role Name</Text>
                <TextInput
                  style={styles.input}
                  value={roleName}
                  onChangeText={setRoleName}
                  placeholder="e.g., Cashier, Manager"
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={roleDescription}
                  onChangeText={setRoleDescription}
                  placeholder="What can this role do?"
                  multiline
                  numberOfLines={3}
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Permissions</Text>
                <Text style={styles.hint}>
                  Select what this role can access and do
                </Text>

                {allPermissions.map((group) => {
                  const groupPerms = group.permissions.map((p) => p.id);
                  const allSelected = groupPerms.every((id) =>
                    selectedPermissions.includes(id),
                  );
                  const someSelected = groupPerms.some((id) =>
                    selectedPermissions.includes(id),
                  );

                  return (
                    <View key={group.resource} style={styles.permissionGroup}>
                      <TouchableOpacity
                        style={styles.resourceHeader}
                        onPress={() => toggleAllInResource(group.resource)}
                      >
                        <Text style={styles.resourceIcon}>
                          {getResourceIcon(group.resource)}
                        </Text>
                        <Text style={styles.resourceName}>
                          {getResourceLabel(group.resource)}
                        </Text>
                        <View
                          style={[
                            styles.checkbox,
                            allSelected && styles.checkboxChecked,
                            someSelected &&
                              !allSelected &&
                              styles.checkboxIndeterminate,
                          ]}
                        >
                          {allSelected && (
                            <Text style={styles.checkmark}>✓</Text>
                          )}
                          {someSelected && !allSelected && (
                            <Text style={styles.checkmark}>−</Text>
                          )}
                        </View>
                      </TouchableOpacity>

                      {group.permissions.map((perm) => (
                        <TouchableOpacity
                          key={perm.id}
                          style={styles.permissionItem}
                          onPress={() => togglePermission(perm.id)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.permissionName}>
                              {perm.action}
                            </Text>
                            <Text style={styles.permissionDescription}>
                              {perm.description}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.checkbox,
                              selectedPermissions.includes(perm.id) &&
                                styles.checkboxChecked,
                            ]}
                          >
                            {selectedPermissions.includes(perm.id) && (
                              <Text style={styles.checkmark}>✓</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  saving && styles.submitButtonDisabled,
                ]}
                onPress={showCreateModal ? handleCreateRole : handleUpdateRole}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {showCreateModal ? "Create Role" : "Update Role"}
                  </Text>
                )}
              </TouchableOpacity>
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

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },

  roleCard: {
    flexDirection: "row",
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
  roleHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  roleName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginRight: 8,
  },
  roleDescription: { fontSize: 13, color: COLORS.secondary },
  systemBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  systemBadgeText: { fontSize: 10, fontWeight: "600", color: COLORS.white },

  roleActions: { gap: 8 },
  actionButton: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionButtonText: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
  deleteButton: { backgroundColor: "#FEE2E2" },
  deleteButtonText: { fontSize: 13, fontWeight: "600", color: COLORS.danger },

  emptyState: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.white },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  modalClose: { fontSize: 24, color: COLORS.secondary },

  formGroup: { marginBottom: 20 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
  },
  hint: { fontSize: 12, color: COLORS.secondary, marginBottom: 12 },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.primary,
  },
  textArea: { height: 80, textAlignVertical: "top" },

  permissionGroup: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  resourceHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resourceIcon: { fontSize: 20, marginRight: 8 },
  resourceName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
  },

  permissionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  permissionName: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.primary,
    marginBottom: 2,
    textTransform: "capitalize",
  },
  permissionDescription: { fontSize: 12, color: COLORS.secondary },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  checkboxIndeterminate: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  checkmark: { fontSize: 14, fontWeight: "bold", color: COLORS.white },

  submitButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 16, fontWeight: "600", color: COLORS.white },
});
