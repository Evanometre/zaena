// lib/db/types.ts

export interface OutboxEntry {
  id: string;
  module: string;       // 'sales' | 'purchasing' | 'hr' | 'accounting' | ...
  operation: string;    // 'create_sale' | 'approve_po' | 'clock_in' | ...
  payload: string;      // JSON — all data needed to sync this operation
  created_at: string;
  sync_attempts: number;
  last_error: string | null;
  depends_on: string | null; // another outbox id that must sync first
}

export interface DbAdapter {
  /** Run once at app startup to create/migrate tables or object stores */
  init(): Promise<void>;

  /** Add a new operation to the outbox */
  addToOutbox(
    entry: Omit<OutboxEntry, 'sync_attempts' | 'last_error'>
  ): Promise<void>;

  /**
   * Return all pending entries in sync order:
   * - Entries with no depends_on come first
   * - Then sorted by created_at ASC within each group
   */
  getPendingEntries(): Promise<OutboxEntry[]>;

  /** Remove a successfully synced entry */
  markSynced(id: string): Promise<void>;

  /** Increment attempt counter and record the error message */
  markFailed(id: string, error: string): Promise<void>;

  /** Total number of entries waiting to sync */
  getPendingCount(): Promise<number>;

  /**
   * Entries that have failed more than `threshold` times.
   * These should be surfaced in the UI for manual review.
   */
  getStuckEntries(threshold?: number): Promise<OutboxEntry[]>;

  /** Hard-delete an entry (for manual dismissal of stuck items) */
  deleteEntry(id: string): Promise<void>;

  /**
   * Retrieve the cached session (userId + organizationId).
   * Native: reads from AsyncStorage.
   * Web: reads from localStorage.
   */
  getCachedSession(): Promise<{
    userId: string;
    organizationId: string;
  } | null>;
}