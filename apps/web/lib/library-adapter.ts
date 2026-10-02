import { readReferences, uploadReference, type LibraryConnection } from '@refer/capture/library/data';
import type { LibraryAdapter, LibraryAccount } from '@refer/capture/library/types';
import { signOut } from '@/app/actions';

class LibrarySessionError extends Error {}

export function webLibraryAdapter(initialReferenceId?: string): LibraryAdapter {
  async function request(path: string, options: RequestInit = {}, owner?: string) {
    const response = await fetch('/api/library' + path, {
      ...options, cache: 'no-store', signal: AbortSignal.timeout(30_000),
      headers: { ...options.headers, ...(owner ? { 'x-library-owner': owner } : {}) },
    });
    if (response.status === 401) {
      // The login page redirects an existing session back to the library.
      // A rejected API token must not start a library → login → library loop.
      throw new LibrarySessionError('Your session has ended. Sign in to access your library.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? 'Unable to access your library.');
    }
    return response;
  }
  async function connection(expectedUserId?: string): Promise<LibraryConnection> {
    const { user } = await (await request('/me')).json() as { user: { id: string; email: string; image?: string | null } };
    if (expectedUserId && user.id !== expectedUserId) throw new Error('Your account changed. Refresh the library.');
    const send = (path: string, options?: RequestInit) => request(path, options, user.id);
    return { user, client: {
      listLibrary: async () => (await send('/library-sync')).json(),
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
    async request(message) {
      try {
        switch (message.type) {
          case 'cloud-sign-in': window.location.assign('/login'); return { ok: true };
          case 'cloud-sign-out': await signOut(); return { ok: true };
          case 'get-cloud-state': {
            const { user } = await connection();
            const cloudState: LibraryAccount = { configured: true, authStatus: 'signed-in', userId: user.id, email: user.email, image: user.image ?? null, legacyCount: 0, legacyBlocked: false };
            return { ok: true, cloudState };
          }
          case 'list-references': return { ok: true, ...await readReferences(await connection()) };
          case 'delete-reference': {
            const { user } = await connection(message.expectedUserId);
            await request('/captures/' + encodeURIComponent(message.id), { method: 'DELETE' }, user.id);
            return { ok: true };
          }
          case 'save-reference': await uploadReference(await connection(message.expectedUserId), message.reference); return { ok: true };
          case 'import-legacy': return { ok: false, error: 'Import older saves from the extension on their original device.' };
        }
      } catch (error) {
        if (error instanceof LibrarySessionError) {
          if (message.type === 'get-cloud-state') return { ok: true, cloudState: {
            configured: true, authStatus: 'signed-out', userId: null, email: null, legacyCount: 0, legacyBlocked: false,
          } };
          return { ok: false, error: error.message, resetLibrary: true };
        }
        return { ok: false, error: error instanceof Error ? error.message : 'Unable to access your library.' };
      }
    },
  };
}
