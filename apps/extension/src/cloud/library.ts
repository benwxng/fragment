import type { Reference } from '@refer/capture';
import { readReferences, uploadReference as upload } from '@refer/capture/library/data';
import { acknowledgeLegacyImport, claimLegacyImport, legacyImportStatus } from '../storage/legacy';
import { CloudError, getAccountClient, getCloudClient } from './client';
import type { CloudState } from './types';

type Account = NonNullable<Awaited<ReturnType<typeof getAccountClient>>>;
let signingIn: Promise<void> | undefined;
let importing: Promise<number> | undefined;

async function changed() {
  await browser.storage.local.set({ 'refer-library-updated': crypto.randomUUID() });
}

async function authenticate(): Promise<void> {
  const client = getCloudClient();
  if (!client) throw new Error('Saving requires an account. Account saving is not configured in this build.');
  const { error } = await client.auth.signIn();
  if (error) throw error;
  await changed();
}

async function account(interactive = false): Promise<Account> {
  let current = await getAccountClient();
  if (!current && interactive) {
    signingIn ??= authenticate().finally(() => { signingIn = undefined; });
    await signingIn;
    current = await getAccountClient();
  }
  if (!current) throw new Error('Sign in to save and view references.');
  return current;
}

export async function getCloudState(): Promise<CloudState> {
  const configured = Boolean(getCloudClient());
  const current = configured ? await getAccountClient() : null;
  const legacy = current ? await legacyImportStatus(current.user.id) : null;
  return {
    configured, authStatus: !configured ? 'unavailable' : current ? 'signed-in' : 'signed-out',
    userId: current?.user.id ?? null, email: current?.user.email ?? null, image: current?.user.image ?? null,
    legacyCount: legacy?.references.length ?? 0, legacyBlocked: legacy?.blocked ?? false,
  };
}

export async function signIn() {
  await account(true);
  return getCloudState();
}

export async function signOut() {
  if (importing || signingIn) throw new Error('Wait for sign-in or import to finish before signing out.');
  try { await getCloudClient()?.auth.signOut(); }
  finally { await changed(); }
  return getCloudState();
}

export async function saveReference(reference: Reference, expectedUserId?: string): Promise<string> {
  const current = await account(true);
  if (expectedUserId && current.user.id !== expectedUserId) throw new Error('Your account changed. Reopen the library and try again.');
  await upload(current, reference);
  await changed();
  return current.user.id;
}

export async function deleteReference(id: string, expectedUserId?: string): Promise<void> {
  const current = await account();
  if (expectedUserId && current.user.id !== expectedUserId) throw new Error('Your account changed. Reopen the library and try again.');
  await current.client.deleteCapture(id);
  await changed();
}

export async function listReferences() {
  return readReferences(await account());
}

async function importLegacy(): Promise<number> {
  const current = await account();
  await claimLegacyImport(current.user.id);
  const legacy = await legacyImportStatus(current.user.id);
  const remote = await current.client.listLibrary();
  if (!remote.complete || remote.userId !== current.user.id) throw new Error('Unable to check your account library.');
  const existing = new Set(remote.captures.map(row => row.id));
  let imported = 0;
  for (const reference of legacy.references) {
    if (!existing.has(reference.id)) {
      try { await upload(current, reference); }
      catch (error) {
        if (!(error instanceof CloudError && error.status === 409)) throw error;
      }
      imported++;
    }
    await acknowledgeLegacyImport(current.user.id, reference.id);
  }
  await changed();
  return imported;
}

export function importLegacyReferences(): Promise<number> {
  importing ??= importLegacy().finally(() => { importing = undefined; });
  return importing;
}
