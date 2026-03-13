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
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  [key: string]: string | undefined;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface DuplicateCustomer {
  row: number;
  phone: string;
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
  errors?: ValidationError[];
  duplicates?: DuplicateCustomer[];
  validRowCount?: number;
  insertedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
}

// ============================================================
// VALIDATION
// ============================================================

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRows(rows: ImportRow[]): ValidationError[] {
  const errors: ValidationError[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // +2 because row 1 is header

    // name is required
    if (!row.name || String(row.name).trim() === '') {
      errors.push({
        row: rowNum,
        field: 'name',
        message: 'Customer name is required',
      });
    }

    // email format check if provided
    if (row.email && String(row.email).trim() !== '') {
      if (!isValidEmail(String(row.email).trim())) {
        errors.push({
          row: rowNum,
          field: 'email',
          message: `"${row.email}" is not a valid email address`,
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
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

// ✅ Service role client for all DB operations - bypasses RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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
    // STEP 2: Check for duplicates (phone-first, name fallback)
    // ============================================================

    const { data: existingCustomers, error: fetchError } = await supabaseAdmin
      .from('customers')
      .select('id, name, phone')
      .eq('organization_id', organizationId);

    if (fetchError) throw fetchError;

    const existingPhoneMap = new Map<string, { id: string; name: string }>();
    const existingNameMap = new Map<string, { id: string; phone: string | null }>();

    (existingCustomers || []).forEach(c => {
      if (c.phone) existingPhoneMap.set(c.phone.trim().toLowerCase(), { id: c.id, name: c.name });
      existingNameMap.set(c.name.trim().toLowerCase(), { id: c.id, phone: c.phone });
    });

    const duplicates: DuplicateCustomer[] = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2;
      const phone = row.phone?.trim().toLowerCase();
      const name = String(row.name).trim().toLowerCase();

      if (phone && existingPhoneMap.has(phone)) {
        const existing = existingPhoneMap.get(phone)!;
        duplicates.push({
          row: rowNum,
          phone: row.phone!.trim(),
          existing_name: existing.name,
          incoming_name: String(row.name).trim(),
        });
      } else if (!phone && existingNameMap.has(name)) {
        const existing = existingNameMap.get(name)!;
        duplicates.push({
          row: rowNum,
          phone: existing.phone || '(no phone)',
          existing_name: name,
          incoming_name: String(row.name).trim(),
        });
      }
    });

    if (duplicates.length > 0 && !duplicateStrategy) {
      console.log(`Duplicates found: ${duplicates.length}`);
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
    // STEP 3: Prepare rows for insert/update
    // ============================================================

    let insertedCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;

    const rowsToInsert: any[] = [];
    const rowsToUpdate: any[] = [];

    rows.forEach((row) => {
      const phone = row.phone?.trim().toLowerCase();
      const name = String(row.name).trim().toLowerCase();
      const isDuplicate =
        (phone && existingPhoneMap.has(phone)) ||
        (!phone && existingNameMap.has(name));

      if (isDuplicate && duplicateStrategy === 'skip') {
        skippedCount++;
        return;
      }

      const customer = {
        organization_id: organizationId,
        name: String(row.name).trim(),
        phone: row.phone?.trim() || null,
        email: row.email?.trim() || null,
        address: row.address?.trim() || null,
        notes: row.notes?.trim() || null,
        is_active: true,
        created_by: user.id,
      };

      if (isDuplicate && duplicateStrategy === 'overwrite') {
        const existingId = phone
          ? existingPhoneMap.get(phone)!.id
          : existingNameMap.get(name)!.id;
        rowsToUpdate.push({ ...customer, id: existingId });
      } else {
        rowsToInsert.push(customer);
      }
    });

    // ============================================================
    // STEP 4: Insert and update in chunks of 200
    // ============================================================
    const CHUNK_SIZE = 200;

    for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
      const { error: insertError } = await supabaseAdmin
        .from('customers')
        .insert(chunk);

      if (insertError) {
        console.error('Insert error:', insertError);
        throw new Error(`Failed to insert customers: ${insertError.message}`);
      }

      insertedCount += chunk.length;
      console.log(`Inserted chunk ${i / CHUNK_SIZE + 1}: ${chunk.length} customers`);
    }

    for (let i = 0; i < rowsToUpdate.length; i += CHUNK_SIZE) {
      const chunk = rowsToUpdate.slice(i, i + CHUNK_SIZE);

      for (const customer of chunk) {
        const { id, ...updateData } = customer;
        const { error: updateError } = await supabaseAdmin
          .from('customers')
          .update({ ...updateData, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('organization_id', organizationId);

        if (updateError) {
          console.error('Update error:', updateError);
          throw new Error(`Failed to update customer: ${updateError.message}`);
        }
      }

      updatedCount += chunk.length;
      console.log(`Updated chunk ${i / CHUNK_SIZE + 1}: ${chunk.length} customers`);
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