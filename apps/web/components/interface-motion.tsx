'use client';

import { useEffect } from 'react';
import { createMotionScope, mountButtonMotion } from '@refer/capture/motion';

/** Account-page effects only; the shared library owns its own Motion scope. */
export function InterfaceMotion() {
  useEffect(() => {
    const scope = createMotionScope();
    const buttons = mountButtonMotion(document.body, scope,
      ':is(.button, .text-action, .text-link, .icon-button):not(.glance-library *)');
    const effects = new Map<HTMLElement, ReturnType<typeof scope.play>>();
    const refresh = () => {
      buttons.refresh();
      for (const [element, effect] of effects) {
        if (!element.isConnected) { effect?.cancel(); effects.delete(element); }
      }
      for (const element of document.querySelectorAll<HTMLElement>('.auth-main-with-art > .auth-card, .loading-card span, .loading-card i, .loading-detail span, .loading-block')) {
        if (effects.has(element) || element.closest('.glance-library')) continue;
        const entrance = element.matches('.auth-card');
        effects.set(element, entrance
          ? scope.play(element, { opacity: [0, 1] }, { duration: 0.8, delay: 0.4, ease: 'easeInOut' })
          : scope.play(element, { opacity: [1, 0.55] }, { duration: 1.4, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }));
      }
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); buttons.dispose(); scope.dispose(); effects.clear(); };
  }, []);
  return null;
}
