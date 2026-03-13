import { supabase } from '@/lib/supabase';

export interface Product {
  id: string;
  organization_id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
  default_cost_price: number;
  default_selling_price: number;
  is_active: boolean;
  has_variations: boolean;
  has_bulk_tiers: boolean;
  created_at?: string;
}

export interface CreateProductPayload {
  organization_id: string;
  name: string;
  sku?: string;
  unit?: string;
  category?: string;
  default_cost_price?: number;
  default_selling_price?: number;
}

/**
 * Create a new product for the given organization.
 *
 * During onboarding we keep it simple — no variations, no bulk tiers.
 * These can be added later from the full product management screen.
 *
 * RLS requires `products.create` permission on the org.
 */
export async function createProduct(
  payload: CreateProductPayload
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert({
      organization_id: payload.organization_id,
      name: payload.name.trim(),
      sku: payload.sku?.trim() ?? null,
      unit: payload.unit?.trim() ?? null,
      category: payload.category?.trim() ?? null,
      default_cost_price: payload.default_cost_price ?? 0,
      default_selling_price: payload.default_selling_price ?? 0,
      is_active: true,
      has_variations: false,
      has_bulk_tiers: false,
    })
    .select(
      'id, organization_id, name, sku, unit, category, default_cost_price, default_selling_price, is_active, has_variations, has_bulk_tiers, created_at'
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Could not create product');
  }

  return data as Product;
}