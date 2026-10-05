import 'server-only';
import { createNeonAuth } from '@neondatabase/auth/next/server';
let instance: ReturnType<typeof createNeonAuth> | undefined;
export function getAuth() {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET) throw new Error('Neon Auth is not configured.');
  return instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET },
    logger: {
      warn: (message, meta) => logAuth('warn', message, meta),
      error: (message, meta) => logAuth('error', message, meta),
    },
  });
}

function logAuth(level: 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  // Next's development log drops object details. Serialize only safe diagnostics.
  const { component, code, status } = meta ?? {};
  console[level](JSON.stringify({ event: 'auth.upstream', message, component, code, status }));
}
