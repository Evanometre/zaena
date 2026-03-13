// ============================================================
// EXPORT TEMPLATE TYPES & CONFIGURATION
// ============================================================

export type ExportTemplate = {
  id: string;
  name: string;
  description: string;
  category: 'sales' | 'purchases' | 'inventory' | 'customers' | 'suppliers' | 'financial' | 'tax';
  viewName: string; // The SQL view to query
  defaultColumns: string[];
  availableColumns: ExportColumn[];
  filters: ExportFilter[];
  requiresDateRange: boolean;
};

export type ExportColumn = {
  id: string;
  label: string;
  description?: string;
  dataType: 'text' | 'number' | 'date' | 'boolean' | 'currency';
  defaultSelected: boolean;
};

export type ExportFilter = {
  id: string;
  label: string;
  type: 'dateRange' | 'select' | 'multiSelect' | 'search';
  required: boolean;
  options?: { value: string; label: string }[]; // For select/multiSelect
  dataSource?: string; // For dynamic options (e.g., 'locations', 'customers')
};

export type ExportRequest = {
  templateId: string;
  organizationId: string;
  filters: Record<string, any>;
  columns: string[];
  format: 'csv' | 'xlsx' | 'json';
};

export type ExportResult = {
  downloadUrl: string;
  fileName: string;
  rowCount: number;
  generatedAt: string;
};

// ============================================================
// EXPORT TEMPLATE DEFINITIONS
// ============================================================

