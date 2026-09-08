import { describe, expect, it } from 'vitest';

import { getStableSelector } from '../src';

interface FakeElementOptions {
  tagName?: string;
  id?: string;
  classes?: string[];
  attributes?: Record<string, string>;
  parent?: FakeElement;
}

class FakeElement {
  readonly tagName: string;
  readonly id: string;
  readonly classList: string[];
  readonly attributes: Record<string, string>;
  readonly children: FakeElement[] = [];
  readonly parentElement: FakeElement | null;

  constructor(options: FakeElementOptions = {}) {
    this.tagName = options.tagName ?? 'DIV';
    this.id = options.id ?? '';
    this.classList = options.classes ?? [];
    this.attributes = options.attributes ?? {};
    this.parentElement = options.parent ?? null;
    this.parentElement?.children.push(this);
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }
}

function documentWith(query: (selector: string) => FakeElement[]): Document {
  return { querySelectorAll: query } as unknown as Document;
}

describe('getStableSelector', () => {
  it('prefers a unique id', () => {
    const target = new FakeElement({ id: 'pricing-card' });
    const document = documentWith((selector) => (selector === '#pricing-card' ? [target] : []));
    expect(getStableSelector(target as unknown as Element, document)).toBe('#pricing-card');
  });

  it('prefers a unique explicit test hook over unstable classes', () => {
    const target = new FakeElement({
      classes: ['css-a89f21c', 'Card'],
      attributes: { 'data-testid': 'hero quote' },
    });
    const document = documentWith((selector) =>
      selector === '[data-testid="hero quote"]' ? [target] : [],
    );
    expect(getStableSelector(target as unknown as Element, document)).toBe(
      '[data-testid="hero quote"]',
    );
  });

  it('builds a deterministic nth-of-type path as a fallback', () => {
    const body = new FakeElement({ tagName: 'BODY' });
    new FakeElement({ tagName: 'SECTION', parent: body });
    const section = new FakeElement({ tagName: 'SECTION', parent: body });
    const target = new FakeElement({ tagName: 'P', parent: section });
    const document = documentWith((selector) =>
      selector === 'body > section:nth-of-type(2) > p' ? [target] : [],
    );
    expect(getStableSelector(target as unknown as Element, document)).toBe(
      'body > section:nth-of-type(2) > p',
    );
  });
});
