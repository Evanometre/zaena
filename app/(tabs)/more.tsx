import { AntDesign } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { usePermissions } from "../../context/PermissionsContext";
import { COLORS } from "../../lib/colors";
import { useTheme } from "../../lib/theme/ThemeProvider";
import { useAuthStore } from "../../stores/authStore";

interface MenuItem {
  icon: string;
  title: string;
  route: string;
  description?: string;
  permission?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export default function MoreScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  // Select businessType as a value — not isCompany as a function.
  // This ensures the component re-renders when businessType changes.
  const { signOut, organizationId } = useAuthStore();
  const businessType = useAuthStore((s) => s.businessType);
  const company = businessType === "registered_company";
  const { hasPermission } = usePermissions();
  const styles = createStyles(theme);

  const allMenuSections: MenuSection[] = [
    {
      title: "Business Operations",
      items: [
        {
          icon: "product",
          title: "Products",
          route: "/products",
          description: "Manage your catalog",
          permission: "products.read",
        },
        {
          icon: "shopping",
          title: "Purchases",
          route: "/purchases",
          description: "Track purchases & suppliers",
          permission: "purchases.read",
        },
        {
          icon: "wallet",
          title: "Expenses",
          route: "/expenses",
          description: "Record business expenses",
          permission: "expenses.read",
        },
        {
          icon: "bar-chart",
          title: "Reports",
          route: "/reports",
          description: "Business insights & analytics",
          permission: "reports.view",
        },
        {
          icon: "export",
          title: "Export Data",
          route: "/exports/ExportScreen",
          description: "Export business data",
          permission: "reports.export",
        },
        {
          icon: "import",
          title: "Import Data",
          route: "/imports/",
          description: "Import data",
          permission: "suppliers.create",
        },
        {
          icon: "exception",
          title: "Refunds & Returns",
          route: "/refunds",
          description: "Manage refunds and returns",
          permission: "refunds.read",
        },
        {
          icon: "safety-certificate",
          title: "Trust Dashboard",
          route: "/trust/TrustDashboard",
          description: "View trust dashboard",
          permission: "trust.read",
        },
      ],
    },
    {
      title: "People",
      items: [
        {
          icon: "team",
          title: "Customers",
          route: "/customers",
          description: "Manage customer records",
          permission: "customers.read",
        },
        {
          icon: "solution",
          title: "Suppliers",
          route: "/suppliers",
          description: "Supplier management",
          permission: "suppliers.read",
        },
        {
          icon: "user",
          title: "Employees",
          route: "/payroll/employees",
          description: "Employee records",
          permission: "employees.read",
        },
        {
          icon: "audit",
          title: "Audit Trail",
          route: "/auditTrail/auditTrailScreen",
          description: "Every action, every actor",
          permission: "audit.read",
        },
      ],
    },
    {
      title: "Manufacturing",
      items: [
        {
          icon: "profile",
          title: "Product Recipe - Bill of Materials",
          route: "/manufacturing/bom",
          description: "Manage product recipes",
          permission: "manufacturing.read",
        },
        {
          icon: "bar-chart",
          title: "Production Reports",
          route: "/manufacturing/reports",
          description: "View production history and costs",
          permission: "manufacturing.read",
        },
        {
          icon: "tool",
          title: "Production Orders",
          route: "/manufacturing/production",
          description: "Track production runs",
          permission: "manufacturing.read",
        },
        {
          icon: "clock",
          title: "AR Aging Report",
          route: "/sales-orders/aging",
          description: "Outstanding receivables by age",
          permission: "invoices.read",
        },
        {
          icon: "file-text",
          title: "Sales Orders",
          route: "/sales-orders",
          description: "Manage bulk and credit orders",
          permission: "sales_orders.read",
        },
      ],
    },
    {
      title: "Finance & Tax",
      items: [
        {
          icon: "fund",
          title: "Finance Dashboard",
          route: "/finance/allocations",
          description: "Profit allocation & reports",
          permission: "allocations.read",
        },
        // Drawings: business_name only — companies use dividends instead
        ...(!company
          ? [
              {
                icon: "money-collect",
                title: "Owner's Drawings",
                route: "/finance/drawings",
                description: "Track withdrawals",
                permission: "drawings.read",
              },
            ]
          : []),
        {
          icon: "reconciliation",
          title: "Payroll Runs",
          route: "/payroll/runs",
          description: "Monthly payroll processing",
          permission: "payroll.read",
        },
        {
          icon: "percentage",
          title: "Tax Dashboard",
          route: "/tax/dashboard",
          description: "VAT, PIT & remittances",
          permission: "tax.read",
        },
      ],
    },
    {
      title: "Settings",
      items: [
        {
          icon: "key",
          title: "Roles & Permissions",
          route: "/settingsg/roles",
          description: "Create and manage roles",
          permission: "roles.read",
        },
        {
          icon: "usergroup-add",
          title: "Users & Roles",
          route: "/settingsg/users",
          description: "Manage team members",
          permission: "invites.read",
        },
        {
          icon: "setting",
          title: "Tax Settings",
          route: "/tax",
          description: "Configure tax rates",
          permission: "tax.settings.read",
        },
        {
          icon: "tool",
          title: "App Settings",
          route: "/settings",
          description: "General preferences",
        },
      ],
    },
  ];

