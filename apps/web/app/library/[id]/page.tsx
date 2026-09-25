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
import { isNeonConfigured } from '@/lib/config';
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

function compactBorder(value: string): string {
  if (value === '—' || value === 'Not captured') return '—';
  const [width = value, style] = value.split(/\s+/u);
  if (width === '0px') return '0';
  return style ? `${width} ${style}` : width;
}

function BoxLayer({
  name,
  sides,
  variant,
  children,
}: {
  name: string;
  sides: CaptureView['box']['marginSides'];
  variant: 'margin' | 'border' | 'padding';
  children: ReactNode;
}) {
  const displayValue = variant === 'border' ? compactBorder : (value: string) => value;
  return (
    <div className={`box-model-layer box-model-${variant}`}>
      <span className="box-model-layer-name">{name}</span>
      <span className="box-model-side box-model-top">{displayValue(sides.top)}</span>
      <span className="box-model-side box-model-right">{displayValue(sides.right)}</span>
      <span className="box-model-side box-model-bottom">{displayValue(sides.bottom)}</span>
      <span className="box-model-side box-model-left">{displayValue(sides.left)}</span>
      <div className="box-model-inner">{children}</div>
    </div>
  );
}

function BoxModel({ box }: { box: CaptureView['box'] }) {
  const describeSides = (name: string, sides: CaptureView['box']['marginSides']) =>
    `${name}: top ${sides.top}, right ${sides.right}, bottom ${sides.bottom}, left ${sides.left}`;
  const description = [
    describeSides('Margin', box.marginSides),
    describeSides('Border', box.borderSides),
    describeSides('Padding', box.paddingSides),
    `Content: ${box.width} by ${box.height}`,
  ].join('. ');
  return (
    <section className="property-section property-section-box" aria-labelledby="box-model-title">
      <h2 id="box-model-title">Box model</h2>
      <div className="box-model-figure">
        <div className="box-model-visual" role="img" aria-label={description}>
          <BoxLayer name="Margin" sides={box.marginSides} variant="margin">
            <BoxLayer name="Border" sides={box.borderSides} variant="border">
              <BoxLayer name="Padding" sides={box.paddingSides} variant="padding">
                <div className="box-model-content">
                  <span>Content</span>
                  <strong>{box.width} × {box.height}</strong>
                </div>
              </BoxLayer>
            </BoxLayer>
          </BoxLayer>
        </div>
      </div>
      <dl className="property-list box-model-extras">
        <div className="property-row"><dt>Radius</dt><dd>{box.radius}</dd></div>
        <div className="property-row"><dt>Shadow</dt><dd>{box.shadow}</dd></div>
      </dl>
    </section>
  );
}

function DetailMedia({ capture }: { capture: CaptureView }) {
  const specimen = capture.textExcerpt || 'Aa';
  const specimenPreview = specimen.length > 160 ? `${Array.from(specimen).slice(0, 159).join('')}…` : specimen;
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
        <p className={`detail-specimen${specimen.length > 80 ? ' is-long' : ''}`}>{specimenPreview}</p>
      )}
    </div>
  );
}

export default async function ReferenceDetailPage({ params, searchParams }: DetailProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const configured = isNeonConfigured();
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
          <BoxModel box={capture.box} />
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
            ['Captured text', capture.textExcerpt || 'Not captured'],
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
