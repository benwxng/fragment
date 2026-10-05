/** Decorative Glance mark; pointer tracking stays independent of selection locking. */
export function createToolbarEye() {
  const element = document.createElement('span');
  element.className = 'toolbar-eye';
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = `<svg viewBox="0 0 100 42" fill="none" focusable="false">
    <defs><clipPath id="glance-toolbar-eye-clip"><path d="M1.59026 20.0476C8.41761 25.6338 24.406 40.7329 49.5903 41C74.7745 40.7329 90.7629 25.6368 97.5903 20.0476C90.7157 14.5527 74.6184 1.07655 49.5903 1.00039C24.5621 1.07655 8.46478 14.5527 1.59026 20.0476Z" /></clipPath></defs>
    <g class="toolbar-eye-lid">
      <path d="M1.59026 20.0476C8.41761 25.6338 24.406 40.7329 49.5903 41C74.7745 40.7329 90.7629 25.6368 97.5903 20.0476C90.7157 14.5527 74.6184 1.07655 49.5903 1.00039C24.5621 1.07655 8.46478 14.5527 1.59026 20.0476Z" fill="white" />
      <g clip-path="url(#glance-toolbar-eye-clip)"><g class="toolbar-eye-pupil">
        <circle cx="49.5903" cy="21" r="20" fill="#526B59" />
        <path class="toolbar-eye-asterisk" d="M49.5902 10.2V31.8M38.7902 21H60.3902M41.9535 13.3633L57.227 28.6368M41.9535 28.6368L57.227 13.3633" stroke="white" stroke-width="2.4" />
      </g></g>
    </g>
  </svg>`;
  const pupil = element.querySelector<SVGGElement>('.toolbar-eye-pupil')!;
  const lid = element.querySelector<SVGGElement>('.toolbar-eye-lid')!;
  const asterisk = element.querySelector<SVGPathElement>('.toolbar-eye-asterisk')!;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let point = { x: 0, y: 0 };
  let angle = 0;
  let blink: Animation | undefined;

  function resetMotion() {
    cancelAnimationFrame(frame);
    frame = 0;
    blink?.cancel();
    pupil.style.transform = 'translate(0px, 0px)';
  }
  reducedMotion.addEventListener('change', resetMotion);

  return {
    element,
    track(x: number, y: number) {
      if (reducedMotion.matches) return;
      point = { x, y };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = element.getBoundingClientRect();
        const dx = point.x - (rect.left + rect.width / 2);
        const dy = point.y - (rect.top + rect.height / 2);
        const distance = Math.hypot(dx, dy);
        const strength = Math.min(distance / 180, 1);
        // SVG units: keep the iris inside the eye, even near the viewport edges.
        pupil.style.transform = `translate(${distance ? dx / distance * 8 * strength : 0}px, ${distance ? dy / distance * 4 * strength : 0}px)`;
      });
    },
    click() {
      if (reducedMotion.matches) return;
      angle += 90;
      asterisk.style.transform = `rotate(${angle}deg)`;
      const current = getComputedStyle(lid).transform;
      blink?.cancel();
      blink = lid.animate([
        { transform: current === 'none' ? 'scaleY(1)' : current, offset: 0 },
        { transform: 'scaleY(0.08)', offset: 0.35 },
        { transform: 'scaleY(1)', offset: 1 },
      ], { duration: 200, easing: 'ease-in-out' });
    },
    dispose() {
      resetMotion();
      reducedMotion.removeEventListener('change', resetMotion);
    },
  };
}
