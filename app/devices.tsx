// FILE: app/devices.tsx
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { COLORS } from '../lib/colors';
import supabase from '../lib/supabase';

interface Device {
  id: string;
  device_name: string;
  last_seen_at: string;
  created_at: string;
  locations: {
    name: string;
  };
}

interface Location {
  id: string;
  name: string;
}

export default function DevicesScreen() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      // Fetch devices
      const { data: devicesData, error: devicesError } = await supabase
        .from('devices')
        .select(`
          *,
          locations (name)
        `)
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: true });

      if (devicesError) throw devicesError;
      setDevices(devicesData || []);

      // Fetch locations for dropdown
      const { data: locationsData, error: locationsError } = await supabase
        .from('locations')
        .select('id, name')
        .eq('organization_id', profile.organization_id);

      if (locationsError) throw locationsError;
      setLocations(locationsData || []);
      
      // Set default location if only one exists
      if (locationsData && locationsData.length === 1) {
        setSelectedLocationId(locationsData[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setEditingDevice(null);
    setDeviceName('');
    if (locations.length === 1) {
      setSelectedLocationId(locations[0].id);
    } else {
      setSelectedLocationId('');
    }
    setShowModal(true);
  }

  function openEditModal(device: Device) {
    setEditingDevice(device);
    setDeviceName(device.device_name);
    // Note: We don't allow location change on edit to maintain receipt integrity
    setShowModal(true);
  }

  async function handleSave() {
    if (!deviceName.trim()) {
      Alert.alert('Error', 'Please enter a device name');
      return;
    }

    if (!editingDevice && !selectedLocationId) {
      Alert.alert('Error', 'Please select a location');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      if (editingDevice) {
        // Update existing device (name only)
        const { error } = await supabase
          .from('devices')
          .update({
            device_name: deviceName.trim(),
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', editingDevice.id);

        if (error) throw error;
        Alert.alert('Success', 'Device updated successfully');
      } else {
        // Create new device
        const { error } = await supabase
          .from('devices')
          .insert({
            organization_id: profile.organization_id,
            location_id: selectedLocationId,
            device_name: deviceName.trim(),
            last_seen_at: new Date().toISOString(),
          });

        if (error) throw error;
        Alert.alert('Success', 'Device registered successfully');
      }

      setShowModal(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving device:', err);
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(device: Device) {
    Alert.alert(
      'Delete Device',
      `Are you sure you want to delete "${device.device_name}"? This will affect historical receipt tracking.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('devices')
                .delete()
                .eq('id', device.id);

              if (error) throw error;
              Alert.alert('Success', 'Device deleted');
              fetchData();
            } catch (err: any) {
              console.error('Error deleting device:', err);
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
<TouchableOpacity onPress={() => router.push('/settings' as any)}>
  <Text style={styles.backButton}>← Back</Text>
</TouchableOpacity>
        <Text style={styles.title}>Devices</Text>
        <TouchableOpacity onPress={openAddModal}>
          <Text style={styles.addButton}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoIcon}>💡</Text>
        <Text style={styles.infoText}>
          Register each POS terminal or device. This helps track which device made which sale and generates unique receipt numbers.
        </Text>
      </View>

      <ScrollView style={styles.content}>
        {devices.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📱</Text>
            <Text style={styles.emptyText}>No devices registered</Text>
            <Text style={styles.emptySubtext}>
              Register your first device to enable proper receipt tracking
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={openAddModal}>
              <Text style={styles.emptyButtonText}>Register Device</Text>
            </TouchableOpacity>
          </View>
        ) : (
          devices.map((device) => (
            <View key={device.id} style={styles.deviceCard}>
              <View style={styles.deviceIcon}>
                <Text style={styles.deviceIconText}>📱</Text>
              </View>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>{device.device_name}</Text>
                <Text style={styles.deviceLocation}>
                  📍 {device.locations.name}
                </Text>
                <Text style={styles.deviceDate}>
                  Last active: {new Date(device.last_seen_at).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.deviceActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openEditModal(device)}
                >
                  <Text style={styles.editText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDelete(device)}
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
              {editingDevice ? 'Edit Device' : 'Register Device'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Device Name *</Text>
              <TextInput
                style={styles.input}
                value={deviceName}
                onChangeText={setDeviceName}
                placeholder="e.g., Counter 1, Main POS, Cashier A"
                autoFocus
              />
              <Text style={styles.inputHint}>
                This name will appear on receipts and reports
              </Text>
            </View>

            {!editingDevice && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location *</Text>
                {locations.length === 0 ? (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      ⚠️ No locations found. Please add a location first.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.locationPicker}>
                    {locations.map((location) => (
                      <TouchableOpacity
                        key={location.id}
                        style={[
                          styles.locationOption,
                          selectedLocationId === location.id && styles.locationOptionActive,
                        ]}
                        onPress={() => setSelectedLocationId(location.id)}
                      >
                        <View style={[
                          styles.radioCircle,
                          selectedLocationId === location.id && styles.radioCircleActive,
                        ]}>
                          {selectedLocationId === location.id && (
                            <View style={styles.radioDot} />
                          )}
                        </View>
                        <Text style={[
                          styles.locationOptionText,
                          selectedLocationId === location.id && styles.locationOptionTextActive,
                        ]}>
                          {location.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {editingDevice && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ Location cannot be changed to maintain receipt integrity
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, saving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={saving || locations.length === 0}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingDevice ? 'Update' : 'Register'}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { fontSize: 16, color: COLORS.primary, minWidth: 60 },
  title: { fontSize: 20, fontWeight: '600', color: COLORS.primary },
  addButton: { fontSize: 16, color: COLORS.accent, fontWeight: '600', minWidth: 60, textAlign: 'right' },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E0F2FE',
    margin: 16,
    padding: 12,
    borderRadius: 8,
    alignItems: 'flex-start',
  },
  infoIcon: { fontSize: 20, marginRight: 8 },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#0C4A6E',
    lineHeight: 18,
  },
  content: { flex: 1, paddingHorizontal: 16 },
  emptyState: {
    padding: 48,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray[600],
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.gray[500],
    textAlign: 'center',
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
    fontWeight: '600',
  },
  deviceCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deviceIconText: { fontSize: 24 },
  deviceInfo: { flex: 1 },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  deviceLocation: {
    fontSize: 13,
    color: COLORS.secondary,
    marginTop: 2,
  },
  deviceDate: {
    fontSize: 11,
    color: COLORS.gray[400],
    marginTop: 4,
  },
  deviceActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.background,
  },
  deleteButton: {
    backgroundColor: COLORS.danger + '20',
  },
  editText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 24,
  },
  inputGroup: { marginBottom: 20 },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
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
  inputHint: {
    fontSize: 12,
    color: COLORS.gray[500],
    marginTop: 4,
  },
  locationPicker: {
    gap: 8,
  },
  locationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  locationOptionActive: {
    backgroundColor: COLORS.accent + '10',
    borderColor: COLORS.accent,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.gray[400],
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleActive: {
    borderColor: COLORS.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  locationOptionText: {
    fontSize: 16,
    color: COLORS.secondary,
  },
  locationOptionTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  warningBox: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#92400E',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.background,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  saveButton: {
    backgroundColor: COLORS.accent,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  buttonDisabled: {
    backgroundColor: COLORS.gray[400],
  },
});