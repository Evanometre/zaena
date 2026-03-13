// FILE: lib/invoices/index.ts
// Single import point for everything invoice-related.
//
// Usage in any screen:
//   import { InvoiceGenerator, buildSaleInvoice } from '@/lib/invoices';

export { INVOICE_TYPE_LABELS, InvoiceGenerator } from './core';
export type { DeliveryOptions, InvoiceData, InvoiceItem, InvoiceResult, InvoiceType } from './core';

export { buildExpenseInvoice } from './builders/expense';
export { buildPaymentInvoice } from './builders/payment';
export { buildPurchaseInvoice } from './builders/purchase';
export { buildSaleInvoice } from './builders/sale';
export { buildStockInvoice } from './builders/stock';
export { buildWithdrawalInvoice } from './builders/withdrawal';
