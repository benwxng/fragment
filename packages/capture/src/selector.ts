const STABLE_ATTRIBUTES = ['data-testid', 'data-test', 'data-qa', 'data-cy'] as const;

function cssEscape(value: string): string {
  const nativeEscape = globalThis.CSS?.escape;
  if (nativeEscape) return nativeEscape(value);

  // A compact CSS.escape-compatible fallback for identifiers in non-window DOMs.
  return Array.from(value)
    .map((character, index) => {
      const code = character.codePointAt(0) ?? 0;
      if (code === 0) return '\uFFFD';
      if (
        (code >= 48 && code <= 57 && (index === 0 || (index === 1 && value[0] === '-'))) ||
        (index === 0 && character === '-' && value.length === 1)
      ) {
        return `\\${code.toString(16)} `;
      }
      if (
        code >= 128 ||
        character === '-' ||
        character === '_' ||
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122)
      ) {
        return character;
      }
      return `\\${character}`;
    })
    .join('');
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"').replace(/[\n\r\f]/gu, ' ');
}

function isUnique(document: Document, selector: string, element: Element): boolean {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}

function usefulClassNames(element: Element): string[] {
  return Array.from(element.classList)
    .filter((className) => {
      if (className.length > 64 || className.length < 2) return false;
      if (/^(css|sc|jsx|emotion)-/iu.test(className)) return false;
      if (/(?:^|[-_])[a-f\d]{6,}(?:$|[-_])/iu.test(className)) return false;
      if (/\d{5,}/u.test(className)) return false;
      return true;
    })
    .slice(0, 2);
}

function segmentFor(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const classes = usefulClassNames(element);
  const classSelector = classes.map((className) => `.${cssEscape(className)}`).join('');
  if (classSelector) return `${tag}${classSelector}`;

  const parent = element.parentElement;
  if (!parent) return tag;
  const siblings = Array.from(parent.children).filter(
    (sibling) => sibling.tagName.toLowerCase() === tag,
  );
  if (siblings.length <= 1) return tag;
  return `${tag}:nth-of-type(${siblings.indexOf(element) + 1})`;
}

/** Returns a stable best-effort selector without exposing arbitrary attributes. */
export function getStableSelector(element: Element, document = element.ownerDocument): string {
  const id = element.id.trim();
  if (id) {
    const selector = `#${cssEscape(id)}`;
    if (isUnique(document, selector, element)) return selector;
  }

  for (const attribute of STABLE_ATTRIBUTES) {
    const value = element.getAttribute(attribute)?.trim();
    if (!value) continue;
    const selector = `[${attribute}="${escapeAttribute(value)}"]`;
    if (isUnique(document, selector, element)) return selector;
  }

  const ownSegment = segmentFor(element);
  if (isUnique(document, ownSegment, element)) return ownSegment;

  const path = [ownSegment];
  let ancestor = element.parentElement;
  while (ancestor && path.length < 6) {
    const ancestorId = ancestor.id.trim();
    if (ancestorId) {
      const anchor = `#${cssEscape(ancestorId)}`;
      if (isUnique(document, anchor, ancestor)) {
        path.unshift(anchor);
        break;
      }
    }

    path.unshift(segmentFor(ancestor));
    const selector = path.join(' > ');
    if (isUnique(document, selector, element)) return selector;
    ancestor = ancestor.parentElement;
  }

  return path.join(' > ');
}
