import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Reference } from '@refer/capture';
import {
  completeSyncJob,
  acknowledgeUpload,
  acknowledgeDeletion,
  reconcileCloudLibrary,
  getReference,
  getCloudRevision,
  claimSyncOwner,
  deleteReference,
  failSyncJob,
  getSyncOwnerId,
  getSyncQueueSummary,
  listReadySyncJobs,
  saveReference,
} from './references';

const reference = {
  id: '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bc9',
  capturedAt: '2026-09-07T12:00:00.000Z',
} as Reference;

describe('reference sync queue', () => {
  it('keeps local mutations durable and ignores stale completions', async () => {
    await saveReference(reference);
    const [firstJob] = await listReadySyncJobs();
    expect(firstJob?.operation).toBe('upsert');

    await saveReference({ ...reference, note: 'newer value' });
    const [newerJob] = await listReadySyncJobs();
    expect(newerJob?.token).not.toBe(firstJob?.token);
    expect(await completeSyncJob(reference.id, firstJob?.token ?? '')).toBe(false);

    expect(await failSyncJob(reference.id, newerJob?.token ?? '', 'offline', new Date(0))).toBe(true);
    expect(await getSyncQueueSummary()).toMatchObject({ pending: 1, failed: 1 });
    expect(await listReadySyncJobs(20, new Date('1970-01-01T00:00:09.999Z'))).toHaveLength(0);
    expect(await listReadySyncJobs(20, new Date('1970-01-01T00:00:10.000Z'))).toHaveLength(1);

    await deleteReference(reference.id);
    const [deleteJob] = await listReadySyncJobs();
    expect(deleteJob?.operation).toBe('delete');
    expect(await completeSyncJob(reference.id, newerJob?.token ?? '')).toBe(false);
    expect(await completeSyncJob(reference.id, deleteJob?.token ?? '')).toBe(true);
    expect(await getSyncQueueSummary()).toMatchObject({ pending: 0, failed: 0 });
  });

  it('binds local data to the first cloud account and rejects silent account adoption', async () => {
    await saveReference(reference);
    const [unownedJob] = await listReadySyncJobs();

    await expect(claimSyncOwner('user-a')).resolves.toEqual({
      status: 'claimed',
      ownerUserId: 'user-a',
      queued: 1,
    });
    expect(await getSyncOwnerId()).toBe('user-a');

    const [ownedJob] = await listReadySyncJobs();
    expect(ownedJob?.token).not.toBe(unownedJob?.token);

    await expect(claimSyncOwner('user-a')).resolves.toEqual({
      status: 'already-owned',
      ownerUserId: 'user-a',
      queued: 0,
    });
    expect((await listReadySyncJobs())[0]?.token).toBe(ownedJob?.token);

    await expect(claimSyncOwner('user-b')).resolves.toEqual({
      status: 'mismatch',
      ownerUserId: 'user-a',
      queued: 0,
    });
    expect(await getSyncOwnerId()).toBe('user-a');
    expect((await listReadySyncJobs())[0]?.token).toBe(ownedJob?.token);
  });
});


describe('account library cache reconciliation', () => {
  it('pulls cloud edits and deletions without queuing them for re-upload', async () => {
    const id = 'cloud-only';
    await reconcileCloudLibrary('user-a', [{ reference: { ...reference, id, note: 'from web' }, revision: 'r1' }]);
    expect((await getReference(id))?.note).toBe('from web');
    expect(await getCloudRevision(id)).toBe('r1');
    expect((await listReadySyncJobs()).some(job => job.referenceId === id)).toBe(false);
    await reconcileCloudLibrary('user-a', []);
    expect(await getReference(id)).toBeUndefined();
  });

  it('protects offline saves, edits, and deletions from a racing cloud snapshot', async () => {
    const saved = { ...reference, id: 'offline-save', note: 'offline' };
    const deleted = { ...reference, id: 'offline-delete' };
    await saveReference(saved);
    await deleteReference(deleted.id);
    await reconcileCloudLibrary('user-a', [
      { reference: { ...saved, note: 'stale' }, revision: 'r1' },
      { reference: deleted, revision: 'r1' },
    ]);
    expect((await getReference(saved.id))?.note).toBe('offline');
    expect(await getReference(deleted.id)).toBeUndefined();
    await reconcileCloudLibrary('user-a', []);
    expect(await getReference(saved.id)).toBeDefined();
  });

  it('acknowledges a server write without dropping a newer local edit', async () => {
    const saved = { ...reference, id: 'racing-edit' };
    await saveReference(saved);
    const first = (await listReadySyncJobs()).find(job => job.referenceId === saved.id)!;
    await saveReference({ ...saved, note: 'newer' });
    await acknowledgeUpload(saved.id, first.token, 'r2');
    expect(await getCloudRevision(saved.id)).toBe('r2');
    expect((await listReadySyncJobs()).find(job => job.referenceId === saved.id)?.token).not.toBe(first.token);
    await acknowledgeDeletion(saved.id, first.token);
    expect(await getCloudRevision(saved.id)).toBeNull();
    expect((await getReference(saved.id))?.note).toBe('newer');
  });

  it('rejects a different account without touching cached references', async () => {
    await expect(reconcileCloudLibrary('user-b', [])).rejects.toThrow('another account');
    expect(await getReference('offline-save')).toBeDefined();
  });
});
