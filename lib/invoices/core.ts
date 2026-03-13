// FILE: lib/invoices/core.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, Linking } from 'react-native';
import supabase from '../supabase';
import type { DeliveryOptions, InvoiceData, InvoiceResult } from './types';
import { INVOICE_TYPE_LABELS } from './types';

// Re-export everything from types so existing imports from core.ts keep working
export { INVOICE_TYPE_LABELS } from './types';
export type {
  DeliveryOptions, InvoiceData,
  InvoiceItem, InvoiceResult, InvoiceType
} from './types';



interface OrgDetails {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export class InvoiceGenerator {
  private org: OrgDetails = { name: 'Your Business' };
  private cacheKey: string;

  constructor(private organizationId: string) {
    this.cacheKey = `org_invoice_details_${organizationId}`;
  }

  async initialize() {
    try {
      const cached = await AsyncStorage.getItem(this.cacheKey);
      if (cached) {
        this.org = JSON.parse(cached);
      }
    } catch {}
    this.refreshOrgFromNetwork().catch(() => {});
  }

  private async refreshOrgFromNetwork() {
    const { data: org } = await supabase
      .from('organizations')
      .select('name, email, phone, address')
      .eq('id', this.organizationId)
      .single();

    if (org) {
      this.org = {
        name: org.name || 'Your Business',
        email: org.email,
        phone: org.phone,
        address: org.address,
      };
      await AsyncStorage.setItem(this.cacheKey, JSON.stringify(this.org));
    }
  }

  async generate(
    invoiceData: InvoiceData,
    deliveryOptions?: DeliveryOptions,
    silentMode: boolean = true
  ): Promise<InvoiceResult> {
    const result: InvoiceResult = {
      success: false,
      deliveryMethods: [],
      errors: [],
    };

    if (!deliveryOptions) {
      deliveryOptions = await this.getDeliverySettings();
    }

    const pdfPath = await this.generatePDF(invoiceData);
    if (!pdfPath) {
      result.errors?.push('Failed to generate PDF');
      return result;
    }

    const savedPath = await this.savePDFToStorage(pdfPath, invoiceData.number);
    if (savedPath) {
      result.pdfPath = savedPath;
      result.deliveryMethods.push('Saved to Device');
    }

    if (deliveryOptions.whatsapp && invoiceData.customer?.phone) {
      this.sendViaWhatsApp(invoiceData.customer.phone, invoiceData, pdfPath)
        .catch(err => console.error('WhatsApp error:', err));
      result.deliveryMethods.push('WhatsApp (preparing)');
    }

    if (deliveryOptions.email && invoiceData.customer?.email) {
      this.sendViaEmail(invoiceData.customer.email, invoiceData, pdfPath)
        .catch(err => console.error('Email error:', err));
      result.deliveryMethods.push('Email (sending)');
    }

    if (!silentMode && deliveryOptions.pdf) {
      await this.sharePDFNow(pdfPath, invoiceData.number);
      result.deliveryMethods.push('Share Dialog Shown');
    }

    result.success = true;
    return result;
  }

  public buildHTML(invoiceData: InvoiceData): string {
    return this.generateHTML(invoiceData);
  }

  private async getDeliverySettings(): Promise<DeliveryOptions> {
    try {
      const { data } = await supabase
        .from('organization_settings')
        .select('receipt_delivery_methods')
        .eq('organization_id', this.organizationId)
        .single();
      if (data?.receipt_delivery_methods) {
        return data.receipt_delivery_methods as DeliveryOptions;
      }
    } catch {}
    return { whatsapp: false, email: false, pdf: true };
  }

  private async generatePDF(invoiceData: InvoiceData): Promise<string | null> {
    try {
      const html = this.generateHTML(invoiceData);
      const Print = await import('expo-print');
      const { uri } = await Print.printToFileAsync({
        html,
        width: 595,   // A4 points width
        height: 842,  // A4 points height
      });
      return uri;
    } catch (err) {
      console.error('PDF generation failed:', err);
      Alert.alert('PDF Error', 'Failed to generate PDF. Please try again.');
      return null;
    }
  }

