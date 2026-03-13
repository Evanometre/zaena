import supabase from '@/lib/supabase';

export interface CreateStockInPayload {
  organization_id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  unit_cost: number;
}

/**
 * Record an opening stock-in via the onboarding_record_stock_in RPC.
 *
 * We use an RPC (SECURITY DEFINER function) instead of direct table inserts
 * because the inventory table has no INSERT RLS policy — only UPDATE.
 * The RPC handles both the inventory_transactions insert and the
 * inventory snapshot upsert atomically, with its own authorization check.
 */
export async function createStockIn(payload: CreateStockInPayload): Promise<void> {
  const { error } = await supabase.rpc('onboarding_record_stock_in', {
    p_organization_id: payload.organization_id,
    p_product_id:      payload.product_id,
    p_location_id:     payload.location_id,
    p_quantity:        payload.quantity,
    p_unit_cost:       payload.unit_cost,
  });

  if (error) {
    throw new Error(error.message);
  }
}