import { conciseElementLabel } from '@refer/capture/presentation';
export { conciseElementLabel, formatCaptureDate } from '@refer/capture/presentation';
import type { CaptureFacet, Reference } from '@refer/capture';
import type { CaptureRow } from '@refer/database';

export interface CaptureView {
  id: string;
  facets: CaptureFacet[];
  sourceUrl: string;
  sourceHost: string;
  pageTitle: string;
  elementLabel: string;
  textExcerpt: string;
  fontFamily: string;
  screenshotPath: string | null;
  screenshotUrl: string | null;
  screenshotWidth: number;
  screenshotHeight: number;
  capturedAt: string;
  note: string;
  typography: {
    fontFamily: string;
    size: string;
    weight: string;
    lineHeight: string;
    letterSpacing: string;
    style: string;
  };
  colors: {
    text: string;
    background: string;
  };
  box: {
    width: string;
    height: string;
    padding: string;
    margin: string;
    border: string;
    radius: string;
    shadow: string;
    marginSides: BoxSides;
    paddingSides: BoxSides;
    borderSides: BoxSides;
  };
  layout: {
    display: string;
    position: string;
    gap: string;
    align: string;
    justify: string;
  };
  selector: string;
  role: string;
  snapshotVersion: number;
}

export interface BoxSides {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

type UnknownRecord = Record<string, unknown>;

const CAPTURE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function isCaptureId(value: string): boolean {
  return CAPTURE_ID_PATTERN.test(value);
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    const record = asRecord(current);
    if (!record || !(segment in record)) return undefined;
    current = record[segment];
  }
  return current;
}

function firstString(value: unknown, paths: readonly (readonly string[])[], fallback = ''): string {
  for (const path of paths) {
    const candidate = valueAt(value, path);
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number') return String(candidate);
  }
  return fallback;
}

