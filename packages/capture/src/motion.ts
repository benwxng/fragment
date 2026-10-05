import { animate } from 'motion/mini';

type Subject = HTMLElement | SVGElement;
type Frames = Parameters<typeof animate>[1];
type Options = NonNullable<Parameters<typeof animate>[2]>;
export const motionEase = {
  hover: [0.25, 0.1, 0.25, 1],
  library: [0.23, 1, 0.32, 1],
  reveal: [0.16, 1, 0.3, 1],
  tracking: [0.2, 0, 0, 1],
} as const;
export type MotionOptions = Options;

/** Scope every effect to its UI lifetime; CSS remains the source of resting styles. */
export function createMotionScope() {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Set<{ cancel(): void }>();
  let disposed = false;

  function play(element: Subject, frames: Frames, options: Options = {}) {
    if (disposed || preference.matches || options.duration === 0) return;
    const properties = Object.keys(frames);
    const original = properties.map(key => [key, element.style.getPropertyValue(key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`))] as const);
    const controls = animate(element, frames, options);
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      controls.cancel();
      for (const [key, value] of original) {
        const property = key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
        if (value) element.style.setProperty(property, value);
        else element.style.removeProperty(property);
      }
      active.delete(effect);
    };
    const effect = { cancel: cleanup, get active() { return !finished; } };
    active.add(effect);
    void controls.finished.then(cleanup, cleanup);
    return effect;
  }

  // CSS targets can change during hover/focus. Sample the in-flight frame before
  // cancelling so reversal continues from what is currently visible.
  function styles(element: Subject, properties: string[]) {
    const read = () => {
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map(key => [key, style.getPropertyValue(key)]));
    };
    let previous = read();
    let effect: ReturnType<typeof play>;
    return {
      update(options: Options = {}) {
        const from = effect?.active ? read() : previous;
        effect?.cancel();
        effect = undefined;
        const target = read();
        const changed = properties.filter(key => from[key] !== target[key]);
        previous = target;
        if (!changed.length) return;
        effect = play(element, Object.fromEntries(changed.map(key => [key, [from[key]!, target[key]!]])), options);
      },
      cancel() { effect?.cancel(); effect = undefined; },
    };
  }

  const positions = new Map<Subject, { target: string; effect: ReturnType<typeof play> }>();
  function move(element: Subject, transform: string, smooth = true) {
    const previous = positions.get(element);
    if (previous?.target === transform && smooth && !preference.matches) return;
    const from = getComputedStyle(element).transform;
    previous?.effect?.cancel();
    element.style.transform = transform;
    const effect = previous && smooth
      ? play(element, { transform: [from, transform] }, { duration: 0.16, ease: motionEase.tracking })
      : undefined;
    positions.set(element, { target: transform, effect });
  }

  const settle = () => { for (const effect of [...active]) effect.cancel(); };
  preference.addEventListener('change', settle);
  return {
    play, styles, move,
    get reduced() { return preference.matches; },
    dispose() { disposed = true; settle(); positions.clear(); preference.removeEventListener('change', settle); },
  };
}
export type MotionScope = ReturnType<typeof createMotionScope>;

/** Animate CSS interaction states without duplicating theme colors in JavaScript. */
export function bindStyleMotion(
  scope: MotionScope,
  trigger: Element,
  targets: Array<{ element: Subject; properties: string[] }>,
  options: () => MotionOptions = () => ({ duration: 0.12, ease: 'easeOut' }),
) {
  const bindings = targets.map(({ element, properties }) => scope.styles(element, properties));
  const update = () => { for (const binding of bindings) binding.update(options()); };
  const events = ['pointerenter', 'pointerleave', 'pointerdown', 'pointerup', 'pointercancel', 'focusin', 'focusout', 'input', 'keydown', 'keyup'];
  // Focusout fires before :focus-within changes; defer to the end of the event.
  let disposed = false;
  const onEvent = () => queueMicrotask(() => { if (!disposed) update(); });
  for (const event of events) trigger.addEventListener(event, onEvent);
  return {
    update,
    dispose() {
      disposed = true;
      for (const event of events) trigger.removeEventListener(event, onEvent);
      for (const binding of bindings) binding.cancel();
    },
  };
}

export function mountButtonMotion(root: HTMLElement, scope: MotionScope, selector: string) {
  const bindings = new Map<Element, ReturnType<typeof bindStyleMotion>>();
  function refresh() {
    for (const [element, binding] of bindings) {
      if (!root.contains(element)) { binding.dispose(); bindings.delete(element); }
    }
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      if (bindings.has(element)) continue;
      bindings.set(element, bindStyleMotion(scope, element, [{ element, properties: ['color', 'background-color', 'opacity', 'transform'] }]));
    }
  }
  refresh();
  return { refresh, dispose() { for (const binding of bindings.values()) binding.dispose(); bindings.clear(); } };
}