  private generateHTML(data: InvoiceData): string {
    const title = INVOICE_TYPE_LABELS[data.type] || 'Receipt';
    const isExpense = data.type === 'expense_receipt';
    const isStock = data.type === 'stock_receipt';
    const isPurchase = data.type === 'purchase_order';
    const partyLabel = isPurchase || isStock ? 'Supplier' : 'Customer';

    const paymentStatus = (() => {
      if (data.amountPaid === undefined) return null;
      if (data.amountPaid >= data.totalAmount) return { label: 'PAID', color: '#10b981', bg: '#f0fdf4' };
      if (data.amountPaid > 0) return { label: 'PARTIAL', color: '#e85a2a', bg: '#fff7f4' };
      return { label: 'UNPAID', color: '#ef4444', bg: '#fef2f2' };
    })();

    const fmt = (n: number) => n.toLocaleString('en-NG', { minimumFractionDigits: 2 });

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=420, initial-scale=1">
  <title>${title} · ${data.number}</title>
  <style>
    :root {
      --ink:       #111111;
      --ink-2:     #444444;
      --ink-3:     #888888;
      --ink-4:     #bbbbbb;
      --accent:    #e85a2a;
      --success:   #10b981;
      --danger:    #ef4444;
      --surface:   #fafafa;
      --border:    #ebebeb;
      --white:     #ffffff;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      width: 100%;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--ink);
      background: var(--white);
    }

    .page {
      width: 100%;
      padding-bottom: 40px;
    }

    /* ── Accent bar ──────────────────────────────────────────────────── */
    .accent-bar {
      height: 3px;
      background: linear-gradient(90deg, #e85a2a 0%, #f0845a 100%);
    }

    /* ── Header ──────────────────────────────────────────────────────── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 28px 32px 24px;
      border-bottom: 1px solid var(--border);
    }

    .org-name {
      font-size: 20px;
      font-weight: 700;
      color: var(--ink);
      letter-spacing: -0.3px;
      margin-bottom: 6px;
    }

    .org-detail {
      font-size: 11.5px;
      color: var(--ink-3);
      line-height: 1.6;
    }

    .doc-meta {
      text-align: right;
    }

    .doc-type {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 6px;
    }

    .doc-number {
      font-family: 'Courier New', Courier, monospace;
      font-size: 15px;
      font-weight: 500;
      color: var(--ink);
      margin-bottom: 3px;
    }

    .doc-date {
      font-size: 11.5px;
      color: var(--ink-3);
      margin-bottom: 10px;
    }

    .status-pill {
      display: inline-block;
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 3px 10px;
      border-radius: 20px;
      border: 1.5px solid currentColor;
    }

    /* ── Parties ─────────────────────────────────────────────────────── */
    .parties {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--border);
    }

    .party {
      flex: 1;
      padding: 18px 32px;
    }

    .party + .party {
      border-left: 1px solid var(--border);
    }

    .party-label {
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 6px;
    }

    .party-name {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--ink);
      margin-bottom: 2px;
    }

    .party-detail {
      font-size: 11.5px;
      color: var(--ink-3);
      line-height: 1.6;
    }

    /* ── Items table ─────────────────────────────────────────────────── */
    .items-wrap {
      padding: 0 0 0 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead tr {
      border-bottom: 1px solid var(--border);
    }

    th {
      padding: 11px 32px;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--ink-3);
      text-align: left;
    }

    th.r { text-align: right; }

    tbody tr {
      border-bottom: 1px solid var(--border);
    }

    tbody tr:last-child {
      border-bottom: none;
    }

    td {
      padding: 13px 32px;
      font-size: 13px;
      color: var(--ink-2);
      text-align: left;
      vertical-align: top;
    }

    td.r { text-align: right; }

