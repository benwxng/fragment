import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reference } from '@refer/capture';

const mocks = vi.hoisted(() => ({
  account: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), upload: vi.fn(), upsert: vi.fn(),
  list: vi.fn(), download: vi.fn(), remove: vi.fn(), legacy: vi.fn(), claim: vi.fn(), acknowledge: vi.fn(),
}));
vi.mock('./client', () => ({
  CloudError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  getAccountClient: mocks.account,
  getCloudClient: () => ({ auth: { signIn: mocks.signIn, signOut: mocks.signOut } }),
}));
vi.mock('../storage/legacy', () => ({
  legacyImportStatus: mocks.legacy, claimLegacyImport: mocks.claim, acknowledgeLegacyImport: mocks.acknowledge,
}));
import { deleteReference, getCloudState, importLegacyReferences, listReferences, saveReference, signOut } from './library';

const userId = '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bc9';
const reference = {
  id: '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bd0', snapshotVersion: 1,
  capturedAt: '2026-10-01T00:00:00Z', facets: ['typography'],
  source: { url: 'https://example.com', origin: 'https://example.com', title: 'Example' },
  element: { semantic: { tagName: 'P', accessibleName: 'Example' }, typography: {}, colors: {} },
  screenshot: { dataUrl: 'data:image/png;base64,YQ==', mimeType: 'image/png', width: 10, height: 10 },
} as Reference;
const current = { user: { id: userId, email: 'a@example.com' }, client: {
  uploadScreenshot: mocks.upload, upsertCapture: mocks.upsert, listLibrary: mocks.list,
  downloadScreenshot: mocks.download, deleteCapture: mocks.remove,
} };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('browser', { storage: { local: { set: vi.fn() } } });
  mocks.account.mockResolvedValue(current);
  mocks.legacy.mockResolvedValue({ references: [], blocked: false });
  mocks.list.mockResolvedValue({ complete: true, userId, captures: [] });
  mocks.signIn.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('account-only library', () => {
  it('finishes the first save after sign-in and writes no offline queue', async () => {
    mocks.account.mockResolvedValueOnce(null).mockResolvedValue(current);
    await saveReference(reference);
    expect(mocks.signIn).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: userId,
      snapshot: expect.objectContaining({ screenshot: expect.objectContaining({ dataUrl: null }) }),
    }), null);
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it('does not save after cancelled sign-in', async () => {
    mocks.account.mockResolvedValue(null);
    mocks.signIn.mockRejectedValue(new Error('Sign-in was cancelled.'));
    await expect(saveReference(reference)).rejects.toThrow('cancelled');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('does not report success or queue a failed cloud save', async () => {
    mocks.upsert.mockRejectedValue(new Error('Offline'));
    await expect(saveReference(reference)).rejects.toThrow('Offline');
    expect(browser.storage.local.set).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('waits for cloud acknowledgement before resolving', async () => {
    let finish!: () => void;
    mocks.upsert.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    let saved = false;
    const pending = saveReference(reference).then(() => { saved = true; });
    await vi.waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    expect(saved).toBe(false);
    finish();
    await pending;
    expect(saved).toBe(true);
  });

  it('does not load a local collection while signed out', async () => {
    mocks.account.mockResolvedValue(null);
    expect(await getCloudState()).toMatchObject({ authStatus: 'signed-out', legacyCount: 0 });
    await expect(listReferences()).rejects.toThrow('Sign in');
    expect(mocks.legacy).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('rejects incomplete and wrong-account library responses', async () => {
    mocks.list.mockResolvedValueOnce({ complete: false, userId, captures: [] });
    await expect(listReferences()).rejects.toThrow('complete');
    mocks.list.mockResolvedValueOnce({ complete: true, userId: 'other', captures: [] });
    await expect(listReferences()).rejects.toThrow('complete');
  });

  it('surfaces failed deletes without queuing them', async () => {
    mocks.remove.mockRejectedValue(new Error('Offline'));
    await expect(deleteReference(reference.id)).rejects.toThrow('Offline');
    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });

  it('rejects stale undo or delete actions after switching accounts', async () => {
    await expect(saveReference(reference, 'previous-account')).rejects.toThrow('account changed');
    await expect(deleteReference(reference.id, 'previous-account')).rejects.toThrow('account changed');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('imports only missing references without overwriting account data', async () => {
    const existing = { ...reference, id: 'existing' };
    mocks.legacy.mockResolvedValue({ references: [reference, existing], blocked: false });
    mocks.list.mockResolvedValue({ complete: true, userId, captures: [{ id: 'existing' }] });
    expect(await importLegacyReferences()).toBe(1);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.acknowledge).toHaveBeenCalledTimes(2);
  });

  it('does not acknowledge legacy saves that failed to upload', async () => {
    mocks.legacy.mockResolvedValue({ references: [reference], blocked: false });
    mocks.upload.mockRejectedValue(new Error('Offline'));
    await expect(importLegacyReferences()).rejects.toThrow('Offline');
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });

  it('never imports another account’s older saves', async () => {
    mocks.claim.mockRejectedValue(new Error('original account'));
    await expect(importLegacyReferences()).rejects.toThrow('original account');
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('notifies open libraries when signing out', async () => {
    await signOut();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(browser.storage.local.set).toHaveBeenCalledWith({ 'refer-library-updated': expect.any(String) });
  });
});
