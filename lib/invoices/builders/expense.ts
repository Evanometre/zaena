// FILE: lib/invoices/builders/expense.ts

import supabase from '../../supabase';
import { InvoiceData } from '../core';

export async function buildExpenseInvoice(
  expenseId: string,
  organizationId: string
): Promise<InvoiceData | null> {
  const { data: expense, error } = await supabase
    .from('expenses')
    .select(`
      *,
      locations (id, name, address),
      user_profiles!expenses_created_by_fkey (full_name)
    `)
    .eq('id', expenseId)
    .single();

  if (error || !expense) {
    console.error('buildExpenseInvoice: failed to fetch expense:', error);
    return null;
  }

  const recorderNote = expense.user_profiles?.full_name
    ? ` | Recorded by ${expense.user_profiles.full_name}`
    : '';

  return {
    type: 'expense_receipt',
    number: `EXP-${expense.id.substring(0, 8).toUpperCase()}`,
    date: new Date(expense.occurred_at),
    organizationId,

    location: expense.locations
      ? {
          id: expense.locations.id,
          name: expense.locations.name,
          address: expense.locations.address,
        }
      : undefined,

    items: [
      {
        productName: expense.category,
        quantity: 1,
        unit: 'expense',
        unitPrice: expense.amount,
        total: expense.amount,
        description: expense.notes || undefined,
      },
    ],

    subtotal: expense.amount,
    totalAmount: expense.amount,
    paymentMethod: expense.payment_method,
    notes: `Expense Type: ${expense.expense_type.toUpperCase()}${recorderNote}`,
  };
}