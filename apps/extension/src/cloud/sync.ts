import type { Reference } from '@refer/capture';
import {
  getReferenceScreenshotPath,
  type CaptureInsert,
  type Json,
  type ReferenceScreenshotExtension,
} from '@refer/database';
import {
  completeSyncJob,
  claimSyncOwner,
  failSyncJob,
  getReference,
  getSyncQueueSummary,
  listReadySyncJobs,
  type SyncJob,
} from '../storage/references';
import { getCloudClient } from './client';
import type { CloudState } from './types';

const META_STORAGE_KEY = 'refer-cloud-sync-meta';
const RETRY_ALARM = 'refer-cloud-sync';

interface SyncMeta {
  lastSyncedAt: string | null;
  lastError: string | null;
  seededUserId: string | null;
}

let activeSync: Promise<CloudState> | null = null;
let syncing = false;

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Cloud sync failed.';
}

const ACCOUNT_MISMATCH_MESSAGE =
  'This device library is already linked to another account. Sign in with the original account to sync; your local references have not been uploaded.';

async function getMeta(): Promise<SyncMeta> {
  const stored = await browser.storage.local.get(META_STORAGE_KEY);
  const value = stored[META_STORAGE_KEY];
  if (!value || typeof value !== 'object') {
    return { lastSyncedAt: null, lastError: null, seededUserId: null };
  }
  const record = value as Record<string, unknown>;
  return {
    lastSyncedAt: typeof record.lastSyncedAt === 'string' ? record.lastSyncedAt : null,
    lastError: typeof record.lastError === 'string' ? record.lastError : null,
    seededUserId: typeof record.seededUserId === 'string' ? record.seededUserId : null,
  };
}

async function setMeta(meta: SyncMeta): Promise<void> {
  await browser.storage.local.set({ [META_STORAGE_KEY]: meta });
}

function elementLabel(reference: Reference): string {
  return reference.element.semantic.accessibleName
    || reference.element.textExcerpt
    || `${reference.element.semantic.tagName.toLocaleLowerCase()} element`;
}

