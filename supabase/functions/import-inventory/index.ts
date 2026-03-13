import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// TYPES
// ============================================================

interface ImportRow {
  product_name?: string;
  sku?: string;
  location_name?: string;
  quantity?: string;
  unit_cost?: string;
  [key: string]: string | undefined;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ImportRequest {
  rows: ImportRow[];
  organizationId: string;
}

interface ImportResult {
  status: 'validation_errors' | 'resolution_errors' | 'success';
  errors?: ValidationError[];
  importedCount?: number;
  failedCount?: number;
  failures?: { row: number; product: string; location: string; reason: string }[];
}

// ============================================================
// VALIDATION
// ============================================================

function validateRows(rows: ImportRow[]): ValidationError[] {
  const errors: ValidationError[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2;

    if (!row.product_name || String(row.product_name).trim() === '') {
      errors.push({ row: rowNum, field: 'product_name', message: 'Product name is required' });
    }

    if (!row.location_name || String(row.location_name).trim() === '') {
      errors.push({ row: rowNum, field: 'location_name', message: 'Location name is required' });
    }

    if (!row.quantity || String(row.quantity).trim() === '') {
      errors.push({ row: rowNum, field: 'quantity', message: 'Quantity is required' });
    } else {
      const qty = Number(row.quantity);
      if (isNaN(qty)) {
        errors.push({ row: rowNum, field: 'quantity', message: `"${row.quantity}" is not a valid number` });
      } else if (qty <= 0) {
        errors.push({ row: rowNum, field: 'quantity', message: 'Quantity must be greater than 0' });
      }
    }

    if (row.unit_cost !== undefined && row.unit_cost !== '') {
      const cost = Number(row.unit_cost);
      if (isNaN(cost)) {
        errors.push({ row: rowNum, field: 'unit_cost', message: `"${row.unit_cost}" is not a valid number` });
      } else if (cost < 0) {
        errors.push({ row: rowNum, field: 'unit_cost', message: 'Unit cost cannot be negative' });
      }
    }
  });

  return errors;
}

// ============================================================
// MAIN
// ============================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase credentials');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    });

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body: ImportRequest = await req.json();
    const { rows, organizationId } = body;

    console.log(`Import inventory request: ${rows.length} rows, org: ${organizationId}`);

    if (!organizationId) throw new Error('Missing organizationId');
    if (!rows || rows.length === 0) throw new Error('No rows provided');

    // ============================================================
    // STEP 1: Validate all rows
    // ============================================================
    const validationErrors = validateRows(rows);

    if (validationErrors.length > 0) {
      console.log(`Validation failed: ${validationErrors.length} errors`);
      const result: ImportResult = {
        status: 'validation_errors',
        errors: validationErrors,
      };
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ============================================================
    // STEP 2: Fetch all products and locations for this org
    // ============================================================
    const [{ data: products, error: prodError }, { data: locations, error: locError }] =
      await Promise.all([
        supabaseAdmin
          .from('products')
          .select('id, name, sku')
          .eq('organization_id', organizationId)
          .eq('is_active', true),
        supabaseAdmin
          .from('locations')
          .select('id, name')
          .eq('organization_id', organizationId)
          
      ]);

    if (prodError) throw prodError;
    if (locError) throw locError;

    // Build lookup maps (lowercase for case-insensitive matching)
    const productByName = new Map<string, { id: string; name: string }>();
    const productBySku = new Map<string, { id: string; name: string }>();
    const locationByName = new Map<string, { id: string; name: string }>();

    (products || []).forEach(p => {
      productByName.set(p.name.trim().toLowerCase(), { id: p.id, name: p.name });
      if (p.sku) productBySku.set(p.sku.trim().toLowerCase(), { id: p.id, name: p.name });
    });

    (locations || []).forEach(l => {
      locationByName.set(l.name.trim().toLowerCase(), { id: l.id, name: l.name });
    });

    // ============================================================
    // STEP 3: Resolve names to IDs, collect resolution errors
    // ============================================================
    const resolutionErrors: ValidationError[] = [];
    const resolvedRows: {
      rowNum: number;
      productId: string;
      productName: string;
      locationId: string;
      locationName: string;
      quantity: number;
      unitCost: number;
    }[] = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2;
      const productNameKey = String(row.product_name).trim().toLowerCase();
      const skuKey = row.sku?.trim().toLowerCase();
      const locationNameKey = String(row.location_name).trim().toLowerCase();

      // Resolve product — try SKU first if provided, then name
      let product = skuKey ? productBySku.get(skuKey) : undefined;
      if (!product) product = productByName.get(productNameKey);

      if (!product) {
        resolutionErrors.push({
          row: rowNum,
          field: 'product_name',
          message: `Product "${row.product_name}"${row.sku ? ` (SKU: ${row.sku})` : ''} not found. Make sure it exists in your catalog first.`,
        });
      }

      // Resolve location
      const location = locationByName.get(locationNameKey);
      if (!location) {
        resolutionErrors.push({
          row: rowNum,
          field: 'location_name',
          message: `Location "${row.location_name}" not found. Check the exact location name.`,
        });
      }

      if (product && location) {
        resolvedRows.push({
          rowNum,
          productId: product.id,
          productName: product.name,
          locationId: location.id,
          locationName: location.name,
          quantity: Number(row.quantity),
          unitCost: row.unit_cost && row.unit_cost !== '' ? Number(row.unit_cost) : 0,
        });
      }
    });

    // If any names couldn't be resolved, return errors before touching the DB
    if (resolutionErrors.length > 0) {
      console.log(`Resolution failed: ${resolutionErrors.length} errors`);
      const result: ImportResult = {
        status: 'resolution_errors',
        errors: resolutionErrors,
      };
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ============================================================
    // STEP 4: Call onboarding_record_stock_in for each row
    // ============================================================
    let importedCount = 0;
    const failures: { row: number; product: string; location: string; reason: string }[] = [];

    for (const resolved of resolvedRows) {
      try {
        const { error: rpcError } = await supabaseAdmin.rpc('onboarding_record_stock_in', {
          p_organization_id: organizationId,
          p_product_id: resolved.productId,
          p_location_id: resolved.locationId,
          p_quantity: resolved.quantity,
          p_unit_cost: resolved.unitCost,
        });

        if (rpcError) {
          console.error(`RPC error for row ${resolved.rowNum}:`, rpcError);
          failures.push({
            row: resolved.rowNum,
            product: resolved.productName,
            location: resolved.locationName,
            reason: rpcError.message,
          });
        } else {
          importedCount++;
          console.log(`Imported row ${resolved.rowNum}: ${resolved.productName} @ ${resolved.locationName} qty=${resolved.quantity}`);
        }
      } catch (err: any) {
        failures.push({
          row: resolved.rowNum,
          product: resolved.productName,
          location: resolved.locationName,
          reason: err.message || 'Unknown error',
        });
      }
    }

    // ============================================================
    // STEP 5: Return success
    // ============================================================
    console.log(`Import complete. Imported: ${importedCount}, Failed: ${failures.length}`);

    const result: ImportResult = {
      status: 'success',
      importedCount,
      failedCount: failures.length,
      failures: failures.length > 0 ? failures : undefined,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        details: error.toString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});