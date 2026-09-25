import type { Reference } from '@refer/capture';

const DATABASE_NAME = 'refer';
const DATABASE_VERSION = 3;
const REFERENCES_STORE = 'references';
const SYNC_JOBS_STORE = 'sync-jobs';
const SYNC_META_STORE = 'sync-meta';
const CLOUD_OWNER_KEY = 'cloud-owner';

export type SyncOperation = 'upsert' | 'delete';

export interface SyncJob {
  referenceId: string;
  operation: SyncOperation;
  token: string;
  attempts: number;
  queuedAt: string;
  nextAttemptAt: string;
  lastError: string | null;
}

export interface SyncQueueSummary {
  pending: number;
  failed: number;
  nextAttemptAt: string | null;
}

interface SyncOwnerRecord {
  key: typeof CLOUD_OWNER_KEY;
  userId: string;
  claimedAt: string;
}

export type SyncOwnerClaim =
  | { status: 'claimed'; ownerUserId: string; queued: number }
  | { status: 'already-owned'; ownerUserId: string; queued: 0 }
  | { status: 'mismatch'; ownerUserId: string; queued: 0 };

let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed.')),
      { once: true },
    );
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')),
      { once: true },
    );
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser context.'));
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(REFERENCES_STORE)) {
        const store = database.createObjectStore(REFERENCES_STORE, { keyPath: 'id' });
        store.createIndex('capturedAt', 'capturedAt');
      }
      if (!database.objectStoreNames.contains(SYNC_JOBS_STORE)) {
        const store = database.createObjectStore(SYNC_JOBS_STORE, { keyPath: 'referenceId' });
        store.createIndex('nextAttemptAt', 'nextAttemptAt');
      }
      if (!database.objectStoreNames.contains(SYNC_META_STORE)) {
        database.createObjectStore(SYNC_META_STORE, { keyPath: 'key' });
      }
    });

    request.addEventListener(
      'success',
      () => {
        const database = request.result;
        database.addEventListener('versionchange', () => {
          database.close();
          databasePromise = undefined;
        });
        resolve(database);
      },
      { once: true },
    );

    request.addEventListener(
      'error',
      () => {
        databasePromise = undefined;
        reject(request.error ?? new Error('Unable to open the reference library.'));
      },
      { once: true },
    );

    request.addEventListener(
      'blocked',
      () => {
        databasePromise = undefined;
        reject(new Error('Close other Glace tabs, then try again.'));
      },
      { once: true },
    );
  });

  return databasePromise;
}

function newSyncJob(referenceId: string, operation: SyncOperation): SyncJob {
  const queuedAt = new Date().toISOString();
  return {
    referenceId,
    operation,
    token: crypto.randomUUID(),
    attempts: 0,
    queuedAt,
    nextAttemptAt: queuedAt,
    lastError: null,
  };
}

/** Add a reference, or replace the reference with the same stable id. */
export async function saveReference(reference: Reference): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([REFERENCES_STORE, SYNC_JOBS_STORE], 'readwrite');
  transaction.objectStore(REFERENCES_STORE).put(reference);
  transaction.objectStore(SYNC_JOBS_STORE).put(newSyncJob(reference.id, 'upsert'));
  await transactionDone(transaction);
}

/** Return the newest references first. */
export async function listReferences(): Promise<Reference[]> {
  const database = await openDatabase();
  const transaction = database.transaction(REFERENCES_STORE, 'readonly');
  const request = transaction.objectStore(REFERENCES_STORE).getAll();
  const references = await requestResult(request) as Reference[];
  await transactionDone(transaction);

  return references.sort((first, second) => {
    const firstTime = Date.parse(first.capturedAt);
    const secondTime = Date.parse(second.capturedAt);
    return (Number.isNaN(secondTime) ? 0 : secondTime) - (Number.isNaN(firstTime) ? 0 : firstTime);
  });
}

/** Permanently remove a reference by id. */
export async function deleteReference(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([REFERENCES_STORE, SYNC_JOBS_STORE], 'readwrite');
  transaction.objectStore(REFERENCES_STORE).delete(id);
  transaction.objectStore(SYNC_JOBS_STORE).put(newSyncJob(id, 'delete'));
  await transactionDone(transaction);
}

/** Queue every current local reference after a user connects cloud sync. */
export async function enqueueAllReferencesForSync(): Promise<number> {
  const database = await openDatabase();
  const transaction = database.transaction([REFERENCES_STORE, SYNC_JOBS_STORE], 'readwrite');
  const request = transaction.objectStore(REFERENCES_STORE).getAll();
  const references = await requestResult(request) as Reference[];
  const jobs = transaction.objectStore(SYNC_JOBS_STORE);
  for (const reference of references) jobs.put(newSyncJob(reference.id, 'upsert'));
  await transactionDone(transaction);
  return references.length;
}

/**
 * Permanently bind this local library to its first cloud account.
 *
 * The initial claim and outbound queue are committed in one IndexedDB
 * transaction. Later accounts are rejected without touching references or jobs.
 * `legacyOwnerUserId` migrates installations that recorded their first account
 * in extension storage before this IndexedDB ownership record existed.
 */
