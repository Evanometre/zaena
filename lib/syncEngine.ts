// lib/syncEngine.ts
// Generic sync engine — dispatches each outbox entry to its registered handler.
// Fully replaces the old sales-specific syncPendingSales().

import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import { adapter } from './db/adapter';
import { OutboxEntry } from './db/types';
import { getHandler, getRegisteredOperations } from './syncRegistry';



// ─── Backoff (unchanged from original) ───────────────────────────────────────

function getBackoffMs(attempts: number): number {
  const base = 1000 * 60 * 2; // 2 minutes
  const cap  = 1000 * 60 * 60; // 1 hour
  return Math.min(base * Math.pow(2, attempts - 1), cap);
}

function isReadyToRetry(createdAt: string, attempts: number): boolean {
  if (attempts === 0) return true;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs >= getBackoffMs(attempts);
}

// ─── Main sync loop ───────────────────────────────────────────────────────────

let isSyncing = false;

AppState.addEventListener("change", (state) => {
  if (state === "active" && isSyncing) {
    console.warn("[syncEngine] Resetting stuck isSyncing flag on foreground");
    isSyncing = false;
  }
});

export async function syncOutbox(): Promise<{
  synced:  number;
  failed:  number;
  skipped: number;
}> {
  if (isSyncing) return { synced: 0, failed: 0, skipped: 0 };
  isSyncing = true;

  let synced  = 0;
  let failed  = 0;
  let skipped = 0;

  try {
    const entries = await adapter.getPendingEntries();

    if (entries.length === 0) {
      return { synced: 0, failed: 0, skipped: 0 };
    }

    // Track IDs synced in this pass so depends_on chains can resolve in one run
    const syncedThisPass = new Set<string>();

    console.log(`🔄 Syncing ${entries.length} pending outbox entr${entries.length === 1 ? 'y' : 'ies'}...`);
    console.log(`   Registered operations: [${getRegisteredOperations().join(', ')}]`);

    for (const entry of entries) {
      // ── 1. Dependency check ────────────────────────────────────────────────
      if (entry.depends_on) {
        // Check if the dependency was already synced in a previous session
        const allEntries   = await adapter.getPendingEntries();
        const depStillWaiting = allEntries.some((e: OutboxEntry) => e.id === entry.depends_on);
        const depSyncedNow    = syncedThisPass.has(entry.depends_on);

        if (depStillWaiting && !depSyncedNow) {
          console.log(
            `⏸  ${entry.operation} (${entry.id.slice(0, 8)}) — ` +
            `waiting on dependency ${entry.depends_on.slice(0, 8)}`
          );
          skipped++;
          continue;
        }
      }

      // ── 2. Backoff check ───────────────────────────────────────────────────
      if (!isReadyToRetry(entry.created_at, entry.sync_attempts)) {
        const waitMin = Math.round(getBackoffMs(entry.sync_attempts) / 60_000);
        console.log(
          `⏳ ${entry.operation} (${entry.id.slice(0, 8)}) — ` +
          `in backoff (attempt ${entry.sync_attempts}, next retry in ~${waitMin} min)`
        );
        skipped++;
        continue;
      }

      // ── 3. Handler lookup ──────────────────────────────────────────────────
      const handler = getHandler(entry.operation);

      if (!handler) {
        console.warn(
          `⚠️  No handler registered for operation "${entry.operation}". ` +
          `Skipping. Check that the module's syncHandler.ts is imported at startup.`
        );
        skipped++;
        continue;
      }

      // ── 4. Execute ────────────────────────────────────────────────────────
      try {
        await handler(entry);
        await adapter.markSynced(entry.id);
        syncedThisPass.add(entry.id);
        synced++;
        console.log(`✅ Synced ${entry.operation} (${entry.id.slice(0, 8)})`);
      } catch (err: any) {
        await adapter.markFailed(entry.id, err?.message ?? 'Unknown error');
        failed++;
        console.error(
          `❌ Failed ${entry.operation} (${entry.id.slice(0, 8)}) ` +
          `— attempt ${entry.sync_attempts + 1}: ${err?.message}`
        );
      }
    }
  } finally {
    isSyncing = false;
  }

  console.log(`🔄 Sync complete — synced: ${synced}, failed: ${failed}, skipped: ${skipped}`);
  return { synced, failed, skipped };
}

// ─── Convenience helpers (replaces old localDb exports used in UI) ────────────

export async function getPendingCount(): Promise<number> {
  return adapter.getPendingCount();
}

export async function getStuckEntries(threshold = 10) {
  return adapter.getStuckEntries(threshold);
}

export async function dismissStuckEntry(id: string): Promise<void> {
  await adapter.deleteEntry(id);
}

export async function syncNow(): Promise<void> {
  const netState = await NetInfo.fetch();
  if (netState.isConnected && netState.isInternetReachable) {
    await syncOutbox();
  }
}