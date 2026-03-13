// modules/purchases/syncHandler.ts
// Import once in _layout.tsx:
//   import '@/modules/purchases/syncHandler';

import { OutboxEntry } from '@/lib/db/types';
import supabase from '@/lib/supabase';
import { registerHandler } from '@/lib/syncRegistry';

interface PurchasePaymentPayload {
  purchaseId: string;
  amount:     number;
  notes:      string | null;
}

async function handleRecordPurchasePayment(entry: OutboxEntry): Promise<void> {
  const p: PurchasePaymentPayload = JSON.parse(entry.payload);

  const { error } = await supabase
    .from('purchase_payments')
    .insert({
      purchase_id: p.purchaseId,
      amount:      p.amount,
      notes:       p.notes,
    });

  if (error) throw error;
  console.log(`✅ purchase_payment synced: ${p.purchaseId} ×${p.amount}`);
}

registerHandler('record_purchase_payment', handleRecordPurchasePayment);
console.log('[SyncRegistry] Purchases module registered.');