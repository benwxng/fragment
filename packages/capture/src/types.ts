export type CaptureFacet = 'typography' | 'component' | 'color' | 'layout';

export interface RectSnapshot {
  x: number;
  y: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface ViewportSnapshot {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
  scale: number;
}

export interface SourceSnapshot {
  url: string;
  origin: string;
  title: string;
  faviconUrl: string | null;
  viewport: ViewportSnapshot;
}

export interface SemanticSnapshot {
  tagName: string;
  id: string | null;
  role: string | null;
  accessibleName: string | null;
  language: string | null;
  direction: string;
  headingLevel: number | null;
}

export interface TypographySnapshot {
  fontFamily: string;
  primaryFontFamily: string | null;
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
  fontStyle: string;
  fontStretch: string;
  letterSpacing: string;
  wordSpacing: string;
  textTransform: string;
  textDecoration: string;
  textAlign: string;
  textIndent: string;
  textOverflow: string;
  whiteSpace: string;
  fontFeatureSettings: string;
  fontVariationSettings: string;
  fontOpticalSizing: string;
  fontKerning: string;
  fontSynthesis: string;
  fontLoaded: boolean | null;
}

export interface ColorSnapshot {
  text: string;
  background: string;
  effectiveBackground: string;
  borderTop: string;
  borderRight: string;
  borderBottom: string;
  borderLeft: string;
  outline: string;
  textDecoration: string;
  accent: string;
}

export interface FourSidesSnapshot {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export interface BorderSideSnapshot {
  width: string;
  style: string;
  color: string;
}

export interface BorderSnapshot {
  top: BorderSideSnapshot;
  right: BorderSideSnapshot;
  bottom: BorderSideSnapshot;
  left: BorderSideSnapshot;
}

export interface RadiusSnapshot {
  topLeft: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
}

export interface BoxSnapshot {
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  aspectRatio: string;
  boxSizing: string;
  padding: FourSidesSnapshot;
  margin: FourSidesSnapshot;
  border: BorderSnapshot;
  radius: RadiusSnapshot;
}

export interface LayoutSnapshot {
  display: string;
  position: string;
  inset: FourSidesSnapshot;
  zIndex: string;
  overflowX: string;
  overflowY: string;
  visibility: string;
  float: string;
  clear: string;
  flexDirection: string;
  flexWrap: string;
  flexGrow: string;
  flexShrink: string;
  flexBasis: string;
  alignItems: string;
  alignContent: string;
  alignSelf: string;
  justifyContent: string;
  justifyItems: string;
  justifySelf: string;
  rowGap: string;
  columnGap: string;
  gridTemplateColumns: string;
  gridTemplateRows: string;
  gridAutoFlow: string;
  gridColumn: string;
  gridRow: string;
}

export interface EffectsSnapshot {
  opacity: string;
  boxShadow: string;
  textShadow: string;
  filter: string;
  backdropFilter: string;
  transform: string;
  transformOrigin: string;
  mixBlendMode: string;
  isolation: string;
  outline: string;
  cursor: string;
}

export interface ElementSnapshot {
  selector: string;
  semantic: SemanticSnapshot;
  textExcerpt: string | null;
  rect: RectSnapshot;
  visibleRect: RectSnapshot;
  typography: TypographySnapshot;
  colors: ColorSnapshot;
  box: BoxSnapshot;
  layout: LayoutSnapshot;
  effects: EffectsSnapshot;
}

export interface ScreenshotSnapshot {
  dataUrl: string | null;
  storagePath: string | null;
  mimeType: string;
  width: number;
  height: number;
}

export interface Reference {
  id: string;
  snapshotVersion: 1;
  capturedAt: string;
  facets: CaptureFacet[];
  source: SourceSnapshot;
  element: ElementSnapshot;
  screenshot: ScreenshotSnapshot | null;
  note: string | null;
  tags: string[];
  favorite: boolean;
  collectionId: string | null;
}

export interface InspectViewport {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
  scale: number;
}

/** Overrides make capture deterministic in tests and usable in non-window DOMs. */
export interface InspectOptions {
  document?: Document;
  getComputedStyle?: (element: Element) => CSSStyleDeclaration;
  url?: string;
  title?: string;
  faviconUrl?: string | null;
  viewport?: Partial<InspectViewport>;
  now?: () => Date | string;
  generateId?: () => string;
  fontIsLoaded?: (fontShorthand: string) => boolean | null;
  maxTextLength?: number;
}
