import { expect, it, vi } from 'vitest';
import { LibraryImageCache, readReferences, type LibraryConnection } from './data';

function fixture(owner = 'owner-a') {
  const row = {
    id: 'capture', user_id: owner, updated_at: '2026-10-02T00:00:00Z',
    facets: ['typography'], screenshot_path: owner + '/capture.png',
    captured_at: '2026-10-02T00:00:00Z', source_url: 'https://example.test', source_origin: 'https://example.test',
    snapshot: { snapshotVersion: 1, element: { semantic: {} }, source: {}, screenshot: { width: 20, height: 10 } },
  };
  const listLibrary = vi.fn().mockImplementation(async () => ({ captures: [row], complete: true, userId: owner }));
  const downloadScreenshot = vi.fn().mockResolvedValue('data:image/png;base64,YQ==');
  const connection = { user: { id: owner, email: 'fixture@example.test' }, client: { listLibrary, downloadScreenshot } } as unknown as LibraryConnection;
  return { row, listLibrary, downloadScreenshot, connection };
}

it('reuses unchanged images while still authenticating the library snapshot on every refresh', async () => {
  const f = fixture(); const cache = new LibraryImageCache();
  const first = await readReferences(f.connection, cache);
  expect(await readReferences(f.connection, cache)).toEqual(first);
  expect(f.listLibrary).toHaveBeenCalledTimes(2);
  expect(f.downloadScreenshot).toHaveBeenCalledOnce();
  f.row.updated_at = '2026-10-02T00:01:00Z';
  await readReferences(f.connection, cache);
  expect(f.downloadScreenshot).toHaveBeenCalledTimes(2);
});
it('never displays cached data without a successful complete account listing', async () => {
  const f = fixture(); const cache = new LibraryImageCache();
  await readReferences(f.connection, cache);
  f.listLibrary.mockRejectedValueOnce(new Error('Session ended'));
  await expect(readReferences(f.connection, cache)).rejects.toThrow('Session ended');
  f.listLibrary.mockResolvedValueOnce({ captures: [f.row], complete: true, userId: 'other' });
  await expect(readReferences(f.connection, cache)).rejects.toThrow('complete account library');
});
it('discards images on sign-out and never reuses another account’s image', async () => {
  const a = fixture(); const b = fixture('owner-b'); const cache = new LibraryImageCache();
  await readReferences(a.connection, cache);
  await readReferences(b.connection, cache);
  expect(b.downloadScreenshot).toHaveBeenCalledOnce();
  cache.clear();
  await readReferences(b.connection, cache);
  expect(b.downloadScreenshot).toHaveBeenCalledTimes(2);
});
it('cannot repopulate the cache from a request that finishes after sign-out', async () => {
  const f = fixture(); const cache = new LibraryImageCache();
  let finish!: (value: string) => void;
  f.downloadScreenshot.mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; }));
  const pending = readReferences(f.connection, cache);
  await vi.waitFor(() => expect(f.downloadScreenshot).toHaveBeenCalledOnce());
  cache.clear();
  finish('data:image/png;base64,YQ==');
  await pending;
  await readReferences(f.connection, cache);
  expect(f.downloadScreenshot).toHaveBeenCalledTimes(2);
});
it('prunes deleted references and does not reuse an image without a revision', async () => {
  const f = fixture(); const cache = new LibraryImageCache();
  await readReferences(f.connection, cache);
  f.listLibrary.mockResolvedValueOnce({ captures: [], complete: true, userId: 'owner-a' });
  await readReferences(f.connection, cache);
  await readReferences(f.connection, cache);
  expect(f.downloadScreenshot).toHaveBeenCalledTimes(2);
  f.row.updated_at = '';
  await readReferences(f.connection, cache);
  await readReferences(f.connection, cache);
  expect(f.downloadScreenshot).toHaveBeenCalledTimes(4);
});
