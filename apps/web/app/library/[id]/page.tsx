import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';

import { AppHeader } from '@/components/app-header';
import { ConfigurationScreen } from '@/components/configuration';
import { DeleteCapture } from '@/components/delete-capture';
import { ArrowIcon, ExternalIcon } from '@/components/icons';
import { formatCaptureDate, isCaptureId, safeSourceUrl, type CaptureView } from '@/lib/captures';
import { isSupabaseConfigured } from '@/lib/config';
import { getCapture } from '@/lib/data';
import { demoCaptures } from '@/lib/demo';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string }>;
};

export async function generateMetadata({ params }: DetailProps): Promise<Metadata> {
  const { id } = await params;
  const demoCapture = demoCaptures.find((capture) => capture.id === id);
  return { title: demoCapture?.elementLabel ?? 'Reference detail' };
}

function PropertySection({ title, rows }: { title: string; rows: readonly [string, ReactNode][] }) {
  return (
    <section className="property-section">
      <h2>{title}</h2>
      <dl className="property-list">
        {rows.map(([label, value]) => (
          <div className="property-row" key={label}>
            <dt>{label}</dt>
            <dd>{value || 'Not captured'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ColorValue({ value }: { value: string }) {
  const valid = /^(?:rgb|hsl|oklch|#[0-9a-f]{3,8})/iu.test(value);
  return (
    <span className="color-value">
      {valid ? <i aria-hidden="true" style={{ backgroundColor: value }} /> : null}
      <span>{value}</span>
    </span>
  );
}

function DetailMedia({ capture }: { capture: CaptureView }) {
  const style = {
    '--specimen-color': capture.colors.text.startsWith('rgb') ? capture.colors.text : '#181916',
    '--specimen-bg': capture.colors.background.startsWith('rgb') ? capture.colors.background : '#f5f4ef',
    fontFamily: capture.fontFamily,
  } as CSSProperties;
  return (
    <div className="detail-hero" style={style}>
      {capture.screenshotUrl ? (
        <Image
          alt={`Captured ${capture.elementLabel} on ${capture.sourceHost}`}
          src={capture.screenshotUrl}
          fill
          sizes="(max-width: 1100px) 100vw, 1100px"
          unoptimized
          priority
        />
      ) : (
        <p className="detail-specimen">{capture.textExcerpt || 'Aa'}</p>
      )}
      <span className="media-meta">{capture.screenshotUrl ? 'Captured preview' : 'Type specimen'}</span>
    </div>
  );
}

export default async function ReferenceDetailPage({ params, searchParams }: DetailProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const configured = isSupabaseConfigured();
  const demo = query.demo === '1' && !configured;
  if (!demo && !isCaptureId(id)) notFound();
  if (!configured && !demo) return <ConfigurationScreen />;
  const result = demo
    ? { capture: demoCaptures.find((candidate) => candidate.id === id) ?? null, email: 'Preview mode' }
    : await getCapture(id);
  if (!result.capture) notFound();
  const capture = result.capture;
  const source = safeSourceUrl(capture.sourceUrl);

  return (
    <div className="detail-page">
      <AppHeader email={result.email} canSignOut={!demo} />
      <main className="detail-main" id="main-content">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link href={demo ? '/library?demo=1' : '/library'}>Library</Link>
          <ArrowIcon />
          <span aria-current="page">Reference</span>
        </nav>
        <DetailMedia capture={capture} />
        <header className="detail-header">
          <p className="detail-meta"><bdi>{capture.sourceHost}</bdi><span aria-hidden="true">·</span>{formatCaptureDate(capture.capturedAt)}</p>
          <h1>{capture.elementLabel}</h1>
          <p>{capture.pageTitle}</p>
          <div className="facet-list" aria-label="Captured facets">
            {capture.facets.map((facet) => <span key={facet}>{facet}</span>)}
          </div>
        </header>

        {capture.note ? (
          <aside className="reference-note">
            <span>Note</span>
            <p>{capture.note}</p>
          </aside>
        ) : null}

        <div className="property-grid">
          <PropertySection title="Typography" rows={[
            ['Typeface', capture.typography.fontFamily],
            ['Size', capture.typography.size],
            ['Weight', capture.typography.weight],
            ['Line height', capture.typography.lineHeight],
            ['Letter spacing', capture.typography.letterSpacing],
            ['Style', capture.typography.style],
            ['Text color', <ColorValue value={capture.colors.text} key="text-color" />],
          ]} />
          <PropertySection title="Box" rows={[
            ['Width', capture.box.width],
            ['Height', capture.box.height],
            ['Padding', capture.box.padding],
            ['Margin', capture.box.margin],
            ['Border', capture.box.border],
            ['Radius', capture.box.radius],
            ['Shadow', capture.box.shadow],
          ]} />
          <PropertySection title="Layout" rows={[
            ['Display', capture.layout.display],
            ['Position', capture.layout.position],
            ['Gap', capture.layout.gap],
            ['Alignment', capture.layout.align],
            ['Justification', capture.layout.justify],
            ['Background', <ColorValue value={capture.colors.background} key="background-color" />],
          ]} />
          <PropertySection title="Context" rows={[
            ['Role', capture.role],
            ['Selector', capture.selector],
            ['Snapshot', `Version ${capture.snapshotVersion}`],
            ['Source', capture.sourceHost],
          ]} />
        </div>

        <footer className="detail-footer">
          {source ? (
            <a className="button button-primary" href={source} target="_blank" rel="noopener noreferrer">
              Open source page <ExternalIcon />
            </a>
          ) : null}
          <DeleteCapture captureId={capture.id} disabled={demo} />
        </footer>
      </main>
    </div>
  );
}
