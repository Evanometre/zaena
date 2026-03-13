// modules/suppliers/syncHandler.ts
// Import once in _layout.tsx:
//   import '@/modules/suppliers/syncHandler';

import { OutboxEntry } from '@/lib/db/types';
import supabase from '@/lib/supabase';
import { registerHandler } from '@/lib/syncRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateSupplierPayload {
  organizationId: string;
  name:           string;
  contactPerson:  string | null;
  email:          string | null;
  phone:          string | null;
  address:        string | null;
  paymentTerms:   string | null;
  notes:          string | null;
}

interface UpdateSupplierPayload {
  supplierId:    string;
  name:          string;
  contactPerson: string | null;
  email:         string | null;
  phone:         string | null;
  address:       string | null;
  paymentTerms:  string | null;
  notes:         string | null;
  isActive:      boolean;
}

interface DeleteSupplierPayload {
  supplierId: string;
  name:       string; // for logging
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCreateSupplier(entry: OutboxEntry): Promise<void> {
  const p: CreateSupplierPayload = JSON.parse(entry.payload);

  const { error } = await supabase.from('suppliers').insert({
    organization_id: p.organizationId,
    name:            p.name,
    contact_person:  p.contactPerson,
    email:           p.email,
    phone:           p.phone,
    address:         p.address,
    payment_terms:   p.paymentTerms,
    notes:           p.notes,
    is_active:       true,
  });

  if (error) throw error;
  console.log(`✅ supplier created: ${p.name}`);
}

async function handleUpdateSupplier(entry: OutboxEntry): Promise<void> {
  const p: UpdateSupplierPayload = JSON.parse(entry.payload);

  const { error } = await supabase
    .from('suppliers')
    .update({
      name:           p.name,
      contact_person: p.contactPerson,
      email:          p.email,
      phone:          p.phone,
      address:        p.address,
      payment_terms:  p.paymentTerms,
      notes:          p.notes,
      is_active:      p.isActive,
    })
    .eq('id', p.supplierId);

  if (error) throw error;
  console.log(`✅ supplier updated: ${p.supplierId}`);
}

async function handleDeleteSupplier(entry: OutboxEntry): Promise<void> {
  const p: DeleteSupplierPayload = JSON.parse(entry.payload);

  const { error } = await supabase
    .from('suppliers')
    .delete()
    .eq('id', p.supplierId);

  if (error) throw error;
  console.log(`✅ supplier deleted: ${p.name}`);
}

// ─── Registration ─────────────────────────────────────────────────────────────

registerHandler('create_supplier', handleCreateSupplier);
registerHandler('update_supplier', handleUpdateSupplier);
registerHandler('delete_supplier', handleDeleteSupplier);

console.log('[SyncRegistry] Suppliers module registered.');