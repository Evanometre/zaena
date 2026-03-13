// FILE: lib/invoices/types.ts
// All invoice types in one place. Imported by core.ts, ReceiptCard, and anywhere
// else that needs them — breaks the circular dependency chain.

export type InvoiceType =
  | 'sale_receipt'
  | 'payment_receipt'
  | 'stock_receipt'
  | 'withdrawal_receipt'
  | 'purchase_order'
  | 'expense_receipt'
  | 'invoice'
  | 'quote'
  | 'proforma';

export interface InvoiceData {
  type: InvoiceType;
  number: string;
  date: Date;
  organizationId: string;

  customer?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };

  location?: {
    id: string;
    name: string;
    address?: string;
  };

  device?: {
    id: string;
    name: string;
  };

  items: InvoiceItem[];

  subtotal: number;
  discount?: number;
  tax?: number;
  totalAmount: number;

  paymentMethod?: string;
  amountPaid?: number;
  balance?: number;

  notes?: string;
}

export interface InvoiceItem {
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  description?: string;
}

export interface DeliveryOptions {
  whatsapp: boolean;
  email: boolean;
  pdf: boolean;
}

export interface InvoiceResult {
  success: boolean;
  deliveryMethods: string[];
  errors?: string[];
  pdfPath?: string;
}

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  sale_receipt: 'Sales Receipt',
  payment_receipt: 'Payment Receipt',
  stock_receipt: 'Goods Received Note',
  withdrawal_receipt: 'Withdrawal Receipt',
  purchase_order: 'Purchase Order',
  expense_receipt: 'Expense Receipt',
  invoice: 'Invoice',
  quote: 'Quote',
  proforma: 'Proforma Invoice',
};