// Temporary comparison controls for choosing the inspector's save confirmation.
const OPTIONS = [
  ['badge', 'Corner'],
  ['stamp', 'Inside'],
] as const;
type Treatment = typeof OPTIONS[number][0];

export function createSaveFeedback(root: HTMLElement, getTarget: () => Element | null) {
  const toolbar = document.createElement('aside');
  toolbar.className = 'feedback-toolbar';
  toolbar.setAttribute('aria-label', 'Save feedback previews');
  const heading = document.createElement('strong');
  heading.textContent = 'Save feedback';
  const note = document.createElement('span');
  note.className = 'feedback-note';
  note.textContent = 'Temporary preview · Choose a style';
  const choices = document.createElement('div');
  choices.className = 'feedback-choices';
  const status = document.createElement('span');
  status.className = 'feedback-note';
  status.textContent = 'Hover an element, then choose a style.';
  status.setAttribute('role', 'status');
  const replay = document.createElement('button');
  replay.type = 'button';
  replay.textContent = 'Replay preview';
  toolbar.append(heading, note, choices, replay, status);
  root.append(toolbar);

  let selected: Treatment = 'badge';
  let lastSaved: Element | null = null;
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
    overlay.className = `save-feedback save-feedback-${selected}`;
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
    if (selected === 'badge') {
      const label = document.createElement('span');
      label.textContent = 'Saved';
      badge.append(label);
    }
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
      const width = selected === 'badge' ? 76 : 32;
      const height = selected === 'badge' ? 28 : 32;
      const x = selected === 'badge' ? right - width - 8 : (left + right - width) / 2;
      const y = selected === 'badge' ? top - height / 2 : (top + bottom - height) / 2;
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

  function preview() {
    const target = lastSaved?.isConnected ? lastSaved : getTarget();
    if (target) {
      show(target);
      status.textContent = 'Preview only · Nothing saved';
    } else {
      status.textContent = 'Hover an element first, then replay.';
    }
  }

  for (const [value, label] of OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.treatment = value;
    button.setAttribute('aria-pressed', String(value === selected));
    button.addEventListener('click', () => {
      selected = value;
      for (const choice of choices.querySelectorAll('button')) {
        choice.setAttribute('aria-pressed', String(choice === button));
      }
      preview();
    });
    choices.append(button);
  }
  replay.addEventListener('click', preview);

  return {
    saved(target: Element) {
      lastSaved = target;
      show(target);
    },
    clear,
    dispose() {
      disposed = true;
      clear();
      toolbar.remove();
    },
  };
}
