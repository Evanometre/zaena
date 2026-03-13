import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../lib/colors";

interface ReportCard {
  id: string;
  icon: string;
  title: string;
  description: string;
  route: string;
  color: string;
  category: string;
  isComingSoon?: boolean;
}

export default function ReportsScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const reports: ReportCard[] = [
    // Sales Reports
    {
      id: "sales-summary",
      icon: "💰",
      title: "Sales Summary",
      description: "Daily, weekly, monthly sales overview",
      route: "/reports/sales-summary",
      color: COLORS.accent,
      category: "sales",
    },
    {
      id: "sales-by-product",
      icon: "📊",
      title: "Sales by Product",
      description: "Best-selling products analysis",
      route: "/reports/sales-by-product",
      color: COLORS.primary,
      category: "sales",
    },
    {
      id: "sales-by-customer",
      icon: "👥",
      title: "Sales by Customer",
      description: "Top customers and purchase history",
      route: "/reports/sales-by-customer",
      color: COLORS.success,
      category: "sales",
    },
    {
      id: "sales-by-locations",
      icon: "💰",
      title: "Sales By Locations",
      description: "Daily, weekly, monthly sales overview for locations",
      route: "/reports/sales-by-locations",
      color: COLORS.accent,
      category: "sales",
    },
    {
      id: "sales-by-category",
      icon: "💰",
      title: "Sales By Categories",
      description: "Daily, weekly, monthly sales overview for categories",
      route: "/reports/sales-by-category",
      color: COLORS.accent,
      category: "sales",
    },
    {
      id: "sales-by-payment",
      icon: "💰",
      title: "Sales By Payment Method",
      description: "Sales by payment method",
      route: "/reports/sales-by-payment",
      color: COLORS.accent,
      category: "sales",
    },

    // Inventory Reports

    {
      id: "stock-movement",
      icon: "🔄",
      title: "Stock Movement",
      description: "Inventory in/out analysis",
      route: "/reports/stock-movement",
      color: COLORS.accent,
      category: "inventory",
    },
    {
      id: "low-stock",
      icon: "⚠️",
      title: "Low Stock Alert",
      description: "Items requiring restock",
      route: "/reports/low-stock",
      color: COLORS.warning,
      category: "inventory",
    },

    // Financial Reports
    {
      id: "profit-loss",
      icon: "📈",
      title: "Profit & Loss",
      description: "Income statement (P&L)",
      route: "/reports/profit-loss",
      color: COLORS.success,
      category: "financial",
    },
    {
      id: "cash-flow",
      icon: "💵",
      title: "Cash Flow",
      description: "Money in vs money out",
      route: "/reports/cash-flow",
      color: COLORS.accent,
      category: "financial",
    },
    {
      id: "expenses-summary",
      icon: "💸",
      title: "Expenses Summary",
      description: "Expense breakdown by category",
      route: "/reports/expenses-summary",
      color: COLORS.danger,
      category: "financial",
    },

    // Tax Reports
    {
      id: "vat-report",
      icon: "🧾",
      title: "VAT Report",
      description: "VAT collected & payable",
      route: "/reports/vat-report",
      color: COLORS.primary,
      category: "tax",
    },
    {
      id: "pit-report",
      icon: "👨‍💼",
      title: "PIT Report",
      description: "Employee PIT deductions",
      route: "/reports/pit-report",
      color: COLORS.accent,
      category: "tax",
    },
    {
      id: "tax-summary",
      icon: "📋",
      title: "Tax Summary",
      description: "Complete tax overview",
      route: "/reports/tax-summary",
      color: COLORS.success,
      category: "tax",
    },

    // Business Intelligence
    {
      id: "supplier-analysis",
      icon: "🏢",
      title: "Supplier Analysis",
      description: "Top suppliers & purchase trends",
      route: "/reports/supplier-analysis",
      color: COLORS.primary,
      category: "analytics",
      isComingSoon: true,
    },
    {
      id: "customer-analytics",
      icon: "📱",
      title: "Customer Analytics",
      description: "Customer behavior & trends",
      route: "/reports/customer-analytics",
      color: COLORS.accent,
      category: "analytics",
      isComingSoon: true,
    },
    {
      id: "products-analysis",
      icon: "🏆",
      title: "Products Analysis",
      description: "Products analysis",
      route: "/reports/products-analysis",
      color: COLORS.success,
      category: "analytics",
      isComingSoon: true,
    },
    {
      id: "categories-analysis",
      icon: "📁",
      title: "Categories Analysis",
      description: "Category performance Analysis",
      route: "/reports/categories-analysis",
      color: COLORS.accent,
      category: "analytics",
      isComingSoon: true,
    },
    {
      id: "stock-valuation-analytics",
      icon: "📦",
      title: "Stock Valuation Analytics",
      description: "Inventory Analytics",
      route: "/reports/stock-valuation-analytics",
      color: COLORS.primary,
      category: "analytics",
      isComingSoon: true,
    },
  ];

  const categories = [
    { id: "all", label: "All Reports", icon: "📊" },
    { id: "sales", label: "Sales", icon: "💰" },
    { id: "inventory", label: "Inventory", icon: "📦" },
    { id: "financial", label: "Financial", icon: "📈" },
    { id: "tax", label: "Tax", icon: "🧾" },
    { id: "analytics", label: "Analytics", icon: "🔍" },
  ];

  const filteredReports =
    selectedCategory === "all"
      ? reports
      : reports.filter((r) => r.category === selectedCategory);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports</Text>
        <Text style={styles.headerSubtitle}>Business insights & analytics</Text>
      </View>

      {/* Category Filter */}
      <View style={styles.categoryContainer}>
        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryChip,
              selectedCategory === category.id && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <Text style={styles.categoryIcon}>{category.icon}</Text>
            <Text
              style={[
                styles.categoryLabel,
                selectedCategory === category.id && styles.categoryLabelActive,
              ]}
            >
              {category.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Reports Grid */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.reportsGrid}>
          {filteredReports.map((report) => (
            <TouchableOpacity
              key={report.id}
              style={[
                styles.reportCard,
                report.isComingSoon && { opacity: 0.6 }, // Gray out the card
              ]}
              onPress={() => {
                if (report.isComingSoon) return; // Disable clicking
                router.push(report.route as any);
              }}
            >
              {/* Coming Soon Badge */}
              {report.isComingSoon && (
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>SOON</Text>
                </View>
              )}
              <View
                style={[
                  styles.reportIconContainer,
                  { backgroundColor: report.color },
                ]}
              >
                <Text style={styles.reportIcon}>{report.icon}</Text>
              </View>
              <Text style={styles.reportTitle}>{report.title}</Text>
              <Text style={styles.reportDescription}>{report.description}</Text>

              {/* Hide arrow for coming soon */}
              {!report.isComingSoon ? (
                <View style={styles.reportArrow}>
                  <Text style={styles.reportArrowText}>View →</Text>
                </View>
              ) : (
                <Text
                  style={[styles.reportArrowText, { color: COLORS.secondary }]}
                >
                  Locked
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {filteredReports.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyText}>No reports in this category</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    padding: 16,
    paddingTop: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 28, fontWeight: "bold", color: COLORS.primary },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.secondary,
    marginTop: 4,
  },

  categoryScroll: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  categoryContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 36,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary,
  },
  categoryIcon: { fontSize: 16, marginRight: 6 },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  categoryLabelActive: {
    color: COLORS.white,
  },

  content: { flex: 1, paddingHorizontal: 16 },
  reportsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16,
  },

  reportCard: {
    width: "48%",
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  reportIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  reportIcon: { fontSize: 24 },
  reportTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  reportDescription: {
    fontSize: 12,
    color: COLORS.secondary,
    lineHeight: 16,
    marginBottom: 12,
  },
  reportArrow: {
    alignSelf: "flex-start",
  },
  reportArrowText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.accent,
  },
  comingSoonBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  comingSoonText: {
    fontSize: 8,
    fontWeight: "bold",
    color: COLORS.secondary,
  },
  emptyState: {
    padding: 48,
    alignItems: "center",
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: {
    fontSize: 16,
    color: COLORS.secondary,
    textAlign: "center",
  },
  categoryContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
});
