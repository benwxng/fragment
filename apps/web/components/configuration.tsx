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
          Glance is ready. Add your Neon Auth URL, cookie secret, and API URL to enable sign-in and cloud references.
        </p>
        <section className="setup-card" aria-labelledby="setup-title">
          <div>
            <span className="step-number">01</span>
            <h2 id="setup-title">Create your environment file</h2>
            <p>Copy the example file, then replace the placeholder values with your project settings.</p>
          </div>
          <pre><code>cp apps/web/.env.example apps/web/.env.local</code></pre>
          <div className="setup-values">
            <code>NEON_AUTH_BASE_URL</code>
            <code>NEON_FUNCTION_API_BASE_URL</code>
          </div>
          <p className="setup-note">
            Keep the cookie secret server-side. Never prefix secrets with NEXT_PUBLIC_.
          </p>
        </section>
        <div className="configuration-actions">
          <Link className="button button-primary" href="/library?demo=1">Preview the library</Link>
          <a className="text-link" href="https://console.neon.tech" target="_blank" rel="noreferrer">Open Neon dashboard</a>
        </div>
      </main>
    </div>
  );
}
