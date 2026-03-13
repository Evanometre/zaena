// FILE: app/profile.tsx
//
// Profile screen — fully rewritten with proper architecture:
//
// 1. Auth store as single source of truth for user/org/businessType.
//    No redundant Supabase calls for data already in the store.
//
// 2. usePermissions for access control — no hardcoded role name strings.
//    "Can this user edit the org name?" is a permission question, not a
//    role name question. Uses the existing 'settings.manage' permission
//    which is granted to Owner and Director roles.
//
// 3. Mode-aware labels and copy — Administrator vs Owner, Company vs Business.
//
// 4. Full_name is fetched fresh (not in auth store) but organization data
//    comes from the store + a single org query, not multiple redundant calls.
//
// 5. Role display fetched from user_roles → roles join, same as before but
//    simplified and with proper error handling.

import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { usePermissions } from "../context/PermissionsContext";
import { COLORS } from "../lib/colors";
import supabase from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProfileData {
  fullName: string;
  email: string;
  roleName: string;
  organizationName: string;
  businessType: "business_name" | "registered_company";
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { user, organizationId } = useAuthStore();
  const businessType = useAuthStore((s) => s.businessType);
  const { hasPermission } = usePermissions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedOrgName, setEditedOrgName] = useState("");

  // Whether this user can rename the organization.
  // Uses the RBAC permission system — not a hardcoded role name check.
  // 'settings.manage' is granted to Owner (business_name) and
  // Director (registered_company) during signup_with_organization.
  const canEditOrgName = hasPermission("settings.manage");

  useEffect(() => {
    if (user && organizationId) {
      fetchProfile();
    }
  }, [user, organizationId]);

  async function fetchProfile() {
    if (!user || !organizationId) return;
    setLoading(true);

    try {
      // ── Fetch full_name from user_profiles ───────────────────────────────
      // organizationId is already in the auth store — no need to re-fetch it.
      const { data: userProfile, error: profileError } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      // ── Fetch role name via user_roles → roles join ──────────────────────
      // .single() is correct here: each user has exactly one active role
      // per org in the current schema.
      const { data: userRoleRow, error: roleError } = await supabase
        .from("user_roles")
        .select("roles(name)")
        .eq("user_id", user.id)
        .single<{ roles: { name: string } | null }>();

      if (roleError && roleError.code !== "PGRST116") {
        // PGRST116 = no rows — handle gracefully, not as a hard error
        console.warn("Role fetch warning:", roleError.message);
      }

      // ── Fetch organization name ──────────────────────────────────────────
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single();

      if (orgError) throw orgError;

      const roleName = userRoleRow?.roles?.name || "Member";
      const orgName = org?.name || "";

      setProfile({
        fullName: userProfile?.full_name || "",
        email: user.email || "",
        roleName,
        organizationName: orgName,
        businessType: businessType || "business_name",
      });

      setEditedName(userProfile?.full_name || "");
      setEditedOrgName(orgName);
    } catch (err: any) {
      console.error("Error fetching profile:", err);
      Alert.alert("Error", "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!editedName.trim()) {
      Alert.alert("Error", "Please enter your name");
      return;
    }
    if (canEditOrgName && !editedOrgName.trim()) {
      Alert.alert("Error", "Please enter your organization name");
      return;
    }
    if (!user || !organizationId) return;

    setSaving(true);
    try {
      // Update full_name in user_profiles
      const { error: nameError } = await supabase
        .from("user_profiles")
        .update({ full_name: editedName.trim() })
        .eq("id", user.id);

      if (nameError) throw nameError;

      // Update org name only if user has permission to do so
      if (
        canEditOrgName &&
        editedOrgName.trim() !== profile?.organizationName
      ) {
        const { error: orgError } = await supabase
          .from("organizations")
          .update({ name: editedOrgName.trim() })
          .eq("id", organizationId);

        if (orgError) throw orgError;
      }

      await fetchProfile();
      setEditMode(false);
      Alert.alert("Success", "Profile updated successfully");
    } catch (err: any) {
      console.error("Error saving profile:", err);
      Alert.alert("Error", err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditedName(profile?.fullName || "");
    setEditedOrgName(profile?.organizationName || "");
    setEditMode(false);
  }

  // ── Mode-aware copy ────────────────────────────────────────────────────────
  const company = businessType === "registered_company";
  const orgLabel = company ? "Company" : "Business";
  const orgNameLabel = company ? "Company Name" : "Business Name";
  const orgEditHint = company
    ? "Only Administrators can change the company name"
    : "Only Owners can change the business name";

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Profile</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  if (!profile) return null;

  const avatarLetter = (profile.fullName || profile.email)
    .charAt(0)
    .toUpperCase();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        {!editMode ? (
          <TouchableOpacity onPress={() => setEditMode(true)}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar + role badge */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{avatarLetter}</Text>
          </View>
          <Text style={styles.roleBadge}>{profile.roleName.toUpperCase()}</Text>
          {company && (
            <View style={styles.companyBadge}>
              <Text style={styles.companyBadgeText}>🏢 Registered Company</Text>
            </View>
          )}
        </View>

        {/* Personal Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            {editMode ? (
              <TextInput
                style={styles.input}
                value={editedName}
                onChangeText={setEditedName}
                placeholder="Enter your full name"
                autoCapitalize="words"
                editable={!saving}
              />
            ) : (
              <Text style={styles.fieldValue}>
                {profile.fullName || "Not set"}
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Email</Text>
            <Text style={styles.fieldValue}>{profile.email}</Text>
            <Text style={styles.hint}>Email cannot be changed here</Text>
          </View>
        </View>

        {/* Organization / Company Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{orgLabel}</Text>

          <TouchableOpacity
            style={[styles.card, styles.navCard]}
            onPress={() => router.push("/settingsg/organization")}
            activeOpacity={0.7}
          >
            <View style={styles.navCardContent}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{orgNameLabel}</Text>
                <Text style={styles.fieldValue}>
                  {profile.organizationName || "Not set"}
                </Text>
              </View>
              <Text style={styles.navArrow}>›</Text>
            </View>
            <Text style={styles.navHint}>
              Manage address, TIN, RC number, receipt settings and more
            </Text>
          </TouchableOpacity>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Your Role</Text>
            <Text style={styles.fieldValue}>{profile.roleName}</Text>
          </View>
        </View>

        {/* Save / Cancel buttons */}
        {editMode && (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                saving && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    fontSize: 16,
    color: COLORS.primary,
    minWidth: 60,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  editButtonText: {
    fontSize: 16,
    color: COLORS.accent,
    fontWeight: "600",
    minWidth: 60,
    textAlign: "right",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },

  navCard: { paddingBottom: 12 },
  navCardContent: { flexDirection: "row", alignItems: "center" },
  navArrow: { fontSize: 24, color: COLORS.secondary, marginLeft: 8 },
  navHint: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 6,
    fontStyle: "italic",
  },

  // Avatar
  avatarSection: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: COLORS.white,
    marginBottom: 16,
    gap: 8,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  avatarLetter: {
    fontSize: 44,
    fontWeight: "bold",
    color: COLORS.white,
  },
  roleBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.secondary,
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    letterSpacing: 0.5,
  },
  companyBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  companyBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1D4ED8",
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  card: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fieldValue: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: "500",
  },
  hint: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 4,
    fontStyle: "italic",
  },
  input: {
    fontSize: 16,
    color: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: COLORS.background,
  },

  // Buttons
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
