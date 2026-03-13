// FILE: app/payroll/employees.tsx
import { getOrganization } from "@/onboarding/services/organizationService";
import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
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

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  employee_id: string | null;
  monthly_salary: number;
  hire_date: string;
  is_active: boolean;
}

export default function EmployeesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { organizationId } = useAuthStore();
  const { hasPermission, loading: permLoading } = usePermissions();

  const [currency, setCurrency] = useState({
    symbol: "₦",
    code: "NGN",
    name: "Nigerian Naira",
  });

  // Add employee modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [hireDate, setHireDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  useFocusEffect(
    useCallback(() => {
      fetchEmployees();
    }, []),
  );
  useEffect(() => {
    async function loadOrgCurrency() {
      if (!organizationId) return;
      try {
        const org = await getOrganization(organizationId);
        if (org.currency) {
          const match = ALL_CURRENCIES.find((c) => c.code === org.currency);
          setCurrency({
            code: org.currency,
            symbol: match?.symbol ?? org.currency,
            name: match?.name ?? "",
          });
        } else if (org.timezone) {
          setCurrency(getCurrencyForTimezone(org.timezone));
        }
      } catch (err) {
        console.error("Failed to load org currency:", err);
      }
    }

    loadOrgCurrency();
  }, [organizationId]);

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

  if (!hasPermission("employees.read")) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <Text style={styles.emptyIcon}>🔐</Text>
        <Text style={styles.emptyText}>Access Restricted</Text>
        <Text style={styles.emptySubtext}>
          You do not have permission to view employees.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.emptyButton}
        >
          <Text style={styles.emptyButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function fetchEmployees() {
    setLoading(true);
    try {
      if (!organizationId) throw new Error("No organization");

      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEmployees(data || []);
    } catch (err: any) {
      console.error("Error fetching employees:", err);
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchEmployees();
  }

  function openAddModal() {
    setFullName("");
    setEmail("");
    setPhone("");
    setEmployeeId("");
    setMonthlySalary("");
    setHireDate(new Date().toISOString().split("T")[0]);
    setShowAddModal(true);
  }

  async function handleAddEmployee() {
    if (!fullName.trim()) {
      Alert.alert("Error", "Employee name is required");
      return;
    }

    if (!monthlySalary || parseFloat(monthlySalary) <= 0) {
      Alert.alert("Error", "Please enter a valid monthly salary");
      return;
    }

    setSaving(true);
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

      const { error } = await supabase.from("employees").insert({
        organization_id: profile.organization_id,
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        employee_id: employeeId.trim() || null,
        monthly_salary: parseFloat(monthlySalary),
        hire_date: hireDate,
        is_active: true,
      });

      if (error) throw error;

      Alert.alert("Success", "Employee added successfully");
      setShowAddModal(false);
      fetchEmployees();
    } catch (err: any) {
      console.error("Error adding employee:", err);
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleEmployeeStatus(
    employeeId: string,
    currentStatus: boolean,
  ) {
    try {
      const { error } = await supabase
        .from("employees")
        .update({ is_active: !currentStatus })
        .eq("id", employeeId);

      if (error) throw error;
      fetchEmployees();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  }

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employee_id?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const activeEmployees = employees.filter((e) => e.is_active);
  const totalMonthlyPayroll = activeEmployees.reduce(
    (sum, e) => sum + e.monthly_salary,
    0,
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Employees</Text>
        {hasPermission("employees.create") ? (
          <TouchableOpacity onPress={openAddModal}>
            <Text style={styles.addButton}>+ Add</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{activeEmployees.length}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { fontSize: 16 }]}>
            {currency.symbol}
            {totalMonthlyPayroll.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Monthly Payroll</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search employees..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={COLORS.secondary}
        />
      </View>

      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing && (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 40 }}
          />
        )}

        {!loading && filteredEmployees.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>No employees found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? "Try a different search"
                : "Add your first employee to get started"}
            </Text>
            {!searchQuery && hasPermission("employees.create") && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={openAddModal}
              >
                <Text style={styles.emptyButtonText}>Add Employee</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {filteredEmployees.map((employee) => (
          <TouchableOpacity
            key={employee.id}
            style={styles.employeeCard}
            activeOpacity={0.75}
            onPress={() =>
              router.push({
                pathname: "/payroll/EmployeePayslipsScreen",
                params: {
                  employeeId: employee.id,
                  employeeName: employee.full_name,
                },
              })
            }
          >
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.employeeName}>{employee.full_name}</Text>
                {employee.employee_id && (
                  <Text style={styles.employeeId}>
                    ID: {employee.employee_id}
                  </Text>
                )}
                {employee.email && (
                  <Text style={styles.contactInfo}>📧 {employee.email}</Text>
                )}
                {employee.phone && (
                  <Text style={styles.contactInfo}>📱 {employee.phone}</Text>
                )}
              </View>

              {hasPermission("employees.update") ? (
                <TouchableOpacity
                  onPress={() =>
                    toggleEmployeeStatus(employee.id, employee.is_active)
                  }
                >
                  <View
                    style={[
                      styles.statusBadge,
                      employee.is_active
                        ? styles.statusActive
                        : styles.statusInactive,
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {employee.is_active ? "Active" : "Inactive"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View
                  style={[
                    styles.statusBadge,
                    employee.is_active
                      ? styles.statusActive
                      : styles.statusInactive,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {employee.is_active ? "Active" : "Inactive"}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.cardBody}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Monthly Salary:</Text>
                <Text style={styles.salaryText}>
                  {currency.symbol}
                  {employee.monthly_salary.toLocaleString()}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Hire Date:</Text>
                <Text style={styles.infoValue}>
                  {new Date(employee.hire_date).toLocaleDateString()}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Add Employee Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Employee</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Full Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="John Doe"
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Employee ID (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={employeeId}
                  onChangeText={setEmployeeId}
                  placeholder="EMP001"
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Email (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="john@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Phone (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="080XXXXXXXX"
                  keyboardType="phone-pad"
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Monthly Salary ({currency.symbol}){" "}
                  <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={monthlySalary}
                  onChangeText={setMonthlySalary}
                  placeholder="100000"
                  keyboardType="decimal-pad"
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Hire Date</Text>
                <TextInput
                  style={styles.input}
                  value={hireDate}
                  onChangeText={setHireDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.secondary}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  saving && styles.submitButtonDisabled,
                ]}
                onPress={handleAddEmployee}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.submitButtonText}>Add Employee</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
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
  backButton: { fontSize: 16, color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  addButton: { fontSize: 16, fontWeight: "600", color: COLORS.accent },

  statsRow: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  statLabel: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },

  searchContainer: { paddingHorizontal: 16, marginBottom: 12 },
  searchInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.primary,
  },

  list: { flex: 1, paddingHorizontal: 16 },

  employeeCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  employeeName: { fontSize: 18, fontWeight: "600", color: COLORS.primary },
  employeeId: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  contactInfo: { fontSize: 13, color: COLORS.secondary, marginTop: 4 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: { backgroundColor: COLORS.success },
  statusInactive: { backgroundColor: COLORS.secondary },
  statusText: { fontSize: 11, fontWeight: "600", color: COLORS.white },

  cardBody: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  infoLabel: { fontSize: 14, color: COLORS.secondary },
  infoValue: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  salaryText: { fontSize: 16, fontWeight: "bold", color: COLORS.accent },

  emptyState: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.secondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: "center",
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.white },

  // Modal styles
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
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  modalClose: { fontSize: 24, color: COLORS.secondary },

  formGroup: { marginBottom: 20 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 8,
  },
  required: { color: COLORS.danger },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.primary,
  },

  submitButton: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 16, fontWeight: "600", color: COLORS.white },
});
