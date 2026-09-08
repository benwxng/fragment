const SAFE_SOURCE_PROTOCOLS = new Set(['http:', 'https:', 'file:', 'about:']);

/**
 * Removes credentials, query parameters, and fragments from a source URL.
 * Unsupported or malformed URLs become an empty string rather than being persisted.
 */
export function sanitizeUrl(input: string, base?: string): string {
  const value = input.trim();
  if (!value) return '';

  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (!SAFE_SOURCE_PROTOCOLS.has(url.protocol)) return '';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

export function safeTextExcerpt(element: Element, maxLength = 280): string | null {
  const tagName = element.tagName.toLowerCase();
  const isFormValue =
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    element.getAttribute('contenteditable') === '' ||
    element.getAttribute('contenteditable')?.toLowerCase() === 'true';

  // Never read `.value`; contenteditable text is user-provided in the DOM itself.
  if (isFormValue) return null;

  const document = element.ownerDocument;
  const view = document?.defaultView;
  const textParts: string[] = [];

  if (document?.createTreeWalker && view) {
    // Walk rendered text nodes rather than using textContent, which also includes
    // CSS-hidden copy. Editable descendants are omitted so selecting a container
    // cannot accidentally capture text the user entered into the page.
    const walker = document.createTreeWalker(element, 4 /* NodeFilter.SHOW_TEXT */);
    let node = walker.nextNode();
    while (node) {
      let parent = node.parentElement;
      let visibleAndSafe = true;

      while (parent) {
        const parentTag = parent.tagName.toLowerCase();
        const editable = parent.getAttribute('contenteditable');
        if (
          parentTag === 'input' ||
          parentTag === 'textarea' ||
          parentTag === 'select' ||
          editable === '' ||
          editable?.toLowerCase() === 'true' ||
          parent.hasAttribute('hidden') ||
          parent.getAttribute('aria-hidden')?.toLowerCase() === 'true'
        ) {
          visibleAndSafe = false;
          break;
        }

        const style = view.getComputedStyle(parent);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse' ||
          style.contentVisibility === 'hidden'
        ) {
          visibleAndSafe = false;
          break;
        }

        if (parent === element) break;
        parent = parent.parentElement;
      }

      if (visibleAndSafe && node.textContent) textParts.push(node.textContent);
      node = walker.nextNode();
    }
  } else {
    // Lightweight DOM fakes used by consumers and tests may not expose a document.
    textParts.push(element.textContent ?? '');
  }

  const normalized = textParts.join(' ').replace(/\s+/gu, ' ').trim();
  if (!normalized) return null;

  const limit = Math.max(0, Math.floor(maxLength));
  const characters = Array.from(normalized);
  if (characters.length <= limit) return normalized;
  if (limit <= 1) return limit === 1 ? '…' : null;
  return `${characters.slice(0, limit - 1).join('').trimEnd()}…`;
}
