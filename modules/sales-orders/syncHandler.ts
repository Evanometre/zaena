// FILE: modules/sales-orders/syncHandler.ts
// Import once in _layout.tsx:
//   import '@/modules/sales-orders/syncHandler';

import { OutboxEntry } from '@/lib/db/types';
import supabase from '@/lib/supabase';
import { registerHandler } from '@/lib/syncRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateSalesOrderPayload {
  orderId:              string;
  organizationId:       string;
  locationId:           string;
  customerId:           string;
  orderNumber:          string;
  status:               'draft';
  orderDate:            string;
  expectedDeliveryDate: string | null;
  requiresProduction:   boolean;
  subtotal:             number;
  discount:             number;
  tax:                  number;
  totalAmount:          number;
  notes:                string | null;
  createdBy:            string;
  items: {
    productId:       string;
    quantityOrdered: number;
    unitPrice:       number;
    discount:        number;
    lineTotal:       number;
  }[];
}

interface ConfirmSalesOrderPayload  { orderId: string; }
interface CancelSalesOrderPayload   { orderId: string; }

interface CreateDeliveryPayload {
  deliveryId:     string;
  salesOrderId:   string;
  organizationId: string;
  locationId:     string;
  deliveryNumber: string;
  notes:          string | null;
  createdBy:      string;
  items: {
    salesOrderItemId:  string;
    productId:         string;
    quantityDelivered: number;
    unitCost:          number;
  }[];
}

interface DispatchDeliveryPayload {
  deliveryId: string;
  deviceId:   string;
}

interface CreateInvoicePayload {
  invoiceId:      string;
  salesOrderId:   string;
  customerId:     string;
  organizationId: string;
  invoiceNumber:  string;
  invoiceDate:    string;
  dueDate:        string;
  subtotal:       number;
  tax:            number;
  totalAmount:    number;
  notes:          string | null; // JSON: { delivery_id, delivery_number, user_notes }
  createdBy:      string;
}

