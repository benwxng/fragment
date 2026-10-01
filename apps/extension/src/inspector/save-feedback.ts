export function createSaveFeedback(root: HTMLElement) {
  let feedback: HTMLDivElement | null = null;
  let frame = 0;
  let disposed = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function clear() {
    cancelAnimationFrame(frame);
    frame = 0;
    feedback?.remove();
    feedback = null;
  }

  function show(target: Element) {
    if (disposed || !target.isConnected) return;
    clear();
    const overlay = document.createElement('div');
    overlay.className = 'save-feedback';
    overlay.setAttribute('aria-hidden', 'true');
    const badge = document.createElement('div');
    badge.className = 'save-confirmation';
    const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    check.classList.add('save-feedback-check');
    check.setAttribute('viewBox', '0 0 16 16');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M3.5 8 6.5 11 12.5 5');
    path.setAttribute('pathLength', '1');
    check.append(path);
    badge.append(check);
    const label = document.createElement('span');
    label.textContent = 'Saved';
    badge.append(label);
    overlay.append(badge);
    root.append(overlay);
    feedback = overlay;
    const started = performance.now();

    function place(now: number) {
      if (!target.isConnected || now - started >= 1400) {
        clear();
        return;
      }
      const rect = target.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(innerWidth, rect.right);
      const bottom = Math.min(innerHeight, rect.bottom);
      overlay.hidden = right <= left || bottom <= top;
      Object.assign(overlay.style, {
        left: `${left}px`, top: `${top}px`,
        width: `${Math.max(0, right - left)}px`, height: `${Math.max(0, bottom - top)}px`,
      });
      // Keep the confirmation readable even on tiny text nodes and viewport edges.
      const width = 76;
      const height = 28;
      const x = right - width - 8;
      const y = top - height / 2;
      badge.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
      badge.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
      const elapsed = now - started;
      overlay.style.opacity = reducedMotion.matches || elapsed < 1200 ? '1' : String((1400 - elapsed) / 200);
      frame = requestAnimationFrame(place);
    }
    place(started);
    if (!reducedMotion.matches) {
      badge.animate([
        { opacity: 0, transform: 'translateY(2px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 140, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 180, easing: 'ease-out' });
    }
  }

  return {
    saved(target: Element) {
      show(target);
    },
    clear,
    dispose() {
      disposed = true;
      clear();
    },
  };
}
