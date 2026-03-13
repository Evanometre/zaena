// lib/syncRegistry.ts
// Each ERP module registers a handler for its operations here.
// The sync engine dispatches to the correct handler at runtime.

import { OutboxEntry } from './db/types';

export type SyncHandler = (entry: OutboxEntry) => Promise<void>;

const registry = new Map<string, SyncHandler>();

/**
 * Register a handler for a specific operation.
 * Call this once per operation, typically in your module's sync handler file.
 *
 * @example
 *   registerHandler('create_sale', async (entry) => { ... });
 *   registerHandler('approve_purchase_order', async (entry) => { ... });
 */
export function registerHandler(operation: string, handler: SyncHandler): void {
  if (registry.has(operation)) {
    console.warn(`[SyncRegistry] Handler for "${operation}" is already registered — overwriting.`);
  }
  registry.set(operation, handler);
}

/**
 * Retrieve the handler for a given operation.
 * Returns undefined if no handler is registered (sync engine will skip and warn).
 */
export function getHandler(operation: string): SyncHandler | undefined {
  return registry.get(operation);
}

/** All currently registered operation names — useful for debugging */
export function getRegisteredOperations(): string[] {
  return Array.from(registry.keys());
}