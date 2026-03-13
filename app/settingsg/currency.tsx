// app/settingsg/currency.tsx
// Page for managing organization's timezone and currency settings.
import { usePermissions } from "@/context/PermissionsContext";
import { COLORS } from "@/lib/colors";
import supabase from "@/lib/supabase";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useAuthStore } from "@/stores/authStore";
import { getTimeZones } from "@vvo/tzdb";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function CurrencySettingsPage() {
  const router = useRouter();
  const { organizationId } = useAuthStore();

  const [timezones, setTimezones] = useState<string[]>([]);
  const [filteredTimezones, setFilteredTimezones] = useState<string[]>([]);
  const [selectedTimezone, setSelectedTimezone] = useState<string>("");
  const { hasPermission, loading: permLoading } = usePermissions();
  const [currency, setCurrency] = useState({
    code: "USD",
    symbol: "$",
    name: "US Dollar",
  });
  const [currencySearch, setCurrencySearch] = useState("");
  const [filteredCurrencies, setFilteredCurrencies] = useState(ALL_CURRENCIES);

  const [loading, setLoading] = useState(true);

  // Load all IANA timezones once
  useEffect(() => {
    const zones = getTimeZones()
      .map((tz) => tz.name)
      .sort();
    setTimezones(zones);
    setFilteredTimezones(zones);
  }, []);

  // Load current org settings
  useEffect(() => {
    async function loadOrgSettings() {
      if (!organizationId) return;
      try {
        const { data: org } = await supabase
          .from("organizations")
          .select("timezone, currency")
          .eq("id", organizationId)
          .single();

        if (org?.timezone) setSelectedTimezone(org.timezone);

        if (org?.currency) {
          const match = ALL_CURRENCIES.find((c) => c.code === org.currency);
          setCurrency({
            code: org.currency,
            symbol: match?.symbol ?? org.currency,
            name: match?.name ?? "",
          });
        } else if (org?.timezone) {
          setCurrency(getCurrencyForTimezone(org.timezone));
        }
      } catch (err) {
        console.error("Failed to load org settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadOrgSettings();
  }, [organizationId]);

  // Suggest currency when timezone changes
  useEffect(() => {
    if (selectedTimezone) {
      const suggested = getCurrencyForTimezone(selectedTimezone);
      setCurrency(suggested);
    }
  }, [selectedTimezone]);

  // Filter timezones based on search text
  const filterTimezones = (text: string) => {
    setFilteredTimezones(
      timezones.filter((tz) => tz.toLowerCase().includes(text.toLowerCase())),
    );
  };

  // Filter currencies based on search text
  useEffect(() => {
    const filtered = ALL_CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
        c.name.toLowerCase().includes(currencySearch.toLowerCase()),
    );
    setFilteredCurrencies(filtered);
  }, [currencySearch]);

  async function saveSettings() {
    if (!organizationId) return;
    try {
      await supabase
        .from("organizations")
        .update({
          timezone: selectedTimezone,
          currency: currency.code,
        })
        .eq("id", organizationId);

      router.back();
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  }

  if (permLoading || loading) {
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

  if (!hasPermission("settings.manage")) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginBottom: 16 }}
        >
          <Text style={{ color: COLORS.primary, fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
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
            You do not have permission to manage settings.
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
        <Text style={styles.headerTitle}>Timezone & Currency</Text>
        <View style={{ width: 60 }} />
      </View>
      <Text style={styles.title}>Select Timezone</Text>
      <TextInput
        placeholder="Search timezone..."
        style={styles.searchInput}
        onChangeText={filterTimezones}
      />
      <FlatList
        data={filteredTimezones}
        keyExtractor={(item) => item}
        style={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.item,
              item === selectedTimezone && styles.selectedItem,
            ]}
            onPress={() => setSelectedTimezone(item)}
          >
            <Text
              style={[
                styles.itemText,
                item === selectedTimezone && styles.selectedItemText,
              ]}
            >
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      <Text style={styles.title}>Select Currency</Text>
      <TextInput
        placeholder="Search currency..."
        style={styles.searchInput}
        value={currencySearch}
        onChangeText={setCurrencySearch}
      />
      <FlatList
        data={filteredCurrencies}
        keyExtractor={(item) => item.code}
        style={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.item,
              item.code === currency.code && styles.selectedItem,
            ]}
            onPress={() => setCurrency(item)}
          >
            <Text
              style={[
                styles.itemText,
                item.code === currency.code && styles.selectedItemText,
              ]}
            >
              {item.symbol} • {item.name}
            </Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
        <Text style={styles.saveButtonText}>Save Settings</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: COLORS.background },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginVertical: 12,
    color: COLORS.primary,
  },
  searchInput: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 48,
    paddingBottom: 16,
    marginBottom: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  backButton: { fontSize: 16, color: COLORS.primary },
  list: { maxHeight: 200, marginBottom: 24 },
  item: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    marginBottom: 8,
  },
  selectedItem: {
    backgroundColor: COLORS.accent,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  selectedItemText: { color: COLORS.white },
  itemText: { fontSize: 14, color: COLORS.primary },
  saveButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  saveButtonText: { color: COLORS.white, fontWeight: "600", fontSize: 16 },
});
