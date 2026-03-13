// FILE: lib/invoices/builders/sale.ts
// Fetches a sale from Supabase and returns a ready-to-generate InvoiceData object.

import supabase from '../../supabase';
import { InvoiceData } from '../core';

export async function buildSaleInvoice(
  saleId: string,
  organizationId: string
): Promise<InvoiceData | null> {
  const { data: sale, error } = await supabase
    .from('sales')
    .select(`
      *,
      sale_items (*, products (name, unit)),
      customers (id, name, email, phone),
      locations (id, name, address),
      devices (id, device_name)
    `)
    .eq('id', saleId)
    .single();

  if (error || !sale) {
    console.error('buildSaleInvoice: failed to fetch sale:', error);
    return null;
  }

  return {
    type: 'sale_receipt',
    number: sale.receipt_number,
    date: new Date(sale.created_at),
    organizationId,

    customer: sale.customers
      ? {
          id: sale.customers.id,
          name: sale.customers.name,
          email: sale.customers.email,
          phone: sale.customers.phone,
        }
      : undefined,

    location: sale.locations
      ? {
          id: sale.locations.id,
          name: sale.locations.name,
          address: sale.locations.address,
        }
      : undefined,

    device: sale.devices
      ? { id: sale.devices.id, name: sale.devices.device_name }
      : undefined,

    items: sale.sale_items.map((item: any) => ({
      productName: item.products.name,
      quantity: item.quantity,
      unit: item.products.unit,
      unitPrice: item.unit_price,
      total: item.quantity * item.unit_price,
    })),

    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    totalAmount: sale.total_amount,
  };
}