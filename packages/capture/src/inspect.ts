import { inferFacets } from './facets';
import { safeTextExcerpt, sanitizeUrl } from './privacy';
import { getStableSelector } from './selector';
import type {
  BorderSideSnapshot,
  ElementSnapshot,
  FourSidesSnapshot,
  InspectOptions,
  RectSnapshot,
  Reference,
  SemanticSnapshot,
  SourceSnapshot,
  ViewportSnapshot,
} from './types';

type StyleReader = (element: Element) => CSSStyleDeclaration;

function css(style: CSSStyleDeclaration, property: string, camelProperty?: keyof CSSStyleDeclaration): string {
  const fromProperty = style.getPropertyValue?.(property)?.trim();
  if (fromProperty) return fromProperty;
  if (!camelProperty) return '';
  const value = style[camelProperty];
  return typeof value === 'string' ? value.trim() : '';
}

function finite(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

function rectSnapshot(rect: DOMRect | DOMRectReadOnly): RectSnapshot {
  const x = finite(rect.x ?? rect.left);
  const y = finite(rect.y ?? rect.top);
  const top = finite(rect.top);
  const left = finite(rect.left);
  const width = finite(rect.width);
  const height = finite(rect.height);
  return {
    x,
    y,
    top,
    right: finite(rect.right),
    bottom: finite(rect.bottom),
    left,
    width,
    height,
  };
}

function visibleRect(rect: RectSnapshot, viewport: ViewportSnapshot): RectSnapshot {
  const left = Math.max(0, Math.min(viewport.width, rect.left));
  const top = Math.max(0, Math.min(viewport.height, rect.top));
  const right = Math.max(left, Math.min(viewport.width, rect.right));
  const bottom = Math.max(top, Math.min(viewport.height, rect.bottom));
  return {
    x: finite(left),
    y: finite(top),
    top: finite(top),
    right: finite(right),
    bottom: finite(bottom),
    left: finite(left),
    width: finite(right - left),
    height: finite(bottom - top),
  };
}

interface Rgba {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function parseChannel(channel: string): number {
  return channel.endsWith('%')
    ? (Number.parseFloat(channel) / 100) * 255
    : Number.parseFloat(channel);
}

function parseAlpha(alpha: string | undefined): number {
  if (!alpha) return 1;
  return alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number.parseFloat(alpha);
}

function parseColor(value: string): Rgba | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'transparent') {
    return { red: 0, green: 0, blue: 0, alpha: 0 };
  }

  const match = normalized.match(/^rgba?\((.*)\)$/u);
  if (!match?.[1]) return null;
  const parts = match[1].replace(/,/gu, ' ').split(/[\s/]+/u).filter(Boolean);
  if (parts.length < 3) return null;
  const red = parseChannel(parts[0] ?? '0');
  const green = parseChannel(parts[1] ?? '0');
  const blue = parseChannel(parts[2] ?? '0');
  const alpha = parseAlpha(parts[3]);
  if (![red, green, blue, alpha].every(Number.isFinite)) return null;
  return {
    red: Math.min(255, Math.max(0, red)),
    green: Math.min(255, Math.max(0, green)),
    blue: Math.min(255, Math.max(0, blue)),
    alpha: Math.min(1, Math.max(0, alpha)),
  };
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 };
  return {
    red:
      (foreground.red * foreground.alpha +
        background.red * background.alpha * (1 - foreground.alpha)) /
      alpha,
    green:
      (foreground.green * foreground.alpha +
        background.green * background.alpha * (1 - foreground.alpha)) /
      alpha,
    blue:
      (foreground.blue * foreground.alpha +
        background.blue * background.alpha * (1 - foreground.alpha)) /
      alpha,
    alpha,
  };
}

