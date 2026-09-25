export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function requireUuid(value: string): string {
  if (!UUID.test(value)) throw new HttpError(400, 'Invalid reference ID.');
  return value;
}
export function screenshotKey(userId: string, captureId: string, extension: string): string {
  requireUuid(userId); requireUuid(captureId);
  if (extension !== 'png' && extension !== 'webp') throw new HttpError(400, 'Use PNG or WebP.');
  return `${userId}/${captureId}.${extension}`;
}
export function validateRedirect(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Missing extension callback.');
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(400, 'Invalid extension callback.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash
    || !(/^[a-p]{32}\.chromiumapp\.org$/.test(url.hostname)
      || /^[a-z0-9-]+\.extensions\.allizom\.org$/.test(url.hostname))) {
    throw new HttpError(400, 'Invalid extension callback.');
  }
  return url.href;
}
export function validateChallenge(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new HttpError(400, 'Invalid sign-in challenge.');
  return value;
}
export async function limitedBody(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'Upload is too large.');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Upload is too large.'); }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(new TextDecoder().decode(await limitedBody(request, 2 * 1024 * 1024)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Invalid JSON.');
  }
}