  // company is a stable derived value from a subscribed slice —
  // useMemo correctly re-runs when either hasPermission or company changes.
  const visibleMenuSections = useMemo(() => {
    return allMenuSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (!item.permission) return true;
          return hasPermission(item.permission);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [hasPermission, company]);

  const handleMenuPress = (item: MenuItem) => {
    if (item.route === "/exports/ExportScreen") {
      router.push({
        pathname: item.route as any,
        params: { organizationId: organizationId || "" },
      });
    } else {
      router.push(item.route as any);
    }
  };

  async function handleLogout() {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
            router.replace("/(auth)/login" as any);
          } catch (err: any) {
            Alert.alert("Error", "Failed to logout. Please try again.");
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
        <TouchableOpacity
          onPress={() => router.push("/settings" as any)}
          style={styles.settingsButton}
        >
          <AntDesign name="tool" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {visibleMenuSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuGroup}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.menuItem,
                    itemIndex === section.items.length - 1 &&
                      styles.menuItemLast,
                  ]}
                  onPress={() => handleMenuPress(item)}
                >
                  <View style={styles.menuIconContainer}>
                    <AntDesign
                      name={item.icon as any}
                      size={24}
                      color={COLORS.gray[700]}
                    />
                  </View>
                  <View style={styles.menuContent}>
                    <Text style={styles.menuTitle}>{item.title}</Text>
                    {item.description && (
                      <Text style={styles.menuDescription}>
                        {item.description}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.menuArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <AntDesign
              name="logout"
              size={20}
              color={COLORS.danger}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: theme.spacing.lg,
      paddingTop: 60,
      paddingBottom: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.borderSubtle,
    },
    headerTitle: { ...theme.typography.h1, color: theme.colors.textPrimary },
    content: { flex: 1 },
    settingsButton: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.round,
      backgroundColor: theme.colors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    section: { paddingHorizontal: 16, marginTop: 24 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: COLORS.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    menuGroup: {
      backgroundColor: COLORS.white,
      borderRadius: 12,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    menuItemLast: { borderBottomWidth: 0 },
    menuIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: COLORS.background,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    menuContent: { flex: 1 },
    menuTitle: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
    menuDescription: { fontSize: 13, color: COLORS.secondary, marginTop: 2 },
    menuArrow: { fontSize: 24, color: COLORS.secondary },
    logoutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.white,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.danger,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    logoutText: { fontSize: 16, fontWeight: "600", color: COLORS.danger },
  });
