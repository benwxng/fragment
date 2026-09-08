'use client';

import { useEffect } from 'react';

import { Brand } from '@/components/app-header';

export default function LibraryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="error-page">
      <header className="site-header"><Brand /></header>
      <main className="state-main" id="main-content">
        <p className="eyebrow">Library unavailable</p>
        <h1>References could not be loaded.</h1>
        <p className="lede">Check your connection and Supabase setup, then try again.</p>
        <button className="button button-primary" type="button" onClick={reset}>Try again</button>
      </main>
    </div>
  );
}
