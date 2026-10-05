import { readReferences, uploadReference, type LibraryConnection } from '@refer/capture/library/data';
import type { LibraryAdapter, LibraryAccount } from '@refer/capture/library/types';
import type { Reference } from '@refer/capture';
import { getReferenceScreenshotPath } from '@refer/database';
import { signOut } from '@/app/actions';

class LibrarySessionError extends Error {}

export function webLibraryAdapter(initialReferenceId?: string): LibraryAdapter {
  type Listing = Awaited<ReturnType<LibraryConnection['client']['listLibrary']>>;
  type Bootstrap = Listing & { user: LibraryConnection['user'] };
  let listing: Bootstrap | undefined;
  let owner: string | undefined;
  let references = new Map<string, Reference>();
  let deleted: { owner: string; reference: Reference } | undefined;
  function clear() { listing = undefined; owner = undefined; references.clear(); deleted = undefined; }
  async function bootstrap(): Promise<Bootstrap> {
    const result = await (await request('/bootstrap')).json() as Bootstrap;
    if (!result.user?.id || result.userId !== result.user.id || !result.complete || !Array.isArray(result.captures)) {
      throw new Error('Unable to load the complete account library.');
    }
    if (owner !== result.user.id) clear();
    owner = result.user.id;
    return result;
  }
  async function request(path: string, options: RequestInit = {}, owner?: string) {
    const response = await fetch('/api/library' + path, {
      ...options, cache: 'no-store', signal: AbortSignal.timeout(30_000),
      headers: { ...options.headers, ...(owner ? { 'x-library-owner': owner } : {}) },
    });
    if (response.status === 401) {
      throw new LibrarySessionError('Your session has ended. Sign in to access your library.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? 'Unable to access your library.');
    }
    return response;
  }
  async function connection(expectedUserId?: string, snapshot?: Bootstrap): Promise<LibraryConnection> {
    const { user } = snapshot ?? await (await request('/me')).json() as { user: LibraryConnection['user'] };
    if (expectedUserId && user.id !== expectedUserId) throw new Error('Your account changed. Refresh the library.');
    const send = (path: string, options?: RequestInit) => request(path, options, user.id);
    return { user, client: {
      listLibrary: async () => snapshot ?? (await send('/library-sync')).json(),
      async downloadScreenshot(id, extension) {
        const response = await send(`/screenshots/${encodeURIComponent(id)}.${extension}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > 5 * 1024 * 1024) throw new Error('Saved image exceeds the supported size.');
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        return `data:image/${extension};base64,${btoa(binary)}`;
      },
      uploadScreenshot: async (id, blob, extension) => send(`/screenshots/${encodeURIComponent(id)}.${extension}`, {
        method: 'PUT', body: blob, headers: { 'Content-Type': blob.type },
      }),
      upsertCapture: async (row, baseRevision) => send(`/captures/${encodeURIComponent(row.id!)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...row, base_revision: baseRevision }),
      }),
    } };
  }
  return {
    homeUrl: '/library',
    initialReferenceId,
    imageUrl(reference) {
      const image = reference.screenshot;
      const imageOwner = owner ?? this.viewState?.account?.userId;
      if (!imageOwner || !image?.storagePath) return;
      const extension = image.mimeType === 'image/png' ? 'png' : 'webp';
      try { if (image.storagePath !== getReferenceScreenshotPath(imageOwner, reference.id, extension)) return; }
      catch { return; }
      const query = new URLSearchParams({ owner: imageOwner });
      return `/api/library/screenshots/${encodeURIComponent(reference.id)}.${extension}?${query}`;
    },
    async request(message) {
      try {
        switch (message.type) {
          case 'cloud-sign-in': window.location.assign('/login'); return { ok: true, redirecting: true };
          case 'cloud-sign-out': clear(); await signOut(); return { ok: true };
          case 'get-cloud-state': {
            listing = undefined;
            listing = await bootstrap();
            const { user } = listing;
            const cloudState: LibraryAccount = { configured: true, authStatus: 'signed-in', userId: user.id, email: user.email, image: user.image ?? null, legacyCount: 0, legacyBlocked: false };
            return { ok: true, cloudState };
          }
          case 'list-references': {
            const snapshot = listing ?? await bootstrap();
            listing = undefined; // A refresh always needs a fresh authenticated listing.
            const result = await readReferences(await connection(undefined, snapshot), undefined, { deferImages: true });
            references = new Map(result.references.map(reference => [reference.id, reference]));
            return { ok: true, ...result };
          }
          case 'delete-reference': {
            const current = await connection(message.expectedUserId);
            const { user } = current;
            const reference = references.get(message.id) ?? (this.viewState?.account?.userId === user.id
              ? this.viewState.references?.find(reference => reference.id === message.id) : undefined);
            if (!reference) throw new Error('Refresh the library before deleting this reference.');
            let backup = reference;
            // Delete removes the stored image too. Read just this image before
            // deleting so Undo retains its original behavior with deferred images.
            if (reference?.screenshot?.storagePath && !reference.screenshot.dataUrl) {
              const dataUrl = await current.client.downloadScreenshot(reference.id, reference.screenshot.mimeType === 'image/png' ? 'png' : 'webp');
              backup = { ...reference, screenshot: { ...reference.screenshot, dataUrl } };
            }
            await request('/captures/' + encodeURIComponent(message.id), { method: 'DELETE' }, user.id);
            deleted = backup ? { owner: user.id, reference: backup } : undefined;
            return { ok: true };
          }
          case 'save-reference': {
            const current = await connection(message.expectedUserId);
            const reference = deleted?.owner === current.user.id && deleted.reference.id === message.reference.id
              ? deleted.reference : message.reference;
            await uploadReference(current, reference);
            if (deleted?.reference.id === reference.id) deleted = undefined;
            return { ok: true };
          }
          case 'import-legacy': return { ok: false, error: 'Import older saves from the extension on their original device.' };
        }
      } catch (error) {
        if (error instanceof LibrarySessionError) {
          clear();
          const returnTo = (window.location.pathname || '/library') + (window.location.search || '');
          window.location.replace(`/login?reauth=1&returnTo=${encodeURIComponent(returnTo)}`);
          return { ok: true, redirecting: true };
        }
        return { ok: false, error: error instanceof Error ? error.message : 'Unable to access your library.' };
      }
    },
  };
}
