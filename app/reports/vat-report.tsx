import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../lib/colors";
import supabase from "../../lib/supabase";

interface VATData {
  vatRate: number;
  totalSales: number;
  vatCollected: number;
  vatRemitted: number;
  vatOutstanding: number;
  salesBreakdown: {
    month: string;
    sales: number;
    vat: number;
  }[];
}

export default function VATReport() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear().toString(),
  );
  const [data, setData] = useState<VATData | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [selectedYear]),
  );

  async function fetchData() {
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

      // Get VAT rate
      const { data: vatSettings } = await supabase
        .from("tax_settings")
        .select("rate")
        .eq("organization_id", profile.organization_id)
        .eq("tax_type", "vat")
        .eq("is_active", true)
        .single();

      const vatRate = vatSettings?.rate || 7.5;

      // Get sales for the year
      const { data: salesData } = await supabase
        .from("sales")
        .select("total_amount, sale_date")
        .eq("organization_id", profile.organization_id)
        .eq("payment_status", "paid")
        .is("voided_at", null)
        .gte("sale_date", `${selectedYear}-01-01`)
        .lte("sale_date", `${selectedYear}-12-31`);

      const totalSales =
        salesData?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
      const vatCollected = (totalSales * vatRate) / (100 + vatRate); // Extract VAT from inclusive price

      // Get VAT remittances
      const { data: remittances } = await supabase
        .from("tax_remittances")
        .select("amount_paid")
        .eq("organization_id", profile.organization_id)
        .eq("tax_type", "vat")
        .gte("period_start", `${selectedYear}-01-01`)
        .lte("period_end", `${selectedYear}-12-31`);

      const vatRemitted =
        remittances?.reduce((sum, r) => sum + Number(r.amount_paid), 0) || 0;
      const vatOutstanding = Math.max(0, vatCollected - vatRemitted);

      // Group sales by month
      const monthlyData: { [key: string]: { sales: number; vat: number } } = {};

      salesData?.forEach((sale) => {
        const month = sale.sale_date.substring(0, 7); // YYYY-MM
        if (!monthlyData[month]) {
          monthlyData[month] = { sales: 0, vat: 0 };
        }
        const saleAmount = Number(sale.total_amount);
        monthlyData[month].sales += saleAmount;
        monthlyData[month].vat += (saleAmount * vatRate) / (100 + vatRate);
      });

      const salesBreakdown = Object.entries(monthlyData)
        .map(([month, data]) => ({
          month,
          sales: data.sales,
          vat: data.vat,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      setData({
        vatRate,
        totalSales,
        vatCollected,
        vatRemitted,
        vatOutstanding,
        salesBreakdown,
      });
    } catch (err: any) {
      console.error("Error fetching VAT data:", err);
    } finally {
      setLoading(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) =>
    (currentYear - i).toString(),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>VAT Report</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Year Selector */}
      <View style={styles.yearContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {years.map((year) => (
            <TouchableOpacity
              key={year}
              style={[
                styles.yearButton,
                selectedYear === year && styles.yearButtonActive,
              ]}
              onPress={() => setSelectedYear(year)}
            >
              <Text
                style={[
                  styles.yearText,
                  selectedYear === year && styles.yearTextActive,
                ]}
              >
                {year}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 40 }}
          />
        ) : data ? (
          <>
            {/* VAT Summary Card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryTitle}>
                  VAT Summary {selectedYear}
                </Text>
                <View style={styles.rateBadge}>
                  <Text style={styles.rateText}>{data.vatRate}%</Text>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Total Sales (VAT Inclusive):
                </Text>
                <Text style={styles.summaryValue}>
                  ₦{data.totalSales.toLocaleString()}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>VAT Collected:</Text>
                <Text style={[styles.summaryValue, { color: COLORS.accent }]}>
                  ₦{data.vatCollected.toLocaleString()}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>VAT Remitted:</Text>
                <Text style={[styles.summaryValue, { color: COLORS.success }]}>
                  ₦{data.vatRemitted.toLocaleString()}
                </Text>
              </View>

              <View style={[styles.summaryRow, styles.outstandingRow]}>
                <Text style={styles.outstandingLabel}>VAT Outstanding:</Text>
                <Text style={styles.outstandingValue}>
                  ₦{data.vatOutstanding.toLocaleString()}
                </Text>
              </View>

              {data.vatOutstanding > 0 && (
                <View style={styles.alertBox}>
                  <Text style={styles.alertText}>
                    ⚠️ You have ₦{data.vatOutstanding.toLocaleString()} in VAT
                    to remit to FIRS
                  </Text>
                </View>
              )}
            </View>

            {/* Monthly Breakdown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Monthly Breakdown</Text>

              {data.salesBreakdown.length > 0 ? (
                data.salesBreakdown.map((item) => (
                  <View key={item.month} style={styles.monthCard}>
                    <View style={styles.monthHeader}>
                      <Text style={styles.monthName}>
                        {new Date(item.month + "-01").toLocaleDateString(
                          "en-US",
                          {
                            month: "long",
                            year: "numeric",
                          },
                        )}
                      </Text>
                    </View>
                    <View style={styles.monthRow}>
                      <Text style={styles.monthLabel}>Sales:</Text>
                      <Text style={styles.monthValue}>
                        ₦{item.sales.toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.monthRow}>
                      <Text style={styles.monthLabel}>VAT Collected:</Text>
                      <Text
                        style={[
                          styles.monthValue,
                          { color: COLORS.accent, fontWeight: "bold" },
                        ]}
                      >
                        ₦{item.vat.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    No sales data for {selectedYear}
                  </Text>
                </View>
              )}
            </View>

            {/* Information */}
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>💡 VAT Filing Information</Text>
              <Text style={styles.infoText}>
                • VAT returns must be filed monthly by the 21st of the following
                month
              </Text>
              <Text style={styles.infoText}>
                • Keep all tax invoices and receipts for at least 6 years
              </Text>
              <Text style={styles.infoText}>
                • Use the Tax Dashboard to record VAT remittances
              </Text>
            </View>

            {/* Action Button */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push("/tax/dashboard" as any)}
            >
              <Text style={styles.actionButtonText}>Record VAT Payment</Text>
            </TouchableOpacity>
          </>
        ) : null}

        <View style={{ height: 40 }} />
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
  backButton: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },

  yearContainer: {
    backgroundColor: COLORS.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  yearButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    marginRight: 8,
  },
  yearButtonActive: { backgroundColor: COLORS.accent },
  yearText: { fontSize: 14, fontWeight: "600", color: COLORS.secondary },
  yearTextActive: { color: COLORS.white },

  content: { flex: 1, padding: 16 },

  summaryCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  summaryTitle: { fontSize: 16, fontWeight: "bold", color: COLORS.primary },
  rateBadge: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rateText: { fontSize: 12, fontWeight: "bold", color: COLORS.white },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: { fontSize: 14, color: COLORS.secondary },
  summaryValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },

  outstandingRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  outstandingLabel: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  outstandingValue: { fontSize: 18, fontWeight: "bold", color: COLORS.danger },

  alertBox: {
    backgroundColor: "#FFF3CD",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  alertText: { fontSize: 12, color: "#856404", lineHeight: 18 },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },

  monthCard: {
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  monthHeader: { marginBottom: 8 },
  monthName: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  monthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  monthLabel: { fontSize: 13, color: COLORS.secondary },
  monthValue: { fontSize: 13, fontWeight: "600", color: COLORS.primary },

  emptyState: { padding: 32, alignItems: "center" },
  emptyText: { fontSize: 14, color: COLORS.secondary },

  infoCard: {
    backgroundColor: "#E8F4FD",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: "#1565C0",
    marginBottom: 8,
    lineHeight: 18,
  },

  actionButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  actionButtonText: { fontSize: 16, fontWeight: "600", color: COLORS.white },
});