function firstNumber(value: unknown, paths: readonly (readonly string[])[], fallback: number): number {
  for (const path of paths) {
    const candidate = valueAt(value, path);
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  return fallback;
}

function hostFrom(sourceOrigin: string | null, sourceUrl: string): string {
  const candidate = sourceOrigin || sourceUrl;
  if (!candidate) return 'Saved reference';
  try {
    return new URL(candidate).hostname.replace(/^www\./u, '');
  } catch {
    return candidate;
  }
}

function summarizeSides(value: unknown): string {
  const { top, right, bottom, left } = normalizeSides(value);
  if (top === right && top === bottom && top === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  return `${top} ${right} ${bottom} ${left}`;
}

function shorthandSides(value: string): BoxSides {
  const parts = value.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return { top: '—', right: '—', bottom: '—', left: '—' };
  const top = parts[0] ?? '—';
  const second = parts[1] ?? top;
  const third = parts[2] ?? top;
  const fourth = parts[3] ?? second;
  if (parts.length === 2) return { top, right: second, bottom: top, left: second };
  if (parts.length === 3) return { top, right: second, bottom: third, left: second };
  return { top, right: second, bottom: third, left: fourth };
}

function normalizeSides(value: unknown): BoxSides {
  const record = asRecord(value);
  if (!record) return typeof value === 'string' && value.trim()
    ? shorthandSides(value)
    : { top: '—', right: '—', bottom: '—', left: '—' };
  return {
    top: String(record.top ?? record.topLeft ?? '—'),
    right: String(record.right ?? record.topRight ?? '—'),
    bottom: String(record.bottom ?? record.bottomRight ?? '—'),
    left: String(record.left ?? record.bottomLeft ?? '—'),
  };
}

function normalizeBorderSides(value: unknown): BoxSides {
  const record = asRecord(value);
  if (!record) {
    const fallback = typeof value === 'string' && value.trim() ? value : '—';
    return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  }
  const side = (name: keyof BoxSides): string => {
    const border = asRecord(record[name]);
    return border ? [border.width, border.style, border.color].filter(Boolean).join(' ') || '—' : '—';
  };
  return { top: side('top'), right: side('right'), bottom: side('bottom'), left: side('left') };
}

function summarizeBorder(value: unknown): string {
  const record = asRecord(value);
  if (!record) return typeof value === 'string' && value ? value : 'Not captured';
  const top = asRecord(record.top);
  if (!top) return 'Not captured';
  return [top.width, top.style, top.color].filter(Boolean).join(' ') || 'Not captured';
}

function safeFacet(value: string): value is CaptureFacet {
  return value === 'typography' || value === 'component' || value === 'color' || value === 'layout';
}

export function normalizeCapture(row: CaptureRow, screenshotUrl: string | null = null): CaptureView {
  const snapshot = row.snapshot as Partial<Reference> | unknown;
  const sourceUrl = row.source_url ?? firstString(snapshot, [['source', 'url']]);
  const textExcerpt = firstString(snapshot, [['element', 'textExcerpt'], ['textExcerpt']]);
  const role = firstString(snapshot, [['element', 'semantic', 'role'], ['element', 'semantic', 'tagName']]);
  const tagName = firstString(snapshot, [['element', 'semantic', 'tagName']]);
  const rawElementLabel = row.element_label
    ?? firstString(snapshot, [['element', 'semantic', 'accessibleName']], textExcerpt || (role ? `${role} element` : 'Saved element'));
  const elementLabel = conciseElementLabel(rawElementLabel, role, tagName);
  const fontFamily = row.primary_font_family
    ?? firstString(snapshot, [
      ['element', 'typography', 'primaryFontFamily'],
      ['element', 'typography', 'fontFamily'],
      ['typography', 'primaryFontFamily'],
    ], 'Unknown typeface');

  return {
    id: row.id,
    facets: (row.facets ?? []).filter(safeFacet),
    sourceUrl,
    sourceHost: hostFrom(row.source_origin, sourceUrl),
    pageTitle: row.page_title ?? firstString(snapshot, [['source', 'title']], 'Untitled page'),
    elementLabel,
    textExcerpt,
    fontFamily: fontFamily.split(',')[0]?.replace(/["']/gu, '').trim() || 'Unknown typeface',
    screenshotPath: row.screenshot_path,
    screenshotUrl,
    screenshotWidth: firstNumber(snapshot, [['screenshot', 'width']], 4),
    screenshotHeight: firstNumber(snapshot, [['screenshot', 'height']], 3),
    capturedAt: row.captured_at,
    note: row.note ?? '',
    typography: {
      fontFamily,
      size: firstString(snapshot, [['element', 'typography', 'fontSize']], 'Not captured'),
      weight: firstString(snapshot, [['element', 'typography', 'fontWeight']], 'Not captured'),
      lineHeight: firstString(snapshot, [['element', 'typography', 'lineHeight']], 'Not captured'),
      letterSpacing: firstString(snapshot, [['element', 'typography', 'letterSpacing']], 'Not captured'),
      style: firstString(snapshot, [['element', 'typography', 'fontStyle']], 'Not captured'),
    },
    colors: {
      text: row.text_color ?? firstString(snapshot, [['element', 'colors', 'text']], 'Not captured'),
      background: row.background_color
        ?? firstString(snapshot, [['element', 'colors', 'effectiveBackground'], ['element', 'colors', 'background']], 'Not captured'),
    },
    box: {
      width: firstString(snapshot, [['element', 'box', 'width']], 'Not captured'),
      height: firstString(snapshot, [['element', 'box', 'height']], 'Not captured'),
      padding: summarizeSides(valueAt(snapshot, ['element', 'box', 'padding'])),
      margin: summarizeSides(valueAt(snapshot, ['element', 'box', 'margin'])),
      border: summarizeBorder(valueAt(snapshot, ['element', 'box', 'border'])),
      radius: summarizeSides(valueAt(snapshot, ['element', 'box', 'radius'])),
      shadow: firstString(snapshot, [['element', 'effects', 'boxShadow']], 'Not captured'),
      marginSides: normalizeSides(valueAt(snapshot, ['element', 'box', 'margin'])),
      paddingSides: normalizeSides(valueAt(snapshot, ['element', 'box', 'padding'])),
      borderSides: normalizeBorderSides(valueAt(snapshot, ['element', 'box', 'border'])),
    },
    layout: {
      display: firstString(snapshot, [['element', 'layout', 'display']], 'Not captured'),
      position: firstString(snapshot, [['element', 'layout', 'position']], 'Not captured'),
      gap: firstString(snapshot, [['element', 'layout', 'gap'], ['element', 'layout', 'rowGap']], 'Not captured'),
      align: firstString(snapshot, [['element', 'layout', 'alignItems']], 'Not captured'),
      justify: firstString(snapshot, [['element', 'layout', 'justifyContent']], 'Not captured'),
    },
    selector: firstString(snapshot, [['element', 'selector']], 'Not captured'),
    role: role || 'Not captured',
    snapshotVersion: row.snapshot_version ?? 1,
  };
}

export function captureMatches(capture: CaptureView, query: string, facet: string): boolean {
  if (facet !== 'all' && !capture.facets.includes(facet as CaptureFacet)) return false;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return [
    capture.elementLabel,
    capture.pageTitle,
    capture.sourceHost,
    capture.fontFamily,
    capture.textExcerpt,
    capture.note,
    ...capture.facets,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
}

export function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
