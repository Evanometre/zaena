// FILE: lib/invoices/builders/purchase.ts

import supabase from '../../supabase';
import { InvoiceData } from '../core';

export async function buildPurchaseInvoice(
  purchaseId: string,
  organizationId: string
): Promise<InvoiceData | null> {
  const { data: purchase, error } = await supabase
    .from('purchases')
    .select(`
      *,
      suppliers (id, name, email, phone),
      locations (id, name, address),
      purchase_items (
        id, quantity, unit_cost, total_cost,
        products (name, unit)
      )
    `)
    .eq('id', purchaseId)
    .single();

  if (error || !purchase) {
    console.error('buildPurchaseInvoice: failed to fetch purchase:', error);
    return null;
  }

  const subtotal = purchase.total_cost - (purchase.acquisition_costs || 0);

  return {
    type: 'purchase_order',
    number: `PO-${purchase.id.substring(0, 8).toUpperCase()}`,
    date: new Date(purchase.created_at),
    organizationId,

    customer: purchase.suppliers
      ? {
          id: purchase.suppliers.id,
          name: purchase.suppliers.name,
          email: purchase.suppliers.email,
          phone: purchase.suppliers.phone,
        }
      : undefined,

    location: purchase.locations
      ? {
          id: purchase.locations.id,
          name: purchase.locations.name,
          address: purchase.locations.address,
        }
      : undefined,

    items: purchase.purchase_items.map((item: any) => ({
      productName: item.products.name,
      quantity: item.quantity,
      unit: item.products.unit,
      unitPrice: item.unit_cost,
      total: item.total_cost,
    })),

    subtotal,
    totalAmount: purchase.total_cost,
    notes: purchase.notes || undefined,
  };
}