import 'server-only';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/server';
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data, error } = await getAuth().token();
  if (error || !data?.token) redirect('/login');
  const response = await fetch(new URL(path, process.env.NEON_FUNCTION_API_BASE_URL!), {
    ...options, cache: 'no-store',
    headers: { ...options.headers, Authorization: `Bearer ${data.token}` },
  });
  if (response.status === 401) redirect('/login');
  if (response.status === 403) {
    const { data: session } = await getAuth().getSession();
    if (session?.user && !session.user.emailVerified) redirect('/verify-email');
  }
  const value = await response.json();
  if (!response.ok) throw new ApiError(response.status, value.error ?? 'Unable to access your library.');
  return value as T;
}
