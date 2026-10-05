import { getAuth } from './server';
import { unstable_rethrow } from 'next/navigation';

export class SessionError extends Error {
  constructor(public status: 401 | 503) {
    super(status === 401 ? 'Sign in to access your library.' : 'Unable to connect to your account right now. Please try again.');
  }
}

/** Never interpret an unavailable auth service or a rejected API JWT as a lost browser session. */
export async function requireSession() {
  try {
    const { data, error } = await getAuth().getSession({ query: { disableCookieCache: 'true' } });
    if (error) throw new SessionError(error.status === 401 ? 401 : 503);
    if (!data?.user) throw new SessionError(401);
    return data;
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SessionError) throw error;
    throw new SessionError(503);
  }
}

export async function sessionToken(): Promise<string> {
  // Retry only a read. Do not replay sign-in, sign-out, or other auth mutations.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await getAuth().token();
      if (!error && data?.token) return data.token;
      console.warn(JSON.stringify({ event: 'auth.token_unavailable', attempt: attempt + 1,
        status: error?.status, code: error?.code, missingToken: !data?.token }));
      if (!error || error.status === 401 || error.status === 403) await requireSession();
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof SessionError && error.status === 401) throw error;
    }
  }
  throw new SessionError(503);
}

/** A backend rejection may mean expired signing keys/JWT, while the login cookie is still valid. */
export async function rejectBackendSession(): Promise<never> {
  await requireSession();
  throw new SessionError(503);
}
