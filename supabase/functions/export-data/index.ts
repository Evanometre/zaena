// supabase/functions/export-data/index.ts
import { stringify } from 'https://deno.land/std@0.168.0/encoding/csv.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportRequest {
  templateId: string;
  organizationId: string;
  filters: {
    dateRange?: { start: string; end: string };
    locations?: string[];
    customers?: string[];
    suppliers?: string[];
    products?: string[];
    [key: string]: any;
  };
  columns: string[];
  format: 'csv' | 'xlsx' | 'json';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Export request received');

    const supabaseUrl =
      Deno.env.get('SUPABASE_URL') ||
      Deno.env.get('SUPABASE_API_URL') ||
      `https://${Deno.env.get('SUPABASE_PROJECT_REF')}.supabase.co`;

    const supabaseAnonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ||
      Deno.env.get('SUPABASE_KEY');

    console.log('Supabase URL:', supabaseUrl);
    console.log('Anon key exists:', !!supabaseAnonKey);

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(`Missing Supabase credentials. URL: ${!!supabaseUrl}, Key: ${!!supabaseAnonKey}`);
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    });

    const { data: { user } } = await supabaseClient.auth.getUser();
    console.log('User:', user?.id);

    if (!user) {
      throw new Error('Unauthorized');
    }

    const body: ExportRequest = await req.json();
    console.log('Request body:', JSON.stringify(body));

    const { templateId, organizationId, filters, columns, format } = body;

    if (!templateId) throw new Error('Missing templateId');
    if (!organizationId) throw new Error('Missing organizationId');
    if (!columns || columns.length === 0) throw new Error('Missing columns');

    const viewMap: Record<string, string> = {
      'sales-detail': 'export_sales_detail',
      'sales-summary': 'export_sales_summary',
      'purchase-detail': 'export_purchase_detail',
      'purchase-summary': 'export_purchase_summary',
      'inventory-movement': 'export_inventory_movement',
      'inventory-levels': 'export_inventory_levels',
      'customer-ledger': 'export_customer_ledger',
      'customer-summary': 'export_customer_summary',
      'supplier-summary': 'export_supplier_summary',
      'expenses': 'export_expenses',
      'payment-history': 'export_payment_history',
      'tax-summary': 'export_tax_summary',
    };

    const viewName = viewMap[templateId];
    if (!viewName) {
      throw new Error(`Invalid template ID: ${templateId}`);
    }

    let query = supabaseClient
      .from(viewName)
      .select(columns.join(', '))
      .eq('organization_id', organizationId);

    console.log('Base query built for view:', viewName);
    console.log('Selected columns:', columns.join(', '));

    if (filters.dateRange) {
      const dateColumn = getDateColumnForView(viewName);
      console.log('Applying date filter on column:', dateColumn);
      if (filters.dateRange.start) {
        query = query.gte(dateColumn, filters.dateRange.start);
      }
      if (filters.dateRange.end) {
        query = query.lte(dateColumn, filters.dateRange.end);
      }
    }

    if (filters.locations && filters.locations.length > 0) {
      query = query.in('location_id', filters.locations);
    }

    if (filters.customers && filters.customers.length > 0) {
      query = query.in('customer_id', filters.customers);
    }

    if (filters.suppliers && filters.suppliers.length > 0) {
      query = query.in('supplier_id', filters.suppliers);
    }

    if (filters.products && filters.products.length > 0) {
      query = query.in('product_id', filters.products);
    }

    console.log('Executing query...');
    const { data, error } = await query;

    console.log('Query result - rows:', data?.length, 'error:', error?.message);

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No data found matching the criteria' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    console.log('Data sample:', JSON.stringify(data[0]));

    // Generate file content
    let fileContent: string;
    let contentType: string;
    let fileExtension: string;

    if (format === 'csv') {
      try {
        fileContent = stringify(data, { columns });
      } catch (stringifyError) {
        console.error('CSV stringify error:', stringifyError);
        console.error('Data structure:', JSON.stringify(data.slice(0, 2), null, 2));
        throw new Error(`CSV generation failed: ${stringifyError.message}`);
      }
      contentType = 'text/csv';
      fileExtension = 'csv';
    } else if (format === 'json') {
      fileContent = JSON.stringify(data, null, 2);
      contentType = 'application/json';
      fileExtension = 'json';
    } else {
      throw new Error('XLSX format not yet implemented');
    }

    // Generate filename and path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${templateId}_${timestamp}.${fileExtension}`;
    const filePath = `exports/${organizationId}/${filename}`;

    console.log('Uploading file to:', filePath);

    // Upload to storage
    const { error: uploadError } = await supabaseClient.storage
      .from('erp-exports')
      .upload(filePath, fileContent, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    console.log('Upload successful, creating signed URL...');

    // Get signed URL
    const { data: urlData, error: urlError } = await supabaseClient.storage
      .from('erp-exports')
      .createSignedUrl(filePath, 3600);

    console.log('Signed URL data:', urlData);
    console.log('Signed URL error:', urlError);

    if (urlError) {
      throw new Error(`Failed to create download URL: ${urlError.message}`);
    }

    if (!urlData?.signedUrl) {
      throw new Error('Signed URL was not generated');
    }

    console.log('Export complete! Rows:', data.length);

    return new Response(
      JSON.stringify({
        downloadUrl: urlData.signedUrl,
        fileName: filename,
        rowCount: data.length,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Export error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        details: error.toString(),
        stack: error.stack,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});

function getDateColumnForView(viewName: string): string {
  const dateColumnMap: Record<string, string> = {
    export_sales_detail: 'sale_date',
    export_sales_summary: 'sale_date',
    export_purchase_detail: 'purchase_date',
    export_purchase_summary: 'purchase_date',
    export_inventory_movement: 'transaction_date',
    export_customer_ledger: 'transaction_date',
    export_expenses: 'expense_date',
    export_payment_history: 'payment_date',
    export_tax_summary: 'sale_date',
  };
  return dateColumnMap[viewName] || 'created_at';
}