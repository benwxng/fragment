import type { Reference } from '@refer/capture';
import type { LibraryAdapter } from '@refer/capture/library/types';
import { demoCaptures } from './demo';

// Preview-only data. It never uses the account transport.
export function demoLibraryAdapter(initialReferenceId?: string): LibraryAdapter {
  let references = demoCaptures.map(capture => ({
    id: capture.id, snapshotVersion: 1, capturedAt: capture.capturedAt, facets: capture.facets,
    source: { url: capture.sourceUrl, origin: 'https://' + capture.sourceHost, title: capture.pageTitle },
    element: {
      semantic: { accessibleName: capture.elementLabel, tagName: 'DIV', role: capture.role },
      selector: capture.selector, textExcerpt: capture.textExcerpt,
      typography: { fontFamily: capture.typography.fontFamily, primaryFontFamily: capture.fontFamily,
        fontSize: capture.typography.size, fontWeight: capture.typography.weight,
        lineHeight: capture.typography.lineHeight, letterSpacing: capture.typography.letterSpacing },
      colors: { text: capture.colors.text, effectiveBackground: capture.colors.background },
      box: { ...capture.box, padding: capture.box.paddingSides, margin: capture.box.marginSides },
      layout: { display: capture.layout.display, position: capture.layout.position,
        alignItems: capture.layout.align, justifyContent: capture.layout.justify },
      effects: { boxShadow: capture.box.shadow },
    },
    screenshot: null, note: capture.note, tags: [], favorite: false, collectionId: null,
  })) as unknown as Reference[];
  return {
    homeUrl: '/library?demo=1', initialReferenceId,
    async request(message) {
      switch (message.type) {
        case 'get-cloud-state': return { ok: true, cloudState: { configured: true, authStatus: 'signed-in',
          email: 'Preview mode', userId: 'preview', legacyCount: 0, legacyBlocked: false } };
        case 'list-references': return { ok: true, references, userId: 'preview' };
        case 'delete-reference': references = references.filter(item => item.id !== message.id); return { ok: true };
        case 'save-reference': references = [message.reference, ...references]; return { ok: true };
        default: return { ok: false, error: 'This is a preview. Connect your account to save references.' };
      }
    },
  };
}
