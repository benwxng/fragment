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
  const record = asRecord(value);
  if (!record) return typeof value === 'string' && value ? value : 'Not captured';
  const top = String(record.top ?? '—');
  const right = String(record.right ?? '—');
  const bottom = String(record.bottom ?? '—');
  const left = String(record.left ?? '—');
  if (top === right && top === bottom && top === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  return `${top} ${right} ${bottom} ${left}`;
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

const semanticNames: Record<string, string> = {
  article: 'Article',
  button: 'Button',
  checkbox: 'Checkbox',
  complementary: 'Sidebar',
  contentinfo: 'Footer',
  form: 'Form',
  heading: 'Heading',
  img: 'Image',
  link: 'Link',
  list: 'List',
  main: 'Main content',
  navigation: 'Navigation',
  radio: 'Radio button',
  textbox: 'Text field',
  aside: 'Sidebar',
  div: 'Container',
  footer: 'Footer',
  header: 'Header',
  input: 'Input',
  li: 'List item',
  nav: 'Navigation',
  ol: 'List',
  p: 'Text block',
  section: 'Section',
  select: 'Select',
  span: 'Text',
  table: 'Table',
  textarea: 'Text field',
  ul: 'List',
};

/** Keep reference names scannable; the full captured copy remains in textExcerpt. */
export function conciseElementLabel(label: string, role: string, tagName = ''): string {
  const cleanLabel = label.replace(/\s+/gu, ' ').trim();
  const words = cleanLabel.split(/\s+/u).filter(Boolean);
  if (cleanLabel && cleanLabel.length <= 40 && words.length <= 6) return cleanLabel;
  if (/^h[1-6]$/u.test(tagName)) return 'Heading';
  return semanticNames[role.toLocaleLowerCase()]
    ?? semanticNames[tagName.toLocaleLowerCase()]
    ?? 'Saved element';
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

export function formatCaptureDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}

export function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
