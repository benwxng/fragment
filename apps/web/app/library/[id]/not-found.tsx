import { Suspense } from 'react';

import { Brand } from '@/components/app-header';
import { LibraryReturnLink } from '@/components/library-return-link';

export default function ReferenceNotFound() {
  return (
    <div className="error-page">
      <header className="site-header"><Brand /></header>
      <main className="state-main" id="main-content">
        <p className="eyebrow">Reference not found</p>
        <h1>That reference isn’t in your library.</h1>
        <p className="lede">It may have been deleted, or the link may be incomplete.</p>
        <div className="state-actions">
          <Suspense fallback={<a className="button button-primary" href="/library">Return to the library</a>}>
            <LibraryReturnLink className="button button-primary" />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
