export const REFERENCE_SCREENSHOTS_BUCKET = 'reference-shots' as const;

export type ReferenceScreenshotExtension = 'png' | 'webp';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Build the exact private Storage path accepted by the captures constraint and RLS policy. */
export function getReferenceScreenshotPath(
  userId: string,
  captureId: string,
  extension: ReferenceScreenshotExtension = 'webp',
): string {
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(captureId)) {
    throw new TypeError('Screenshot paths require UUID user and capture IDs.');
  }

  return `${userId}/${captureId}.${extension}`;
}
