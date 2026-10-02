import { mountLibrary } from '@refer/capture/library';
import type { LibraryResponse } from '@refer/capture/library/types';

mountLibrary(document.getElementById('library-root')!, {
  homeUrl: browser.runtime.getURL('/library.html'),
  request: async (message) => await browser.runtime.sendMessage(message) as LibraryResponse,
  subscribe(refresh) {
    const listener = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && (changes['refer-library-updated'] || changes['refer-neon-session'])) {
        refresh(Boolean(changes['refer-neon-session']));
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  },
});