export async function claimSyncOwner(
  userId: string,
  legacyOwnerUserId: string | null = null,
): Promise<SyncOwnerClaim> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [SYNC_META_STORE, REFERENCES_STORE, SYNC_JOBS_STORE],
    'readwrite',
  );
  const done = transactionDone(transaction);
  const metadata = transaction.objectStore(SYNC_META_STORE);
  const existing = await requestResult(metadata.get(CLOUD_OWNER_KEY)) as SyncOwnerRecord | undefined;
  const ownerUserId = existing?.userId ?? legacyOwnerUserId;

  if (ownerUserId && ownerUserId !== userId) {
    await done;
    return { status: 'mismatch', ownerUserId, queued: 0 };
  }

  if (existing) {
    await done;
    return { status: 'already-owned', ownerUserId: existing.userId, queued: 0 };
  }

  metadata.put({
    key: CLOUD_OWNER_KEY,
    userId,
    claimedAt: new Date().toISOString(),
  } satisfies SyncOwnerRecord);

  // A legacy owner was already seeded by the previous sync implementation.
  // Merely persist the stronger local binding without replacing its queue.
  if (legacyOwnerUserId === userId) {
    await done;
    return { status: 'already-owned', ownerUserId: userId, queued: 0 };
  }

  const references = await requestResult(
    transaction.objectStore(REFERENCES_STORE).getAll(),
  ) as Reference[];
  const jobs = transaction.objectStore(SYNC_JOBS_STORE);
  for (const reference of references) jobs.put(newSyncJob(reference.id, 'upsert'));
  await done;
  return { status: 'claimed', ownerUserId: userId, queued: references.length };
}

export async function getSyncOwnerId(): Promise<string | null> {
  const database = await openDatabase();
  const transaction = database.transaction(SYNC_META_STORE, 'readonly');
  const done = transactionDone(transaction);
  const record = await requestResult(
    transaction.objectStore(SYNC_META_STORE).get(CLOUD_OWNER_KEY),
  ) as SyncOwnerRecord | undefined;
  await done;
  return record?.userId ?? null;
}

/** Return jobs whose retry delay has elapsed, oldest first. */
export async function listReadySyncJobs(
  limit = 20,
  now = new Date(),
): Promise<SyncJob[]> {
  const database = await openDatabase();
  const transaction = database.transaction(SYNC_JOBS_STORE, 'readonly');
  const request = transaction.objectStore(SYNC_JOBS_STORE).getAll();
  const jobs = await requestResult(request) as SyncJob[];
  await transactionDone(transaction);

  const timestamp = now.getTime();
  return jobs
    .filter((job) => Date.parse(job.nextAttemptAt) <= timestamp)
    .sort((first, second) => Date.parse(first.queuedAt) - Date.parse(second.queuedAt))
    .slice(0, Math.max(0, limit));
}

export async function getReference(id: string): Promise<Reference | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(REFERENCES_STORE, 'readonly');
  const request = transaction.objectStore(REFERENCES_STORE).get(id);
  const reference = await requestResult(request) as Reference | undefined;
  await transactionDone(transaction);
  return reference;
}

/** Remove a completed job only if no newer local mutation replaced it. */
export async function completeSyncJob(referenceId: string, token: string): Promise<boolean> {
  const database = await openDatabase();
  const transaction = database.transaction(SYNC_JOBS_STORE, 'readwrite');
  const store = transaction.objectStore(SYNC_JOBS_STORE);
  const current = await requestResult(store.get(referenceId)) as SyncJob | undefined;
  if (current?.token === token) store.delete(referenceId);
  await transactionDone(transaction);
  return current?.token === token;
}

/** Record a bounded exponential retry without overwriting a newer mutation. */
export async function failSyncJob(
  referenceId: string,
  token: string,
  message: string,
  now = new Date(),
): Promise<boolean> {
  const database = await openDatabase();
  const transaction = database.transaction(SYNC_JOBS_STORE, 'readwrite');
  const store = transaction.objectStore(SYNC_JOBS_STORE);
  const current = await requestResult(store.get(referenceId)) as SyncJob | undefined;
  if (current?.token === token) {
    const attempts = current.attempts + 1;
    const retryDelayMs = Math.min(60 * 60_000, 2 ** Math.min(attempts, 10) * 5_000);
    store.put({
      ...current,
      attempts,
      lastError: message.slice(0, 500),
      nextAttemptAt: new Date(now.getTime() + retryDelayMs).toISOString(),
    } satisfies SyncJob);
  }
  await transactionDone(transaction);
  return current?.token === token;
}

export async function getSyncQueueSummary(): Promise<SyncQueueSummary> {
  const database = await openDatabase();
  const transaction = database.transaction(SYNC_JOBS_STORE, 'readonly');
  const request = transaction.objectStore(SYNC_JOBS_STORE).getAll();
  const jobs = await requestResult(request) as SyncJob[];
  await transactionDone(transaction);
  const nextAttemptAt = jobs.reduce<string | null>((earliest, job) => {
    if (!earliest || Date.parse(job.nextAttemptAt) < Date.parse(earliest)) return job.nextAttemptAt;
    return earliest;
  }, null);
  return {
    pending: jobs.length,
    failed: jobs.filter((job) => job.attempts > 0).length,
    nextAttemptAt,
  };
}
