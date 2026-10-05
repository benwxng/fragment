import { redirect } from 'next/navigation';
import { requireSession, SessionError } from './session';

export async function pageSession(returnTo = '/library') {
  try { return await requireSession(); }
  catch (error) {
    if (error instanceof SessionError && error.status === 401) {
      redirect(returnTo === '/library' ? '/login' : `/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
    throw error;
  }
}
