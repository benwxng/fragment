import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimSyncOwner: vi.fn(),
  completeSyncJob: vi.fn(),
  failSyncJob: vi.fn(),
  getReference: vi.fn(),
  getSyncQueueSummary: vi.fn(),
  listReadySyncJobs: vi.fn(),
  getSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  uploadScreenshot: vi.fn(), upsertCapture: vi.fn(), deleteCapture: vi.fn(),
  listLibrary: vi.fn(), downloadScreenshot: vi.fn(),
  getCloudRevision: vi.fn(), acknowledgeUpload: vi.fn(), acknowledgeDeletion: vi.fn(), reconcileCloudLibrary: vi.fn(),
}));

vi.mock('../storage/references', () => ({
  claimSyncOwner: mocks.claimSyncOwner,
  getCloudRevision: mocks.getCloudRevision,
  acknowledgeUpload: mocks.acknowledgeUpload,
  acknowledgeDeletion: mocks.acknowledgeDeletion,
  reconcileCloudLibrary: mocks.reconcileCloudLibrary,
  completeSyncJob: mocks.completeSyncJob,
  failSyncJob: mocks.failSyncJob,
  getReference: mocks.getReference,
  getSyncQueueSummary: mocks.getSyncQueueSummary,
  listReadySyncJobs: mocks.listReadySyncJobs,
}));

vi.mock('./client', () => ({
  CloudError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  getCloudClient: () => ({
    auth: {
      getSession: mocks.getSession,
      signIn: mocks.signIn,
      signOut: mocks.signOut,
    },
    uploadScreenshot: mocks.uploadScreenshot, upsertCapture: mocks.upsertCapture, deleteCapture: mocks.deleteCapture,
    listLibrary: mocks.listLibrary, downloadScreenshot: mocks.downloadScreenshot,
  }),
}));

import { CloudError } from './client';
import { signIn, syncNow } from './sync';

let storedMeta: Record<string, unknown> | undefined;
const clearAlarm = vi.fn();

describe('cloud sync account ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCloudRevision.mockResolvedValue(null);
    mocks.listLibrary.mockResolvedValue({ userId: 'user-a', complete: true, captures: [] });
    storedMeta = {
      lastSyncedAt: null,
      lastError: null,
      seededUserId: 'user-a',
    };
    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: vi.fn(async () => ({ 'refer-cloud-sync-meta': storedMeta })),
          set: vi.fn(async (value: Record<string, unknown>) => {
            storedMeta = value['refer-cloud-sync-meta'] as Record<string, unknown>;
          }),
        },
      },
      alarms: {
        clear: clearAlarm,
        create: vi.fn(),
      },
    });
    mocks.getSyncQueueSummary.mockResolvedValue({
      pending: 1,
      failed: 0,
      nextAttemptAt: '2026-09-07T12:00:00.000Z',
    });
    mocks.listReadySyncJobs.mockResolvedValue([]);
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it('signs a different account back out before any reference can upload', async () => {
    mocks.signIn.mockResolvedValue({
      data: { user: { id: 'user-b' } },
      error: null,
    });
    mocks.claimSyncOwner.mockResolvedValue({
      status: 'mismatch',
      ownerUserId: 'user-a',
      queued: 0,
    });

    await expect(signIn()).rejects.toThrow(
      /already linked to another account/u,
    );

    expect(mocks.claimSyncOwner).toHaveBeenCalledWith('user-b', 'user-a');
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.upsertCapture).not.toHaveBeenCalled();
    expect(mocks.uploadScreenshot).not.toHaveBeenCalled();
    expect(mocks.listReadySyncJobs).not.toHaveBeenCalled();
  });

  it('blocks a restored mismatched session before processing the outbound queue', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-b', email: 'other@example.com' } } },
      error: null,
    });
    mocks.claimSyncOwner.mockResolvedValue({
      status: 'mismatch',
      ownerUserId: 'user-a',
      queued: 0,
    });

    const state = await syncNow(true);

    expect(state.lastError).toMatch(/already linked to another account/u);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(clearAlarm).toHaveBeenCalledWith('refer-cloud-sync');
    expect(mocks.upsertCapture).not.toHaveBeenCalled();
    expect(mocks.uploadScreenshot).not.toHaveBeenCalled();
    expect(mocks.listReadySyncJobs).not.toHaveBeenCalled();
  });
});

const cloudRow = {
  id: 'capture-1', user_id: 'user-a', sync_revision: 'revision-1', captured_at: '2026-09-30T12:00:00Z',
  facets: ['typography'], source_url: 'https://example.com', source_origin: 'https://example.com', page_title: 'Example',
  note: 'Cloud note', favorite: true, collection_id: null, screenshot_path: 'user-a/capture-1.png',
  snapshot: { snapshotVersion: 1, source: {}, element: {}, screenshot: { width: 200, height: 100 } },
};

