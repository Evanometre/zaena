// modules/sales/syncHandler.ts
// All sales-specific sync logic lives here.
// Import this file once at app startup to register the handler.

import { OutboxEntry } from '@/lib/db/types';
import supabase from '@/lib/supabase';
import { registerHandler } from '@/lib/syncRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryMutation {
  p_product_id:  string;
  p_location_id: string;
  p_quantity:    number;
  p_unit_cost:   number;
  p_source_type: string;
  p_device_id:   string;
}

interface SaleOutboxPayload {
  sale:                object;
  items:               object[];
  payment:             object | null;
  inventoryMutations:  InventoryMutation[];
}

// ─── Conflict handler (unchanged from original syncEngine.ts) ─────────────────

async function handleInventoryConflict(params: {
  saleId:         string;
  receiptNumber:  string;
  mutation:       InventoryMutation;
  createdBy:      string;
  organizationId: string;
}): Promise<void> {
  const { saleId, receiptNumber, mutation, createdBy, organizationId } = params;

  const { data: currentInventory } = await supabase
    .from('inventory')
    .select('quantity_on_hand')
    .eq('product_id', mutation.p_product_id)
    .eq('location_id', mutation.p_location_id)
    .single();

  const availableQty  = currentInventory?.quantity_on_hand ?? 0;
  const requestedQty  = mutation.p_quantity;
  const deductableQty = Math.min(availableQty, requestedQty);
  const shortfallQty  = requestedQty - deductableQty;

  if (deductableQty > 0) {
    await supabase.rpc('mutate_inventory', {
      ...mutation,
      p_quantity:  deductableQty,
      p_source_id: saleId,
    });
  }

  const reviewReason =
    `Offline sale ${receiptNumber} could not fully deduct inventory at sync time. ` +
    `Requested: ${requestedQty}, Available: ${availableQty}, ` +
    `Deducted: ${deductableQty}, Shortfall: ${shortfallQty}. ` +
    `Manual stock reconciliation required.`;

  if (shortfallQty > 0) {
    await supabase.from('inventory_adjustments').insert({
      organization_id: organizationId,
      product_id:      mutation.p_product_id,
      location_id:     mutation.p_location_id,
      quantity:        shortfallQty,
      direction:       'out',
      reason:          `SYNC DISCREPANCY — ${reviewReason}`,
      adjusted_by:     createdBy,
      adjusted_at:     new Date().toISOString(),
      created_at:      new Date().toISOString(),
    });
  }

  await supabase.from('audit_trails').insert({
    organization_id: organizationId,
    category:        'inventory',
    action:          'sync_conflict',
    table_name:      'sales',
    record_id:       saleId,
    user_id:         createdBy,
    metadata: {
      receipt_number: receiptNumber,
      product_id:     mutation.p_product_id,
      location_id:    mutation.p_location_id,
      requested_qty:  requestedQty,
      available_qty:  availableQty,
      deducted_qty:   deductableQty,
      shortfall_qty:  shortfallQty,
      review_reason:  reviewReason,
    },
    created_at: new Date().toISOString(),
  });

  await supabase
    .from('sales')
    .update({ needs_review: true, review_reason: reviewReason })
    .eq('id', saleId);

  console.warn(
    `⚠️  Inventory conflict on ${receiptNumber}: ` +
    `requested ${requestedQty}, available ${availableQty}, shortfall ${shortfallQty}. ` +
    `Sale flagged for review.`
  );
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function handleCreateSale(entry: OutboxEntry): Promise<void> {
  const { sale, items, payment, inventoryMutations }: SaleOutboxPayload =
    JSON.parse(entry.payload);

  // Sanitize UUID fields — replace empty strings with null
  const sanitizedSale = Object.fromEntries(
    Object.entries(sale as Record<string, unknown>).map(([k, v]) => [k, v === '' ? null : v])
  );

  // 1. Insert sale — Supabase generates the real ID
  const { data: inserted, error: saleError } = await supabase
    .from('sales')
    .insert(sanitizedSale)
    .select('id')
    .single();

  if (saleError) throw saleError;
  const realSaleId = inserted.id;

  // 2. Insert sale items with the real sale ID
  const { error: itemsError } = await supabase
    .from('sale_items')
    .insert(items.map(item => ({ ...(item as object), sale_id: realSaleId })));

  if (itemsError) throw itemsError;

  // 3. Run inventory mutations
  for (const mutation of inventoryMutations) {
    const { error: mutError } = await supabase.rpc('mutate_inventory', {
      ...mutation,
      p_source_id: realSaleId,
    });

    if (mutError) {
      const isShortfall =
        mutError.message?.includes('Insufficient inventory') ||
        mutError.code === 'P0001';

      if (isShortfall) {
        await handleInventoryConflict({
          saleId:         realSaleId,
          receiptNumber:  (sanitizedSale as any).receipt_number ?? entry.id,
          mutation,
          createdBy:      (sanitizedSale as any).created_by,
          organizationId: (sanitizedSale as any).organization_id,
        });
      } else {
        throw mutError;
      }
    }
  }

  // 4. Insert payment if present
  if (payment) {
    const p = payment as any;
    const { error: paymentError } = await supabase.from('payments').insert({
      organization_id:       p.organization_id,
      location_id:           p.location_id,
      reference_type:        'sale',
      reference_id:          realSaleId,
      amount:                p.amount,
      payment_method:        p.payment_method,
      direction:             'in',
      device_id:             p.device_id || null,
      created_by:            p.created_by,
      occurred_at:           p.occurred_at,
      payment_delay_minutes: p.payment_delay_minutes || 0,
      is_immediate:          p.is_immediate ?? true,
      recorded_offline:      true,
      synced_at:             new Date().toISOString(),
    });

    if (paymentError) throw paymentError;
  }

  // 5. Create financial event for revenue
const s = sanitizedSale as any;
const { error: eventError } = await supabase
  .from('financial_events')
  .insert({
    organization_id: s.organization_id,
    location_id:     s.location_id,
    event_type:      'sale_revenue',
    account_id:      null, // or resolve from payment method if you want
    direction:       'in',
    amount:          s.total_amount,
    reference_type:  'sale',
    reference_id:    realSaleId,
    category:        'sales',
    notes:           `Sale ${s.receipt_number}`,
    occurred_at:     s.created_at,
  });

if (eventError) throw eventError;
}


// ─── Registration ─────────────────────────────────────────────────────────────
// Import this module once at app startup (e.g. in _layout.tsx or app/_layout.tsx).
// The act of importing it registers the handler.

registerHandler('create_sale', handleCreateSale);

console.log('[SyncRegistry] Sales module registered.');