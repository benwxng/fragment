import { LibraryRefresh } from '@/components/library-refresh';
import { libraryEmptyCopy } from '@refer/capture/presentation';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AppHeader } from '@/components/app-header';
import { CaptureCard } from '@/components/capture-card';
import { ConfigurationScreen } from '@/components/configuration';
import { LibraryFilters } from '@/components/library-filters';
import { captureMatches } from '@/lib/captures';
import { isNeonConfigured } from '@/lib/config';
import { listCaptures } from '@/lib/data';
import { demoCaptures } from '@/lib/demo';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Reference library' };

interface LibrarySearchParams {
  q?: string;
  facet?: string;
  demo?: string;
  deleted?: string;
}

const allowedFacets = new Set(['all', 'typography', 'component', 'color', 'layout']);

export default async function LibraryPage({ searchParams }: { searchParams: Promise<LibrarySearchParams> }) {
  const parameters = await searchParams;
  if (!isNeonConfigured() && parameters.demo !== '1') return <ConfigurationScreen />;
  const demo = parameters.demo === '1' && !isNeonConfigured();
  const query = parameters.q?.slice(0, 120) ?? '';
  const facet = parameters.facet && allowedFacets.has(parameters.facet) ? parameters.facet : 'all';
  const library = demo ? { captures: demoCaptures, email: 'Preview mode' } : await listCaptures();
  const visibleCaptures = library.captures.filter((capture) => captureMatches(capture, query, facet));
  const filtering = Boolean(query.trim()) || facet !== 'all';

  return (
    <div className="library-page">
      {!demo && <LibraryRefresh />}
      <AppHeader email={library.email} count={library.captures.length} canSignOut={!demo} />
      <main className="library-main" id="main-content">
        <h1 className="visually-hidden">Saved references</h1>
        {demo ? (
          <aside className="demo-notice">
            <span>Preview data</span>
            <Link href="/">Connect Neon</Link>
          </aside>
        ) : null}

        {parameters.deleted === '1' ? (
          <div className="notice" role="status">
            <span>Reference deleted.</span>
            <Link href="/library">Dismiss</Link>
          </div>
        ) : null}

        <LibraryFilters query={query} facet={facet} demo={demo} />
        <div className="result-summary" role="status">
          {filtering ? `${visibleCaptures.length} ${visibleCaptures.length === 1 ? 'result' : 'results'} shown` : ''}
        </div>

        {visibleCaptures.length ? (
          <div className="reference-grid">
            {visibleCaptures.map((capture) => <CaptureCard capture={capture} demo={demo} key={capture.id} />)}
          </div>
        ) : (
          <section className="empty-state">
            <div className="empty-glyph" aria-hidden="true">Aa</div>
            <h2>{filtering ? (query ? `No results for “${query}”` : `No ${facet} references`) : 'No references yet'}</h2>
            <p>
              {filtering
                ? 'Try another search, or return to all references.'
                : libraryEmptyCopy}
            </p>
            {filtering ? <Link className="text-link empty-action" href={demo ? '/library?demo=1' : '/library'}>Clear search and filters</Link> : null}
          </section>
        )}
      </main>
    </div>
  );
}
