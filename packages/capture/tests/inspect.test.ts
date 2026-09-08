import { afterEach, describe, expect, it, vi } from 'vitest';

import { inspectElement } from '../src';

class FakeElement {
  readonly tagName: string;
  readonly id: string;
  readonly classList: string[] = [];
  readonly attributes: Record<string, string>;
  readonly children: FakeElement[] = [];
  readonly parentElement: FakeElement | null;
  ownerDocument!: FakeDocument;
  textContent: string | null;

  constructor(options: {
    tagName?: string;
    id?: string;
    attributes?: Record<string, string>;
    parent?: FakeElement;
    text?: string;
  } = {}) {
    this.tagName = options.tagName ?? 'DIV';
    this.id = options.id ?? '';
    this.attributes = options.attributes ?? {};
    this.parentElement = options.parent ?? null;
    this.textContent = options.text ?? null;
    this.parentElement?.children.push(this);
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  getBoundingClientRect(): DOMRect {
    return {
      x: -10.25,
      y: 20.5,
      top: 20.5,
      right: 310.25,
      bottom: 220.75,
      left: -10.25,
      width: 320.5,
      height: 200.25,
      toJSON: () => ({}),
    } as DOMRect;
  }
}

class FakeDocument {
  readonly defaultView = null;
  readonly title = 'Private query is not copied';
  readonly location = { href: 'https://example.com/components/card?session=secret#demo' };
  readonly fonts = { check: () => true };
  readonly documentElement: FakeElement;
  private readonly elements: FakeElement[];

  constructor(elements: FakeElement[], root: FakeElement) {
    this.elements = elements;
    this.documentElement = root;
    for (const element of elements) element.ownerDocument = this;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector.startsWith('#')) {
      return this.elements.filter((element) => `#${element.id}` === selector);
    }
    return [];
  }

  querySelector(): null {
    return null;
  }

  getElementById(id: string): FakeElement | null {
    return this.elements.find((element) => element.id === id) ?? null;
  }
}

function style(properties: Record<string, string>): CSSStyleDeclaration {
  return {
    getPropertyValue(property: string) {
      return properties[property] ?? '';
    },
  } as CSSStyleDeclaration;
}

