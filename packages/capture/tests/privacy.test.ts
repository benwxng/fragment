import { describe, expect, it } from 'vitest';

import { safeTextExcerpt, sanitizeUrl } from '../src';

function element(overrides: Record<string, unknown> = {}): Element {
  const attributes = new Map<string, string>();
  const fake = {
    tagName: 'DIV',
    textContent: '  A useful   design\nreference  ',
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    },
    ...overrides,
  };
  return fake as unknown as Element;
}

describe('sanitizeUrl', () => {
  it('removes credentials, query parameters, and fragments', () => {
    expect(sanitizeUrl('https://user:secret@example.com/work/card?token=private#selection')).toBe(
      'https://example.com/work/card',
    );
  });

  it('resolves safe relative URLs and rejects executable URLs', () => {
    expect(sanitizeUrl('/icon.svg?v=3', 'https://example.com/page?private=yes')).toBe(
      'https://example.com/icon.svg',
    );
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('data:text/plain,secret')).toBe('');
    expect(sanitizeUrl('not a URL')).toBe('');
  });
});

describe('safeTextExcerpt', () => {
  it('normalizes and truncates visible text without splitting unicode', () => {
    expect(safeTextExcerpt(element())).toBe('A useful design reference');
    expect(safeTextExcerpt(element({ textContent: 'hello 🌍 again' }), 8)).toBe('hello 🌍…');
  });

  it.each(['INPUT', 'TEXTAREA', 'SELECT'])(
    'redacts values from %s elements without touching their value property',
    (tagName) => {
      const field = element({
        tagName,
        textContent: 'should not be captured',
      });
      Object.defineProperty(field, 'value', {
        get() {
          throw new Error('the value property must never be read');
        },
      });
      expect(safeTextExcerpt(field)).toBeNull();
    },
  );

  it('redacts contenteditable text', () => {
    const editable = element({
      textContent: 'draft private copy',
      getAttribute(name: string) {
        return name === 'contenteditable' ? 'true' : null;
      },
    });
    expect(safeTextExcerpt(editable)).toBeNull();
  });

  it('omits hidden and editable descendant text from a container excerpt', () => {
    const root = {
      tagName: 'DIV',
      parentElement: null,
      getAttribute: () => null,
      hasAttribute: () => false,
    };
    const visibleParent = {
      ...root,
      tagName: 'P',
      parentElement: root,
    };
    const hiddenParent = {
      ...visibleParent,
      getAttribute(name: string) {
        return name === 'aria-hidden' ? 'true' : null;
      },
    };
    const editableParent = {
      ...visibleParent,
      getAttribute(name: string) {
        return name === 'contenteditable' ? 'true' : null;
      },
    };
    const nodes = [
      { textContent: 'Visible reference', parentElement: visibleParent },
      { textContent: 'hidden copy', parentElement: hiddenParent },
      { textContent: 'private draft', parentElement: editableParent },
    ];
    let index = 0;
    const document = {
      defaultView: {
        getComputedStyle: () => ({
          display: 'block',
          visibility: 'visible',
          contentVisibility: 'visible',
        }),
      },
      createTreeWalker: () => ({
        nextNode: () => nodes[index++] ?? null,
      }),
    };
    const container = {
      ...root,
      ownerDocument: document,
      textContent: 'Visible reference hidden copy private draft',
    } as unknown as Element;

    expect(safeTextExcerpt(container)).toBe('Visible reference');
  });
});
