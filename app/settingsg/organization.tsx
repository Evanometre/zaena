// FILE: app/settings/organization.tsx
//
// Organization Settings screen
//
// Covers two layers of org data:
//   1. organizations table  — identity fields (name, address, phone, email, TIN, RC number)
//   2. organization_settings table — operational settings (financial year end,
//      receipt delivery, sales mode, workflow mode)
//
// Access: any member can VIEW. Only users with settings.manage can EDIT.

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
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrgIdentity {
  name: string;
  address: string;
  phone: string;
  email: string;
  tin: string;
  rc_number: string;
}

interface OrgOperational {
  financial_year_end_month: number;
  receipt_send_whatsapp: boolean;
  receipt_send_email: boolean;
  receipt_download_pdf: boolean;
  sales_mode: string;
  workflow_mode: string;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function OrganizationSettingsScreen() {
  const router = useRouter();
  const { organizationId } = useAuthStore();
  const businessType = useAuthStore((s) => s.businessType);
  const company = businessType === "registered_company";
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settings.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Identity
  const [identity, setIdentity] = useState<OrgIdentity>({
    name: "",
    address: "",
    phone: "",
    email: "",
    tin: "",
    rc_number: "",
  });
  const [draft, setDraft] = useState<OrgIdentity>({
    name: "",
    address: "",
    phone: "",
    email: "",
    tin: "",
    rc_number: "",
  });

  // Operational
  const [operational, setOperational] = useState<OrgOperational>({
    financial_year_end_month: 12,
    receipt_send_whatsapp: false,
    receipt_send_email: false,
    receipt_download_pdf: true,
    sales_mode: "standard",
    workflow_mode: "standard",
  });

  useEffect(() => {
    if (organizationId) fetchSettings();
  }, [organizationId]);

  async function fetchSettings() {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [orgRes, settingsRes] = await Promise.all([
        supabase
          .from("organizations")
          .select("name, address, phone, email, tin, rc_number")
          .eq("id", organizationId)
          .single(),
        supabase
          .from("organization_settings")
          .select(
            "financial_year_end_month, receipt_send_whatsapp, receipt_send_email, receipt_download_pdf, sales_mode, workflow_mode",
          )
          .eq("organization_id", organizationId)
          .single(),
      ]);

      if (orgRes.error) throw orgRes.error;

      const id: OrgIdentity = {
        name: orgRes.data?.name ?? "",
        address: orgRes.data?.address ?? "",
        phone: orgRes.data?.phone ?? "",
        email: orgRes.data?.email ?? "",
        tin: orgRes.data?.tin ?? "",
        rc_number: orgRes.data?.rc_number ?? "",
      };
      setIdentity(id);
      setDraft({ ...id });

      if (settingsRes.data) {
        setOperational({
          financial_year_end_month:
            settingsRes.data.financial_year_end_month ?? 12,
          receipt_send_whatsapp:
            settingsRes.data.receipt_send_whatsapp ?? false,
          receipt_send_email: settingsRes.data.receipt_send_email ?? false,
          receipt_download_pdf: settingsRes.data.receipt_download_pdf ?? true,
          sales_mode: settingsRes.data.sales_mode ?? "standard",
          workflow_mode: settingsRes.data.workflow_mode ?? "standard",
        });
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!draft.name.trim()) {
      Alert.alert("Error", "Organization name is required");
      return;
    }
    if (!organizationId) return;
    setSaving(true);
    try {
      const { error: orgError } = await supabase
        .from("organizations")
        .update({
          name: draft.name.trim(),
          address: draft.address.trim() || null,
          phone: draft.phone.trim() || null,
          email: draft.email.trim() || null,
          tin: draft.tin.trim() || null,
          rc_number: draft.rc_number.trim() || null,
        })
        .eq("id", organizationId);

      if (orgError) throw orgError;

      setIdentity({ ...draft });
      setEditMode(false);
      Alert.alert("Saved", "Organization details updated successfully");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function saveYearEnd(month: number) {
    if (!organizationId) return;
    setOperational((prev) => ({ ...prev, financial_year_end_month: month }));
    try {
      await supabase
        .from("organization_settings")
        .update({ financial_year_end_month: month })
        .eq("organization_id", organizationId);
    } catch (err: any) {
      Alert.alert("Error", "Failed to save year end setting");
    }
  }

  async function saveReceiptToggle(
    key: keyof Pick<
      OrgOperational,
      "receipt_send_whatsapp" | "receipt_send_email" | "receipt_download_pdf"
    >,
    value: boolean,
  ) {
    if (!organizationId) return;
    setOperational((prev) => ({ ...prev, [key]: value }));
    try {
      await supabase
        .from("organization_settings")
        .update({ [key]: value })
        .eq("organization_id", organizationId);
    } catch (err: any) {
      Alert.alert("Error", "Failed to save setting");
    }
  }

  function handleCancel() {
    setDraft({ ...identity });
    setEditMode(false);
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.container}>
        <Header
          onBack={() => router.back()}
          editMode={false}
          canEdit={false}
          onEdit={() => {}}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Header
        onBack={() => router.back()}
        editMode={editMode}
        canEdit={canEdit}
        onEdit={() => setEditMode(true)}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Identity section ─────────────────────────────────────────────── */}
        <SectionLabel text="Identity" />

        <Field
          label="Business Name"
          value={editMode ? draft.name : identity.name}
          editMode={editMode}
          canEdit={canEdit}
          onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
          placeholder="Your business name"
        />

        <Field
          label="Address"
          value={editMode ? draft.address : identity.address}
          editMode={editMode}
          canEdit={canEdit}
          onChangeText={(v) => setDraft((d) => ({ ...d, address: v }))}
          placeholder="Business address"
          multiline
        />

        <Field
          label="Phone"
          value={editMode ? draft.phone : identity.phone}
          editMode={editMode}
          canEdit={canEdit}
          onChangeText={(v) => setDraft((d) => ({ ...d, phone: v }))}
          placeholder="e.g. 0801 234 5678"
          keyboardType="phone-pad"
        />

        <Field
          label="Email"
          value={editMode ? draft.email : identity.email}
          editMode={editMode}
          canEdit={canEdit}
          onChangeText={(v) => setDraft((d) => ({ ...d, email: v }))}
          placeholder="business@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* ── Tax & Legal section ───────────────────────────────────────────── */}
        <SectionLabel text="Tax & Legal" />

        <Field
          label="Tax Identification Number (TIN)"
          value={editMode ? draft.tin : identity.tin}
          editMode={editMode}
          canEdit={canEdit}
          onChangeText={(v) => setDraft((d) => ({ ...d, tin: v }))}
          placeholder="e.g. 1234567-0001"
          hint="Appears on all invoices and receipts"
        />

        {company && (
          <Field
            label="RC Number (CAC Registration)"
            value={editMode ? draft.rc_number : identity.rc_number}
            editMode={editMode}
            canEdit={canEdit}
            onChangeText={(v) => setDraft((d) => ({ ...d, rc_number: v }))}
            placeholder="e.g. RC 1234567"
            hint="Required on company invoices"
          />
        )}

        {/* Save / Cancel */}
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

        {/* ── Financial year section ────────────────────────────────────────── */}
        <SectionLabel text="Financial Year" />

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Year End Month</Text>
          <Text style={styles.fieldHint}>
            Determines when your CIT filing deadline falls (6 months after year
            end)
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.monthScroll}
          >
            <View style={styles.monthRow}>
              {MONTHS.map((month, index) => {
                const active =
                  operational.financial_year_end_month === index + 1;
                return (
                  <TouchableOpacity
                    key={month}
                    style={[styles.monthChip, active && styles.monthChipActive]}
                    onPress={() => canEdit && saveYearEnd(index + 1)}
                    disabled={!canEdit}
                  >
                    <Text
                      style={[
                        styles.monthChipText,
                        active && styles.monthChipTextActive,
                      ]}
                    >
                      {month.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          {!canEdit && (
            <Text style={styles.lockedHint}>
              Only Administrators can change this setting
            </Text>
          )}
        </View>

        {/* ── Receipt delivery section ──────────────────────────────────────── */}
        <SectionLabel text="Receipt Delivery" />

        <View style={styles.card}>
          <Text style={[styles.fieldHint, { marginBottom: 12 }]}>
            Choose how receipts are sent to customers after each sale
          </Text>

          <Toggle
            label="Send via WhatsApp"
            description="Opens WhatsApp with receipt message"
            value={operational.receipt_send_whatsapp}
            onToggle={(v) =>
              canEdit && saveReceiptToggle("receipt_send_whatsapp", v)
            }
            disabled={!canEdit}
          />
          <View style={styles.divider} />
          <Toggle
            label="Send via Email"
            description="Emails receipt PDF to customer"
            value={operational.receipt_send_email}
            onToggle={(v) =>
              canEdit && saveReceiptToggle("receipt_send_email", v)
            }
            disabled={!canEdit}
          />
          <View style={styles.divider} />
          <Toggle
            label="Save PDF to Device"
            description="Silently saves receipt to device storage"
            value={operational.receipt_download_pdf}
            onToggle={(v) =>
              canEdit && saveReceiptToggle("receipt_download_pdf", v)
            }
            disabled={!canEdit}
          />
        </View>

        {!canEdit && (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedBannerText}>
              🔒 You can view settings but cannot make changes. Contact your
              Administrator.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Header({
  onBack,
  editMode,
  canEdit,
  onEdit,
}: {
  onBack: () => void;
  editMode: boolean;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={{ minWidth: 60 }}>
        <Text style={styles.backButton}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Organization</Text>
      {!editMode && canEdit ? (
        <TouchableOpacity
          onPress={onEdit}
          style={{ minWidth: 60, alignItems: "flex-end" }}
        >
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ minWidth: 60 }} />
      )}
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text.toUpperCase()}</Text>;
}

function Field({
  label,
  value,
  editMode,
  canEdit,
  onChangeText,
  placeholder,
  hint,
  multiline,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  editMode: boolean;
  canEdit: boolean;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {editMode && canEdit ? (
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.secondary}
          multiline={multiline}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
        />
      ) : (
        <Text style={[styles.fieldValue, !value && styles.fieldValueEmpty]}>
          {value || "Not set"}
        </Text>
      )}
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

function Toggle({
  label,
  description,
  value,
  onToggle,
  disabled,
}: {
  label: string;
  description: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.toggleRow}
      onPress={() => onToggle(!value)}
      disabled={disabled}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackActive]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

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
  backButton: { fontSize: 16, color: COLORS.primary },
  title: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  editButtonText: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },

  content: { flex: 1 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.secondary,
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },

  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    padding: 16,
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
  fieldValueEmpty: {
    color: COLORS.secondary,
    fontStyle: "italic",
  },
  fieldHint: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 4,
    lineHeight: 16,
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
  inputMultiline: {
    height: 80,
    textAlignVertical: "top",
  },

  buttonRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 4,
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
  saveButton: { backgroundColor: COLORS.primary },
  saveButtonText: { fontSize: 15, fontWeight: "600", color: COLORS.white },
  buttonDisabled: { opacity: 0.6 },

  // Month picker
  monthScroll: { marginTop: 12 },
  monthRow: { flexDirection: "row", gap: 8, paddingBottom: 4 },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  monthChipText: { fontSize: 13, fontWeight: "600", color: COLORS.secondary },
  monthChipTextActive: { color: COLORS.white },

  lockedHint: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 10,
    fontStyle: "italic",
  },

  // Toggles
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 2,
  },
  toggleDescription: { fontSize: 12, color: COLORS.secondary },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    padding: 2,
  },
  toggleTrackActive: { backgroundColor: COLORS.accent },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: { alignSelf: "flex-end" },

  lockedBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 12,
  },
  lockedBannerText: { fontSize: 13, color: "#92400E", lineHeight: 18 },
});
