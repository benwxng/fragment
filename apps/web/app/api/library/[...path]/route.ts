import { getAuth } from '@/lib/auth/server';

// Same-origin, authenticated transport for the shared library. No tokens reach the browser.
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = '/' + (await context.params).path.join('/');
  const uuid = '[0-9a-fA-F-]{36}';
  const allowed = request.method === 'GET'
    ? path === '/me' || path === '/library-sync' || new RegExp('^/screenshots/' + uuid + '\\.(png|webp)$').test(path)
    : request.method === 'PUT'
      ? new RegExp('^/(captures/' + uuid + '|screenshots/' + uuid + '\\.(png|webp))$').test(path)
      : request.method === 'DELETE' && new RegExp('^/captures/' + uuid + '$').test(path);
  if (!allowed) return Response.json({ error: 'Not found.' }, { status: 404 });
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const { data, error } = await getAuth().token();
  if (error && error.status !== 401 && error.status !== 403) {
    return Response.json({ error: 'Unable to connect to your account right now. Please try again.' }, { status: 503 });
  }
  if (error || !data?.token) return Response.json({ error: 'Sign in to access your library.' }, { status: 401 });
  const headers = { Authorization: `Bearer ${data.token}` };
  const base = process.env.NEON_FUNCTION_API_BASE_URL!;
  const owner = request.headers.get('x-library-owner');
  if (path !== '/me') {
    if (!owner) return Response.json({ error: 'An account is required.' }, { status: 400 });
    const me = await fetch(new URL('/me', base), { headers, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    if (!me.ok) return new Response(me.body, { status: me.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    const { user } = await me.json();
    if (user.id !== owner) return Response.json({ error: 'Your account changed. Refresh the library.' }, { status: 409 });
  }
  let body: ArrayBuffer | undefined;
  if (request.method === 'PUT') {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 6 * 1024 * 1024) {
          await reader.cancel();
          return Response.json({ error: 'Reference exceeds the supported size.' }, { status: 413 });
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    body = bytes.buffer;
  }
  const response = await fetch(new URL(path, base), {
    method: request.method, headers: { ...headers, 'Content-Type': request.headers.get('content-type') ?? 'application/json' },
    body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
