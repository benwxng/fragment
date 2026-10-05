import { createMotionScope, motionEase } from '@refer/capture/motion';

export function createSaveFeedback(root: HTMLElement) {
  let feedback: HTMLDivElement | null = null;
  let frame = 0;
  let disposed = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = createMotionScope();
  let effects: Array<ReturnType<typeof motion.play>> = [];

  function clear() {
    effects.forEach(effect => effect?.cancel());
    effects = [];
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
      frame = requestAnimationFrame(place);
    }
    place(started);
    if (!reducedMotion.matches) {
      effects.push(
        motion.play(badge, { opacity: [0, 1], transform: ['translateY(2px)', 'translateY(0)'] }, { duration: 0.14, ease: motionEase.tracking }),
        motion.play(path, { strokeDashoffset: [1, 0] }, { duration: 0.18, ease: 'easeOut' }),
        motion.play(overlay, { opacity: [1, 0] }, { duration: 0.2, delay: 1.2, ease: 'linear' }),
      );
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
      motion.dispose();
    },
  };
}
