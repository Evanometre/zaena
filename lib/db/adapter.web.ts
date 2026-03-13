// lib/db/adapter.web.ts
// Expo Metro automatically uses this file on web.
// Requires: npx expo install idb

import { IDBPDatabase, openDB } from 'idb';
import { DbAdapter, OutboxEntry } from './types';

const DB_NAME    = 'nova_erp';
const DB_VERSION = 1;
const STORE      = 'outbox';

// Lazily opened — created once, reused for the session lifetime
let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;

  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by_created_at',    'created_at');
        store.createIndex('by_sync_attempts', 'sync_attempts');
        store.createIndex('by_depends_on',    'depends_on');
      }
    },
  });

  return _db;
}

export const adapter: DbAdapter = {
  async init() {
    // Opening the DB triggers the upgrade callback above if needed
    await getDb();
  },

  async addToOutbox(entry) {
    const db = await getDb();
    await db.put(STORE, {
      ...entry,
      sync_attempts: 0,
      last_error:    null,
      depends_on:    entry.depends_on ?? null,
    } satisfies OutboxEntry);
  },

  async getPendingEntries() {
    const db   = await getDb();
    const all  = await db.getAll(STORE) as OutboxEntry[];

    // Mirror the SQL sort: no depends_on first, then oldest first within each group
    return all.sort((a, b) => {
      const aBlocked = a.depends_on !== null ? 1 : 0;
      const bBlocked = b.depends_on !== null ? 1 : 0;
      if (aBlocked !== bBlocked) return aBlocked - bBlocked;
      return a.created_at.localeCompare(b.created_at);
    });
  },

  async markSynced(id) {
    const db = await getDb();
    await db.delete(STORE, id);
  },

  async markFailed(id, error) {
    const db    = await getDb();
    const entry = await db.get(STORE, id) as OutboxEntry | undefined;
    if (!entry) return;

    await db.put(STORE, {
      ...entry,
      sync_attempts: entry.sync_attempts + 1,
      last_error:    error,
    });
  },

  async getPendingCount() {
    const db = await getDb();
    return db.count(STORE);
  },

  async getStuckEntries(threshold = 10) {
    const db  = await getDb();
    const all = await db.getAll(STORE) as OutboxEntry[];
    return all
      .filter(e => e.sync_attempts >= threshold)
      .sort((a, b) => b.sync_attempts - a.sync_attempts);
  },

  async deleteEntry(id) {
    const db = await getDb();
    await db.delete(STORE, id);
  },

  async getCachedSession() {
    try {
      const raw = localStorage.getItem('checkout_cache');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.userId || !parsed.organizationId) return null;
      return { userId: parsed.userId, organizationId: parsed.organizationId };
    } catch {
      return null;
    }
  },
};