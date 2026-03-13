// FILE: app/locations.tsx
import { useAuthStore } from "@/stores/authStore";
import { getTimeZones } from "@vvo/tzdb";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../lib/colors";
import supabase from "../lib/supabase";

interface Location {
  id: string;
  name: string;
  address?: string;
  created_at: string;
  timezone?: string;
}

export default function LocationsScreen() {
  const router = useRouter();
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const { organizationId } = useAuthStore();
  const [timezone, setTimezone] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, []);

  async function fetchLocations() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setLocations(data || []);
    } catch (err: any) {
      console.error("Error fetching locations:", err);
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setEditingLocation(null);
    setName("");
    setAddress("");
    setShowModal(true);
    setTimezone("");
    setTimezoneSearch("");
  }

  function openEditModal(location: Location) {
    setEditingLocation(location);
    setName(location.name);
    setAddress(location.address || "");
    setShowModal(true);
    setTimezone(location.timezone || "");
    setTimezoneSearch("");
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a location name");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (editingLocation) {
        // Update existing location
        const { error } = await supabase
          .from("locations")
          .update({
            name: name.trim(),
            address: address.trim() || null,
            timezone: timezone || null,
          })
          .eq("id", editingLocation.id);

        if (error) throw error;
        Alert.alert("Success", "Location updated successfully");
      } else {
        // Create new location
        const { error } = await supabase.from("locations").insert({
          organization_id: organizationId,
          name: name.trim(),
          address: address.trim() || null,
          timezone: timezone || null,
        });

        if (error) throw error;
        Alert.alert("Success", "Location added successfully");
      }

      setShowModal(false);
      fetchLocations();
    } catch (err: any) {
      console.error("Error saving location:", err);
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(location: Location) {
    Alert.alert(
      "Delete Location",
      `Are you sure you want to delete "${location.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("locations")
                .delete()
                .eq("id", location.id);

              if (error) throw error;
              Alert.alert("Success", "Location deleted");
              fetchLocations();
            } catch (err: any) {
              console.error("Error deleting location:", err);
              Alert.alert("Error", err.message);
            }
          },
        },
      ],
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/settings" as any)}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Locations</Text>
        <TouchableOpacity onPress={openAddModal}>
          <Text style={styles.addButton}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {locations.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📍</Text>
            <Text style={styles.emptyText}>No locations yet</Text>
            <Text style={styles.emptySubtext}>
              Add your first business location to get started
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={openAddModal}>
              <Text style={styles.emptyButtonText}>Add Location</Text>
            </TouchableOpacity>
          </View>
        ) : (
          locations.map((location) => (
            <View key={location.id} style={styles.locationCard}>
              <View style={styles.locationIcon}>
                <Text style={styles.locationIconText}>📍</Text>
              </View>
              <View style={styles.locationInfo}>
                <Text style={styles.locationName}>{location.name}</Text>
                {location.address && (
                  <Text style={styles.locationAddress}>{location.address}</Text>
                )}
                {location.timezone && (
                  <Text style={styles.locationAddress}>
                    🕐 {location.timezone}
                  </Text>
                )}
                <Text style={styles.locationDate}>
                  Added {new Date(location.created_at).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.locationActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openEditModal(location)}
                >
                  <Text style={styles.editText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDelete(location)}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingLocation ? "Edit Location" : "Add Location"}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Location Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Main Store, Warehouse A"
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Address (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={address}
                onChangeText={setAddress}
                placeholder="Enter full address"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Timezone (Optional)</Text>
              <TextInput
                style={styles.input}
                value={timezone}
                onChangeText={(text) => {
                  setTimezone(text);
                  setTimezoneSearch(text);
                }}
                placeholder="e.g., Africa/Lagos"
              />
              {timezoneSearch.length > 0 && (
                <ScrollView
                  style={{ maxHeight: 160, marginTop: 4 }}
                  nestedScrollEnabled
                >
                  {getTimeZones()
                    .map((tz) => tz.name)
                    .filter((tz) =>
                      tz.toLowerCase().includes(timezoneSearch.toLowerCase()),
                    )
                    .slice(0, 8)
                    .map((tz) => (
                      <TouchableOpacity
                        key={tz}
                        style={styles.tzSuggestion}
                        onPress={() => {
                          setTimezone(tz);
                          setTimezoneSearch("");
                        }}
                      >
                        <Text style={styles.tzSuggestionText}>{tz}</Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.saveButton,
                  saving && styles.buttonDisabled,
                ]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingLocation ? "Update" : "Add"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
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
  backButton: { fontSize: 16, color: COLORS.primary, minWidth: 60 },
  title: { fontSize: 20, fontWeight: "600", color: COLORS.primary },
  addButton: {
    fontSize: 16,
    color: COLORS.accent,
    fontWeight: "600",
    minWidth: 60,
    textAlign: "right",
  },
  content: { flex: 1, padding: 16 },
  emptyState: {
    padding: 48,
    alignItems: "center",
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.gray[600],
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.gray[500],
    textAlign: "center",
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
  },
  locationCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  locationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  locationIconText: { fontSize: 24 },
  locationInfo: { flex: 1 },
  locationName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
  },
  locationAddress: {
    fontSize: 13,
    color: COLORS.secondary,
    marginTop: 2,
  },
  locationDate: {
    fontSize: 11,
    color: COLORS.gray[400],
    marginTop: 4,
  },
  locationActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.background,
  },
  deleteButton: {
    backgroundColor: COLORS.danger + "20",
  },
  editText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.danger,
  },
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
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 24,
  },
  inputGroup: { marginBottom: 20 },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: COLORS.background,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
  },
  saveButton: {
    backgroundColor: COLORS.accent,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.white,
  },
  buttonDisabled: {
    backgroundColor: COLORS.gray[400],
  },
  tzSuggestion: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  tzSuggestionText: {
    fontSize: 14,
    color: COLORS.primary,
  },
});