describe('inspectElement', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures a complete, versioned, JSON-safe design reference', () => {
    const html = new FakeElement({ tagName: 'HTML', attributes: { lang: 'en' } });
    const body = new FakeElement({ tagName: 'BODY', parent: html });
    const target = new FakeElement({
      tagName: 'ARTICLE',
      id: 'feature-card',
      parent: body,
      text: '  Designed   with care ',
      attributes: { 'aria-label': 'Feature card' },
    });
    const document = new FakeDocument([html, body, target], html);
    const styles = new Map<FakeElement, CSSStyleDeclaration>([
      [html, style({ 'background-color': 'transparent' })],
      [body, style({ 'background-color': 'rgb(0, 0, 255)' })],
      [
        target,
        style({
          'font-family': '"Inter Variable", system-ui, sans-serif',
          'font-size': '18px',
          'font-weight': '550',
          'font-style': 'normal',
          'font-stretch': '100%',
          'line-height': '27px',
          'letter-spacing': '-0.2px',
          'word-spacing': '1px',
          color: 'rgb(250, 250, 250)',
          'background-color': 'rgba(255, 0, 0, 0.5)',
          display: 'grid',
          position: 'relative',
          width: '320.5px',
          height: '200.25px',
          'box-sizing': 'border-box',
          'padding-top': '16px',
          'padding-right': '20px',
          'padding-bottom': '16px',
          'padding-left': '20px',
          'margin-top': '8px',
          'margin-right': '0px',
          'margin-bottom': '12px',
          'margin-left': '0px',
          'border-top-width': '1px',
          'border-top-style': 'solid',
          'border-top-color': 'rgb(10, 20, 30)',
          'border-top-left-radius': '12px',
          'border-top-right-radius': '12px',
          'border-bottom-right-radius': '12px',
          'border-bottom-left-radius': '12px',
          'box-shadow': '0 8px 30px rgba(0, 0, 0, 0.2)',
          opacity: '0.95',
          'grid-template-columns': '1fr 2fr',
          'row-gap': '12px',
          'column-gap': '16px',
          top: '4px',
          right: 'auto',
          bottom: 'auto',
          left: '0px',
          direction: 'ltr',
        }),
      ],
    ]);

    const reference = inspectElement(target as unknown as Element, {
      document: document as unknown as Document,
      getComputedStyle: (element) => styles.get(element as unknown as FakeElement) ?? style({}),
      viewport: {
        width: 300,
        height: 180,
        scrollX: 12,
        scrollY: 40,
        devicePixelRatio: 2,
        scale: 1.25,
      },
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      generateId: () => 'ref_test',
    });

    expect(reference).toMatchObject({
      id: 'ref_test',
      snapshotVersion: 1,
      capturedAt: '2026-09-07T12:00:00.000Z',
      facets: ['typography', 'component', 'color', 'layout'],
      source: {
        url: 'https://example.com/components/card',
        origin: 'https://example.com',
        title: 'Private query is not copied',
        viewport: { width: 300, height: 180, devicePixelRatio: 2, scale: 1.25 },
      },
      element: {
        selector: '#feature-card',
        textExcerpt: 'Designed with care',
        semantic: {
          tagName: 'article',
          role: 'article',
          accessibleName: 'Feature card',
          language: 'en',
        },
        rect: { left: -10.25, width: 320.5 },
        visibleRect: { left: 0, right: 300, top: 20.5, bottom: 180, width: 300, height: 159.5 },
        typography: {
          primaryFontFamily: 'Inter Variable',
          fontSize: '18px',
          lineHeight: '27px',
          fontLoaded: true,
        },
        colors: {
          text: 'rgb(250, 250, 250)',
          background: 'rgba(255, 0, 0, 0.5)',
          effectiveBackground: 'rgb(128, 0, 128)',
        },
        box: {
          padding: { top: '16px', right: '20px', bottom: '16px', left: '20px' },
          margin: { top: '8px', right: '0px', bottom: '12px', left: '0px' },
          border: { top: { width: '1px', style: 'solid', color: 'rgb(10, 20, 30)' } },
          radius: { topLeft: '12px' },
        },
        layout: {
          display: 'grid',
          gridTemplateColumns: '1fr 2fr',
          rowGap: '12px',
          columnGap: '16px',
          inset: { top: '4px', right: 'auto', bottom: 'auto', left: '0px' },
        },
        effects: {
          opacity: '0.95',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)',
        },
      },
      screenshot: null,
      note: null,
      tags: [],
      favorite: false,
      collectionId: null,
    });

    const json = JSON.stringify(reference);
    expect(json).not.toContain('secret');
    expect(json).not.toContain('undefined');
    expect(JSON.parse(json)).toEqual(reference);
  });

  it('never captures a password field value or text content', () => {
    const html = new FakeElement({ tagName: 'HTML' });
    const password = new FakeElement({
      tagName: 'INPUT',
      id: 'password',
      parent: html,
      text: 'hidden password fallback',
      attributes: { type: 'password', 'aria-label': 'Account password' },
    });
    Object.defineProperty(password, 'value', {
      get: () => {
        throw new Error('password value read');
      },
    });
    const document = new FakeDocument([html, password], html);
    const reference = inspectElement(password as unknown as Element, {
      document: document as unknown as Document,
      getComputedStyle: () => style({ 'font-family': 'sans-serif', color: 'black' }),
      viewport: { width: 100, height: 100 },
      now: () => '2026-09-07T12:00:00Z',
      generateId: () => 'password_test',
    });
    expect(reference.element.textExcerpt).toBeNull();
    expect(reference.element.semantic.accessibleName).toBe('Account password');
    expect(JSON.stringify(reference)).not.toContain('hidden password fallback');
  });

  it('uses a database-compatible UUID when randomUUID is unavailable', () => {
    const html = new FakeElement({ tagName: 'HTML' });
    const target = new FakeElement({ parent: html });
    const document = new FakeDocument([html, target], html);
    let nextByte = 0;
    vi.stubGlobal('crypto', {
      getRandomValues(bytes: Uint8Array) {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = nextByte;
          nextByte += 1;
        }
        return bytes;
      },
    });

    const reference = inspectElement(target as unknown as Element, {
      document: document as unknown as Document,
      getComputedStyle: () => style({ 'font-family': 'sans-serif' }),
      viewport: { width: 100, height: 100 },
    });

    expect(reference.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });
});
