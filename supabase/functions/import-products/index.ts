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
  name: string;
  sku?: string;
  category?: string;
  unit?: string;
  default_cost_price?: string | number;
  default_selling_price?: string | number;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface DuplicateProduct {
  row: number;
  sku: string;
  existing_name: string;
  incoming_name: string;
}

interface ImportRequest {
  rows: ImportRow[];
  organizationId: string;
  duplicateStrategy?: 'skip' | 'overwrite' | null;
}

interface ImportResult {
  status: 'validation_errors' | 'duplicates_found' | 'success';
  // validation_errors
  errors?: ValidationError[];
  // duplicates_found
  duplicates?: DuplicateProduct[];
  validRowCount?: number;
  // success
  insertedCount?: number;
  skippedCount?: number;
  updatedCount?: number;
}

// ============================================================
// VALIDATION
// ============================================================

function validateRows(rows: ImportRow[]): ValidationError[] {
  const errors: ValidationError[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // +2 because row 1 is the header

    // name is required
    if (!row.name || String(row.name).trim() === '') {
      errors.push({
        row: rowNum,
        field: 'name',
        message: 'Product name is required',
      });
    }

    // cost price must be a non-negative number if provided
    if (row.default_cost_price !== undefined && row.default_cost_price !== '') {
      const cost = Number(row.default_cost_price);
      if (isNaN(cost)) {
        errors.push({
          row: rowNum,
          field: 'default_cost_price',
          message: `"${row.default_cost_price}" is not a valid number`,
        });
      } else if (cost < 0) {
        errors.push({
          row: rowNum,
          field: 'default_cost_price',
          message: 'Cost price cannot be negative',
        });
      }
    }

    // selling price must be a non-negative number if provided
    if (row.default_selling_price !== undefined && row.default_selling_price !== '') {
      const price = Number(row.default_selling_price);
      if (isNaN(price)) {
        errors.push({
          row: rowNum,
          field: 'default_selling_price',
          message: `"${row.default_selling_price}" is not a valid number`,
        });
      } else if (price < 0) {
        errors.push({
          row: rowNum,
          field: 'default_selling_price',
          message: 'Selling price cannot be negative',
        });
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

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase credentials');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    });

    // Auth check
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const body: ImportRequest = await req.json();
    const { rows, organizationId, duplicateStrategy } = body;

    console.log(`Import request: ${rows.length} rows, org: ${organizationId}, strategy: ${duplicateStrategy}`);

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
    // STEP 2: Check for duplicates (SKU-based, then name-based)
    // ============================================================

    // Get all SKUs from incoming rows
    const incomingSkus = rows
      .map(r => r.sku?.trim())
      .filter(Boolean) as string[];

    // Get all names from incoming rows (for name-based duplicate check)
    const incomingNames = rows.map(r => String(r.name).trim().toLowerCase());

    // Fetch existing products for this org
    const { data: existingProducts, error: fetchError } = await supabaseClient
      .from('products')
      .select('id, name, sku')
      .eq('organization_id', organizationId);

    if (fetchError) throw fetchError;

    const existingSkuMap = new Map<string, { id: string; name: string }>();
    const existingNameMap = new Map<string, { id: string; sku: string | null }>();

    (existingProducts || []).forEach(p => {
      if (p.sku) existingSkuMap.set(p.sku.trim().toLowerCase(), { id: p.id, name: p.name });
      existingNameMap.set(p.name.trim().toLowerCase(), { id: p.id, sku: p.sku });
    });

    // Find duplicates
    const duplicates: DuplicateProduct[] = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2;
      const sku = row.sku?.trim().toLowerCase();
      const name = String(row.name).trim().toLowerCase();

      if (sku && existingSkuMap.has(sku)) {
        const existing = existingSkuMap.get(sku)!;
        duplicates.push({
          row: rowNum,
          sku: row.sku!.trim(),
          existing_name: existing.name,
          incoming_name: String(row.name).trim(),
        });
      } else if (!sku && existingNameMap.has(name)) {
        // No SKU — fall back to name matching
        const existing = existingNameMap.get(name)!;
        duplicates.push({
          row: rowNum,
          sku: existing.sku || '(no SKU)',
          existing_name: name,
          incoming_name: String(row.name).trim(),
        });
      }
    });

    // If duplicates found and no strategy set, return them for user to decide
    if (duplicates.length > 0 && !duplicateStrategy) {
      console.log(`Duplicates found: ${duplicates.length}, waiting for strategy`);
      const result: ImportResult = {
        status: 'duplicates_found',
        duplicates,
        validRowCount: rows.length,
      };
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ============================================================
    // STEP 3: Prepare rows for insert/upsert
    // ============================================================

    let insertedCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;

    const rowsToInsert: any[] = [];
    const rowsToUpdate: any[] = [];

    rows.forEach((row) => {
      const sku = row.sku?.trim().toLowerCase();
      const name = String(row.name).trim().toLowerCase();
      const isDuplicate = (sku && existingSkuMap.has(sku)) ||
        (!sku && existingNameMap.has(name));

      if (isDuplicate && duplicateStrategy === 'skip') {
        skippedCount++;
        return;
      }

      const product = {
        organization_id: organizationId,
        name: String(row.name).trim(),
        sku: row.sku?.trim() || null,
        category: row.category?.trim() || null,
        unit: row.unit?.trim() || null,
        default_cost_price: row.default_cost_price !== undefined && row.default_cost_price !== ''
          ? Number(row.default_cost_price)
          : 0,
        default_selling_price: row.default_selling_price !== undefined && row.default_selling_price !== ''
          ? Number(row.default_selling_price)
          : 0,
        is_active: true,
      };

      if (isDuplicate && duplicateStrategy === 'overwrite') {
        // Get the existing ID
        const existingId = sku
          ? existingSkuMap.get(sku)!.id
          : existingNameMap.get(name)!.id;
        rowsToUpdate.push({ ...product, id: existingId });
      } else {
        rowsToInsert.push(product);
      }
    });

    // ============================================================
    // STEP 4: Insert and update in chunks of 200
    // ============================================================
    const CHUNK_SIZE = 200;

    // Insert new products
    for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
      const { error: insertError } = await supabaseClient
        .from('products')
        .insert(chunk);

      if (insertError) {
        console.error('Insert error:', insertError);
        throw new Error(`Failed to insert products: ${insertError.message}`);
      }

      insertedCount += chunk.length;
      console.log(`Inserted chunk ${i / CHUNK_SIZE + 1}: ${chunk.length} products`);
    }

    // Update existing products (overwrite strategy)
    for (let i = 0; i < rowsToUpdate.length; i += CHUNK_SIZE) {
      const chunk = rowsToUpdate.slice(i, i + CHUNK_SIZE);

      // Update one by one (upsert by id)
      for (const product of chunk) {
        const { id, ...updateData } = product;
        const { error: updateError } = await supabaseClient
          .from('products')
          .update({ ...updateData, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('organization_id', organizationId);

        if (updateError) {
          console.error('Update error:', updateError);
          throw new Error(`Failed to update product: ${updateError.message}`);
        }
      }

      updatedCount += chunk.length;
      console.log(`Updated chunk ${i / CHUNK_SIZE + 1}: ${chunk.length} products`);
    }

    // ============================================================
    // STEP 5: Return success
    // ============================================================
    console.log(`Import complete. Inserted: ${insertedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}`);

    const result: ImportResult = {
      status: 'success',
      insertedCount,
      updatedCount,
      skippedCount,
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