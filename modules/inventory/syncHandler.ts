// modules/inventory/syncHandler.ts
// Handles offline-queued inventory operations.
// Import once at app startup in _layout.tsx:
//   import '@/modules/inventory/syncHandler';

import { OutboxEntry } from '@/lib/db/types';
import supabase from '@/lib/supabase';
import { registerHandler } from '@/lib/syncRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcquisitionCosts {
  transportation: number;
  offload: number;
  customs: number;
  other: number;
}

interface StockInPayload {
  organizationId:         string;
  userId:                 string;
  productId:              string;   // may be a placeholder if awaitsPrecedingProduct=true
  productName:            string;
  locationId:             string;
  supplierId:             string | null;
  supplierName:           string | null;
  quantity:               number;
  tierMultiplier:         number;
  tierName:               string | null;
  costPerTier:            number | null;
  costPerUnit:            number;
  baseUnitCost:           number;
  grandTotal:             number;
  sellingPrice:           number;
  acquisitionCosts:       AcquisitionCosts;
  acquisitionTotal:       number;
  notes:                  string | null;
  occurredAt:             string;
  // Set by add.tsx merged screen when product was just created in the same session
  awaitsPrecedingProduct?: boolean;
}

interface StockOutPayload {
  organizationId: string;
  userId:         string;
  productId:      string;
  locationId:     string;
  quantity:       number;
  unitCost:       number;
  reason:         string;
  isBackdated:    boolean;
  occurredAt:     string;
}

interface BulkStockInPayload {
  organizationId:   string;
  userId:           string;
  locationId:       string;
  supplierId:       string | null;
  supplierName:     string | null;
  items: {
    productId:    string;
    productName:  string;
    quantity:     number;
    unitCost:     number;
    costPerUnit:  number;
    sellingPrice: number;
    totalCost:    number;
  }[];
  bulkAcquisitionCosts: AcquisitionCosts;
  acquisitionTotal:     number;
  grandTotal:           number;
  totalUnits:           number;
  notes:                string | null;
  occurredAt:           string;
}

// ─── Resolver: look up real product ID when placeholder was used ───────────────
//
// Called when awaitsPrecedingProduct=true. The create_product outbox entry ran
// first (sync processes entries in insertion order), so the product now exists
// in Supabase. We fetch it by name + organizationId to get the real UUID.
//
// Throws if the product is not found — this causes the sync engine to retry
// the entry later rather than silently writing garbage data.

async function resolveProductId(
  placeholderId: string,
  productName: string,
  organizationId: string,
): Promise<string> {
  // Fast-path: if the caller already passed a real UUID (36-char hyphenated),
  // trust it and skip the lookup entirely.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID_RE.test(placeholderId)) return placeholderId;

  const { data, error } = await supabase
    .from('products')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('name', productName)
    .order('created_at', { ascending: false }) // newest first — handles duplicates
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(
      `[inventory/syncHandler] resolveProductId: product "${productName}" not found in org ${organizationId}. ` +
      `create_product may not have synced yet. Will retry. (${error?.message ?? 'no data'})`,
    );
  }

  return data.id;
}

// ─── stock_in handler ─────────────────────────────────────────────────────────

async function handleStockIn(entry: OutboxEntry): Promise<void> {
  const p: StockInPayload = JSON.parse(entry.payload);

  // Resolve real product ID if this entry was queued from the merged add screen
  const productId = p.awaitsPrecedingProduct
    ? await resolveProductId(p.productId, p.productName, p.organizationId)
    : p.productId;

  const baseQuantity = p.quantity * p.tierMultiplier;

  // 1. Update product prices
  await supabase
    .from('products')
    .update({
      default_cost_price:    p.baseUnitCost,
      default_selling_price: p.sellingPrice,
    })
    .eq('id', productId);

  // 2. Create purchase record
  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .insert({
      organization_id:   p.organizationId,
      location_id:       p.locationId,
      supplier_id:       p.supplierId,
      total_cost:        p.grandTotal,
      total_items:       1,
      total_units:       baseQuantity,
      acquisition_costs: p.acquisitionTotal,
      notes:             p.notes,
      created_by:        p.userId,
    })
    .select('id')
    .single();

  if (purchaseError) throw purchaseError;

  // 3. Create purchase item
  await supabase.from('purchase_items').insert({
    purchase_id: purchase.id,
    product_id:  productId,
    quantity:    baseQuantity,
    unit_cost:   p.costPerUnit,
    total_cost:  p.grandTotal - p.acquisitionTotal,
  });

  // 4. Mutate inventory
  const { error: mutError } = await supabase.rpc('mutate_inventory', {
    p_product_id:  productId,
    p_location_id: p.locationId,
    p_direction:   'in',
    p_quantity:    baseQuantity,
    p_unit_cost:   p.costPerUnit,
    p_source_type: 'purchase',
    p_source_id:   purchase.id,
    p_device_id:   null,
  });

  if (mutError) throw mutError;

  // 5. Acquisition costs breakdown
  if (p.acquisitionTotal > 0) {
    const records: object[] = [];
    const description = p.supplierName
      ? `Supplier: ${p.supplierName}. ${p.notes || ''}`
      : p.notes || null;

    const costTypes: (keyof AcquisitionCosts)[] = [
      'transportation', 'offload', 'customs', 'other',
    ];

    for (const type of costTypes) {
      if (p.acquisitionCosts[type] > 0) {
        records.push({
          organization_id: p.organizationId,
          reference_type:  'inventory_adjustment',
          reference_id:    productId,
          cost_type:       type,
          amount:          p.acquisitionCosts[type],
          description,
        });
      }
    }

    if (records.length > 0) {
      await supabase.from('acquisition_costs').insert(records);
    }

    await supabase.from('expenses').insert({
      organization_id: p.organizationId,
      location_id:     p.locationId,
      category:        'Inventory Acquisition',
      amount:          p.acquisitionTotal,
      expense_type:    'capital',
      notes: `Acquisition costs for ${p.productName}${p.supplierName ? ` from ${p.supplierName}` : ''}`,
      occurred_at:     p.occurredAt,
      created_by:      p.userId,
    });
  }

  console.log(`✅ stock_in synced: ${p.productName} ×${baseQuantity}`);
}

