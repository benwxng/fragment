import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import { formatCaptureDate, type CaptureView } from '@/lib/captures';

interface CaptureCardProps {
  capture: CaptureView;
  demo?: boolean;
}

export function CaptureCard({ capture, demo = false }: CaptureCardProps) {
  const href = `/library/${encodeURIComponent(capture.id)}${demo ? '?demo=1' : ''}`;
  const label = capture.elementLabel.length > 80 ? `${capture.elementLabel.slice(0, 79)}…` : capture.elementLabel;
  const previewId = `font-preview-${capture.id.replace(/[^a-zA-Z0-9_-]/gu, '')}`;
  const previewText = capture.textExcerpt || 'Aa Bb Cc 0123';
  const specimenStyle = {
    '--specimen-color': capture.colors.text.startsWith('rgb') ? capture.colors.text : '#181916',
    '--specimen-bg': capture.colors.background.startsWith('rgb') ? capture.colors.background : '#fcfbf8',
    fontFamily: capture.fontFamily,
  } as CSSProperties;

  return (
    <article className="reference-card">
      <Link className="card-open" href={href} aria-label={`View ${label} from ${capture.sourceHost}`}>
        <span className="card-media" style={specimenStyle}>
          {capture.screenshotUrl ? (
            <Image
              alt={`Captured ${capture.elementLabel} on ${capture.sourceHost}`}
              src={capture.screenshotUrl}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 25vw"
              unoptimized
            />
          ) : (
            <span className="card-specimen">{capture.textExcerpt || 'Aa'}</span>
          )}
          <span className="media-meta">{capture.screenshotUrl ? 'Captured preview' : 'Type specimen'}</span>
        </span>
        <span className="card-body">
          <span className="card-meta">
            <bdi>{capture.sourceHost}</bdi>
            <span>{formatCaptureDate(capture.capturedAt)}</span>
          </span>
          <span className="card-title">{capture.elementLabel}</span>
        </span>
      </Link>
      <span className="card-detail">
        <span className="font-preview-wrap">
          <button
            className="font-preview-trigger"
            type="button"
            aria-label={`Preview ${capture.fontFamily} from ${capture.elementLabel}`}
            aria-describedby={previewId}
          >
            {capture.fontFamily}
          </button>
        </span>
        <span className="font-preview-popover" id={previewId} role="tooltip">
          {capture.screenshotUrl ? (
            <span className="font-preview-image">
              <Image alt="" src={capture.screenshotUrl} fill sizes="19rem" unoptimized />
            </span>
          ) : (
            <span
              className="font-preview-sample"
              style={{
                ...specimenStyle,
                fontFamily: capture.typography.fontFamily,
                fontWeight: capture.typography.weight,
                fontStyle: capture.typography.style,
                letterSpacing: capture.typography.letterSpacing,
              }}
            >
              {previewText}
            </span>
          )}
          <span className="font-preview-caption">
            <strong>{capture.fontFamily}</strong>
            <span>{capture.screenshotUrl ? 'Captured preview · Original rendering' : 'Live specimen · Browser fallback may apply'}</span>
          </span>
        </span>
      </span>
    </article>
  );
}
