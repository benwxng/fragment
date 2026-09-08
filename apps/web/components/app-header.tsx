import Link from 'next/link';

import { signOut } from '@/app/actions';
import { MarkIcon } from '@/components/icons';

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Refer home">
      <MarkIcon className="brand-mark" />
      <span>Refer</span>
    </Link>
  );
}

export function AppHeader({ email, count, canSignOut = true }: { email?: string; count?: number; canSignOut?: boolean }) {
  return (
    <header className="site-header">
      <Brand />
      {email ? (
        <div className="account">
          {typeof count === 'number' ? <span className="library-count">{count} {count === 1 ? 'reference' : 'references'}</span> : null}
          <span className="account-email"><bdi>{email}</bdi></span>
          {canSignOut ? (
            <form action={signOut}>
              <button className="text-action" type="submit">Sign out</button>
            </form>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
