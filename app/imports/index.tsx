import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { PermissionGuard } from "../../context/PermissionGuard";
import { COLORS } from "../../lib/colors";

export default function ImportDataIndex() {
  const router = useRouter();

  const importOptions = [
    {
      title: "Import Products",
      description: "Import business data",
      icon: "import",
      route: "/imports/ImportProductsScreen",
      permission: "products.create",
      color: COLORS.primary,
    },
    {
      title: "Import Customers",
      description: "Import customer data",
      icon: "import",
      route: "/imports/ImportCustomersScreen",
      permission: "customers.create",
      color: COLORS.success,
    },
    {
      title: "Import Suppliers",
      description: "Import supplier data",
      icon: "import",
      route: "/imports/ImportSuppliersScreen",
      permission: "suppliers.create",
      color: COLORS.accent,
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header - Consistent with Dashboard */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={24} color={COLORS.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import Center</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bulk Data Upload</Text>
          <Text style={styles.sectionSubtext}>
            Select a category to begin importing your records into the system.
          </Text>

          <View style={styles.listContainer}>
            {importOptions.map((option, index) => (
              <PermissionGuard key={index} permission={option.permission}>
                <TouchableOpacity
                  style={styles.importCard}
                  onPress={() => router.push(option.route as any)}
                >
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: option.color + "15" }, // 15% opacity version of the color
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={option.icon as any}
                      size={28}
                      color={option.color}
                    />
                  </View>
                  <View style={styles.textContainer}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionDescription}>
                      {option.description}
                    </Text>
                  </View>
                  <Feather
                    name="chevron-right"
                    size={20}
                    color={COLORS.gray[400]}
                  />
                </TouchableOpacity>
              </PermissionGuard>
            ))}
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.infoBox}>
          <MaterialCommunityIcons
            name="file-excel-outline"
            size={20}
            color={COLORS.secondary}
          />
          <Text style={styles.infoText}>
            Supported formats: CSV, .xls, and .xlsx.
          </Text>
        </View>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1, padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 8,
  },
  sectionSubtext: {
    fontSize: 14,
    color: COLORS.secondary,
    marginBottom: 20,
  },
  listContainer: { gap: 16 },
  importCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  textContainer: { flex: 1 },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: COLORS.secondary,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: COLORS.gray[100],
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.secondary,
  },
});