describe('two-way library sync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    storedMeta = { lastSyncedAt: null, lastError: null, seededUserId: 'user-a' };
    vi.stubGlobal('browser', {
      storage: { local: {
        get: vi.fn(async () => ({ 'refer-cloud-sync-meta': storedMeta })),
        set: vi.fn(async value => { if (value['refer-cloud-sync-meta']) storedMeta = value['refer-cloud-sync-meta']; }),
      } },
      alarms: { clear: vi.fn(), create: vi.fn() },
    });
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-a', email: 'a@example.com' } } }, error: null });
    mocks.claimSyncOwner.mockResolvedValue({ status: 'already-owned', ownerUserId: 'user-a', queued: 0 });
    mocks.getSyncQueueSummary.mockResolvedValue({ pending: 0, failed: 0, nextAttemptAt: null });
    mocks.listReadySyncJobs.mockResolvedValue([]);
    mocks.getCloudRevision.mockResolvedValue(null);
    mocks.listLibrary.mockResolvedValue({ userId: 'user-a', complete: true, captures: [cloudRow] });
    mocks.downloadScreenshot.mockResolvedValue('data:image/png;base64,AA==');
  });

  it('hydrates a new device with cloud metadata and offline image bytes, and keeps polling', async () => {
    await syncNow(true);
    expect(mocks.downloadScreenshot).toHaveBeenCalledWith('capture-1', 'png');
    expect(mocks.reconcileCloudLibrary).toHaveBeenCalledWith('user-a', [expect.objectContaining({
      revision: 'revision-1', reference: expect.objectContaining({ note: 'Cloud note', favorite: true,
        screenshot: expect.objectContaining({ dataUrl: 'data:image/png;base64,AA==' }) }),
    })]);
    expect(browser.alarms.create).toHaveBeenCalled();
  });

  it('reuses unchanged cached images', async () => {
    mocks.getCloudRevision.mockResolvedValue('revision-1');
    mocks.getReference.mockResolvedValue({ screenshot: { dataUrl: 'data:image/png;base64,cached' } });
    await syncNow();
    expect(mocks.downloadScreenshot).not.toHaveBeenCalled();
    expect(mocks.reconcileCloudLibrary).toHaveBeenCalled();
  });

  it.each([
    { complete: false, userId: 'user-a', captures: [] },
    { complete: true, userId: 'user-b', captures: [] },
    { complete: true, userId: 'user-a', captures: [{ ...cloudRow, user_id: 'user-b' }] },
  ])('never reconciles incomplete or wrong-account responses', async response => {
    mocks.listLibrary.mockResolvedValue(response);
    const state = await syncNow();
    expect(state.lastError).toBeTruthy();
    expect(mocks.reconcileCloudLibrary).not.toHaveBeenCalled();
  });

  it('keeps the entire cache when an image download fails', async () => {
    mocks.downloadScreenshot.mockRejectedValue(new Error('offline'));
    const state = await syncNow();
    expect(state.lastError).toBe('offline');
    expect(mocks.reconcileCloudLibrary).not.toHaveBeenCalled();
  });

  it('accepts a complete empty library so cloud deletions reach the cache', async () => {
    mocks.listLibrary.mockResolvedValue({ complete: true, userId: 'user-a', captures: [] });
    await syncNow();
    expect(mocks.reconcileCloudLibrary).toHaveBeenCalledWith('user-a', []);
  });

  it('preserves failed outbound jobs while still pulling remote changes', async () => {
    mocks.listReadySyncJobs.mockResolvedValue([{ referenceId: 'deleted', token: 't', operation: 'delete' }]);
    mocks.deleteCapture.mockRejectedValue(new Error('offline'));
    await syncNow();
    expect(mocks.failSyncJob).toHaveBeenCalledWith('deleted', 't', 'offline');
    expect(mocks.acknowledgeDeletion).not.toHaveBeenCalled();
    expect(mocks.reconcileCloudLibrary).toHaveBeenCalled();
  });

  it('resolves a stale local write in favor of the cloud without retrying it', async () => {
    mocks.listReadySyncJobs.mockResolvedValue([{ referenceId: 'capture-1', token: 't', operation: 'upsert' }]);
    mocks.getReference.mockResolvedValue({ id: 'capture-1', element: { semantic: { accessibleName: 'Title' }, typography: {}, colors: {} }, source: {}, screenshot: null });
    mocks.upsertCapture.mockRejectedValue(new CloudError(409, 'changed'));
    await syncNow();
    expect(mocks.completeSyncJob).toHaveBeenCalledWith('capture-1', 't');
    expect(mocks.failSyncJob).not.toHaveBeenCalled();
    expect(mocks.reconcileCloudLibrary).toHaveBeenCalled();
  });
});
