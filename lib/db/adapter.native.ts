// lib/db/adapter.native.ts
// Expo Metro automatically uses this file on iOS and Android.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { DbAdapter, OutboxEntry } from './types';

const db = SQLite.openDatabaseSync('nova_offline.db');

export const adapter: DbAdapter = {
  async init() {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS outbox (
        id            TEXT PRIMARY KEY,
        module        TEXT NOT NULL,
        operation     TEXT NOT NULL,
        payload       TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        sync_attempts INTEGER DEFAULT 0,
        last_error    TEXT,
        depends_on    TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_outbox_created_at
        ON outbox (created_at);

      CREATE INDEX IF NOT EXISTS idx_outbox_depends_on
        ON outbox (depends_on);
    `);
  },

  async addToOutbox(entry) {
    db.runSync(
      `INSERT INTO outbox
         (id, module, operation, payload, created_at, sync_attempts, last_error, depends_on)
       VALUES (?, ?, ?, ?, ?, 0, NULL, ?)`,
      [
        entry.id,
        entry.module,
        entry.operation,
        entry.payload,
        entry.created_at,
        entry.depends_on ?? null,
      ]
    );
  },

  async getPendingEntries() {
    // Entries without depends_on first, then by age
    return db.getAllSync<OutboxEntry>(
      `SELECT * FROM outbox
       ORDER BY (depends_on IS NOT NULL) ASC, created_at ASC`
    );
  },

  async markSynced(id) {
    db.runSync(`DELETE FROM outbox WHERE id = ?`, [id]);
  },

  async markFailed(id, error) {
    db.runSync(
      `UPDATE outbox
       SET sync_attempts = sync_attempts + 1, last_error = ?
       WHERE id = ?`,
      [error, id]
    );
  },

  async getPendingCount() {
    const row = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM outbox`
    );
    return row?.count ?? 0;
  },

  async getStuckEntries(threshold = 10) {
    return db.getAllSync<OutboxEntry>(
      `SELECT * FROM outbox
       WHERE sync_attempts >= ?
       ORDER BY sync_attempts DESC`,
      [threshold]
    );
  },

  async deleteEntry(id) {
    db.runSync(`DELETE FROM outbox WHERE id = ?`, [id]);
  },

  async getCachedSession() {
    try {
      const raw = await AsyncStorage.getItem('checkout_cache');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.userId || !parsed.organizationId) return null;
      return { userId: parsed.userId, organizationId: parsed.organizationId };
    } catch {
      return null;
    }
  },
};