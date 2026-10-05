import type { Reference, CaptureFacet } from '../types';
import { getReferenceScreenshotPath, type CaptureInsert, type CaptureRow, type Json } from '@refer/database';

export interface LibraryConnection {
  user: { id: string; email: string; image?: string | null };
  client: {
    uploadScreenshot(id: string, blob: Blob, extension: string): Promise<unknown>;
    upsertCapture(row: CaptureInsert, baseRevision: string | null): Promise<unknown>;
    listLibrary(): Promise<{ captures: CaptureRow[]; complete: boolean; userId: string }>;
    downloadScreenshot(id: string, extension: string): Promise<string>;
  };
}
function imageBlob(dataUrl: string): Blob {
  const match = /^data:(image\/(?:png|webp));base64,([\s\S]+)$/u.exec(dataUrl);
  if (!match) throw new Error('Unsupported reference image.');
  const bytes = Uint8Array.from(atob(match[2]!), char => char.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

export async function uploadReference(current: LibraryConnection, reference: Reference): Promise<void> {
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


/** Reuse unchanged image bytes only after an authenticated, complete library listing. */
export class LibraryImageCache {
  private owner: string | undefined;
  private generation = 0;
  private images = new Map<string, string>();
  clear() { this.generation++; this.owner = undefined; this.images.clear(); }
  forAccount(owner: string) {
    if (this.owner !== owner) { this.clear(); this.owner = owner; }
    const generation = this.generation;
    const images = this.images;
    return { images, commit: (next: Map<string, string>) => {
      if (generation === this.generation) this.images = next;
    } };
  }
}

export async function readReferences({ client, user }: LibraryConnection, cache?: LibraryImageCache): Promise<{ references: Reference[]; userId: string }> {
  const cached = cache?.forAccount(user.id);
  const result = await client.listLibrary();
  if (!result.complete || result.userId !== user.id || !Array.isArray(result.captures)) {
    throw new Error('Unable to load the complete account library. Try again.');
  }
  const references: Reference[] = [];
  const nextImages = new Map<string, string>();
  for (const row of result.captures) {
    const snapshot = row.snapshot as unknown as Reference;
    if (row.user_id !== user.id || !snapshot?.element || !snapshot.source || snapshot.snapshotVersion !== 1) {
      throw new Error('Unable to read a saved reference.');
    }
    let screenshot = snapshot.screenshot;
    if (row.screenshot_path) {
      const extension = row.screenshot_path.endsWith('.png') ? 'png' : 'webp';
      const imageKey = JSON.stringify([row.id, row.screenshot_path, row.updated_at]);
      // Missing revisions must never permit reuse of potentially changed bytes.
      const dataUrl = (row.updated_at ? cached?.images.get(imageKey) : undefined)
        ?? await client.downloadScreenshot(row.id, extension);
      nextImages.set(imageKey, dataUrl);
      screenshot = { dataUrl,
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
  cached?.commit(nextImages);
  return { userId: user.id, references: references.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt)) };
}