    .item-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--ink);
    }

    .item-desc {
      font-size: 11px;
      color: var(--ink-3);
      margin-top: 2px;
    }

    .mono {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
    }

    /* ── Totals ──────────────────────────────────────────────────────── */
    .totals {
      border-top: 1px solid var(--border);
      padding: 16px 32px;
    }

    .total-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
    }

    .total-line-label {
      font-size: 12.5px;
      color: var(--ink-3);
    }

    .total-line-value {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12.5px;
      color: var(--ink-2);
    }

    .total-line.discount .total-line-label,
    .total-line.discount .total-line-value { color: var(--danger); }

    .grand-total {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
      padding-top: 14px;
      border-top: 1.5px solid var(--ink);
    }

    .grand-total-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: var(--ink);
    }

    .grand-total-value {
      font-family: 'Courier New', Courier, monospace;
      font-size: 22px;
      font-weight: 500;
      color: var(--accent);
      letter-spacing: -0.5px;
    }

    /* ── Payment section ─────────────────────────────────────────────── */
    .payment-section {
      border-top: 1px solid var(--border);
      padding: 18px 32px;
      background: var(--surface);
    }

    .payment-section-label {
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: var(--ink-3);
      margin-bottom: 12px;
    }

    .payment-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 0;
    }

    .payment-row-label {
      font-size: 12.5px;
      color: var(--ink-3);
    }

    .payment-row-value {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12.5px;
      color: var(--ink-2);
    }

    .payment-row.paid .payment-row-value { color: var(--success); font-weight: 500; }

    .balance-block {
      margin-top: 14px;
      padding: 14px 16px;
      background: #fff5f5;
      border: 1px solid #fecaca;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .balance-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: var(--danger);
    }

    .balance-value {
      font-family: 'Courier New', Courier, monospace;
      font-size: 18px;
      font-weight: 500;
      color: var(--danger);
    }

    /* ── Notes ───────────────────────────────────────────────────────── */
    .notes-section {
      border-top: 1px solid var(--border);
      padding: 16px 32px;
    }

    .notes-label {
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: var(--ink-3);
      margin-bottom: 6px;
    }

    .notes-text {
      font-size: 12px;
      color: var(--ink-2);
      line-height: 1.7;
    }

    /* ── Footer ──────────────────────────────────────────────────────── */
    .footer {
      border-top: 1px solid var(--border);
      padding: 20px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .footer-brand {
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
    }

    .footer-tagline {
      font-size: 11px;
      color: var(--ink-4);
    }

    .footer-right {
      text-align: right;
    }

    .footer-generated {
      font-size: 10px;
      color: var(--ink-4);
      font-family: 'Courier New', Courier, monospace;
    }

    .accent-dot {
      display: inline-block;
      width: 5px;
      height: 5px;
      background: var(--accent);
      border-radius: 50%;
      margin: 0 5px;
      vertical-align: middle;
    }
  </style>
</head>
<body>
<div class="page">

  <div class="accent-bar"></div>

  <!-- Header -->
  <div class="header">
    <div>
      <div class="org-name">${this.org.name}</div>
      <div class="org-detail">
        ${[this.org.address, this.org.phone ? `Tel: ${this.org.phone}` : null, this.org.email].filter(Boolean).join('<br>')}
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">${title}</div>
      <div class="doc-number">#${data.number}</div>
      <div class="doc-date">${data.date.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      ${paymentStatus ? `<span class="status-pill" style="color:${paymentStatus.color}; background:${paymentStatus.bg}; border-color:${paymentStatus.color}20">${paymentStatus.label}</span>` : ''}
    </div>
  </div>

  <!-- Parties -->
  ${(data.customer || data.location) ? `
  <div class="parties">
    ${data.customer ? `
    <div class="party">
      <div class="party-label">${partyLabel}</div>
      <div class="party-name">${data.customer.name}</div>
      ${data.customer.phone ? `<div class="party-detail">${data.customer.phone}</div>` : ''}
      ${data.customer.email ? `<div class="party-detail">${data.customer.email}</div>` : ''}
    </div>` : ''}
    ${data.location ? `
    <div class="party">
      <div class="party-label">Location</div>
      <div class="party-name">${data.location.name}</div>
      ${data.location.address ? `<div class="party-detail">${data.location.address}</div>` : ''}
    </div>` : ''}
  </div>` : ''}

  <!-- Items -->
  <div class="items-wrap">
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="r">Qty</th>
          <th class="r">Unit Price</th>
          <th class="r">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${data.items.map(item => `
        <tr>
          <td>
            <div class="item-name">${item.productName}</div>
            ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
          </td>
          <td class="r mono">${item.quantity} <span style="color:var(--ink-4)">${item.unit}</span></td>
          <td class="r mono">${fmt(item.unitPrice)}</td>
          <td class="r mono" style="color:var(--ink); font-weight:500">${fmt(item.total)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <!-- Totals -->
  <div class="totals">
    ${data.subtotal !== data.totalAmount || data.discount || data.tax ? `
    <div class="total-line">
      <span class="total-line-label">Subtotal</span>
      <span class="total-line-value mono">${fmt(data.subtotal)}</span>
    </div>` : ''}
    ${data.discount && data.discount > 0 ? `
    <div class="total-line discount">
      <span class="total-line-label">Discount</span>
      <span class="total-line-value mono">−${fmt(data.discount)}</span>
    </div>` : ''}
    ${data.tax && data.tax > 0 ? `
    <div class="total-line">
      <span class="total-line-label">Tax</span>
      <span class="total-line-value mono">${fmt(data.tax)}</span>
    </div>` : ''}
    <div class="grand-total">
      <span class="grand-total-label">Total</span>
      <span class="grand-total-value">${fmt(data.totalAmount)}</span>
    </div>
  </div>

  <!-- Payment -->
  ${data.amountPaid !== undefined ? `
  <div class="payment-section">
    <div class="payment-section-label">Payment</div>
    ${data.paymentMethod ? `
    <div class="payment-row">
      <span class="payment-row-label">Method</span>
      <span class="payment-row-value">${data.paymentMethod.charAt(0).toUpperCase() + data.paymentMethod.slice(1)}</span>
    </div>` : ''}
    <div class="payment-row paid">
      <span class="payment-row-label">Amount Paid</span>
      <span class="payment-row-value">${fmt(data.amountPaid)}</span>
    </div>
    ${data.balance !== undefined && data.balance > 0 ? `
    <div class="balance-block">
      <span class="balance-label">Balance Due</span>
      <span class="balance-value">${fmt(data.balance)}</span>
    </div>` : ''}
  </div>` : ''}

  <!-- Notes -->
  ${data.notes ? `
  <div class="notes-section">
    <div class="notes-label">Notes</div>
    <div class="notes-text">${data.notes}</div>
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <div>
      <div class="footer-brand">${this.org.name}</div>
      <div class="footer-tagline">Thank you for your business</div>
    </div>
    <div class="footer-right">
      <div class="footer-generated">${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
    </div>
  </div>

  <div class="accent-bar"></div>

</div>
</body>
</html>`;}


  private async sendViaWhatsApp(phoneNumber: string, invoiceData: InvoiceData, _pdfPath: string): Promise<boolean> {
    try {
      const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
      const title = INVOICE_TYPE_LABELS[invoiceData.type] || 'Receipt';
      let msg = `*${title}*\nReceipt #: ${invoiceData.number}\nDate: ${invoiceData.date.toLocaleDateString('en-NG')}\n\n`;
      if (invoiceData.customer) msg += `Customer: ${invoiceData.customer.name}\n\n`;
      msg += `*Items:*\n`;
      invoiceData.items.forEach(item => {
        msg += `• ${item.productName} (${item.quantity} ${item.unit}) - ₦${item.total.toFixed(2)}\n`;
      });
      msg += `\n*Total: ₦${invoiceData.totalAmount.toFixed(2)}*\n`;
      if (invoiceData.amountPaid !== undefined) msg += `Paid: ₦${invoiceData.amountPaid.toFixed(2)}\n`;
      if (invoiceData.balance !== undefined && invoiceData.balance > 0) msg += `Balance: ₦${invoiceData.balance.toFixed(2)}\n`;
      msg += `\nThank you!\n- ${this.org.name}`;

      const url = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) await Linking.openURL(url);
      return canOpen;
    } catch (err) {
      console.error('WhatsApp send failed:', err);
      return false;
    }
  }

  private async sendViaEmail(email: string, invoiceData: InvoiceData, pdfPath: string): Promise<boolean> {
    try {
      const MailComposer = await import('expo-mail-composer');
      const title = INVOICE_TYPE_LABELS[invoiceData.type] || 'Receipt';
      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) return false;
      const result = await MailComposer.composeAsync({
        recipients: [email],
        subject: `${title} #${invoiceData.number} - ${this.org.name}`,
        body: `<p>Please find attached your ${title.toLowerCase()}.</p>`,
        isHtml: true,
        attachments: [pdfPath],
      });
      return result.status === 'sent';
    } catch {
      return false;
    }
  }

  private async savePDFToStorage(pdfPath: string, receiptNumber: string): Promise<string | null> {
    try {
      const fileName = `Receipt_${receiptNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
      const receiptsDir = new Directory(Paths.document, 'receipts');
      if (!await receiptsDir.exists) await receiptsDir.create();
      const destFile = new File(receiptsDir, fileName);
      await new File(pdfPath).copy(destFile);
      return destFile.uri;
    } catch {
      return null;
    }
  }

  private async sharePDFNow(pdfPath: string, receiptNumber: string): Promise<boolean> {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfPath, {
          mimeType: 'application/pdf',
          dialogTitle: `Receipt ${receiptNumber}`,
          UTI: 'com.adobe.pdf',
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async getSavedReceiptPath(receiptNumber: string): Promise<string | null> {
    try {
      const receiptsDir = new Directory(Paths.document, 'receipts');
      if (!await receiptsDir.exists) return null;
      const items = await receiptsDir.list();
      const clean = receiptNumber.replace(/[^a-zA-Z0-9]/g, '_');
      for (const item of items) {
        if (item instanceof File && item.name.includes(clean)) return item.uri;
      }
      return null;
    } catch {
      return null;
    }
  }

  async shareExistingReceipt(receiptNumber: string): Promise<boolean> {
    const pdfPath = await this.getSavedReceiptPath(receiptNumber);
    if (!pdfPath) {
      Alert.alert('Receipt Not Found', 'Could not find saved receipt');
      return false;
    }
    return this.sharePDFNow(pdfPath, receiptNumber);
  }
}