export const EXPORT_TEMPLATES: ExportTemplate[] = [
  // ============================================================
  // SALES EXPORTS
  // ============================================================
  {
    id: 'sales-detail',
    name: 'Sales Detail Report',
    description: 'Detailed sales data with line items, customer info, and profitability',
    category: 'sales',
    viewName: 'export_sales_detail',
    defaultColumns: [
      'sale_date',
      'receipt_number',
      'customer_name',
      'product_name',
      'quantity',
      'unit_price',
      'line_total',
      'line_profit',
    ],
    availableColumns: [
      { id: 'sale_id', label: 'Sale ID', dataType: 'text', defaultSelected: false },
      { id: 'receipt_number', label: 'Receipt #', dataType: 'text', defaultSelected: true },
      { id: 'sale_date', label: 'Sale Date', dataType: 'date', defaultSelected: true },
      { id: 'recorded_date', label: 'Recorded Date', dataType: 'date', defaultSelected: false },
      { id: 'is_backdated', label: 'Backdated?', dataType: 'boolean', defaultSelected: false },
      
      { id: 'customer_name', label: 'Customer', dataType: 'text', defaultSelected: true },
      { id: 'customer_phone', label: 'Customer Phone', dataType: 'text', defaultSelected: false },
      { id: 'customer_email', label: 'Customer Email', dataType: 'text', defaultSelected: false },
      
      { id: 'location_name', label: 'Location', dataType: 'text', defaultSelected: true },
      { id: 'device_name', label: 'Device', dataType: 'text', defaultSelected: false },
      
      { id: 'product_name', label: 'Product', dataType: 'text', defaultSelected: true },
      { id: 'product_sku', label: 'SKU', dataType: 'text', defaultSelected: false },
      { id: 'product_category', label: 'Category', dataType: 'text', defaultSelected: false },
      { id: 'variation_name', label: 'Variation', dataType: 'text', defaultSelected: false },
      
      { id: 'quantity', label: 'Quantity', dataType: 'number', defaultSelected: true },
      { id: 'unit_price', label: 'Unit Price', dataType: 'currency', defaultSelected: true },
      { id: 'line_total', label: 'Line Total', dataType: 'currency', defaultSelected: true },
      { id: 'unit_cogs', label: 'Unit Cost', dataType: 'currency', defaultSelected: false },
      { id: 'total_cogs', label: 'Total Cost', dataType: 'currency', defaultSelected: false },
      { id: 'line_profit', label: 'Profit', dataType: 'currency', defaultSelected: true },
      { id: 'profit_margin_percent', label: 'Margin %', dataType: 'number', defaultSelected: false },
      
      { id: 'sale_subtotal', label: 'Sale Subtotal', dataType: 'currency', defaultSelected: false },
      { id: 'sale_discount', label: 'Discount', dataType: 'currency', defaultSelected: false },
      { id: 'sale_tax', label: 'Tax', dataType: 'currency', defaultSelected: false },
      { id: 'sale_total', label: 'Sale Total', dataType: 'currency', defaultSelected: false },
      { id: 'payment_status', label: 'Payment Status', dataType: 'text', defaultSelected: true },
      
      { id: 'created_by_name', label: 'Created By', dataType: 'text', defaultSelected: false },
      { id: 'entry_method', label: 'Entry Method', dataType: 'text', defaultSelected: false },
    ],
    filters: [
      {
        id: 'dateRange',
        label: 'Date Range',
        type: 'dateRange',
        required: true,
      },
      {
        id: 'locations',
        label: 'Locations',
        type: 'multiSelect',
        required: false,
        dataSource: 'locations',
      },
      {
        id: 'customers',
        label: 'Customers',
        type: 'multiSelect',
        required: false,
        dataSource: 'customers',
      },
      {
        id: 'payment_status',
        label: 'Payment Status',
        type: 'multiSelect',
        required: false,
        options: [
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partial' },
          { value: 'unpaid', label: 'Unpaid' },
        ],
      },
    ],
    requiresDateRange: true,
  },

  {
    id: 'sales-summary',
    name: 'Sales Summary Report',
    description: 'Aggregated sales totals by transaction',
    category: 'sales',
    viewName: 'export_sales_summary',
    defaultColumns: [
      'sale_date',
      'receipt_number',
      'customer_name',
      'location_name',
      'total_amount',
      'profit',
      'payment_status',
    ],
    availableColumns: [
      { id: 'receipt_number', label: 'Receipt #', dataType: 'text', defaultSelected: true },
      { id: 'sale_date', label: 'Sale Date', dataType: 'date', defaultSelected: true },
      { id: 'sale_date_only', label: 'Date (Date Only)', dataType: 'date', defaultSelected: false },
      { id: 'customer_name', label: 'Customer', dataType: 'text', defaultSelected: true },
      { id: 'location_name', label: 'Location', dataType: 'text', defaultSelected: true },
      { id: 'device_name', label: 'Device', dataType: 'text', defaultSelected: false },
      
      { id: 'subtotal', label: 'Subtotal', dataType: 'currency', defaultSelected: false },
      { id: 'discount', label: 'Discount', dataType: 'currency', defaultSelected: false },
      { id: 'tax', label: 'Tax', dataType: 'currency', defaultSelected: false },
      { id: 'total_amount', label: 'Total', dataType: 'currency', defaultSelected: true },
      { id: 'total_cogs', label: 'Cost', dataType: 'currency', defaultSelected: false },
      { id: 'profit', label: 'Profit', dataType: 'currency', defaultSelected: true },
      { id: 'profit_margin_percent', label: 'Margin %', dataType: 'number', defaultSelected: false },
      
      { id: 'payment_status', label: 'Payment Status', dataType: 'text', defaultSelected: true },
      { id: 'item_count', label: '# Items', dataType: 'number', defaultSelected: false },
      { id: 'total_quantity', label: 'Total Qty', dataType: 'number', defaultSelected: false },
      { id: 'created_by_name', label: 'Created By', dataType: 'text', defaultSelected: false },
    ],
    filters: [
      {
        id: 'dateRange',
        label: 'Date Range',
        type: 'dateRange',
        required: true,
      },
      {
        id: 'locations',
        label: 'Locations',
        type: 'multiSelect',
        required: false,
        dataSource: 'locations',
      },
    ],
    requiresDateRange: true,
  },

  // ============================================================
  // PURCHASE EXPORTS
  // ============================================================
  {
    id: 'purchase-detail',
    name: 'Purchase Detail Report',
    description: 'Detailed purchase data with line items and supplier info',
    category: 'purchases',
    viewName: 'export_purchase_detail',
    defaultColumns: [
      'purchase_date',
      'supplier_name',
      'product_name',
      'quantity',
      'unit_cost',
      'total_cost',
    ],
    availableColumns: [
      { id: 'purchase_date', label: 'Purchase Date', dataType: 'date', defaultSelected: true },
      { id: 'supplier_name', label: 'Supplier', dataType: 'text', defaultSelected: true },
      { id: 'supplier_contact', label: 'Contact Person', dataType: 'text', defaultSelected: false },
      { id: 'supplier_phone', label: 'Supplier Phone', dataType: 'text', defaultSelected: false },
      { id: 'location_name', label: 'Location', dataType: 'text', defaultSelected: true },
      
      { id: 'product_name', label: 'Product', dataType: 'text', defaultSelected: true },
      { id: 'product_sku', label: 'SKU', dataType: 'text', defaultSelected: false },
      { id: 'product_category', label: 'Category', dataType: 'text', defaultSelected: false },
      
      { id: 'quantity', label: 'Quantity', dataType: 'number', defaultSelected: true },
      { id: 'unit_cost', label: 'Unit Cost', dataType: 'currency', defaultSelected: true },
      { id: 'total_cost', label: 'Total Cost', dataType: 'currency', defaultSelected: true },
      
      { id: 'purchase_subtotal', label: 'Purchase Subtotal', dataType: 'currency', defaultSelected: false },
      { id: 'acquisition_costs', label: 'Acquisition Costs', dataType: 'currency', defaultSelected: false },
      { id: 'purchase_total', label: 'Purchase Total', dataType: 'currency', defaultSelected: false },
      { id: 'payment_status', label: 'Payment Status', dataType: 'text', defaultSelected: true },
      
      { id: 'notes', label: 'Notes', dataType: 'text', defaultSelected: false },
      { id: 'created_by_name', label: 'Created By', dataType: 'text', defaultSelected: false },
    ],
    filters: [
      {
        id: 'dateRange',
        label: 'Date Range',
        type: 'dateRange',
        required: true,
      },
      {
        id: 'suppliers',
        label: 'Suppliers',
        type: 'multiSelect',
        required: false,
        dataSource: 'suppliers',
      },
      {
        id: 'locations',
        label: 'Locations',
        type: 'multiSelect',
        required: false,
        dataSource: 'locations',
      },
    ],
    requiresDateRange: true,
  },

  // ============================================================
  // INVENTORY EXPORTS
  // ============================================================
  {
    id: 'inventory-movement',
    name: 'Inventory Movement Report',
    description: 'Stock ins and outs with running balance',
    category: 'inventory',
    viewName: 'export_inventory_movement',
    defaultColumns: [
      'transaction_date',
      'product_name',
      'location_name',
      'movement_type',
      'quantity',
      'stock_before',
      'stock_after',
    ],
    availableColumns: [
      { id: 'transaction_date', label: 'Date', dataType: 'date', defaultSelected: true },
      { id: 'product_name', label: 'Product', dataType: 'text', defaultSelected: true },
      { id: 'product_sku', label: 'SKU', dataType: 'text', defaultSelected: false },
      { id: 'product_category', label: 'Category', dataType: 'text', defaultSelected: false },
      { id: 'location_name', label: 'Location', dataType: 'text', defaultSelected: true },
      
      { id: 'movement_type', label: 'Type', dataType: 'text', defaultSelected: true },
      { id: 'quantity', label: 'Quantity', dataType: 'number', defaultSelected: true },
      { id: 'unit_cost', label: 'Unit Cost', dataType: 'currency', defaultSelected: false },
      { id: 'total_value', label: 'Total Value', dataType: 'currency', defaultSelected: false },
      
      { id: 'source_description', label: 'Source', dataType: 'text', defaultSelected: true },
      { id: 'stock_before', label: 'Stock Before', dataType: 'number', defaultSelected: true },
      { id: 'stock_after', label: 'Stock After', dataType: 'number', defaultSelected: true },
      
      { id: 'device_name', label: 'Device', dataType: 'text', defaultSelected: false },
    ],
    filters: [
      {
        id: 'dateRange',
        label: 'Date Range',
        type: 'dateRange',
        required: true,
      },
      {
        id: 'locations',
        label: 'Locations',
        type: 'multiSelect',
        required: false,
        dataSource: 'locations',
      },
      {
        id: 'products',
        label: 'Products',
        type: 'multiSelect',
        required: false,
        dataSource: 'products',
      },
    ],
    requiresDateRange: true,
  },

  {
    id: 'inventory-levels',
    name: 'Current Inventory Levels',
    description: 'Current stock on hand by location',
    category: 'inventory',
    viewName: 'export_inventory_levels',
    defaultColumns: [
      'product_name',
      'location_name',
      'current_stock',
      'stock_value',
      'stock_status',
    ],
    availableColumns: [
      { id: 'product_name', label: 'Product', dataType: 'text', defaultSelected: true },
      { id: 'product_sku', label: 'SKU', dataType: 'text', defaultSelected: false },
      { id: 'product_category', label: 'Category', dataType: 'text', defaultSelected: false },
      { id: 'location_name', label: 'Location', dataType: 'text', defaultSelected: true },
      
      { id: 'current_stock', label: 'Stock on Hand', dataType: 'number', defaultSelected: true },
      { id: 'average_cost', label: 'Avg Cost', dataType: 'currency', defaultSelected: false },
      { id: 'stock_value', label: 'Stock Value', dataType: 'currency', defaultSelected: true },
      
      { id: 'default_cost_price', label: 'Cost Price', dataType: 'currency', defaultSelected: false },
      { id: 'default_selling_price', label: 'Selling Price', dataType: 'currency', defaultSelected: false },
      
      { id: 'stock_status', label: 'Status', dataType: 'text', defaultSelected: true },
      { id: 'is_active', label: 'Active?', dataType: 'boolean', defaultSelected: false },
    ],
    filters: [
      {
        id: 'locations',
        label: 'Locations',
        type: 'multiSelect',
        required: false,
        dataSource: 'locations',
      },
      {
        id: 'stock_status',
        label: 'Stock Status',
        type: 'multiSelect',
        required: false,
        options: [
          { value: 'In Stock', label: 'In Stock' },
          { value: 'Low Stock', label: 'Low Stock' },
          { value: 'Out of Stock', label: 'Out of Stock' },
        ],
      },
    ],
    requiresDateRange: false,
  },

  // ============================================================
  // CUSTOMER/SUPPLIER EXPORTS
  // ============================================================
  {
    id: 'customer-ledger',
    name: 'Customer Ledger',
    description: 'Customer transaction history with running balance',
    category: 'customers',
    viewName: 'export_customer_ledger',
    defaultColumns: [
      'customer_name',
      'transaction_date',
      'transaction_type',
      'debit',
      'credit',
      'balance',
    ],
    availableColumns: [
      { id: 'customer_name', label: 'Customer', dataType: 'text', defaultSelected: true },
      { id: 'customer_phone', label: 'Phone', dataType: 'text', defaultSelected: false },
      { id: 'transaction_date', label: 'Date', dataType: 'date', defaultSelected: true },
      { id: 'transaction_type', label: 'Type', dataType: 'text', defaultSelected: true },
      { id: 'reference', label: 'Reference', dataType: 'text', defaultSelected: false },
      { id: 'debit', label: 'Debit', dataType: 'currency', defaultSelected: true },
      { id: 'credit', label: 'Credit', dataType: 'currency', defaultSelected: true },
      { id: 'balance', label: 'Balance', dataType: 'currency', defaultSelected: true },
    ],
    filters: [
      {
        id: 'dateRange',
        label: 'Date Range',
        type: 'dateRange',
        required: false,
      },
      {
        id: 'customers',
        label: 'Customers',
        type: 'multiSelect',
        required: false,
        dataSource: 'customers',
      },
    ],
    requiresDateRange: false,
  },

  {
    id: 'customer-summary',
    name: 'Customer Summary',
    description: 'Overall customer statistics and balances',
    category: 'customers',
    viewName: 'export_customer_summary',
    defaultColumns: [
      'customer_name',
      'total_sales_count',
      'total_sales_amount',
      'outstanding_balance',
      'customer_status',
    ],
    availableColumns: [
      { id: 'customer_name', label: 'Customer', dataType: 'text', defaultSelected: true },
      { id: 'customer_phone', label: 'Phone', dataType: 'text', defaultSelected: true },
      { id: 'customer_email', label: 'Email', dataType: 'text', defaultSelected: false },
      { id: 'customer_since', label: 'Customer Since', dataType: 'date', defaultSelected: false },
      
      { id: 'total_sales_count', label: 'Total Sales', dataType: 'number', defaultSelected: true },
      { id: 'total_sales_amount', label: 'Sales Amount', dataType: 'currency', defaultSelected: true },
      { id: 'average_sale_amount', label: 'Avg Sale', dataType: 'currency', defaultSelected: false },
      
      { id: 'total_paid', label: 'Total Paid', dataType: 'currency', defaultSelected: false },
      { id: 'outstanding_balance', label: 'Outstanding', dataType: 'currency', defaultSelected: true },
      
      { id: 'last_sale_date', label: 'Last Sale', dataType: 'date', defaultSelected: false },
      { id: 'customer_status', label: 'Status', dataType: 'text', defaultSelected: true },
    ],
    filters: [
      {
        id: 'customer_status',
        label: 'Status',
        type: 'multiSelect',
        required: false,
        options: [
          { value: 'Active', label: 'Active' },
          { value: 'Recent', label: 'Recent' },
          { value: 'Inactive', label: 'Inactive' },
        ],
      },
    ],
    requiresDateRange: false,
  },

  // ============================================================
  // FINANCIAL EXPORTS
  // ============================================================
  {
    id: 'expenses',
    name: 'Expense Report',
    description: 'All business expenses by category and date',
    category: 'financial',
    viewName: 'export_expenses',
    defaultColumns: [
      'expense_date',
      'category',
      'amount',
      'location_name',
      'payment_account',
    ],
    availableColumns: [
      { id: 'expense_date', label: 'Date', dataType: 'date', defaultSelected: true },
      { id: 'category', label: 'Category', dataType: 'text', defaultSelected: true },
      { id: 'expense_type', label: 'Type', dataType: 'text', defaultSelected: false },
      { id: 'amount', label: 'Amount', dataType: 'currency', defaultSelected: true },
      { id: 'location_name', label: 'Location', dataType: 'text', defaultSelected: true },
      { id: 'payment_account', label: 'Payment Account', dataType: 'text', defaultSelected: true },
      { id: 'notes', label: 'Notes', dataType: 'text', defaultSelected: false },
      { id: 'is_from_purchase', label: 'From Purchase?', dataType: 'boolean', defaultSelected: false },
    ],
    filters: [
      {
        id: 'dateRange',
        label: 'Date Range',
        type: 'dateRange',
        required: true,
      },
      {
        id: 'locations',
        label: 'Locations',
        type: 'multiSelect',
        required: false,
        dataSource: 'locations',
      },
    ],
    requiresDateRange: true,
  },

  {
    id: 'payment-history',
    name: 'Payment History',
    description: 'All payment transactions',
    category: 'financial',
    viewName: 'export_payment_history',
    defaultColumns: [
      'payment_date',
      'party_name',
      'amount',
      'payment_method',
      'payment_direction',
    ],
    availableColumns: [
      { id: 'payment_date', label: 'Date', dataType: 'date', defaultSelected: true },
      { id: 'party_name', label: 'Customer/Supplier', dataType: 'text', defaultSelected: true },
      { id: 'amount', label: 'Amount', dataType: 'currency', defaultSelected: true },
      { id: 'payment_method', label: 'Method', dataType: 'text', defaultSelected: true },
      { id: 'payment_direction', label: 'Direction', dataType: 'text', defaultSelected: true },
      { id: 'reference_number', label: 'Reference', dataType: 'text', defaultSelected: false },
      { id: 'location_name', label: 'Location', dataType: 'text', defaultSelected: false },
      { id: 'device_name', label: 'Device', dataType: 'text', defaultSelected: false },
      { id: 'status', label: 'Status', dataType: 'text', defaultSelected: false },
    ],
    filters: [
      {
        id: 'dateRange',
        label: 'Date Range',
        type: 'dateRange',
        required: true,
      },
      {
        id: 'payment_direction',
        label: 'Direction',
        type: 'multiSelect',
        required: false,
        options: [
          { value: 'in', label: 'Received' },
          { value: 'out', label: 'Paid' },
        ],
      },
    ],
    requiresDateRange: true,
  },

  // ============================================================
  // TAX EXPORTS
  // ============================================================
  {
    id: 'tax-summary',
    name: 'Tax Summary Report',
    description: 'Tax collected by period and location',
    category: 'tax',
    viewName: 'export_tax_summary',
    defaultColumns: [
      'sale_date',
      'location_name',
      'total_sales',
      'total_subtotal',
      'total_tax_collected',
    ],
    availableColumns: [
      { id: 'sale_date', label: 'Date', dataType: 'date', defaultSelected: true },
      { id: 'tax_year', label: 'Year', dataType: 'number', defaultSelected: false },
      { id: 'tax_month', label: 'Month', dataType: 'number', defaultSelected: false },
      { id: 'tax_quarter', label: 'Quarter', dataType: 'number', defaultSelected: false },
      { id: 'location_name', label: 'Location', dataType: 'text', defaultSelected: true },
      { id: 'total_sales', label: '# Sales', dataType: 'number', defaultSelected: true },
      { id: 'total_subtotal', label: 'Subtotal', dataType: 'currency', defaultSelected: true },
      { id: 'total_discount', label: 'Discount', dataType: 'currency', defaultSelected: false },
      { id: 'total_tax_collected', label: 'Tax Collected', dataType: 'currency', defaultSelected: true },
      { id: 'total_sales_amount', label: 'Total Sales', dataType: 'currency', defaultSelected: false },
    ],
    filters: [
      {
        id: 'dateRange',
        label: 'Date Range',
        type: 'dateRange',
        required: true,
      },
      {
        id: 'locations',
        label: 'Locations',
        type: 'multiSelect',
        required: false,
        dataSource: 'locations',
      },
    ],
    requiresDateRange: true,
  },
];