// modules/customers/syncHandler.ts
// Import once in _layout.tsx:
//   import '@/modules/customers/syncHandler';

import { OutboxEntry } from '@/lib/db/types';
import supabase from '@/lib/supabase';
import { registerHandler } from '@/lib/syncRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateCustomerPayload {
  organizationId: string;
  userId:         string;
  name:           string;
  phone:          string | null;
  email:          string | null;
  address:        string | null;
  notes:          string | null;
  credit_limit:   number;
  credit_terms:   number;
  localId:        string;
}

interface UpdateCustomerPayload {
  customerId:   string;
  name:         string;
  phone:        string | null;
  email:        string | null;
  address:      string | null;
  notes:        string | null;
  credit_limit: number;
  credit_terms: number;
}

interface ToggleCustomerActivePayload {
  customerId: string;
  isActive:   boolean;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCreateCustomer(entry: OutboxEntry): Promise<void> {
  const p: CreateCustomerPayload = JSON.parse(entry.payload);

  const { error } = await supabase.from('customers').insert({
    organization_id: p.organizationId,
    name:            p.name,
    phone:           p.phone,
    email:           p.email,
    address:         p.address,
    notes:           p.notes,
    credit_limit:    p.credit_limit,
    credit_terms:    p.credit_terms,
    created_by:      p.userId,
  });

  if (error) throw error;
  console.log(`✅ customer created: ${p.name}`);
}

async function handleUpdateCustomer(entry: OutboxEntry): Promise<void> {
  const p: UpdateCustomerPayload = JSON.parse(entry.payload);

  const { error } = await supabase
    .from('customers')
    .update({
      name:         p.name,
      phone:        p.phone,
      email:        p.email,
      address:      p.address,
      notes:        p.notes,
      credit_limit: p.credit_limit,
      credit_terms: p.credit_terms,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', p.customerId);

  if (error) throw error;
  console.log(`✅ customer updated: ${p.customerId}`);
}

async function handleToggleCustomerActive(entry: OutboxEntry): Promise<void> {
  const p: ToggleCustomerActivePayload = JSON.parse(entry.payload);

  const { error } = await supabase
    .from('customers')
    .update({ is_active: p.isActive })
    .eq('id', p.customerId);

  if (error) throw error;
  console.log(`✅ customer toggled: ${p.customerId} → ${p.isActive}`);
}

// ─── Registration ─────────────────────────────────────────────────────────────

registerHandler('create_customer',        handleCreateCustomer);
registerHandler('update_customer',        handleUpdateCustomer);
registerHandler('toggle_customer_active', handleToggleCustomerActive);

console.log('[SyncRegistry] Customers module registered.');