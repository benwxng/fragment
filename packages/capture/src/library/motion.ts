import { bindStyleMotion, createMotionScope, motionEase, mountButtonMotion } from '../motion';

export function mountLibraryMotion(root: HTMLElement) {
  const scope = createMotionScope();
  const buttons = mountButtonMotion(root, scope, '.filter, .button, .text-button, .icon-button, .account-button, .toast-action, .toast-close');
  let loadingEffects: Array<NonNullable<ReturnType<typeof scope.play>>> = [];
  let loading = false;
  const loadingPreference = matchMedia('(prefers-reduced-motion: reduce)');
  function animateLoading() {
    loadingEffects.forEach(effect => effect.cancel());
    loadingEffects = [];
    if (!loading) return;
    for (const tile of root.querySelectorAll<HTMLElement>('.library-skeleton-card')) {
      const effect = scope.play(tile, { opacity: [0.55, 1, 0.55] }, { duration: 1, repeat: Infinity, ease: 'easeInOut' });
      if (effect) loadingEffects.push(effect);
    }
  }
  loadingPreference.addEventListener('change', animateLoading);
  const cards = new Map<Element, Array<ReturnType<typeof bindStyleMotion>>>();
  const brand = scope.styles(root.querySelector<SVGElement>('.brand-asterisk')!, ['transform']);
  const toggle = (event: Event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.matches('.detail-more[open]') || details.querySelector('summary:focus-visible')) return;
    for (const section of details.querySelectorAll<HTMLElement>(':scope > .property-section')) {
      scope.play(section, { opacity: [0, 1], transform: ['translateY(4px)', 'translateY(0)'] }, { duration: 0.18, ease: motionEase.library });
    }
  };
  root.addEventListener('toggle', toggle, true);

  function refresh() {
    buttons.refresh();
    for (const [card, bindings] of cards) {
      if (!root.contains(card)) { bindings.forEach(binding => binding.dispose()); cards.delete(card); }
    }
    for (const card of root.querySelectorAll<HTMLElement>('.reference-card')) {
      if (cards.has(card)) continue;
      const options = () => ({ duration: card.matches(':focus-within') ? 0 : 0.24, ease: motionEase.hover });
      const bindings = [bindStyleMotion(scope, card,
        [...card.querySelectorAll<HTMLElement>('.card-blur, .card-body, .card-source')].map(element => ({ element, properties: ['opacity'] })), options),
      bindStyleMotion(scope, card,
        [...card.querySelectorAll<HTMLElement>('.card-body > *')].map(element => ({ element, properties: ['transform'] })),
        () => ({ duration: card.matches(':focus-within') ? 0 : 0.24, ease: motionEase.library }))];
      const source = card.querySelector<HTMLElement>('.card-source');
      if (source) bindings.push(bindStyleMotion(scope, source, [{ element: source, properties: ['background-color', 'transform'] }],
        () => ({ duration: 0.18, ease: motionEase.reveal })));
      cards.set(card, bindings);
    }
  }
  return {
    refresh,
    loading(visible: boolean) {
      if (loading === visible) return;
      loading = visible;
      animateLoading();
    },
    imageReady(image: HTMLImageElement) {
      scope.play(image, { opacity: [0, 1] }, { duration: 0.18, ease: motionEase.library });
    },
    galleryReady(grid: HTMLElement) {
      scope.play(grid, { opacity: [0, 1], transform: ['translateY(6px)', 'translateY(0)'] }, { duration: 0.24, ease: motionEase.library });
    },
    brand(animate: boolean) { brand.update({ duration: animate ? 0.28 : 0, ease: motionEase.library }); },
    enter(element: HTMLElement, animate: boolean) {
      if (animate) scope.play(element, { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0)'] }, { duration: 0.22, ease: motionEase.library });
    },
    dispose() {
      loading = false;
      animateLoading();
      loadingPreference.removeEventListener('change', animateLoading);
      root.removeEventListener('toggle', toggle, true);
      brand.cancel(); buttons.dispose();
      for (const bindings of cards.values()) bindings.forEach(binding => binding.dispose());
      cards.clear(); scope.dispose();
    },
  };
}