// ─── stock_out handler ────────────────────────────────────────────────────────

async function handleStockOut(entry: OutboxEntry): Promise<void> {
  const p: StockOutPayload = JSON.parse(entry.payload);

  const { error: mutError } = await supabase.rpc('mutate_inventory', {
    p_product_id:  p.productId,
    p_location_id: p.locationId,
    p_direction:   'out',
    p_quantity:    p.quantity,
    p_unit_cost:   p.unitCost,
    p_source_type: 'adjustment',
    p_source_id:   null,
    p_device_id:   null,
  });

  if (mutError) throw mutError;

  await supabase.from('inventory_adjustments').insert({
    organization_id: p.organizationId,
    product_id:      p.productId,
    location_id:     p.locationId,
    quantity:        p.quantity,
    direction:       'out',
    reason:          p.reason,
    adjusted_by:     p.userId,
    adjusted_at:     p.occurredAt,
  });

  console.log(`✅ stock_out synced: product ${p.productId} ×${p.quantity}`);
}

// ─── bulk_stock_in handler ────────────────────────────────────────────────────

async function handleBulkStockIn(entry: OutboxEntry): Promise<void> {
  const p: BulkStockInPayload = JSON.parse(entry.payload);

  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .insert({
      organization_id:   p.organizationId,
      location_id:       p.locationId,
      supplier_id:       p.supplierId,
      total_cost:        p.grandTotal,
      total_items:       p.items.length,
      total_units:       p.totalUnits,
      acquisition_costs: p.acquisitionTotal,
      notes:             p.notes,
      created_by:        p.userId,
    })
    .select('id')
    .single();

  if (purchaseError) throw purchaseError;

  for (const item of p.items) {
    await supabase.from('purchase_items').insert({
      purchase_id: purchase.id,
      product_id:  item.productId,
      quantity:    item.quantity,
      unit_cost:   item.costPerUnit,
      total_cost:  item.totalCost,
    });

    const { error: mutError } = await supabase.rpc('mutate_inventory', {
      p_product_id:  item.productId,
      p_location_id: p.locationId,
      p_direction:   'in',
      p_quantity:    item.quantity,
      p_unit_cost:   item.costPerUnit,
      p_source_type: 'purchase',
      p_source_id:   purchase.id,
      p_device_id:   null,
    });

    if (mutError) throw mutError;

    await supabase
      .from('products')
      .update({
        default_cost_price:    item.unitCost,
        default_selling_price: item.sellingPrice,
      })
      .eq('id', item.productId);
  }

  if (p.acquisitionTotal > 0) {
    const records: object[] = [];
    const description = p.supplierName
      ? `Bulk from ${p.supplierName}. ${p.notes || ''}`
      : p.notes || null;

    const costTypes: (keyof AcquisitionCosts)[] = [
      'transportation', 'offload', 'customs', 'other',
    ];

    for (const type of costTypes) {
      if (p.bulkAcquisitionCosts[type] > 0) {
        records.push({
          organization_id: p.organizationId,
          reference_type:  'purchase',
          reference_id:    null,
          cost_type:       type,
          amount:          p.bulkAcquisitionCosts[type],
          description,
        });
      }
    }

    if (records.length > 0) {
      await supabase.from('acquisition_costs').insert(records);
    }

    await supabase.from('expenses').insert({
      organization_id: p.organizationId,
      location_id:     p.locationId,
      category:        'Bulk Inventory Acquisition',
      amount:          p.acquisitionTotal,
      expense_type:    'capital',
      notes: `Bulk acquisition costs${p.supplierName ? ` from ${p.supplierName}` : ''}. ${p.items.length} products, ${p.totalUnits} units`,
      occurred_at:     p.occurredAt,
      created_by:      p.userId,
    });
  }

  console.log(`✅ bulk_stock_in synced: ${p.items.length} products`);
}

// ─── Registration ─────────────────────────────────────────────────────────────

registerHandler('stock_in',      handleStockIn);
registerHandler('stock_out',     handleStockOut);
registerHandler('bulk_stock_in', handleBulkStockIn);

console.log('[SyncRegistry] Inventory module registered.');