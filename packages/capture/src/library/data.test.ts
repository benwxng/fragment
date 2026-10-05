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

it('downloads four images concurrently and preserves order when requests finish out of order', async () => {
  const f = fixture();
  const rows = Array.from({ length: 6 }, (_, index) => ({ ...f.row, id: `capture-${index}`, screenshot_path: `owner-a/${index}.png` }));
  f.listLibrary.mockResolvedValue({ captures: rows, complete: true, userId: 'owner-a' });
  const pending = new Map<string, (value: string) => void>();
  f.downloadScreenshot.mockImplementation((id: string) => new Promise<string>(resolve => pending.set(id, resolve)));
  const result = readReferences(f.connection);
  await vi.waitFor(() => expect(f.downloadScreenshot).toHaveBeenCalledTimes(4));
  pending.get('capture-3')!('image-3');
  await vi.waitFor(() => expect(f.downloadScreenshot).toHaveBeenCalledTimes(5));
  pending.get('capture-1')!('image-1');
  await vi.waitFor(() => expect(f.downloadScreenshot).toHaveBeenCalledTimes(6));
  for (const index of [5, 4, 2, 0]) pending.get(`capture-${index}`)!(`image-${index}`);
  const loaded = await result;
  expect(loaded.references.map(reference => reference.id)).toEqual(rows.map(row => row.id));
  expect(loaded.references.map(reference => reference.screenshot?.dataUrl)).toEqual(rows.map((_, index) => `image-${index}`));
});

it('validates every row before requesting any images', async () => {
  const f = fixture();
  f.listLibrary.mockResolvedValue({ captures: [f.row, { ...f.row, user_id: 'other' }], complete: true, userId: 'owner-a' });
  await expect(readReferences(f.connection)).rejects.toThrow('Unable to read a saved reference');
  expect(f.downloadScreenshot).not.toHaveBeenCalled();
});

it('does not cache partial results or schedule more downloads after a failure', async () => {
  const f = fixture(); const cache = new LibraryImageCache();
  const rows = Array.from({ length: 6 }, (_, index) => ({ ...f.row, id: `capture-${index}` }));
  f.listLibrary.mockResolvedValue({ captures: rows, complete: true, userId: 'owner-a' });
  let release!: (value: string) => void;
  f.downloadScreenshot.mockImplementation((id: string) => id === 'capture-0'
    ? Promise.reject(new Error('Download failed'))
    : new Promise<string>(resolve => { const previous = release; release = value => { previous?.(value); resolve(value); }; }));
  await expect(readReferences(f.connection, cache)).rejects.toThrow('Download failed');
  expect(f.downloadScreenshot).toHaveBeenCalledTimes(4);
  release('image');
  await Promise.resolve();
  await Promise.resolve();
  expect(f.downloadScreenshot).toHaveBeenCalledTimes(4);
  f.downloadScreenshot.mockResolvedValue('image');
  await readReferences(f.connection, cache);
  expect(f.downloadScreenshot).toHaveBeenCalledTimes(10);
});

it('returns complete reference metadata without image IO when the platform can load images on demand', async () => {
  const f = fixture();
  const result = await readReferences(f.connection, undefined, { deferImages: true });
  expect(result.references[0]?.screenshot).toMatchObject({ dataUrl: null, storagePath: f.row.screenshot_path, width: 20, height: 10 });
  expect(f.downloadScreenshot).not.toHaveBeenCalled();
});
