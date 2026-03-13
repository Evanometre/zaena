// FILE: app/suppliers/[id].tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { queueOperation } from "../../lib/localDb";
import supabase from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  payment_terms: string;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export default function SupplierDetailScreen() {
  const { organizationId } = useAuthStore();
  const router = useRouter();
  const params = useLocalSearchParams();
  const supplierId = params.id as string;

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form fields
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  const { hasPermission, loading: permLoading } = usePermissions();
  const canEdit = hasPermission("suppliers.update");
  const canDelete = hasPermission("suppliers.delete");

  useEffect(() => {
    if (supplierId) {
      fetchSupplier(); // purchases are now fetched inside fetchSupplier
    }
  }, [supplierId]);

  async function fetchSupplier() {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!supplierId || !uuidRegex.test(supplierId)) {
      console.warn("Invalid supplier id:", supplierId);
      router.replace("/suppliers");
      return;
    }

    setLoading(true);
    try {
      // ── Show cache immediately ──────────────────────────
      const cacheKey = `supplier_detail_${supplierId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { supplier: cs, purchases: cp } = JSON.parse(cached);
        applySupplierData(cs);
        if (cp) setPurchaseHistory(cp);
        setLoading(false);
      }

      // ── Fetch fresh ─────────────────────────────────────
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", supplierId)
        .single();

      if (error) throw error;

      applySupplierData(data);

      // Fetch purchase history fresh too
      const { data: purchaseData } = await supabase
        .from("purchases")
        .select(
          "id, total_cost, total_items, total_units, created_at, locations(name)",
        )
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: false })
        .limit(10);

      const freshPurchases = purchaseData || [];
      setPurchaseHistory(freshPurchases);

      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({ supplier: data, purchases: freshPurchases }),
      );
    } catch (err: any) {
      if (!supplier) {
        console.error("Error fetching supplier:", err);
        Alert.alert("Error", err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  function applySupplierData(data: Supplier) {
    setSupplier(data);
    setName(data.name || "");
    setContactPerson(data.contact_person || "");
    setEmail(data.email || "");
    setPhone(data.phone || "");
    setAddress(data.address || "");
    setPaymentTerms(data.payment_terms || "");
    setNotes(data.notes || "");
    setIsActive(data.is_active);
  }

  async function handleUpdate() {
    if (!name.trim()) {
      Alert.alert("Error", "Supplier name cannot be empty");
      return;
    }

    setSaving(true);
    try {
      await queueOperation({
        module: "suppliers",
        operation: "update_supplier",
        payload: {
          supplierId,
          name: name.trim(),
          contactPerson: contactPerson.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          paymentTerms: paymentTerms.trim() || null,
          notes: notes.trim() || null,
          isActive,
        },
      });

      // Optimistic cache update
      if (supplier) {
        const updated: Supplier = {
          ...supplier,
          name: name.trim(),
          contact_person: contactPerson.trim() || "",
          email: email.trim() || "",
          phone: phone.trim() || "",
          address: address.trim() || "",
          payment_terms: paymentTerms.trim() || "",
          notes: notes.trim() || "",
          is_active: isActive,
        };
        setSupplier(updated);

        const cacheKey = `supplier_detail_${supplierId}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          await AsyncStorage.setItem(
            cacheKey,
            JSON.stringify({ ...parsed, supplier: updated }),
          );
        }
        // Invalidate list caches so name/status changes show
        if (organizationId) {
          await AsyncStorage.removeItem(`suppliers_${organizationId}_false`);
          await AsyncStorage.removeItem(`suppliers_${organizationId}_true`);
        }
      }

      setEditMode(false);
      Alert.alert("Saved ✓", "Changes saved and will sync when online.");
    } catch (err: any) {
      console.error("Error updating supplier:", err);
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      "Delete Supplier",
      `Are you sure you want to delete "${supplier?.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await queueOperation({
                module: "suppliers",
                operation: "delete_supplier",
                payload: { supplierId, name: supplier?.name ?? "" },
              });

              // Remove from caches
              await AsyncStorage.removeItem(`supplier_detail_${supplierId}`);
              if (organizationId) {
                await AsyncStorage.removeItem(
                  `suppliers_${organizationId}_false`,
                );
                await AsyncStorage.removeItem(
                  `suppliers_${organizationId}_true`,
                );
              }

              Alert.alert(
                "Deleted ✓",
                "Supplier will be removed when online.",
                [{ text: "OK", onPress: () => router.back() }],
              );
            } catch (err: any) {
              console.error("Error deleting supplier:", err);
              Alert.alert("Error", err.message);
            }
          },
        },
      ],
    );
  }

  function toggleActive() {
    setIsActive((prev) => !prev);
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

  if (!hasPermission("suppliers.read")) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Supplier</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.errorState}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔐</Text>
          <Text style={styles.errorText}>Access Restricted</Text>
        </View>
      </View>
    );
  }

  if (loading) {
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

  if (!supplier) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Supplier</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Supplier not found</Text>
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
        <Text style={styles.title}>Supplier Details</Text>
        {!editMode ? (
          canEdit ? (
            <TouchableOpacity onPress={() => setEditMode(true)}>
              <Text style={styles.editButton}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )
        ) : (
          <TouchableOpacity onPress={() => setEditMode(false)}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        {!editMode ? (
          // VIEW MODE
          <>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.supplierName}>{supplier.name}</Text>
                {!supplier.is_active && (
                  <View style={styles.inactiveBadge}>
                    <Text style={styles.inactiveBadgeText}>Inactive</Text>
                  </View>
                )}
              </View>

              {supplier.contact_person && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Contact Person:</Text>
                  <Text style={styles.infoValue}>
                    {supplier.contact_person}
                  </Text>
                </View>
              )}

              {supplier.phone && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Phone:</Text>
                  <Text style={styles.infoValue}>{supplier.phone}</Text>
                </View>
              )}

              {supplier.email && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email:</Text>
                  <Text style={styles.infoValue}>{supplier.email}</Text>
                </View>
              )}

              {supplier.address && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Address:</Text>
                  <Text style={styles.infoValue}>{supplier.address}</Text>
                </View>
              )}

              {supplier.payment_terms && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Payment Terms:</Text>
                  <Text style={styles.infoValue}>{supplier.payment_terms}</Text>
                </View>
              )}

              {supplier.notes && (
                <View style={styles.notesSection}>
                  <Text style={styles.notesLabel}>Notes:</Text>
                  <Text style={styles.notesText}>{supplier.notes}</Text>
                </View>
              )}

              <View style={styles.metaRow}>
                <Text style={styles.metaText}>
                  Created: {new Date(supplier.created_at).toLocaleDateString()}
                </Text>
                <Text style={styles.metaText}>
                  Updated: {new Date(supplier.updated_at).toLocaleDateString()}
                </Text>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionsCard}>
              <Text style={styles.actionsTitle}>Actions</Text>

              {hasPermission("inventory.adjust") && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push("/inventory/adjust")}
                >
                  <Text style={styles.actionIcon}>📦</Text>
                  <Text style={styles.actionText}>
                    Add Inventory from this Supplier
                  </Text>
                </TouchableOpacity>
              )}

              {canDelete && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleDelete}
                >
                  <Text style={styles.actionIcon}>🗑️</Text>
                  <Text style={[styles.actionText, { color: COLORS.danger }]}>
                    Delete Supplier
                  </Text>
                </TouchableOpacity>
              )}

              {!canEdit && !canDelete && !hasPermission("inventory.adjust") && (
                <Text
                  style={{
                    fontSize: 14,
                    color: COLORS.secondary,
                    fontStyle: "italic",
                  }}
                >
                  No actions available
                </Text>
              )}
            </View>

            {/* Purchase History */}
            <View style={styles.historyCard}>
              <Text style={styles.historyTitle}>Purchase History</Text>

              {loadingPurchases ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : purchaseHistory.length === 0 ? (
                <Text style={styles.historyPlaceholder}>
                  No purchases from this supplier yet
                </Text>
              ) : (
                <>
                  {purchaseHistory.map((purchase) => (
                    <TouchableOpacity
                      key={purchase.id}
                      style={styles.historyItem}
                      onPress={() =>
                        router.push(`/purchases/${purchase.id}` as any)
                      }
                    >
                      <View style={styles.historyItemHeader}>
                        <Text style={styles.historyDate}>
                          {new Date(purchase.created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </Text>
                        <Text style={styles.historyCost}>
                          ₦{purchase.total_cost.toLocaleString()}
                        </Text>
                      </View>
                      <Text style={styles.historyDetail}>
                        {purchase.total_items} items • {purchase.total_units}{" "}
                        units • {purchase.locations.name}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  {purchaseHistory.length === 10 && (
                    <TouchableOpacity
                      style={styles.viewAllButton}
                      onPress={() => {
                        // Navigate to filtered purchases view
                        router.back();
                      }}
                    >
                      <Text style={styles.viewAllText}>
                        View All Purchases →
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </>
        ) : (
          // EDIT MODE
          <>
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Supplier Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Supplier name"
                  editable={!saving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Contact Person</Text>
                <TextInput
                  style={styles.input}
                  value={contactPerson}
                  onChangeText={setContactPerson}
                  placeholder="Contact person"
                  editable={!saving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  editable={!saving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!saving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Address</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Full address"
                  multiline
                  numberOfLines={3}
                  editable={!saving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Payment Terms</Text>
                <TextInput
                  style={styles.input}
                  value={paymentTerms}
                  onChangeText={setPaymentTerms}
                  placeholder="e.g., Net 30"
                  editable={!saving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Additional notes"
                  multiline
                  numberOfLines={4}
                  editable={!saving}
                />
              </View>

              {/* Active Status Toggle */}
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Supplier Status</Text>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    isActive ? styles.toggleActive : styles.toggleInactive,
                  ]}
                  onPress={toggleActive}
                  disabled={saving}
                >
                  <Text style={styles.toggleButtonText}>
                    {isActive ? "✓ Active" : "○ Inactive"}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.buttonDisabled]}
                onPress={handleUpdate}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
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
  backButton: { fontSize: 16, color: COLORS.primary },
  title: { fontSize: 20, fontWeight: "600", color: COLORS.primary },
  editButton: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  cancelButton: { fontSize: 16, color: COLORS.danger, fontWeight: "600" },
  content: { flex: 1, padding: 16 },
  card: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  supplierName: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.primary,
    flex: 1,
  },
  inactiveBadge: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inactiveBadgeText: { fontSize: 10, fontWeight: "600", color: COLORS.white },
  infoRow: {
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.secondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: "500",
  },
  notesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  notesLabel: {
    fontSize: 12,
    color: COLORS.secondary,
    marginBottom: 8,
  },
  notesText: {
    fontSize: 14,
    color: COLORS.primary,
    lineHeight: 20,
  },
  historyItem: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  historyItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  historyCost: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.accent,
  },
  historyDetail: {
    fontSize: 12,
    color: COLORS.secondary,
  },
  viewAllButton: {
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.accent,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  metaText: {
    fontSize: 11,
    color: COLORS.secondary,
  },
  actionsCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    marginBottom: 8,
  },
  actionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.primary,
  },
  historyCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },
  historyPlaceholder: {
    fontSize: 14,
    color: COLORS.secondary,
    fontStyle: "italic",
    textAlign: "center",
    padding: 24,
  },
  errorState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 48,
  },
  errorText: {
    fontSize: 18,
    color: COLORS.secondary,
  },
  form: { marginBottom: 32 },
  inputGroup: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 8,
  },
  required: { color: COLORS.danger },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
  },
  toggleActive: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  toggleInactive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.white,
  },
  saveButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: COLORS.gray[400] },
  saveButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
});
