'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { Brand } from '@/components/app-header';

export default function ReferenceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const searchParams = useSearchParams();
  const libraryHref = searchParams.get('demo') === '1' ? '/library?demo=1' : '/library';

  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="error-page">
      <header className="site-header"><Brand /></header>
      <main className="state-main" id="main-content">
        <p className="eyebrow">Reference unavailable</p>
        <h1>This reference couldn’t be loaded.</h1>
        <p className="lede">Check your connection, then try again. Your saved reference hasn’t been changed.</p>
        <div className="state-actions">
          <button className="button button-primary" type="button" onClick={reset}>Try again</button>
          <Link className="button button-secondary" href={libraryHref}>Return to the library</Link>
        </div>
      </main>
    </div>
  );
}