function colorString(color: Rgba): string {
  const red = Math.round(color.red);
  const green = Math.round(color.green);
  const blue = Math.round(color.blue);
  if (color.alpha >= 0.999) return `rgb(${red}, ${green}, ${blue})`;
  const alpha = Math.round(color.alpha * 1000) / 1000;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function effectiveBackground(element: Element, readStyle: StyleReader): string {
  let node: Element | null = element;
  let rendered: Rgba = { red: 0, green: 0, blue: 0, alpha: 0 };
  let unparsedFallback = '';

  while (node) {
    const value = css(readStyle(node), 'background-color', 'backgroundColor');
    const parsed = parseColor(value);
    if (parsed) {
      rendered = composite(rendered, parsed);
      if (rendered.alpha >= 0.999) return colorString(rendered);
    } else if (value && value !== 'transparent' && !unparsedFallback) {
      unparsedFallback = value;
    }
    node = node.parentElement;
  }

  if (rendered.alpha > 0) return colorString(composite(rendered, { red: 255, green: 255, blue: 255, alpha: 1 }));
  return unparsedFallback || 'rgb(255, 255, 255)';
}

function sides(style: CSSStyleDeclaration, prefix: string, suffix = ''): FourSidesSnapshot {
  const property = (side: string) => `${prefix}-${side}${suffix ? `-${suffix}` : ''}`;
  return {
    top: css(style, property('top')),
    right: css(style, property('right')),
    bottom: css(style, property('bottom')),
    left: css(style, property('left')),
  };
}

function borderSide(style: CSSStyleDeclaration, side: string): BorderSideSnapshot {
  return {
    width: css(style, `border-${side}-width`),
    style: css(style, `border-${side}-style`),
    color: css(style, `border-${side}-color`),
  };
}

function primaryFamily(fontFamily: string): string | null {
  const first = fontFamily.match(/^\s*(?:(["'])(.*?)\1|([^,]+))/u);
  const value = (first?.[2] ?? first?.[3] ?? '').trim();
  return value || null;
}

function inferredRole(element: Element): string | null {
  const explicit = element.getAttribute('role')?.trim();
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  const roles: Record<string, string> = {
    a: 'link',
    article: 'article',
    aside: 'complementary',
    button: 'button',
    footer: 'contentinfo',
    form: 'form',
    header: 'banner',
    img: 'img',
    main: 'main',
    nav: 'navigation',
    ol: 'list',
    select: 'combobox',
    table: 'table',
    textarea: 'textbox',
    ul: 'list',
  };
  if (/^h[1-6]$/u.test(tag)) return 'heading';
  if (tag === 'input') {
    const type = element.getAttribute('type')?.toLowerCase() ?? 'text';
    if (['button', 'submit', 'reset'].includes(type)) return 'button';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    return 'textbox';
  }
  return roles[tag] ?? null;
}

function accessibleName(element: Element, document: Document, fallback: string | null): string | null {
  const ariaLabel = element.getAttribute('aria-label')?.replace(/\s+/gu, ' ').trim();
  if (ariaLabel) return ariaLabel.slice(0, 160);

  const labelledBy = element.getAttribute('aria-labelledby')?.trim().split(/\s+/u).filter(Boolean) ?? [];
  if (labelledBy.length > 0) {
    const label = labelledBy
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .replace(/\s+/gu, ' ')
      .trim();
    if (label) return label.slice(0, 160);
  }

  const alternate = element.getAttribute('alt')?.trim() || element.getAttribute('title')?.trim();
  if (alternate) return alternate.slice(0, 160);
  return fallback ? Array.from(fallback).slice(0, 160).join('') : null;
}

function semanticSnapshot(
  element: Element,
  document: Document,
  style: CSSStyleDeclaration,
  excerpt: string | null,
): SemanticSnapshot {
  const tagName = element.tagName.toLowerCase();
  const heading = tagName.match(/^h([1-6])$/u);
  return {
    tagName,
    id: element.id.trim() || null,
    role: inferredRole(element),
    accessibleName: accessibleName(element, document, excerpt),
    language: element.getAttribute('lang')?.trim() || document.documentElement?.getAttribute('lang')?.trim() || null,
    direction: css(style, 'direction', 'direction') || element.getAttribute('dir')?.trim() || 'ltr',
    headingLevel: heading?.[1] ? Number.parseInt(heading[1], 10) : null,
  };
}

function viewportSnapshot(element: Element, options: InspectOptions): ViewportSnapshot {
  const document = options.document ?? element.ownerDocument;
  const window = document.defaultView;
  const root = document.documentElement;
  return {
    width: finite(options.viewport?.width ?? window?.innerWidth ?? root?.clientWidth ?? 0),
    height: finite(options.viewport?.height ?? window?.innerHeight ?? root?.clientHeight ?? 0),
    scrollX: finite(options.viewport?.scrollX ?? window?.scrollX ?? 0),
    scrollY: finite(options.viewport?.scrollY ?? window?.scrollY ?? 0),
    devicePixelRatio: finite(options.viewport?.devicePixelRatio ?? window?.devicePixelRatio ?? 1),
    scale: finite(options.viewport?.scale ?? window?.visualViewport?.scale ?? 1),
  };
}

function faviconUrl(document: Document, pageUrl: string, explicit: string | null | undefined): string | null {
  if (explicit !== undefined) return explicit ? sanitizeUrl(explicit, pageUrl) || null : null;
  const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"][href]');
  const href = icon?.href || icon?.getAttribute('href') || '';
  return href ? sanitizeUrl(href, pageUrl) || null : null;
}

function sourceSnapshot(element: Element, options: InspectOptions, viewport: ViewportSnapshot): SourceSnapshot {
  const document = options.document ?? element.ownerDocument;
  const rawUrl = options.url ?? document.location?.href ?? '';
  const url = sanitizeUrl(rawUrl);
  let origin = '';
  try {
    origin = url ? new URL(url).origin : '';
    if (origin === 'null') origin = '';
  } catch {
    origin = '';
  }
  return {
    url,
    origin,
    title: (options.title ?? document.title ?? '').trim().slice(0, 500),
    faviconUrl: faviconUrl(document, rawUrl, options.faviconUrl),
    viewport,
  };
}

function captureElementSnapshot(
  element: Element,
  document: Document,
  readStyle: StyleReader,
  viewport: ViewportSnapshot,
  options: InspectOptions,
): ElementSnapshot {
  const style = readStyle(element);
  const rect = rectSnapshot(element.getBoundingClientRect());
  const textExcerpt = safeTextExcerpt(element, options.maxTextLength ?? 280);
  const fontFamily = css(style, 'font-family', 'fontFamily');
  const fontSize = css(style, 'font-size', 'fontSize');
  const fontWeight = css(style, 'font-weight', 'fontWeight');
  const fontStyle = css(style, 'font-style', 'fontStyle');
  const fontShorthand = `${fontStyle || 'normal'} ${fontWeight || '400'} ${fontSize || '16px'} ${fontFamily}`.trim();
  const defaultFontStatus = (): boolean | null => {
    try {
      return document.fonts?.check(fontShorthand) ?? null;
    } catch {
      return null;
    }
  };

  return {
    selector: getStableSelector(element, document),
    semantic: semanticSnapshot(element, document, style, textExcerpt),
    textExcerpt,
    rect,
    visibleRect: visibleRect(rect, viewport),
    typography: {
      fontFamily,
      primaryFontFamily: primaryFamily(fontFamily),
      fontSize,
      lineHeight: css(style, 'line-height', 'lineHeight'),
      fontWeight,
      fontStyle,
      fontStretch: css(style, 'font-stretch', 'fontStretch'),
      letterSpacing: css(style, 'letter-spacing', 'letterSpacing'),
      wordSpacing: css(style, 'word-spacing', 'wordSpacing'),
      textTransform: css(style, 'text-transform', 'textTransform'),
      textDecoration: css(style, 'text-decoration', 'textDecoration'),
      textAlign: css(style, 'text-align', 'textAlign'),
      textIndent: css(style, 'text-indent', 'textIndent'),
      textOverflow: css(style, 'text-overflow', 'textOverflow'),
      whiteSpace: css(style, 'white-space', 'whiteSpace'),
      fontFeatureSettings: css(style, 'font-feature-settings', 'fontFeatureSettings'),
      fontVariationSettings: css(style, 'font-variation-settings', 'fontVariationSettings'),
      fontOpticalSizing: css(style, 'font-optical-sizing', 'fontOpticalSizing'),
      fontKerning: css(style, 'font-kerning', 'fontKerning'),
      fontSynthesis: css(style, 'font-synthesis', 'fontSynthesis'),
      fontLoaded: options.fontIsLoaded ? options.fontIsLoaded(fontShorthand) : defaultFontStatus(),
    },
    colors: {
      text: css(style, 'color', 'color'),
      background: css(style, 'background-color', 'backgroundColor'),
      effectiveBackground: effectiveBackground(element, readStyle),
      borderTop: css(style, 'border-top-color', 'borderTopColor'),
      borderRight: css(style, 'border-right-color', 'borderRightColor'),
      borderBottom: css(style, 'border-bottom-color', 'borderBottomColor'),
      borderLeft: css(style, 'border-left-color', 'borderLeftColor'),
      outline: css(style, 'outline-color', 'outlineColor'),
      textDecoration: css(style, 'text-decoration-color', 'textDecorationColor'),
      accent: css(style, 'accent-color', 'accentColor'),
    },
    box: {
      width: css(style, 'width', 'width'),
      height: css(style, 'height', 'height'),
      minWidth: css(style, 'min-width', 'minWidth'),
      minHeight: css(style, 'min-height', 'minHeight'),
      maxWidth: css(style, 'max-width', 'maxWidth'),
      maxHeight: css(style, 'max-height', 'maxHeight'),
      aspectRatio: css(style, 'aspect-ratio', 'aspectRatio'),
      boxSizing: css(style, 'box-sizing', 'boxSizing'),
      padding: sides(style, 'padding'),
      margin: sides(style, 'margin'),
      border: {
        top: borderSide(style, 'top'),
        right: borderSide(style, 'right'),
        bottom: borderSide(style, 'bottom'),
        left: borderSide(style, 'left'),
      },
      radius: {
        topLeft: css(style, 'border-top-left-radius', 'borderTopLeftRadius'),
        topRight: css(style, 'border-top-right-radius', 'borderTopRightRadius'),
        bottomRight: css(style, 'border-bottom-right-radius', 'borderBottomRightRadius'),
        bottomLeft: css(style, 'border-bottom-left-radius', 'borderBottomLeftRadius'),
      },
    },
    layout: {
      display: css(style, 'display', 'display'),
      position: css(style, 'position', 'position'),
      inset: {
        top: css(style, 'top', 'top'),
        right: css(style, 'right', 'right'),
        bottom: css(style, 'bottom', 'bottom'),
        left: css(style, 'left', 'left'),
      },
      zIndex: css(style, 'z-index', 'zIndex'),
      overflowX: css(style, 'overflow-x', 'overflowX'),
      overflowY: css(style, 'overflow-y', 'overflowY'),
      visibility: css(style, 'visibility', 'visibility'),
      float: css(style, 'float', 'cssFloat'),
      clear: css(style, 'clear', 'clear'),
      flexDirection: css(style, 'flex-direction', 'flexDirection'),
      flexWrap: css(style, 'flex-wrap', 'flexWrap'),
      flexGrow: css(style, 'flex-grow', 'flexGrow'),
      flexShrink: css(style, 'flex-shrink', 'flexShrink'),
      flexBasis: css(style, 'flex-basis', 'flexBasis'),
      alignItems: css(style, 'align-items', 'alignItems'),
      alignContent: css(style, 'align-content', 'alignContent'),
      alignSelf: css(style, 'align-self', 'alignSelf'),
      justifyContent: css(style, 'justify-content', 'justifyContent'),
      justifyItems: css(style, 'justify-items', 'justifyItems'),
      justifySelf: css(style, 'justify-self', 'justifySelf'),
      rowGap: css(style, 'row-gap', 'rowGap'),
      columnGap: css(style, 'column-gap', 'columnGap'),
      gridTemplateColumns: css(style, 'grid-template-columns', 'gridTemplateColumns'),
      gridTemplateRows: css(style, 'grid-template-rows', 'gridTemplateRows'),
      gridAutoFlow: css(style, 'grid-auto-flow', 'gridAutoFlow'),
      gridColumn: css(style, 'grid-column', 'gridColumn'),
      gridRow: css(style, 'grid-row', 'gridRow'),
    },
    effects: {
      opacity: css(style, 'opacity', 'opacity'),
      boxShadow: css(style, 'box-shadow', 'boxShadow'),
      textShadow: css(style, 'text-shadow', 'textShadow'),
      filter: css(style, 'filter', 'filter'),
      backdropFilter: css(style, 'backdrop-filter', 'backdropFilter'),
      transform: css(style, 'transform', 'transform'),
      transformOrigin: css(style, 'transform-origin', 'transformOrigin'),
      mixBlendMode: css(style, 'mix-blend-mode', 'mixBlendMode'),
      isolation: css(style, 'isolation', 'isolation'),
      outline: css(style, 'outline', 'outline'),
      cursor: css(style, 'cursor', 'cursor'),
    },
  };
}

function capturedAt(options: InspectOptions): string {
  const value = options.now?.() ?? new Date();
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new TypeError('InspectOptions.now returned an invalid date');
  return date.toISOString();
}

function generatedId(options: InspectOptions): string {
  if (options.generateId) return options.generateId();
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();

  // `captures.id` is a Postgres uuid. Some inspected HTTP pages do not expose
  // randomUUID(), so keep the fallback contract-compatible instead of creating
  // a local reference that can never sync.
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Captures a versioned, JSON-serializable reference from the element's computed state. */
export function inspectElement(element: Element, options: InspectOptions = {}): Reference {
  const document = options.document ?? element.ownerDocument;
  const window = document.defaultView;
  const readStyle =
    options.getComputedStyle ??
    (window ? ((target: Element) => window.getComputedStyle(target)) : undefined);
  if (!readStyle) {
    throw new TypeError('inspectElement requires getComputedStyle in this DOM environment');
  }

  const timestamp = capturedAt(options);
  const viewport = viewportSnapshot(element, options);
  const snapshot = captureElementSnapshot(element, document, readStyle, viewport, options);
  return {
    id: generatedId(options),
    snapshotVersion: 1,
    capturedAt: timestamp,
    facets: inferFacets(snapshot),
    source: sourceSnapshot(element, options, viewport),
    element: snapshot,
    screenshot: null,
    note: null,
    tags: [],
    favorite: false,
    collectionId: null,
  };
}
