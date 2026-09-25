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
  from: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock('../storage/references', () => ({
  claimSyncOwner: mocks.claimSyncOwner,
  completeSyncJob: mocks.completeSyncJob,
  failSyncJob: mocks.failSyncJob,
  getReference: mocks.getReference,
  getSyncQueueSummary: mocks.getSyncQueueSummary,
  listReadySyncJobs: mocks.listReadySyncJobs,
}));

vi.mock('./client', () => ({
  getCloudClient: () => ({
    auth: {
      getSession: mocks.getSession,
      signIn: mocks.signIn,
      signOut: mocks.signOut,
    },
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  }),
}));

import { signIn, syncNow } from './sync';

let storedMeta: Record<string, unknown> | undefined;
const clearAlarm = vi.fn();

describe('cloud sync account ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.storageFrom).not.toHaveBeenCalled();
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
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.listReadySyncJobs).not.toHaveBeenCalled();
  });
});
