import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock('./session', async original => ({ ...await original<typeof import('./session')>(), requireSession: auth.requireSession }));
vi.mock('./server', () => ({ getAuth: vi.fn() }));
vi.mock('next/navigation', async original => ({ ...await original<typeof import('next/navigation')>(),
  redirect: (url: string) => { throw new Error('REDIRECT:' + url); } }));
import { pageSession } from './page-session';
import { SessionError } from './session';
beforeEach(() => vi.resetAllMocks());
it('preserves an extension sign-in return URL for a confirmed ended session', async () => {
  auth.requireSession.mockRejectedValue(new SessionError(401));
  const path = '/extension/connect?challenge=fixture&state=state';
  await expect(pageSession(path)).rejects.toThrow('REDIRECT:/login?returnTo=' + encodeURIComponent(path));
});
it('does not redirect an account-service outage to sign-in', async () => {
  auth.requireSession.mockRejectedValue(new SessionError(503));
  await expect(pageSession()).rejects.toMatchObject({ status: 503 });
});
it('returns a verified session to protected pages', async () => {
  const session = { user: { id: 'owner', emailVerified: true } };
  auth.requireSession.mockResolvedValue(session);
  expect(await pageSession()).toBe(session);
});
