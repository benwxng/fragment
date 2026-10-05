import { mountLibrary } from '@refer/capture/library';
import type { LibraryResponse } from '@refer/capture/library/types';
import { getCloudConfig } from '../../src/cloud/config';

mountLibrary(document.getElementById('library-root')!, {
  homeUrl: browser.runtime.getURL('/library.html'),
  async request(message) {
    const response = await browser.runtime.sendMessage(message) as LibraryResponse;
    const config = getCloudConfig();
    if (config && response.ok && response.cloudState?.authStatus === 'signed-out') {
      window.location.replace(new URL('/login?reauth=1', config.siteUrl).href);
      return { ok: true, redirecting: true };
    }
    return response;
  },
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
