import Link from 'next/link';

import { Brand } from '@/components/app-header';

export default function NotFound() {
  return (
    <div className="error-page">
      <header className="site-header"><Brand /></header>
      <main className="state-main" id="main-content">
        <p className="eyebrow">Not found</p>
        <h1>This reference is no longer here.</h1>
        <p className="lede">It may have been deleted, or the link may be incomplete.</p>
        <Link className="button button-primary" href="/library">Return to the library</Link>
      </main>
    </div>
  );
}
