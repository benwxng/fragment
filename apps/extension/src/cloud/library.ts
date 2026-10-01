import type { Reference, CaptureFacet } from '@refer/capture';
import { getReferenceScreenshotPath, type CaptureInsert, type Json } from '@refer/database';
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
    userId: current?.user.id ?? null, email: current?.user.email ?? null,
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

function imageBlob(dataUrl: string): Blob {
  const match = /^data:(image\/(?:png|webp));base64,([\s\S]+)$/u.exec(dataUrl);
  if (!match) throw new Error('Unsupported reference image.');
  const bytes = Uint8Array.from(atob(match[2]!), char => char.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

async function upload(current: Account, reference: Reference): Promise<void> {
  const { client, user } = current;
  let storagePath: string | null = null;
  if (reference.screenshot?.dataUrl) {
    const extension = reference.screenshot.mimeType === 'image/png' ? 'png' : 'webp';
    storagePath = getReferenceScreenshotPath(user.id, reference.id, extension);
    await client.uploadScreenshot(reference.id, imageBlob(reference.screenshot.dataUrl), extension);
  } else if (reference.screenshot?.storagePath) {
    const extension = reference.screenshot.mimeType === 'image/png' ? 'png' : 'webp';
    const expectedPath = getReferenceScreenshotPath(user.id, reference.id, extension);
    if (reference.screenshot.storagePath !== expectedPath) throw new Error('This image belongs to another account.');
    storagePath = expectedPath;
  }
  const { element, source } = reference;
  const row = {
    id: reference.id, user_id: user.id, facets: reference.facets,
    source_url: source.url, source_origin: source.origin, page_title: source.title,
    element_label: element.semantic.accessibleName || element.textExcerpt || `${element.semantic.tagName.toLowerCase()} element`,
    primary_font_family: element.typography.primaryFontFamily,
    text_color: element.colors.text, background_color: element.colors.effectiveBackground,
    screenshot_path: storagePath, snapshot_version: reference.snapshotVersion,
    snapshot: { ...reference, screenshot: storagePath && reference.screenshot
      ? { ...reference.screenshot, dataUrl: null, storagePath } : null } as unknown as Json,
    note: reference.note, favorite: reference.favorite, collection_id: reference.collectionId,
    captured_at: reference.capturedAt,
  } satisfies CaptureInsert;
  await client.upsertCapture(row, null);
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

export async function listReferences(): Promise<{ references: Reference[]; userId: string }> {
  const { client, user } = await account();
  const result = await client.listLibrary();
  if (!result.complete || result.userId !== user.id || !Array.isArray(result.captures)) {
    throw new Error('Unable to load the complete account library. Try again.');
  }
  const references: Reference[] = [];
  for (const row of result.captures) {
    const snapshot = row.snapshot as unknown as Reference;
    if (row.user_id !== user.id || !snapshot?.element || !snapshot.source || snapshot.snapshotVersion !== 1) {
      throw new Error('Unable to read a saved reference.');
    }
    let screenshot = snapshot.screenshot;
    if (row.screenshot_path) {
      const extension = row.screenshot_path.endsWith('.png') ? 'png' : 'webp';
      screenshot = { dataUrl: await client.downloadScreenshot(row.id, extension),
        storagePath: row.screenshot_path, mimeType: `image/${extension}`,
        width: screenshot?.width ?? 4, height: screenshot?.height ?? 3 };
    } else screenshot = null;
    const facets = row.facets.filter((facet): facet is CaptureFacet => ['typography', 'component', 'color', 'layout'].includes(facet));
    references.push({ ...snapshot, id: row.id, capturedAt: row.captured_at, facets,
      element: { ...snapshot.element, semantic: { ...snapshot.element.semantic,
        accessibleName: row.element_label || snapshot.element.semantic.accessibleName } },
      source: { ...snapshot.source, url: row.source_url, origin: row.source_origin, title: row.page_title },
      note: row.note, favorite: row.favorite, collectionId: row.collection_id, screenshot });
  }
  return { userId: user.id, references: references.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt)) };
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
