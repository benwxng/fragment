import Link from 'next/link';

import { SearchIcon, SlidersIcon } from '@/components/icons';

const filters = [
  ['all', 'All'],
  ['typography', 'Type'],
  ['component', 'Components'],
  ['color', 'Colors'],
  ['layout', 'Layout'],
] as const;

export function LibraryFilters({ query, facet, demo }: { query: string; facet: string; demo: boolean }) {
  return (
    <div className="library-tools">
      <form className="search" action="/library" role="search">
        <label className="visually-hidden" htmlFor="library-search">Search references</label>
        <SearchIcon />
        <input
          id="library-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search fonts, pages, notes…"
        />
        {facet !== 'all' ? <input type="hidden" name="facet" value={facet} /> : null}
        {demo ? <input type="hidden" name="demo" value="1" /> : null}
        <button className="search-submit" type="submit">Search</button>
      </form>
      <nav className="filters" aria-label="Reference facets">
        <SlidersIcon className="filter-icon" />
        {filters.map(([value, label]) => {
          const parameters = new URLSearchParams();
          if (query) parameters.set('q', query);
          if (value !== 'all') parameters.set('facet', value);
          if (demo) parameters.set('demo', '1');
          const href = `/library${parameters.size ? `?${parameters}` : ''}`;
          return (
            <Link
              className={`filter ${facet === value ? 'is-active' : ''}`}
              href={href}
              aria-current={facet === value ? 'page' : undefined}
              key={value}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
