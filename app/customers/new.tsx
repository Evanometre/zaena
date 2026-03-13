// FILE: app/customers/new.tsx
import { queueOperation } from "@/lib/localDb";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

export default function NewCustomerScreen() {
  const { organizationId } = useAuthStore();
  const router = useRouter();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [creditLimit, setCreditLimit] = useState("0");
  const [creditTerms, setCreditTerms] = useState("30");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!permissionsLoading && !hasPermission("customers.create")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to create customers",
        [{ text: "OK", onPress: () => router.back() }],
      );
    }
  }, [permissionsLoading, hasPermission]);

  async function handleSubmit() {
    if (!hasPermission("customers.create")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to create customers",
      );
      return;
    }
    if (!name.trim()) {
      Alert.alert("Error", "Please enter customer name");
      return;
    }
    if (!organizationId) {
      Alert.alert("Error", "Organization not found");
      return;
    }

    const parsedCreditLimit = parseFloat(creditLimit) || 0;
    const parsedCreditTerms = parseInt(creditTerms) || 30;

    if (parsedCreditLimit < 0) {
      Alert.alert("Error", "Credit limit cannot be negative");
      return;
    }
    if (parsedCreditTerms < 1) {
      Alert.alert("Error", "Credit terms must be at least 1 day");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const localId = `pending_${Date.now()}`;

      await queueOperation({
        module: "customers",
        operation: "create_customer",
        payload: {
          organizationId,
          userId: user.id,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          credit_limit: parsedCreditLimit,
          credit_terms: parsedCreditTerms,
          localId,
        },
      });

      // Optimistically add to list cache
      try {
        const cacheKey = `customers_${organizationId}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const items = JSON.parse(cached);
          items.push({
            id: localId,
            name: name.trim(),
            phone: phone.trim() || null,
            email: email.trim() || null,
            credit_limit: parsedCreditLimit,
            credit_terms: parsedCreditTerms,
            total_purchases: 0,
            total_spent: 0,
            outstanding_balance: 0,
            last_purchase_date: null,
          });
          items.sort((a: any, b: any) => a.name.localeCompare(b.name));
          await AsyncStorage.setItem(cacheKey, JSON.stringify(items));
        }
      } catch {}

      Alert.alert(
        "Customer Saved ✓",
        "Customer has been saved and will sync automatically when online.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err: any) {
      console.error("Error adding customer:", err);
      Alert.alert("Error", err.message || "Failed to add customer");
    } finally {
      setLoading(false);
    }
  }

  if (permissionsLoading) {
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

  if (!hasPermission("customers.create")) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>{"<"} Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add Customer</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.form}>
        <Text style={styles.sectionLabel}>BASIC INFORMATION</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Customer Name <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter customer name"
            editable={!loading}
            autoFocus
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. 08012345678"
            keyboardType="phone-pad"
            editable={!loading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="customer@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Address</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={address}
            onChangeText={setAddress}
            placeholder="Enter customer address"
            multiline
            numberOfLines={3}
            editable={!loading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional notes about this customer..."
            multiline
            numberOfLines={4}
            editable={!loading}
          />
        </View>

        <Text style={styles.sectionLabel}>CREDIT SETTINGS</Text>
        <Text style={styles.sectionHint}>
          Set a credit limit of 0 to allow unlimited credit. Credit terms is the
          number of days before a payment is considered overdue.
        </Text>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>Credit Limit ({"₦"})</Text>
            <TextInput
              style={styles.input}
              value={creditLimit}
              onChangeText={setCreditLimit}
              placeholder="0"
              keyboardType="decimal-pad"
              editable={!loading}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
            <Text style={styles.label}>Credit Terms (days)</Text>
            <TextInput
              style={styles.input}
              value={creditTerms}
              onChangeText={setCreditTerms}
              placeholder="30"
              keyboardType="number-pad"
              editable={!loading}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.submitButtonText}>Add Customer</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 48 }} />
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
  backButton: { fontSize: 16, color: COLORS.primary, minWidth: 60 },
  title: { fontSize: 24, fontWeight: "bold", color: COLORS.primary },
  form: { flex: 1, padding: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8E8E93",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },
  sectionHint: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 12,
    marginTop: -4,
    lineHeight: 18,
  },
  inputGroup: { marginBottom: 16 },
  row: { flexDirection: "row" },
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
  textArea: { height: 80, textAlignVertical: "top" },
  submitButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  buttonDisabled: { backgroundColor: COLORS.gray[400] },
  submitButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
});
