// FILE: app/voids/index.tsx (NEW - Void History)
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { COLORS } from '../../lib/colors';
import supabase from '../../lib/supabase';

interface VoidRecord {
  id: string;
  reference_type: string;
  reference_id: string;
  original_amount: number;
  reason: string;
  voided_at: string;
  created_at: string;
  reversal_completed: boolean;
  voided_by_profile: {
    full_name: string;
    email: string;
  } | null;
  location: {
    name: string;
  } | null;
  sale: {
    receipt_number: string;
  } | null;
}

export default function VoidHistoryScreen() {
  const router = useRouter();
  const [voids, setVoids] = useState<VoidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchVoids();
    }, [])
  );

  async function fetchVoids() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('transaction_voids')
        .select(`
          *,
          voided_by_profile:user_profiles!voided_by (full_name, email),
          location:locations!location_id (name),
          sale:sales!reference_id (receipt_number)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setVoids(data || []);
    } catch (err: any) {
      console.error('Error fetching voids:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchVoids();
  }

  const filteredVoids = voids.filter((v) => {
    const searchLower = searchQuery.toLowerCase();
    const receiptNumber = v.sale?.receipt_number || '';
    const reason = v.reason || '';
    const voidedBy = v.voided_by_profile?.full_name || '';
    
    return (
      receiptNumber.toLowerCase().includes(searchLower) ||
      reason.toLowerCase().includes(searchLower) ||
      voidedBy.toLowerCase().includes(searchLower)
    );
  });

  const totalVoided = voids.reduce((sum, v) => sum + v.original_amount, 0);
  const completedVoids = voids.filter(v => v.reversal_completed).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Void History</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{voids.length}</Text>
          <Text style={styles.statLabel}>Total Voids</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{completedVoids}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { fontSize: 16 }]}>
            ₦{totalVoided.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Amount Voided</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by receipt, reason, or person..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* List */}
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing && (
          <ActivityIndicator size="large" color={COLORS.primary} />
        )}

        {filteredVoids.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyText}>No voids recorded</Text>
            <Text style={styles.emptySubtext}>
              Voided transactions will appear here
            </Text>
          </View>
        )}

        {filteredVoids.map((voidRecord) => (
          <TouchableOpacity
            key={voidRecord.id}
            style={styles.voidCard}
            onPress={() => {
              if (voidRecord.reference_type === 'sale' && voidRecord.reference_id) {
                router.push(`/sales/${voidRecord.reference_id}` as any);
              }
            }}
          >
            {/* Header */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.receiptNumber}>
                  {voidRecord.sale?.receipt_number || `Void #${voidRecord.id.slice(0, 8)}`}
                </Text>
                <Text style={styles.voidType}>
                  {voidRecord.reference_type.toUpperCase()} VOID
                </Text>
              </View>
              <View style={styles.amountBadge}>
                <Text style={styles.amountText}>
                  ₦{voidRecord.original_amount.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Body */}
            <View style={styles.cardBody}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Voided By:</Text>
                <Text style={styles.infoValue}>
                  {voidRecord.voided_by_profile?.full_name || 'Unknown'}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Location:</Text>
                <Text style={styles.infoValue}>
                  📍 {voidRecord.location?.name || 'N/A'}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Status:</Text>
                <View style={[
                  styles.statusBadge,
                  voidRecord.reversal_completed 
                    ? styles.statusCompleted 
                    : styles.statusPending
                ]}>
                  <Text style={styles.statusText}>
                    {voidRecord.reversal_completed ? '✓ Completed' : '○ Pending'}
                  </Text>
                </View>
              </View>

              {voidRecord.reason && (
                <View style={styles.reasonRow}>
                  <Text style={styles.reasonLabel}>Reason:</Text>
                  <Text style={styles.reasonText}>{voidRecord.reason}</Text>
                </View>
              )}
            </View>

            {/* Footer */}
            <View style={styles.cardFooter}>
              <View>
                <Text style={styles.dateLabel}>Voided At:</Text>
                <Text style={styles.dateText}>
                  {new Date(voidRecord.voided_at).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </Text>
              </View>
              {voidRecord.created_at !== voidRecord.voided_at && (
                <View>
                  <Text style={styles.dateLabel}>Recorded At:</Text>
                  <Text style={styles.dateText}>
                    {new Date(voidRecord.created_at).toLocaleString('en-US', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    padding: 16,
    paddingTop: 48,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: COLORS.primary },
  
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary },
  statLabel: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },

  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },

  list: { flex: 1, paddingHorizontal: 16 },

  voidCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  receiptNumber: { fontSize: 18, fontWeight: '600', color: COLORS.primary },
  voidType: { fontSize: 11, color: '#dc2626', marginTop: 2, fontWeight: '600' },
  amountBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  amountText: { fontSize: 14, fontWeight: 'bold', color: '#dc2626' },

  cardBody: { marginBottom: 12 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: { fontSize: 13, color: COLORS.secondary },
  infoValue: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusCompleted: { backgroundColor: '#d1fae5' },
  statusPending: { backgroundColor: '#fef3c7' },
  statusText: { fontSize: 11, fontWeight: '600', color: COLORS.primary },

  reasonRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  reasonLabel: { fontSize: 11, color: COLORS.secondary, marginBottom: 4 },
  reasonText: { fontSize: 13, color: COLORS.primary, fontStyle: 'italic' },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dateLabel: { fontSize: 10, color: COLORS.secondary, marginBottom: 2 },
  dateText: { fontSize: 11, color: COLORS.primary },

  emptyState: { padding: 48, alignItems: 'center' },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.secondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.secondary,
    textAlign: 'center',
  },
});