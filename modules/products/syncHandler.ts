// modules/products/syncHandler.ts
// Import once in _layout.tsx:
//   import '@/modules/products/syncHandler';

import { OutboxEntry } from '@/lib/db/types';
import supabase from '@/lib/supabase';
import { registerHandler } from '@/lib/syncRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BulkPriceTier {
  id:                  string;
  name:                string;
  quantity_multiplier: number;
  unit_price:          number;   // already divided — total/qty
  is_active:           boolean;
  archived_at:         string | null;
  is_new:              boolean;
}

interface CreateProductPayload {
  organizationId:       string;
  name:                 string;
  sku:                  string | null;
  category:             string | null;
  unit:                 string;
  defaultSellingPrice:  number;
  isActive:             boolean;
  productType:          'product' | 'raw_material' | 'semi_finished';
  isSellable:           boolean;
  bulkTiers:            BulkPriceTier[];
}

interface UpdateProductPayload {
  productId:            string;
  organizationId:       string;
  before:               any;
  updates: {
    name:                  string;
    category:              string;
    sku:                   string;
    default_cost_price:    number;
    default_selling_price: number;
    product_type:          string;
    is_sellable:           boolean;
  };
  bulkTiers:            BulkPriceTier[];
}

interface DeactivateProductPayload {
  productId:  string;
  before:     any;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCreateProduct(entry: OutboxEntry): Promise<void> {
  const p: CreateProductPayload = JSON.parse(entry.payload);

  const { data: product, error: productError } = await supabase
    .from('products')
    .insert({
      organization_id:       p.organizationId,
      name:                  p.name,
      sku:                   p.sku,
      category:              p.category,
      unit:                  p.unit,
      default_selling_price: p.defaultSellingPrice,
      is_active:             p.isActive,
      product_type:          p.productType,
      is_sellable:           p.isSellable,
    })
    .select('id')
    .single();

  if (productError) throw productError;

  if (p.bulkTiers.length > 0) {
    const { error: bulkError } = await supabase
      .from('product_bulk_prices')
      .insert(
        p.bulkTiers.map(tier => ({
          product_id:          product.id,
          organization_id:     p.organizationId,
          name:                tier.name,
          quantity_multiplier: tier.quantity_multiplier,
          unit_price:          tier.unit_price,
          is_active:           true,
        }))
      );

    if (bulkError) throw bulkError;
  }

  console.log(`✅ product created: ${p.name}`);
}

async function handleUpdateProduct(entry: OutboxEntry): Promise<void> {
  const p: UpdateProductPayload = JSON.parse(entry.payload);

  const { error: productError } = await supabase
    .from('products')
    .update({ ...p.updates, updated_at: new Date().toISOString() })
    .eq('id', p.productId);

  if (productError) throw productError;

  // Audit log
  await supabase.from('product_audit_logs').insert({
    product_id: p.productId,
    action:     'update',
    before:     p.before,
    after:      p.updates,
  });

  // Save bulk tiers — new ones insert, existing ones update
  for (const tier of p.bulkTiers) {
    if (!tier.name || !tier.quantity_multiplier || !tier.unit_price) continue;

    if (tier.is_new) {
      await supabase.from('product_bulk_prices').insert({
        product_id:          p.productId,
        organization_id:     p.organizationId,
        name:                tier.name,
        quantity_multiplier: tier.quantity_multiplier,
        unit_price:          tier.unit_price,
        is_active:           tier.is_active,
      });
    } else {
      await supabase
        .from('product_bulk_prices')
        .update({
          name:                tier.name,
          quantity_multiplier: tier.quantity_multiplier,
          unit_price:          tier.unit_price,
          is_active:           tier.is_active,
          archived_at:         tier.archived_at,
        })
        .eq('id', tier.id);
    }
  }

  console.log(`✅ product updated: ${p.productId}`);
}

async function handleDeactivateProduct(entry: OutboxEntry): Promise<void> {
  const p: DeactivateProductPayload = JSON.parse(entry.payload);

  await supabase
    .from('products')
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq('id', p.productId);

  await supabase.from('product_audit_logs').insert({
    product_id: p.productId,
    action:     'deactivate',
    before:     p.before,
    after:      { is_active: false },
  });

  console.log(`✅ product deactivated: ${p.productId}`);
}

// ─── Registration ─────────────────────────────────────────────────────────────

registerHandler('create_product',     handleCreateProduct);
registerHandler('update_product',     handleUpdateProduct);
registerHandler('deactivate_product', handleDeactivateProduct);

console.log('[SyncRegistry] Products module registered.');