function screenshotPath(userId: string, reference: Reference): string | null {
  if (!reference.screenshot?.dataUrl) return reference.screenshot?.storagePath ?? null;
  const extension: ReferenceScreenshotExtension = reference.screenshot.mimeType === 'image/png'
    ? 'png'
    : 'webp';
  return getReferenceScreenshotPath(userId, reference.id, extension);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/u.exec(dataUrl);
  if (!match?.[1] || !match[2]) throw new Error('The local screenshot is not a supported data URL.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1] });
}

function remoteSnapshot(reference: Reference, storagePath: string | null): Reference {
  return {
    ...reference,
    screenshot: reference.screenshot
      ? { ...reference.screenshot, dataUrl: null, storagePath }
      : null,
  };
}

async function uploadReference(job: SyncJob, userId: string, reference: Reference): Promise<void> {
  const client = getCloudClient();
  if (!client) throw new Error('Cloud sync is not configured.');
  const storagePath = screenshotPath(userId, reference);

  if (storagePath && reference.screenshot?.dataUrl) {
    await client.uploadScreenshot(reference.id, dataUrlToBlob(reference.screenshot.dataUrl), reference.screenshot.mimeType === 'image/png' ? 'png' : 'webp');
  }

  const typography = reference.element.typography;
  const colors = reference.element.colors;
  const row = {
    id: reference.id,
    user_id: userId,
    facets: reference.facets,
    source_url: reference.source.url,
    source_origin: reference.source.origin,
    page_title: reference.source.title,
    element_label: elementLabel(reference),
    primary_font_family: typography.primaryFontFamily,
    text_color: colors.text,
    background_color: colors.effectiveBackground,
    screenshot_path: storagePath,
    snapshot_version: reference.snapshotVersion,
    snapshot: remoteSnapshot(reference, storagePath) as unknown as Json,
    note: reference.note,
    favorite: reference.favorite,
    collection_id: reference.collectionId,
    captured_at: reference.capturedAt,
  } satisfies CaptureInsert;
  await client.upsertCapture(row);
  await completeSyncJob(job.referenceId, job.token);
}

async function deleteRemoteReference(job: SyncJob, userId: string): Promise<void> {
  const client = getCloudClient();
  if (!client) throw new Error('Cloud sync is not configured.');

  await client.deleteCapture(job.referenceId);
  await completeSyncJob(job.referenceId, job.token);
}

async function scheduleRetry(): Promise<void> {
  const summary = await getSyncQueueSummary();
  if (!summary.pending || !summary.nextAttemptAt) {
    await browser.alarms.clear(RETRY_ALARM);
    return;
  }
  const scheduled = Math.max(Date.now() + 1_000, Date.parse(summary.nextAttemptAt));
  await browser.alarms.create(RETRY_ALARM, { when: scheduled });
}

export async function getCloudState(): Promise<CloudState> {
  const client = getCloudClient();
  const [queue, meta] = await Promise.all([getSyncQueueSummary(), getMeta()]);
  if (!client) {
    return {
      configured: false,
      authStatus: 'unavailable',
      email: null,
      syncing,
      ...queue,
      lastSyncedAt: meta.lastSyncedAt,
      lastError: meta.lastError,
    };
  }

  const { data, error } = await client.auth.getSession();
  return {
    configured: true,
    authStatus: data.session ? 'signed-in' : 'signed-out',
    email: data.session?.user.email ?? null,
    syncing,
    ...queue,
    lastSyncedAt: meta.lastSyncedAt,
    lastError: error?.message ?? meta.lastError,
  };
}

async function runSync(force: boolean): Promise<CloudState> {
  const client = getCloudClient();
  if (!client) return getCloudState();
  const { data, error } = await client.auth.getSession();
  if (error) {
    const meta = await getMeta();
    await setMeta({ ...meta, lastError: error.message });
    await scheduleRetry();
    return getCloudState();
  }
  if (!data.session) return getCloudState();

  const startingMeta = await getMeta();
  const ownership = await claimSyncOwner(data.session.user.id, startingMeta.seededUserId);
  if (ownership.status === 'mismatch') {
    // A restored session can belong to a different account after browser sync,
    // profile cloning, or another extension context. Remove it before returning
    // so the UI never presents that account as safely connected to this library.
    await client.auth.signOut({ scope: 'local' });
    await setMeta({ ...startingMeta, lastError: ACCOUNT_MISMATCH_MESSAGE });
    await browser.alarms.clear(RETRY_ALARM);
    return getCloudState();
  }

  syncing = true;
  let failure: string | null = null;
  try {
    await setMeta({
      ...startingMeta,
      seededUserId: data.session.user.id,
      lastError: null,
    });
    const farFuture = new Date('9999-12-31T23:59:59.999Z');
    const jobs = await listReadySyncJobs(50, force ? farFuture : new Date());
    for (const job of jobs) {
      try {
        if (job.operation === 'delete') {
          await deleteRemoteReference(job, data.session.user.id);
        } else {
          const reference = await getReference(job.referenceId);
          if (reference) await uploadReference(job, data.session.user.id, reference);
          else await completeSyncJob(job.referenceId, job.token);
        }
      } catch (jobError) {
        failure = messageFrom(jobError);
        await failSyncJob(job.referenceId, job.token, failure);
        break;
      }
    }

    const currentMeta = await getMeta();
    const meta = {
      ...currentMeta,
      lastSyncedAt: failure ? currentMeta.lastSyncedAt : new Date().toISOString(),
      lastError: failure,
    } satisfies SyncMeta;
    await setMeta(meta);
    await scheduleRetry();
  } finally {
    syncing = false;
  }
  return getCloudState();
}

export function syncNow(force = false): Promise<CloudState> {
  if (activeSync) return activeSync;
  activeSync = runSync(force).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

export async function signIn(): Promise<CloudState> {
  const client = getCloudClient();
  if (!client) throw new Error('Cloud sync is not configured in this build.');
  const { data, error } = await client.auth.signIn();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error('Cloud sign-in completed without a user identity.');

  const meta = await getMeta();
  const ownership = await claimSyncOwner(userId, meta.seededUserId);
  if (ownership.status === 'mismatch') {
    await client.auth.signOut({ scope: 'local' });
    await browser.alarms.clear(RETRY_ALARM);
    throw new Error(ACCOUNT_MISMATCH_MESSAGE);
  }
  return syncNow(true);
}

export async function signOut(): Promise<CloudState> {
  const client = getCloudClient();
  if (!client) return getCloudState();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
  await browser.alarms.clear(RETRY_ALARM);
  return getCloudState();
}

export function isSyncAlarm(name: string): boolean {
  return name === RETRY_ALARM;
}
