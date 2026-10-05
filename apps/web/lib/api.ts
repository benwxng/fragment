import 'server-only';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/server';
import { rejectBackendSession, SessionError, sessionToken } from '@/lib/auth/session';
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  try { return await authenticatedApi<T>(path, options); }
  catch (error) {
    if (error instanceof SessionError && error.status === 401) redirect('/login');
    throw error;
  }
}
async function authenticatedApi<T>(path: string, options: RequestInit): Promise<T> {
  const token = await sessionToken();
  const response = await fetch(new URL(path, process.env.NEON_FUNCTION_API_BASE_URL!), {
    ...options, cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(30_000),
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) { await response.body?.cancel(); await rejectBackendSession(); }
  if (response.status === 403) {
    const { data: session } = await getAuth().getSession();
    if (session?.user && !session.user.emailVerified) redirect('/verify-email');
  }
  const value = await response.json();
  if (!response.ok) throw new ApiError(response.status, value.error ?? 'Unable to access your library.');
  return value as T;
}
