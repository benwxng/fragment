import { AppHeader } from '@/components/app-header';

export default function DetailLoading() {
  return (
    <div className="detail-page">
      <AppHeader />
      <main className="detail-main" id="main-content" aria-busy="true">
        <p className="loading-label">Loading reference…</p>
        <div className="detail-hero loading-block" aria-hidden="true" />
        <div className="loading-detail" aria-hidden="true"><span /><span /><span /></div>
      </main>
    </div>
  );
}
