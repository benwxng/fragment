import { AppHeader } from '@/components/app-header';

export default function LibraryLoading() {
  return (
    <div className="library-page">
      <AppHeader />
      <main className="library-main" id="main-content" aria-busy="true">
        <h1 className="visually-hidden">Saved references</h1>
        <p className="loading-label">Loading references…</p>
        <div className="reference-grid loading-grid" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => <div className="loading-card" key={index}><span /><i /><i /></div>)}
        </div>
      </main>
    </div>
  );
}
