import { AppHeader } from '@/components/app-header';

export default function LibraryLoading() {
  return (
    <div className="library-page">
      <AppHeader />
      <main className="library-main" id="main-content" aria-busy="true">
        <div className="loading-intro" aria-hidden="true"><span /><span /><span /></div>
        <p className="loading-label">Loading references…</p>
        <div className="reference-grid loading-grid" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => <div className="loading-card" key={index}><span /><i /><i /></div>)}
        </div>
      </main>
    </div>
  );
}
