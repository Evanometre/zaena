// FILE: lib/invoices/builders/payment.ts

import supabase from '../../supabase';
import { InvoiceData } from '../core';

export async function buildPaymentInvoice(
  paymentId: string,
  organizationId: string
): Promise<InvoiceData | null> {
  const { data: payment, error } = await supabase
    .from('payments')
    .select(`
      *,
      sales (
        *,
        sale_items (*, products (name, unit)),
        customers (id, name, email, phone),
        locations (id, name, address)
      )
    `)
    .eq('id', paymentId)
    .single();

  if (error || !payment) {
    console.error('buildPaymentInvoice: failed to fetch payment:', error);
    return null;
  }

  const sale = payment.sales;
  const balance = sale.total_amount - payment.amount;

  return {
    type: 'payment_receipt',
    number: `PAY-${payment.id.substring(0, 8).toUpperCase()}`,
    date: new Date(payment.payment_date),
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
    paymentMethod: payment.payment_method,
    amountPaid: payment.amount,
    balance: balance > 0 ? balance : undefined,
    notes: payment.notes,
  };
}