interface RecordInvoicePaymentPayload {
  invoiceId:     string;
  amount:        number;
  paymentDate:   string;
  paymentMethod: string;
  reference:     string | null;
  notes:         string | null;
  recordedBy:    string;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCreateSalesOrder(entry: OutboxEntry): Promise<void> {
  const p: CreateSalesOrderPayload = JSON.parse(entry.payload);

  const { error: orderError } = await supabase.from('sales_orders').insert({
    id:                     p.orderId,
    organization_id:        p.organizationId,
    location_id:            p.locationId,
    customer_id:            p.customerId,
    order_number:           p.orderNumber,
    status:                 p.status,
    order_date:             p.orderDate,
    expected_delivery_date: p.expectedDeliveryDate,
    requires_production:    p.requiresProduction,
    subtotal:               p.subtotal,
    discount:               p.discount,
    tax:                    p.tax,
    total_amount:           p.totalAmount,
    notes:                  p.notes,
    created_by:             p.createdBy,
  });
  if (orderError) throw orderError;

  const { error: itemsError } = await supabase.from('sales_order_items').insert(
    p.items.map((item) => ({
      sales_order_id:     p.orderId,
      product_id:         item.productId,
      quantity_ordered:   item.quantityOrdered,
      quantity_delivered: 0,
      unit_price:         item.unitPrice,
      discount:           item.discount,
      line_total:         item.lineTotal,
    })),
  );
  if (itemsError) throw itemsError;

  console.log(`✅ sales order created: ${p.orderNumber}`);
}

async function handleConfirmSalesOrder(entry: OutboxEntry): Promise<void> {
  const p: ConfirmSalesOrderPayload = JSON.parse(entry.payload);
  const { error } = await supabase.rpc('confirm_sales_order', {
    p_sales_order_id: p.orderId,
  });
  if (error) throw error;
  console.log(`✅ sales order confirmed: ${p.orderId}`);
}

async function handleCancelSalesOrder(entry: OutboxEntry): Promise<void> {
  const p: CancelSalesOrderPayload = JSON.parse(entry.payload);
  const { error } = await supabase.rpc('cancel_sales_order', {
    p_sales_order_id: p.orderId,
  });
  if (error) throw error;
  console.log(`✅ sales order cancelled: ${p.orderId}`);
}

async function handleCreateDelivery(entry: OutboxEntry): Promise<void> {
  const p: CreateDeliveryPayload = JSON.parse(entry.payload);

  const { error: deliveryError } = await supabase.from('deliveries').insert({
    id:              p.deliveryId,
    sales_order_id:  p.salesOrderId,
    organization_id: p.organizationId,
    location_id:     p.locationId,
    delivery_number: p.deliveryNumber,
    status:          'pending',
    notes:           p.notes,
    created_by:      p.createdBy,
  });
  if (deliveryError) throw deliveryError;

  const { error: itemsError } = await supabase.from('delivery_items').insert(
    p.items.map((item) => ({
      delivery_id:         p.deliveryId,
      sales_order_item_id: item.salesOrderItemId,
      product_id:          item.productId,
      quantity_delivered:  item.quantityDelivered,
      unit_cost:           item.unitCost,
    })),
  );
  if (itemsError) throw itemsError;

  console.log(`✅ delivery created: ${p.deliveryNumber}`);
}

async function handleDispatchDelivery(entry: OutboxEntry): Promise<void> {
  const p: DispatchDeliveryPayload = JSON.parse(entry.payload);
  const { error } = await supabase.rpc('dispatch_delivery', {
    p_delivery_id: p.deliveryId,
    p_device_id:   p.deviceId,
  });
  if (error) throw error;
  console.log(`✅ delivery dispatched: ${p.deliveryId}`);
}

async function handleCreateInvoice(entry: OutboxEntry): Promise<void> {
  const p: CreateInvoicePayload = JSON.parse(entry.payload);

  const { error } = await supabase.from('invoices').insert({
    id:              p.invoiceId,
    sales_order_id:  p.salesOrderId,
    customer_id:     p.customerId,
    organization_id: p.organizationId,
    invoice_number:  p.invoiceNumber,
    status:          'sent',
    invoice_date:    p.invoiceDate,
    due_date:        p.dueDate,
    subtotal:        p.subtotal,
    tax:             p.tax,
    total_amount:    p.totalAmount,
    amount_paid:     0,
    notes:           p.notes,
    created_by:      p.createdBy,
  });
  if (error) throw error;

  // Advance order to 'invoiced' if it isn't already closed
  await supabase
    .from('sales_orders')
    .update({ status: 'invoiced', updated_at: new Date().toISOString() })
    .eq('id', p.salesOrderId)
    .in('status', ['confirmed', 'in_fulfillment', 'fulfilled']);

  console.log(`✅ invoice created: ${p.invoiceNumber}`);
}

async function handleRecordInvoicePayment(entry: OutboxEntry): Promise<void> {
  const p: RecordInvoicePaymentPayload = JSON.parse(entry.payload);
  const { error } = await supabase.rpc('record_invoice_payment', {
    p_invoice_id:     p.invoiceId,
    p_amount:         p.amount,
    p_payment_date:   p.paymentDate,
    p_payment_method: p.paymentMethod,
    p_reference:      p.reference,
    p_notes:          p.notes,
    p_recorded_by:    p.recordedBy,
  });
  if (error) throw error;
  console.log(`✅ payment recorded for invoice: ${p.invoiceId}`);
}

// ─── Registration ─────────────────────────────────────────────────────────────

registerHandler('create_sales_order',     handleCreateSalesOrder);
registerHandler('confirm_sales_order',    handleConfirmSalesOrder);
registerHandler('cancel_sales_order',     handleCancelSalesOrder);
registerHandler('create_delivery',        handleCreateDelivery);
registerHandler('dispatch_delivery',      handleDispatchDelivery);
registerHandler('create_invoice',         handleCreateInvoice);
registerHandler('record_invoice_payment', handleRecordInvoicePayment);

console.log('[SyncRegistry] Sales Orders module registered.');