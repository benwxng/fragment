import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acknowledgeLegacyImport, claimLegacyImport, legacyImportStatus, readLegacyLibrary } from './legacy';

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
let storage: Record<string, unknown>;
beforeEach(async () => {
  await result(indexedDB.deleteDatabase('refer'));
  storage = {};
  vi.stubGlobal('browser', { storage: { local: {
    get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
    set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(storage, value); }),
  } } });
});
afterEach(() => vi.unstubAllGlobals());

async function seed(owner?: string) {
  const request = indexedDB.open('refer', 3);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('references', { keyPath: 'id' });
    request.result.createObjectStore('sync-meta', { keyPath: 'key' });
    request.result.createObjectStore('sync-jobs', { keyPath: 'referenceId' });
  };
  const db = await result(request);
  const tx = db.transaction(['references', 'sync-meta'], 'readwrite');
  tx.objectStore('references').put({ id: 'unsaved' });
  tx.objectStore('references').put({ id: 'cached' });
  tx.objectStore('sync-meta').put({ key: 'revision:cached', revision: 'previously-uploaded' });
  if (owner) tx.objectStore('sync-meta').put({ key: 'cloud-owner', userId: owner });
  await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); });
  db.close();
}

describe('one-time legacy recovery', () => {
  it('does not create IndexedDB for a fresh installation', async () => {
    expect(await readLegacyLibrary()).toEqual({ references: [], owner: null });
    expect(await indexedDB.databases()).toEqual([]);
  });
  it('excludes old cloud cache rows so deleted references are not resurrected', async () => {
    await seed();
    expect((await readLegacyLibrary()).references.map(reference => reference.id)).toEqual(['unsaved']);
  });
  it('preserves ownership and the original backup after a successful import', async () => {
    await seed('a');
    await expect(claimLegacyImport('b')).rejects.toThrow('original account');
    await claimLegacyImport('a');
    await acknowledgeLegacyImport('a', 'unsaved');
    expect((await legacyImportStatus('a')).references).toEqual([]);
    expect((await readLegacyLibrary()).references).toHaveLength(1);
    expect((await legacyImportStatus('b')).blocked).toBe(true);
  });
  it('binds anonymous imports only after the user chooses to import', async () => {
    await seed();
    await legacyImportStatus('a');
    expect(storage['refer-legacy-import']).toBeUndefined();
    await claimLegacyImport('a');
    await expect(claimLegacyImport('b')).rejects.toThrow('original account');
  });
});
