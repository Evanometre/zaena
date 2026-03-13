// FILE: lib/invoices/builders/withdrawal.ts

import supabase from '../../supabase';
import { InvoiceData } from '../core';

export async function buildWithdrawalInvoice(
  withdrawalId: string,
  organizationId: string
): Promise<InvoiceData | null> {
  const { data: withdrawal, error } = await supabase
    .from('withdrawals')
    .select(`
      *,
      locations (id, name, address)
    `)
    .eq('id', withdrawalId)
    .single();

  if (error || !withdrawal) {
    console.error('buildWithdrawalInvoice: failed to fetch withdrawal:', error);
    return null;
  }

  return {
    type: 'withdrawal_receipt',
    number: `WD-${withdrawal.id.substring(0, 8).toUpperCase()}`,
    date: new Date(withdrawal.withdrawal_date),
    organizationId,

    location: withdrawal.locations
      ? {
          id: withdrawal.locations.id,
          name: withdrawal.locations.name,
          address: withdrawal.locations.address,
        }
      : undefined,

    items: [
      {
        productName: 'Owner Withdrawal',
        quantity: 1,
        unit: 'transaction',
        unitPrice: withdrawal.amount,
        total: withdrawal.amount,
        description: withdrawal.description || undefined,
      },
    ],

    subtotal: withdrawal.amount,
    totalAmount: withdrawal.amount,
    notes: withdrawal.notes || undefined,
  };
}