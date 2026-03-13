// FILE: lib/invoice.ts
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, Linking } from 'react-native';
import supabase from './supabase';

/**
 * Invoice Generation System
 * 
 * Supports generating invoices/receipts for:
 * - Sales (with or without payments)
 * - Payments (full or partial)
 * - Stock receipts (inventory in)
 * - Owner withdrawals
 * - Purchase orders
 * 
 * Delivery methods:
 * - WhatsApp
 * - Email
 * - PDF Download
 */

// ==================== TYPES ====================

export type InvoiceType = 
  | 'sale_receipt'           // Customer purchase
  | 'payment_receipt'        // Payment confirmation
  | 'stock_receipt'          // Goods received note
  | 'withdrawal_receipt'     // Owner withdrawal
  | 'purchase_order'        // Purchase from supplier
  | 'expense_receipt';


export interface InvoiceData {
  // Common fields
  type: InvoiceType;
  number: string;           // Receipt/Invoice number
  date: Date;
  organizationId: string;

  // Transaction references
  saleId?: string;
  paymentId?: string;
  stockInId?: string;
  withdrawalId?: string;

  // Party information
  customer?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };

  // Location/Device
  location?: {
    id: string;
    name: string;
    address?: string;
  };
  device?: {
    id: string;
    name: string;
  };

  // Line items
  items: InvoiceItem[];

  // Financial totals
  subtotal: number;
  discount?: number;
  tax?: number;
  taxLabel?: string;
  totalAmount: number;

  // Payment info (for payment receipts)
  paymentMethod?: string;
  amountPaid?: number;
  balance?: number;

  // Notes
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

// ==================== MAIN INVOICE GENERATOR ====================

export class InvoiceGenerator {
  private organizationId: string;
  private organizationName: string = 'Your Business';
  private organizationEmail?: string;
  private organizationPhone?: string;
  private organizationAddress?: string;
  private organizationLogo?: string;
  private organizationTIN?: string;
private organizationRCNumber?: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Initialize with organization details
   */
  async initialize() {
    try {
      const { data: org } = await supabase
  .from('organizations')
  .select('name, email, phone, address, logo_url, tin, rc_number')
  .eq('id', this.organizationId)
  .single();

if (org) {
  this.organizationName     = org.name || 'Your Business';
  this.organizationEmail    = org.email;
  this.organizationPhone    = org.phone;
  this.organizationAddress  = org.address;
  this.organizationLogo     = org.logo_url;
  this.organizationTIN      = org.tin;
  this.organizationRCNumber = org.rc_number;
}
    } catch (err) {
      console.error('Failed to load organization details:', err);
    }
  }

  /**
   * Generate and deliver invoice based on settings
   */
  async generateAndDeliver(
    invoiceData: InvoiceData,
    deliveryOptions?: DeliveryOptions,
    silentMode: boolean = true
  ): Promise<InvoiceResult> {
    const result: InvoiceResult = {
      success: false,
      deliveryMethods: [],
      errors: [],
    };

    // Load delivery options from settings if not provided
    if (!deliveryOptions) {
      deliveryOptions = await this.getDeliverySettings();
    }

    // Always generate PDF first
    const pdfPath = await this.generatePDF(invoiceData);
    
    if (!pdfPath) {
      result.errors?.push('Failed to generate PDF');
      return result;
    }

    // ALWAYS save PDF silently to storage (non-blocking)
    const savedPath = await this.savePDFToStorage(pdfPath, invoiceData.number);
    if (savedPath) {
      result.pdfPath = savedPath;
      result.deliveryMethods.push('Saved to Device');
    }

    // Determine delivery methods based on customer info and settings
    const hasCustomerEmail = !!invoiceData.customer?.email;
    const hasCustomerPhone = !!invoiceData.customer?.phone;

    // WhatsApp delivery (silent - opens WhatsApp but doesn't block)
    if (deliveryOptions.whatsapp && hasCustomerPhone) {
      // Run in background
      this.sendViaWhatsApp(
        invoiceData.customer!.phone!,
        invoiceData,
        pdfPath
      ).then(sent => {
        if (sent) {
          console.log('✅ WhatsApp prepared');
        }
      }).catch(err => {
        console.error('WhatsApp error:', err);
      });
      
      result.deliveryMethods.push('WhatsApp (preparing)');
    }

    // Email delivery (silent background)
    if (deliveryOptions.email && hasCustomerEmail) {
      // Run in background
      this.sendViaEmail(
        invoiceData.customer!.email!,
        invoiceData,
        pdfPath
      ).then(sent => {
        if (sent) {
          console.log('✅ Email sent');
        }
      }).catch(err => {
        console.error('Email error:', err);
      });
      
      result.deliveryMethods.push('Email (sending)');
    }

    // Only show share dialog if explicitly requested (not in silent mode)
    if (!silentMode && deliveryOptions.pdf) {
      await this.sharePDFNow(pdfPath, invoiceData.number);
      result.deliveryMethods.push('Share Dialog Shown');
    }

    result.success = true;
    return result;
  }

