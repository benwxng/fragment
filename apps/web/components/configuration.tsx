import Link from 'next/link';

import { Brand } from '@/components/app-header';

export function ConfigurationScreen() {
  return (
    <div className="configuration-page">
      <header className="site-header"><Brand /></header>
      <main className="configuration-main" id="main-content">
        <p className="eyebrow">One-time setup</p>
        <h1>Connect your private library.</h1>
        <p className="lede">
          Refer is ready. Add your Supabase project URL and publishable key to enable sign-in and cloud references.
        </p>
        <section className="setup-card" aria-labelledby="setup-title">
          <div>
            <span className="step-number">01</span>
            <h2 id="setup-title">Create your environment file</h2>
            <p>Copy the example file, then replace both placeholder values with your project settings.</p>
          </div>
          <pre><code>cp apps/web/.env.example apps/web/.env.local</code></pre>
          <div className="setup-values">
            <code>NEXT_PUBLIC_SUPABASE_URL</code>
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
          </div>
          <p className="setup-note">
            Use the public publishable key only. Never add a secret or service-role key to this app.
          </p>
        </section>
        <div className="configuration-actions">
          <Link className="button button-primary" href="/library?demo=1">Preview the library</Link>
          <a className="text-link" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open Supabase dashboard</a>
        </div>
      </main>
    </div>
  );
}
