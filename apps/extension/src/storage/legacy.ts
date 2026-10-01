import type { Reference } from '@refer/capture';

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Read-only recovery of old installations. Never create a library for new users. */
export async function readLegacyLibrary(): Promise<{ references: Reference[]; owner: string | null }> {
  if (!(await indexedDB.databases()).some(db => db.name === 'refer')) return { references: [], owner: null };
  const db = await result(indexedDB.open('refer'));
  try {
    if (!db.objectStoreNames.contains('references')) return { references: [], owner: null };
    const references = await result(db.transaction('references').objectStore('references').getAll()) as Reference[];
    const record = db.objectStoreNames.contains('sync-meta')
      ? await result(db.transaction('sync-meta').objectStore('sync-meta').get('cloud-owner'))
      : null;
    const meta = (await browser.storage.local.get('refer-cloud-sync-meta'))['refer-cloud-sync-meta'] as { seededUserId?: string } | undefined;
    const metadata = db.objectStoreNames.contains('sync-meta')
      ? await result(db.transaction('sync-meta').objectStore('sync-meta').getAll()) : [];
    const jobs = db.objectStoreNames.contains('sync-jobs')
      ? await result(db.transaction('sync-jobs').objectStore('sync-jobs').getAll()) : [];
    const uploaded = new Set(metadata.filter(item => String(item.key).startsWith('revision:')).map(item => String(item.key).slice(9)));
    const pending = new Set(jobs.filter(job => job.operation === 'upsert').map(job => job.referenceId));
    // Cached cloud rows are not older unsaved work. Do not resurrect remote deletions.
    return { references: references.filter(reference => !uploaded.has(reference.id) || pending.has(reference.id)),
      owner: record?.userId ?? meta?.seededUserId ?? null };
  } finally { db.close(); }
}

const IMPORT_KEY = 'refer-legacy-import';
interface ImportState { owner: string; completed: string[] }

export async function legacyImportStatus(userId: string) {
  const legacy = await readLegacyLibrary();
  const state = (await browser.storage.local.get(IMPORT_KEY))[IMPORT_KEY] as ImportState | undefined;
  const owner = legacy.owner ?? state?.owner;
  if (owner && owner !== userId) return { references: [], blocked: true };
  const completed = new Set(state?.completed ?? []);
  return { references: legacy.references.filter(reference => !completed.has(reference.id)), blocked: false };
}

export async function claimLegacyImport(userId: string): Promise<void> {
  const status = await legacyImportStatus(userId);
  if (status.blocked) throw new Error('Sign in to the original account to import these older saves.');
  const state = (await browser.storage.local.get(IMPORT_KEY))[IMPORT_KEY] as ImportState | undefined;
  await browser.storage.local.set({ [IMPORT_KEY]: state ?? { owner: userId, completed: [] } });
}

export async function acknowledgeLegacyImport(userId: string, id: string): Promise<void> {
  const state = (await browser.storage.local.get(IMPORT_KEY))[IMPORT_KEY] as ImportState | undefined;
  if (!state || state.owner !== userId) throw new Error('The import account changed.');
  await browser.storage.local.set({ [IMPORT_KEY]: { ...state, completed: [...new Set([...state.completed, id])] } });
}