  /**
   * Get delivery settings from organization settings
   */
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
    } catch (err) {
      console.error('Failed to load delivery settings:', err);
    }

    // Default: PDF only
    return { whatsapp: false, email: false, pdf: true };
  }

  /**
   * Generate PDF invoice
   */
  private async generatePDF(invoiceData: InvoiceData): Promise<string | null> {
    try {
      const html = this.generateHTML(invoiceData);
      
      // Correct import for expo-print (no destructuring)
      const Print = await import('expo-print');
      
      const { uri } = await Print.printToFileAsync({ html });
      
      return uri;
    } catch (err) {
      console.error('PDF generation failed:', err);
      Alert.alert(
        'PDF Error',
        'Failed to generate PDF. Please try again.'
      );
      return null;
    }
  }

  /**
   * Generate HTML for invoice
   */
  private generateHTML(data: InvoiceData): string {
    const typeLabels: Record<InvoiceType, string> = {
      sale_receipt: 'Sales Receipt',
      payment_receipt: 'Payment Receipt',
      stock_receipt: 'Goods Received Note',
      withdrawal_receipt: 'Withdrawal Receipt',
      purchase_order: 'Purchase Order',
      expense_receipt: 'Expense Receipt',

    };

    const title = typeLabels[data.type] || 'Receipt';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - ${data.number}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #2563eb;
    }
    
    .company-info h1 {
      font-size: 28px;
      color: #1e40af;
      margin-bottom: 8px;
    }
    
    .company-info p {
      font-size: 13px;
      color: #6b7280;
      margin: 2px 0;
    }
    
    .invoice-info {
      text-align: right;
    }
    
    .invoice-type {
      font-size: 24px;
      font-weight: bold;
      color: #1e40af;
      margin-bottom: 8px;
    }
    
    .invoice-number {
      font-size: 16px;
      color: #374151;
      margin-bottom: 4px;
    }
    
    .invoice-date {
      font-size: 13px;
      color: #6b7280;
    }
    
    .parties {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    
    .party-box {
      flex: 1;
      padding: 15px;
      background: #f9fafb;
      border-radius: 8px;
      margin-right: 15px;
    }
    
    .party-box:last-child {
      margin-right: 0;
    }
    
    .party-box h3 {
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    
    .party-box p {
      font-size: 14px;
      color: #111827;
      margin: 3px 0;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    
    .items-table thead {
      background: #f3f4f6;
    }
    
    .items-table th {
      padding: 12px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    
    .items-table th.right,
    .items-table td.right {
      text-align: right;
    }
    
    .items-table tbody tr {
      border-bottom: 1px solid #e5e7eb;
    }
    
    .items-table td {
      padding: 12px;
      color: #374151;
    }
    
    .totals {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }
    
    .totals-box {
      width: 350px;
    }
    
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      font-size: 14px;
    }
    
    .total-row.subtotal {
      color: #6b7280;
    }
    
    .total-row.discount {
      color: #dc2626;
    }
    
    .total-row.tax {
      color: #6b7280;
    }
    
    .total-row.grand-total {
      background: #f3f4f6;
      font-size: 18px;
      font-weight: bold;
      color: #111827;
      margin-top: 8px;
      border-radius: 6px;
    }
    
    .payment-info {
      background: #ecfdf5;
      border: 1px solid #10b981;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }
    
    .payment-info h3 {
      font-size: 14px;
      color: #065f46;
      margin-bottom: 8px;
      font-weight: 600;
    }
    
    .payment-detail {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      color: #047857;
      margin: 4px 0;
    }
    
    .balance-due {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }
    
    .balance-due h3 {
      font-size: 14px;
      color: #92400e;
      margin-bottom: 4px;
    }
    
    .balance-amount {
      font-size: 24px;
      font-weight: bold;
      color: #92400e;
    }
    
    .notes {
      background: #f9fafb;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }
    
    .notes h3 {
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 8px;
    }
    
    .notes p {
      font-size: 13px;
      color: #374151;
      line-height: 1.6;
    }
    
    .footer {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      color: #9ca3af;
      font-size: 12px;
    }
    
    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="company-info">
      <h1>${this.organizationName}</h1>
     // Replace the existing company-info paragraph block with:
${this.organizationAddress    ? `<p>${this.organizationAddress}</p>`         : ''}
${this.organizationPhone      ? `<p>Phone: ${this.organizationPhone}</p>`    : ''}
${this.organizationEmail      ? `<p>Email: ${this.organizationEmail}</p>`    : ''}
${this.organizationTIN        ? `<p>TIN: ${this.organizationTIN}</p>`        : ''}
${this.organizationRCNumber   ? `<p>RC No: ${this.organizationRCNumber}</p>` : ''}
    </div>
    <div class="invoice-info">
      <div class="invoice-type">${title}</div>
      <div class="invoice-number">#${data.number}</div>
      <div class="invoice-date">${data.date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}</div>
    </div>
  </div>

  <!-- Parties -->
  <div class="parties">
    ${data.customer ? `
      <div class="party-box">
        <h3>${data.type === 'purchase_order' ? 'Supplier' : 'Customer'}</h3>
        <p><strong>${data.customer.name}</strong></p>
        ${data.customer.email ? `<p>${data.customer.email}</p>` : ''}
        ${data.customer.phone ? `<p>${data.customer.phone}</p>` : ''}
      </div>
    ` : ''}
    
    ${data.location ? `
      <div class="party-box">
        <h3>Location</h3>
        <p><strong>${data.location.name}</strong></p>
        ${data.location.address ? `<p>${data.location.address}</p>` : ''}
      </div>
    ` : ''}
  </div>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th>Item</th>
        <th class="right">Quantity</th>
        <th class="right">Unit Price</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${data.items.map(item => `
        <tr>
          <td>
            <strong>${item.productName}</strong>
            ${item.description ? `<br><small style="color: #6b7280;">${item.description}</small>` : ''}
          </td>
          <td class="right">${item.quantity} ${item.unit}</td>
          <td class="right">₦${item.unitPrice.toFixed(2)}</td>
          <td class="right">₦${item.total.toFixed(2)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals">
    <div class="totals-box">
      <div class="total-row subtotal">
        <span>Subtotal:</span>
        <span>₦${data.subtotal.toFixed(2)}</span>
      </div>
      
      ${data.discount && data.discount > 0 ? `
        <div class="total-row discount">
          <span>Discount:</span>
          <span>-₦${data.discount.toFixed(2)}</span>
        </div>
      ` : ''}
      
      ${data.tax && data.tax > 0 ? `
  <div class="total-row tax">
    <span>${data.taxLabel || 'Tax'}:</span>
    <span>₦${data.tax.toFixed(2)}</span>
  </div>
` : ''}
      
      <div class="total-row grand-total">
        <span>Total:</span>
        <span>₦${data.totalAmount.toFixed(2)}</span>
      </div>
    </div>
  </div>

  <!-- Payment Info (if applicable) -->
  ${data.amountPaid !== undefined ? `
    <div class="payment-info">
      <h3>Payment Information</h3>
      <div class="payment-detail">
        <span>Payment Method:</span>
        <strong>${data.paymentMethod || 'N/A'}</strong>
      </div>
      <div class="payment-detail">
        <span>Amount Paid:</span>
        <strong>₦${data.amountPaid.toFixed(2)}</strong>
      </div>
    </div>
  ` : ''}

  <!-- Balance Due -->
  ${data.balance !== undefined && data.balance > 0 ? `
    <div class="balance-due">
      <h3>Balance Due</h3>
      <div class="balance-amount">₦${data.balance.toFixed(2)}</div>
    </div>
  ` : ''}

  <!-- Notes -->
  ${data.notes ? `
    <div class="notes">
      <h3>Notes</h3>
      <p>${data.notes}</p>
    </div>
  ` : ''}

  <!-- Footer -->
  <div class="footer">
    <p>Thank you for your business!</p>
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Send invoice via WhatsApp
   */
  private async sendViaWhatsApp(
    phoneNumber: string,
    invoiceData: InvoiceData,
    pdfPath: string
  ): Promise<boolean> {
    try {
      // Format phone number (remove spaces, dashes, etc.)
      const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
      
      // Create message
      const message = this.formatWhatsAppMessage(invoiceData);
      
      // WhatsApp URL with message
      const whatsappUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
      
      // Check if WhatsApp is available
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
        
        // Note: We can't actually attach the PDF via deep link
        // The user will need to manually share the PDF
        // For actual PDF sending, you'd need WhatsApp Business API
        
        Alert.alert(
          'WhatsApp Opened',
          'Message prepared. You can manually attach the PDF from your files.',
        );
        
        return true;
      } else {
        Alert.alert('WhatsApp Not Available', 'Please install WhatsApp to send receipts.');
        return false;
      }
    } catch (err) {
      console.error('WhatsApp send failed:', err);
      return false;
    }
  }

  /**
   * Format WhatsApp message
   */
  private formatWhatsAppMessage(data: InvoiceData): string {
    const typeLabels: Record<InvoiceType, string> = {
      sale_receipt: 'Sales Receipt',
      payment_receipt: 'Payment Receipt',
      stock_receipt: 'Goods Received Note',
      withdrawal_receipt: 'Withdrawal Receipt',
      purchase_order: 'Purchase Order',
      expense_receipt: 'Expense Receipt',

    };

    const title = typeLabels[data.type] || 'Receipt';

    let message = `*${title}*\n`;
    message += `Receipt #: ${data.number}\n`;
    message += `Date: ${data.date.toLocaleDateString()}\n\n`;
    
    if (data.customer) {
      message += `Customer: ${data.customer.name}\n\n`;
    }
    
    message += `*Items:*\n`;
    data.items.forEach(item => {
      message += `• ${item.productName} (${item.quantity} ${item.unit}) - ₦${item.total.toFixed(2)}\n`;
    });
    
    message += `\n*Total: ₦${data.totalAmount.toFixed(2)}*\n`;
    
    if (data.amountPaid !== undefined) {
      message += `Paid: ₦${data.amountPaid.toFixed(2)}\n`;
    }
    
    if (data.balance !== undefined && data.balance > 0) {
      message += `Balance: ₦${data.balance.toFixed(2)}\n`;
    }
    
    message += `\nThank you for your business!\n`;
    message += `- ${this.organizationName}`;
    
    return message;
  }

  /**
   * Send invoice via Email
   */
  private async sendViaEmail(
    email: string,
    invoiceData: InvoiceData,
    pdfPath: string
  ): Promise<boolean> {
    try {
      // Correct import for expo-mail-composer
      const MailComposer = await import('expo-mail-composer');
      
      const typeLabels: Record<InvoiceType, string> = {
        sale_receipt: 'Sales Receipt',
        payment_receipt: 'Payment Receipt',
        stock_receipt: 'Goods Received Note',
        withdrawal_receipt: 'Withdrawal Receipt',
        purchase_order: 'Purchase Order',
        expense_receipt: 'Expense Receipt',

      };

      const title = typeLabels[invoiceData.type] || 'Receipt';
      
      const isAvailable = await MailComposer.isAvailableAsync();
      
      if (!isAvailable) {
        Alert.alert('Email Not Available', 'Please set up email on your device.');
        return false;
      }
      
      const result = await MailComposer.composeAsync({
        recipients: [email],
        subject: `${title} #${invoiceData.number} - ${this.organizationName}`,
        body: this.formatEmailBody(invoiceData),
        isHtml: true,
        attachments: [pdfPath],
      });
      
      return result.status === 'sent';
    } catch (err) {
      console.error('Email send failed:', err);
      return false;
    }
  }

  /**
   * Format email body
   */
  private formatEmailBody(data: InvoiceData): string {
    const typeLabels: Record<InvoiceType, string> = {
      sale_receipt: 'Sales Receipt',
      payment_receipt: 'Payment Receipt',
      stock_receipt: 'Goods Received Note',
      withdrawal_receipt: 'Withdrawal Receipt',
      purchase_order: 'Purchase Order',
      expense_receipt: 'Expense Receipt',

    };

    const title = typeLabels[data.type] || 'Receipt';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">${title}</h2>
        <p>Dear ${data.customer?.name || 'Customer'},</p>
        <p>Please find attached your ${title.toLowerCase()} for transaction #${data.number}.</p>
        
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Receipt Number:</strong> ${data.number}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${data.date.toLocaleDateString()}</p>
          <p style="margin: 5px 0;"><strong>Total Amount:</strong> ₦${data.totalAmount.toFixed(2)}</p>
          ${data.amountPaid !== undefined ? `<p style="margin: 5px 0;"><strong>Amount Paid:</strong> ₦${data.amountPaid.toFixed(2)}</p>` : ''}
          ${data.balance !== undefined && data.balance > 0 ? `<p style="margin: 5px 0; color: #dc2626;"><strong>Balance Due:</strong> ₦${data.balance.toFixed(2)}</p>` : ''}
        </div>
        
        <p>If you have any questions, please don't hesitate to contact us.</p>
        
        <p style="margin-top: 30px;">
          Best regards,<br>
          <strong>${this.organizationName}</strong><br>
          ${this.organizationPhone ? `Phone: ${this.organizationPhone}<br>` : ''}
          ${this.organizationEmail ? `Email: ${this.organizationEmail}` : ''}
        </p>
      </div>
    `;
  }

  /**
   * Save PDF to device storage (SILENT - no share dialog)
   */
  private async savePDFToStorage(pdfPath: string, receiptNumber: string): Promise<string | null> {
    try {
      const fileName = `Receipt_${receiptNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
      
      // Create receipts directory in document directory
      const receiptsDir = new Directory(Paths.document, 'receipts');
      
      // Create directory if it doesn't exist (exists is a property, not a method)
      const dirExists = await receiptsDir.exists;
      if (!dirExists) {
        await receiptsDir.create();
      }
      
      // Create file path
      const destFile = new File(receiptsDir, fileName);
      
      // Copy PDF to receipts folder
      const sourceFile = new File(pdfPath);
      await sourceFile.copy(destFile);
      
      console.log('✅ Receipt saved silently to:', destFile.uri);
      
      return destFile.uri;
    } catch (err) {
      console.error('Silent PDF save failed:', err);
      return null;
    }
  }

  /**
   * Share PDF immediately (for manual sharing)
   */
  private async sharePDFNow(pdfPath: string, receiptNumber: string): Promise<boolean> {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        await Sharing.shareAsync(pdfPath, {
          mimeType: 'application/pdf',
          dialogTitle: `Receipt ${receiptNumber}`,
          UTI: 'com.adobe.pdf',
        });
        return true;
      } else {
        Alert.alert('Sharing Not Available', 'Cannot share on this device');
        return false;
      }
    } catch (err) {
      console.error('PDF sharing failed:', err);
      return false;
    }
  }

  /**
   * Get saved receipt path for a sale
   */
  async getSavedReceiptPath(receiptNumber: string): Promise<string | null> {
    try {
      // Access receipts directory
      const receiptsDir = new Directory(Paths.document, 'receipts');
      
      // Check if directory exists (exists is a property, not a method)
      const dirExists = await receiptsDir.exists;
      if (!dirExists) {
        return null;
      }
      
      // List all files in receipts directory
      const items = await receiptsDir.list();
      
      // Find file matching this receipt number
      const cleanReceiptNumber = receiptNumber.replace(/[^a-zA-Z0-9]/g, '_');
      
      // items is an array of File/Directory objects
      for (const item of items) {
        // Check if it's a file (not a directory) and matches our receipt number
        if (item instanceof File && item.name.includes(cleanReceiptNumber)) {
          return item.uri;
        }
      }
      
      return null;
    } catch (err) {
      console.error('Error finding saved receipt:', err);
      return null;
    }
  }

  /**
   * Share a previously saved receipt
   */
  async shareExistingReceipt(receiptNumber: string): Promise<boolean> {
    const pdfPath = await this.getSavedReceiptPath(receiptNumber);
    
    if (!pdfPath) {
      Alert.alert('Receipt Not Found', 'Could not find saved receipt');
      return false;
    }
    
    return await this.sharePDFNow(pdfPath, receiptNumber);
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create invoice from sale
 */
export async function createInvoiceFromSale(
  saleId: string,
  organizationId: string,
  silentMode: boolean = true
): Promise<InvoiceResult | null> {
  try {
    // Fetch sale data
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select(`
        *,
        sale_items (
          *,
          products (name, unit)
        ),
        customers (id, name, email, phone),
        locations (id, name, address),
        devices (id, device_name)
      `)
      .eq('id', saleId)
      .single();

    if (saleError || !sale) {
      console.error('Failed to fetch sale:', saleError);
      return null;
    }

    // Build invoice data
    const invoiceData: InvoiceData = {
      type: 'sale_receipt',
      number: sale.receipt_number,
      date: new Date(sale.created_at),
      organizationId,
      saleId: sale.id,
      customer: sale.customers ? {
        id: sale.customers.id,
        name: sale.customers.name,
        email: sale.customers.email,
        phone: sale.customers.phone,
      } : undefined,
      location: sale.locations ? {
        id: sale.locations.id,
        name: sale.locations.name,
        address: sale.locations.address,
      } : undefined,
      device: sale.devices ? {
        id: sale.devices.id,
        name: sale.devices.device_name,
      } : undefined,
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
      taxLabel: 'Value Added Tax (VAT 7.5%)', 
      totalAmount: sale.total_amount,
    };

    // Generate and deliver
    const generator = new InvoiceGenerator(organizationId);
    await generator.initialize();
    
    return await generator.generateAndDeliver(invoiceData, undefined, silentMode);
  } catch (err) {
    console.error('Failed to create invoice from sale:', err);
    return null;
  }
}

/**
 * Create invoice from payment
 */
export async function createInvoiceFromPayment(
  paymentId: string,
  organizationId: string
): Promise<InvoiceResult | null> {
  try {
    // Fetch payment data
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select(`
        *,
        sales (
          *,
          sale_items (
            *,
            products (name, unit)
          ),
          customers (id, name, email, phone),
          locations (id, name, address)
        )
      `)
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      console.error('Failed to fetch payment:', paymentError);
      return null;
    }

    const sale = payment.sales;

    // Calculate balance
    const totalPaid = payment.amount;
    const balance = sale.total_amount - totalPaid;

    // Build invoice data
    const invoiceData: InvoiceData = {
      type: 'payment_receipt',
      number: `PAY-${payment.id.substring(0, 8).toUpperCase()}`,
      date: new Date(payment.payment_date),
      organizationId,
      paymentId: payment.id,
      saleId: sale.id,
      customer: sale.customers ? {
        id: sale.customers.id,
        name: sale.customers.name,
        email: sale.customers.email,
        phone: sale.customers.phone,
      } : undefined,
      location: sale.locations ? {
        id: sale.locations.id,
        name: sale.locations.name,
        address: sale.locations.address,
      } : undefined,
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
      taxLabel: 'Value Added Tax (VAT 7.5%)',
      totalAmount: sale.total_amount,
      paymentMethod: payment.payment_method,
      amountPaid: totalPaid,
      balance: balance > 0 ? balance : undefined,
      notes: payment.notes,
    };

    // Generate and deliver
    const generator = new InvoiceGenerator(organizationId);
    await generator.initialize();
    
    return await generator.generateAndDeliver(invoiceData);
  } catch (err) {
    console.error('Failed to create invoice from payment:', err);
    return null;
  }
}

/**
 * Create invoice from stock receipt
 */
export async function createInvoiceFromStockIn(
  stockInId: string,
  organizationId: string
): Promise<InvoiceResult | null> {
  try {
    // Fetch stock in data
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
      console.error('Failed to fetch stock in:', error);
      return null;
    }

    // Build invoice data
    const invoiceData: InvoiceData = {
      type: 'stock_receipt',
      number: `GRN-${stockIn.id.substring(0, 8).toUpperCase()}`,
      date: new Date(stockIn.created_at),
      organizationId,
      stockInId: stockIn.id,
      customer: stockIn.suppliers ? {
        id: stockIn.suppliers.id,
        name: stockIn.suppliers.name,
        email: stockIn.suppliers.email,
        phone: stockIn.suppliers.phone,
      } : undefined,
      location: stockIn.locations ? {
        id: stockIn.locations.id,
        name: stockIn.locations.name,
        address: stockIn.locations.address,
      } : undefined,
      items: [{
        productName: stockIn.products.name,
        quantity: stockIn.quantity,
        unit: stockIn.products.unit,
        unitPrice: stockIn.unit_cost || 0,
        total: stockIn.quantity * (stockIn.unit_cost || 0),
      }],
      subtotal: stockIn.quantity * (stockIn.unit_cost || 0),
      totalAmount: stockIn.quantity * (stockIn.unit_cost || 0),
      notes: stockIn.notes,
    };

    // Generate and deliver
    const generator = new InvoiceGenerator(organizationId);
    await generator.initialize();
    
    return await generator.generateAndDeliver(invoiceData);
  } catch (err) {
    console.error('Failed to create invoice from stock in:', err);
    return null;
  }
}

/**
 * Create invoice from owner withdrawal
 */
export async function createInvoiceFromWithdrawal(
  withdrawalId: string,
  organizationId: string
): Promise<InvoiceResult | null> {
  try {
    // Fetch withdrawal data
    const { data: withdrawal, error } = await supabase
      .from('withdrawals')
      .select(`
        *,
        locations (id, name, address)
      `)
      .eq('id', withdrawalId)
      .single();

    if (error || !withdrawal) {
      console.error('Failed to fetch withdrawal:', error);
      return null;
    }

    // Build invoice data
    const invoiceData: InvoiceData = {
      type: 'withdrawal_receipt',
      number: `WD-${withdrawal.id.substring(0, 8).toUpperCase()}`,
      date: new Date(withdrawal.withdrawal_date),
      organizationId,
      withdrawalId: withdrawal.id,
      location: withdrawal.locations ? {
        id: withdrawal.locations.id,
        name: withdrawal.locations.name,
        address: withdrawal.locations.address,
      } : undefined,
      items: [{
        productName: 'Owner Withdrawal',
        quantity: 1,
        unit: 'transaction',
        unitPrice: withdrawal.amount,
        total: withdrawal.amount,
        description: withdrawal.description,
      }],
      subtotal: withdrawal.amount,
      totalAmount: withdrawal.amount,
      notes: withdrawal.notes,
    };

    // Generate and deliver (PDF only for withdrawals)
    const generator = new InvoiceGenerator(organizationId);
    await generator.initialize();
    
    return await generator.generateAndDeliver(invoiceData, {
      whatsapp: false,
      email: false,
      pdf: true,
    });
  } catch (err) {
    console.error('Failed to create invoice from withdrawal:', err);
    return null;
  }
}

// ==================== HELPER FUNCTION ====================



export async function createInvoiceFromPurchase(
  purchaseId: string,
  organizationId: string,
  silentMode: boolean = true
): Promise<InvoiceResult | null> {
  try {
    // Fetch purchase from Supabase
    const { data: purchase, error } = await supabase
      .from('purchases')
      .select(`
        *,
        suppliers(id, name, email, phone),
        locations(id, name, address),
        purchase_items(
  id,
  quantity,
  unit_cost,
  total_cost,
  products (
    name,
    unit
  )
)

      `)
      .eq('id', purchaseId)
      .single();

    if (error) throw error;
    if (!purchase) throw new Error('Purchase not found');

    const items: InvoiceItem[] = purchase.purchase_items.map((item: any) => ({
  productName: item.products.name,
  quantity: item.quantity,
  unit: item.products.unit,
  unitPrice: item.unit_cost,
  total: item.total_cost,
}));


    const subtotal = purchase.total_cost - (purchase.acquisition_costs || 0);

    // Generate receipt number
    const receiptNumber = `PO-${purchase.id.substring(0, 8).toUpperCase()}`;

    // Prepare invoice data
    const invoiceData = {
      type: 'purchase_order' as const,
      number: receiptNumber,
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
      location: {
        id: purchase.locations.id,
        name: purchase.locations.name,
        address: purchase.locations.address,
      },
      items,
      subtotal,
      totalAmount: purchase.total_cost,
      notes: purchase.notes || '',
    };

    // Initialize generator
    const generator = new InvoiceGenerator(organizationId);
    await generator.initialize();

    // Generate and deliver invoice
    const result = await generator.generateAndDeliver(invoiceData, undefined, silentMode);

    return result;
  } catch (err: any) {
    console.error('Failed to create purchase invoice:', err);
    return {
      success: false,
      deliveryMethods: [],
      errors: [err.message || 'Unknown error'],
    };
  }
}

export async function createInvoiceFromExpense(
  expenseId: string,
  organizationId: string,
  silentMode: boolean = false
): Promise<InvoiceResult | null> {
  try {
    const { data: expense, error } = await supabase
      .from('expenses')
      .select(`
        *,
        locations (id, name, address),
        user_profiles!expenses_created_by_fkey (full_name)
      `)
      .eq('id', expenseId)
      .single();

    if (error || !expense) {
      console.error('Failed to fetch expense:', error);
      return null;
    }

    const invoiceData: InvoiceData = {
      type: 'expense_receipt',
      number: `EXP-${expense.id.substring(0, 8).toUpperCase()}`,
      date: new Date(expense.occurred_at),
      organizationId,

      location: expense.locations
        ? {
            id: expense.locations.id,
            name: expense.locations.name,
            address: expense.locations.address,
          }
        : undefined,

      items: [
        {
          productName: expense.category,
          quantity: 1,
          unit: 'expense',
          unitPrice: expense.amount,
          total: expense.amount,
          description: expense.notes || undefined,
        },
      ],

      subtotal: expense.amount,
      totalAmount: expense.amount,

      paymentMethod: expense.payment_method,
      notes: `Expense Type: ${expense.expense_type.toUpperCase()}${
        expense.user_profiles?.full_name
          ? ` | Recorded by ${expense.user_profiles.full_name}`
          : ''
      }`,
    };

    const generator = new InvoiceGenerator(organizationId);
    await generator.initialize();

    return await generator.generateAndDeliver(invoiceData, undefined, silentMode);
  } catch (err) {
    console.error('Failed to create expense receipt:', err);
    return null;
  }
}
