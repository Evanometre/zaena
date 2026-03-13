// FILE: lib/invoices/builders/stock.ts

import supabase from '../../supabase';
import { InvoiceData } from '../core';

export async function buildStockInvoice(
  stockInId: string,
  organizationId: string
): Promise<InvoiceData | null> {
  const { data: stockIn, error } = await supabase
    .from('stock_movements')
    .select(`
      *,
      products (name, unit),
      locations (id, name, address),
      suppliers (id, name, email, phone)
    `)
    .eq('id', stockInId)
    .eq('direction', 'in')
    .single();

  if (error || !stockIn) {
    console.error('buildStockInvoice: failed to fetch stock movement:', error);
    return null;
  }

  const lineTotal = stockIn.quantity * (stockIn.unit_cost || 0);

  return {
    type: 'stock_receipt',
    number: `GRN-${stockIn.id.substring(0, 8).toUpperCase()}`,
    date: new Date(stockIn.created_at),
    organizationId,

    customer: stockIn.suppliers
      ? {
          id: stockIn.suppliers.id,
          name: stockIn.suppliers.name,
          email: stockIn.suppliers.email,
          phone: stockIn.suppliers.phone,
        }
      : undefined,

    location: stockIn.locations
      ? {
          id: stockIn.locations.id,
          name: stockIn.locations.name,
          address: stockIn.locations.address,
        }
      : undefined,

    items: [
      {
        productName: stockIn.products.name,
        quantity: stockIn.quantity,
        unit: stockIn.products.unit,
        unitPrice: stockIn.unit_cost || 0,
        total: lineTotal,
      },
    ],

    subtotal: lineTotal,
    totalAmount: lineTotal,
    notes: stockIn.notes || undefined,
  };
}