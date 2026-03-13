// lib/localDb.ts
// Public API for queueing offline operations.
// All storage is delegated to the platform adapter (SQLite on native, IndexedDB on web).
// The old per-table functions have been removed — the outbox is now the single source of truth.

import * as Crypto from 'expo-crypto';
import { adapter } from './db/adapter';
// ─── Init ─────────────────────────────────────────────────────────────────────
// Call once at app startup, before any other localDb operations.

export async function initLocalDb(): Promise<void> {
  await adapter.init();
}

// ─── Sales ────────────────────────────────────────────────────────────────────
// API is intentionally identical to the old queueSale() so new.tsx needs no changes.

export async function queueSale(params: {
  localId:             string;
  receiptNumber:       string;
  salePayload:         object;
  items:               object[];
  payment:             object | null;
  inventoryMutations:  object[];
}): Promise<void> {
  await adapter.addToOutbox({
    id:         params.localId,
    module:     'sales',
    operation:  'create_sale',
    payload:    JSON.stringify({
      sale:               params.salePayload,
      items:              params.items,
      payment:            params.payment,
      inventoryMutations: params.inventoryMutations,
    }),
    created_at: new Date().toISOString(),
    depends_on: null,
  });
}

export interface StuckSale {
  id:             string;
  receipt_number: string;
  created_at:     string;
  sync_attempts:  number;
  last_error:     string | null;
}

// ─── Generic outbox helpers (for new modules) ─────────────────────────────────

export async function queueOperation(params: {
  module:     string;
  operation:  string;
  payload:    object;
  dependsOn?: string;
}): Promise<string> {
  const id = Crypto.randomUUID();
  await adapter.addToOutbox({
    id,
    module:     params.module,
    operation:  params.operation,
    payload:    JSON.stringify(params.payload),
    created_at: new Date().toISOString(),
    depends_on: params.dependsOn ?? null,
  });
  return id; // return the id so callers can set depends_on chains
}

// ─── Session cache ────────────────────────────────────────────────────────────

export async function getCachedSession() {
  return adapter.getCachedSession();
}

// ─── Pending count (for UI badges) ───────────────────────────────────────────

export async function getPendingSaleCount(): Promise<number> {
  // Scoped to sales module only — for backward compat with any existing UI badge
  const entries = await adapter.getPendingEntries();
  return entries.filter(e => e.module === 'sales').length;
}

// Add to lib/localDb.ts

export async function getStuckSales(): Promise<StuckSale[]> {
  const entries = await adapter.getStuckEntries(10);
  return entries
    .filter(e => e.module === 'sales')
    .map(e => ({
      id:             e.id,
      receipt_number: JSON.parse(e.payload)?.sale?.receipt_number ?? e.id,
      created_at:     e.created_at,
      sync_attempts:  e.sync_attempts,
      last_error:     e.last_error ?? null,
    }));
}

export async function deletePendingSale(receiptNumber: string): Promise<void> {
  const entries = await adapter.getPendingEntries();
  const match = entries.find(
    e => e.module === 'sales' &&
         JSON.parse(e.payload)?.sale?.receipt_number === receiptNumber
  );
  if (match) await adapter.deleteEntry(match.id);
}