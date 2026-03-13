// modules/expenses/syncHandler.ts
// Import once in _layout.tsx:
//   import '@/modules/expenses/syncHandler';

import { OutboxEntry } from '@/lib/db/types';
import supabase from '@/lib/supabase';
import { registerHandler } from '@/lib/syncRegistry';

interface ExpensePayload {
  organizationId:   string;
  locationId:       string;
  userId:           string;
  category:         string;
  amount:           number;
  expenseType:      'operating' | 'capital';
  paymentMethod:    string;
  notes:            string | null;
  occurredAt:       string;
  createdByName:    string | null;
  whtRate:          number;   // ← add
  whtAmount:        number;   // ← add
}

// modules/expenses/syncHandler.ts — add alongside create_expense:

interface ExpenseVoidPayload {
  expenseId:      string;
  organizationId: string;
  locationId:     string;
  events: {
     reference_type:  string
    reference_id:    string;
    organization_id: string;
    location_id:     string;
    event_type:      string;
    amount:          number;
    occurred_at:     string;
    notes:           string;
  }[];
}

async function handleVoidExpense(entry: OutboxEntry): Promise<void> {
  const p: ExpenseVoidPayload = JSON.parse(entry.payload);

  let eventsToInsert = p.events;

  if (!eventsToInsert || eventsToInsert.length === 0) {
    const { data: existing } = await supabase
      .from('financial_events')
      .select('*')
      .eq('reference_type', 'expense')
      .eq('reference_id', p.expenseId);

    eventsToInsert = (existing ?? []).map(evt => ({
      reference_type: 'expense',
      reference_id: p.expenseId,
      organization_id: p.organizationId,
      location_id: p.locationId,
      event_type: 'reversal_' + evt.event_type,
      amount: -evt.amount,
      occurred_at: new Date().toISOString(),
      notes: `Reversal of event ${evt.id}`,
    }));
  }

  if (eventsToInsert.length === 0) {
    console.warn(`void_expense: no financial events found for expense ${p.expenseId} — skipping`);
    return;
  }

  const { error } = await supabase.from('financial_events').insert(eventsToInsert);
  if (error) throw error;
}

registerHandler('void_expense', handleVoidExpense);

async function handleCreateExpense(entry: OutboxEntry): Promise<void> {
  const p: ExpensePayload = JSON.parse(entry.payload);

  // 1. Get or create financial account for payment method
  let accountId: string | null = null;

  const { data: existing } = await supabase
    .from('financial_accounts')
    .select('id')
    .eq('organization_id', p.organizationId)
    .eq('account_type', p.paymentMethod)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (existing) {
    accountId = existing.id;
  } else {
    const { data: created, error: createError } = await supabase
      .from('financial_accounts')
      .insert({
        organization_id: p.organizationId,
        name: p.paymentMethod.charAt(0).toUpperCase() + p.paymentMethod.slice(1),
        account_type: p.paymentMethod,
        is_active: true,
      })
      .select('id')
      .single();

    if (createError) throw createError;
    accountId = created.id;
  }

  // 2. Insert expense
  const { data: expense, error: expenseError } = await supabase
  .from('expenses')
  .insert({
    organization_id:    p.organizationId,
    location_id:        p.locationId,
    category:           p.category,
    amount:             p.amount,
    expense_type:       p.expenseType,
    payment_method:     p.paymentMethod,
    payment_account_id: accountId,
    notes:              p.notes,
    occurred_at:        p.occurredAt,
    created_by:         p.userId,
    created_by_name:    p.createdByName,
    wht_rate:           p.whtRate   ?? 0,   // ← add
    wht_amount:         p.whtAmount ?? 0,   // ← add
  })
  .select('id')
  .single();

  if (expenseError) throw expenseError;

  // 3. Create financial event
  const { error: eventError } = await supabase
    .from('financial_events')
    .insert({
      organization_id: p.organizationId,
      location_id:     p.locationId,
      event_type:      p.expenseType === 'capital' ? 'capital_expense' : 'operating_expense',
      account_id:      accountId,
      direction:       'out',
      amount:          p.amount,
      reference_type:  'expense',
      reference_id:    expense.id,
      category:        p.category,
      notes:           p.notes,
      occurred_at:     p.occurredAt,
    });

  if (eventError) throw eventError;

  console.log(`✅ expense synced: ${p.category} ${p.amount}`);
}

registerHandler('create_expense', handleCreateExpense);

console.log('[SyncRegistry] Expenses module registered.');