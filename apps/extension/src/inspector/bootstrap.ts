import { inferFacets, inspectElement, type Reference } from '@refer/capture';

import type { ExtensionMessage, ExtensionResponse } from '../messages';
import { captureElementImage, type ScreenshotCrop, waitForOverlayToDisappear } from './screenshot';
import { inspectorStyles } from './styles';
import { createSaveFeedback } from './save-feedback';

const HOST_ID = '__refer_design_inspector__';
const TOGGLE_EVENT = 'refer:toggle-inspector';
const CURSOR_ATTRIBUTE = 'data-refer-inspecting';
const EDGE_GAP = 10;
const VIEWPORT_INSET = 8;

type ToastKind = 'saved' | 'error';

interface HudElements {
  root: HTMLDivElement;
  highlight: HTMLDivElement;
  highlightFill: HTMLDivElement;
  highlightEdges: HTMLDivElement[];
  chip: HTMLDivElement;
  hud: HTMLElement;
  fontPreview: HTMLDivElement;
  sections: HTMLDivElement;
  hint: HTMLDivElement;
  chipLabel: HTMLSpanElement;
  libraryButton: HTMLButtonElement;
  exitButton: HTMLButtonElement;
  toast: HTMLDivElement;
  toastMark: HTMLSpanElement;
  toastMessage: HTMLSpanElement;
  undoButton: HTMLButtonElement;
  viewButton: HTMLButtonElement;
  retryButton: HTMLButtonElement;
  closeToastButton: HTMLButtonElement;
  announcer: HTMLDivElement;
}

interface HudRow {
  label: string;
  value: string;
  swatch?: string;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  return node;
}

function createButton(className: string, label: string): HTMLButtonElement {
  const button = element('button', className);
  button.type = 'button';
  button.textContent = label;
  return button;
}

function concealEditableContent(root: Element): () => void {
  const selector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
  const sensitive = [
    ...(root.matches(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ].filter((node): node is HTMLElement => node instanceof HTMLElement);
  const previous = sensitive.map((node) => ({
    node,
    value: node.style.getPropertyValue('visibility'),
    priority: node.style.getPropertyPriority('visibility'),
  }));

  for (const { node } of previous) node.style.setProperty('visibility', 'hidden', 'important');

  return () => {
    for (const { node, value, priority } of previous) {
      if (value) node.style.setProperty('visibility', value, priority);
      else node.style.removeProperty('visibility');
    }
  };
}

function createUi(shadow: ShadowRoot): HudElements {
  const style = element('style');
  style.textContent = inspectorStyles;

  const root = element('div', 'root');
  root.setAttribute('dir', 'ltr');

  const highlight = element('div', 'highlight');
  highlight.hidden = true;
  highlight.setAttribute('aria-hidden', 'true');
  const highlightFill = element('div', 'highlight-fill');
  const highlightEdges = Array.from({ length: 4 }, () => element('div', 'highlight-edge'));
  highlight.append(highlightFill, ...highlightEdges);

  const chip = element('div', 'chip');
  const statusDot = element('span', 'status-dot');
  statusDot.setAttribute('aria-hidden', 'true');
  const chipLabel = element('span', 'chip-label');
  chipLabel.textContent = 'Click to inspect';
  const libraryButton = createButton('library', 'View references');
  const exitButton = createButton('exit', 'Exit');
  exitButton.setAttribute('aria-label', 'Exit inspector');
  exitButton.setAttribute('aria-keyshortcuts', 'Escape');
  chip.append(statusDot, chipLabel, libraryButton, exitButton);

  const hud = element('section', 'hud');
  hud.hidden = true;
  hud.setAttribute('aria-label', 'Inspector Panel');
  hud.dataset.expanded = 'false';
  const fontPreview = element('div', 'font-preview');
  const sections = element('div', 'sections');
  sections.hidden = true;
  const hint = element('div', 'hint');
  hint.hidden = true;
  hint.innerHTML = '<kbd>Click</kbd> or <kbd>Enter</kbd> save · <kbd>↑↓</kbd> traverse · <kbd>Esc</kbd> back';
  hud.append(fontPreview, sections, hint);

  const toast = element('div', 'toast');
  toast.hidden = true;
  const toastMark = element('span', 'toast-mark');
  toastMark.setAttribute('aria-hidden', 'true');
  const toastMessage = element('span', 'toast-message');
  const undoButton = createButton('undo', 'Undo');
  const viewButton = createButton('view', 'View references');
  const retryButton = createButton('retry', 'Try again');
  const closeToastButton = createButton('close', '×');
  closeToastButton.setAttribute('aria-label', 'Dismiss notification');
  toast.append(
    toastMark,
    toastMessage,
    undoButton,
    viewButton,
    retryButton,
    closeToastButton,
  );

  const announcer = element('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  Object.assign(announcer.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });

  root.append(highlight, chip, hud, toast, announcer);
  shadow.append(style, root);

  return {
    root,
    highlight,
    highlightFill,
    highlightEdges,
    chip,
    hud,
    fontPreview,
    sections,
    hint,
    chipLabel,
    libraryButton,
    exitButton,
    toast,
    toastMark,
    toastMessage,
    undoButton,
    viewButton,
    retryButton,
    closeToastButton,
    announcer,
  };
}

function announce(node: HTMLElement, message: string): void {
  node.textContent = '';
  requestAnimationFrame(() => {
    node.textContent = message;
  });
}

function isTransparent(color: string): boolean {
  if (color === 'transparent') return true;
  const alpha = color.match(/^rgba?\([^/]*[, ]\s*(0(?:\.0+)?)\s*\)$/i);
  const modernAlpha = color.match(/^rgb\([^/]+\/\s*(0(?:\.0+)?%?)\s*\)$/i);
  return Boolean(alpha || modernAlpha);
}

function effectiveBackground(target: Element): string {
  let current: Element | null = target;
  while (current) {
    const color = getComputedStyle(current).backgroundColor;
    if (!isTransparent(color)) return color;
    current = current.parentElement;
  }
  return getComputedStyle(document.documentElement).backgroundColor || 'transparent';
}

function compactColor(color: string): string {
  const match = color.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)(?:\D+([\d.]+))?\s*\)$/i);
  if (!match) return color;

  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);
  const alpha = match[4] == null ? 1 : Number(match[4]);
  if (alpha < 1) return color.replace(/\s+/g, ' ');

  return `#${[red, green, blue]
    .map((part) => Math.round(part).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function px(value: string, precision = 1): string {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return value;
  if (Math.abs(numeric) < 0.005) return '0';
  return `${Number(numeric.toFixed(precision))} px`;
}

function spacing(values: readonly string[]): string {
  const normalized = values.map(px);
  const [top, right, bottom, left] = normalized;
  if (!top || !right || !bottom || !left) return normalized.join(' ');
  if (top === right && top === bottom && top === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  if (right === left) return `${top} ${right} ${bottom}`;
  return normalized.join(' ');
}

function primaryFont(fontFamily: string): string {
  return fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || fontFamily;
}

function createSection(title: string, rows: readonly HudRow[]): HTMLElement {
  const section = element('section', 'section');
  const heading = element('h2', 'section-title');
  heading.textContent = title;
  const values = element('dl', 'values');

  for (const row of rows) {
    const line = element('div', 'value-row');
    const term = element('dt');
    const value = element('dd');
    term.textContent = row.label;
    value.textContent = row.value;
    value.title = row.value;

    if (row.swatch) {
      const swatchLine = element('span', 'swatch-line');
      const swatch = element('span', 'swatch');
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.backgroundColor = row.swatch;
      swatchLine.append(swatch, term);
      line.append(swatchLine, value);
    } else {
      line.append(term, value);
    }
    values.append(line);
  }

  section.append(heading, values);
  return section;
}

function renderProperties(ui: HudElements, target: Element): void {
  const computed = getComputedStyle(target);
  const foreground = computed.color;
  const background = effectiveBackground(target);

  ui.sections.replaceChildren(
    createSection('Type', [
      { label: primaryFont(computed.fontFamily), value: px(computed.fontSize, 0) },
      { label: 'Line height', value: px(computed.lineHeight) },
      { label: 'Weight', value: computed.fontWeight },
      { label: 'Tracking', value: px(computed.letterSpacing) },
    ]),
    createSection('Color', [
      { label: 'Text', value: compactColor(foreground), swatch: foreground },
      { label: 'Background', value: compactColor(background), swatch: background },
    ]),
    createSection('Box', [
      {
        label: 'Padding',
        value: spacing([
          computed.paddingTop,
          computed.paddingRight,
          computed.paddingBottom,
          computed.paddingLeft,
        ]),
      },
      {
        label: 'Margin',
        value: spacing([
          computed.marginTop,
          computed.marginRight,
          computed.marginBottom,
          computed.marginLeft,
        ]),
      },
      { label: 'Radius', value: spacing(computed.borderRadius.split(/\s+/)) },
      {
        label: 'Border',
        value:
          computed.borderTopStyle === 'none'
            ? 'none'
            : `${px(computed.borderTopWidth)} ${computed.borderTopStyle}`,
      },
    ]),
    createSection('Layout', [
      { label: 'Display', value: computed.display },
      { label: 'Position', value: computed.position },
      { label: 'Gap', value: spacing([computed.rowGap, computed.columnGap]) },
      {
        label: 'Align',
        value: `${computed.justifyContent} · ${computed.alignItems}`,
      },
    ]),
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function positionOverlay(
  ui: HudElements,
  target: Element,
  pointer: Readonly<{ x: number; y: number }>,
  smoothOutline?: boolean,
): void {
  const rect = target.getBoundingClientRect();
  const visibleLeft = clamp(rect.left, 0, window.innerWidth);
  const visibleTop = clamp(rect.top, 0, window.innerHeight);
  const visibleRight = clamp(rect.right, 0, window.innerWidth);
  const visibleBottom = clamp(rect.bottom, 0, window.innerHeight);

  ui.hud.hidden = false;
  const chipRect = ui.chip.getBoundingClientRect();
  const minimumTop = Math.max(VIEWPORT_INSET, Math.ceil(chipRect.bottom + VIEWPORT_INSET));
  ui.hud.style.maxBlockSize = `${Math.max(120, window.innerHeight - minimumTop - VIEWPORT_INSET)}px`;
  const hudRect = ui.hud.getBoundingClientRect();
  const hudWidth = hudRect.width || Math.min(288, window.innerWidth - VIEWPORT_INSET * 2);
  const hudHeight = hudRect.height;
  const maxLeft = window.innerWidth - hudWidth - VIEWPORT_INSET;
  const maxTop = Math.max(minimumTop, window.innerHeight - hudHeight - VIEWPORT_INSET);
  let left: number;
  let top: number;

  if (window.innerWidth - rect.right >= hudWidth + EDGE_GAP) {
    left = rect.right + EDGE_GAP;
    top = clamp(rect.top, minimumTop, maxTop);
  } else if (rect.left >= hudWidth + EDGE_GAP) {
    left = rect.left - hudWidth - EDGE_GAP;
    top = clamp(rect.top, minimumTop, maxTop);
  } else if (window.innerHeight - rect.bottom >= hudHeight + EDGE_GAP) {
    left = clamp(rect.left, VIEWPORT_INSET, maxLeft);
    top = clamp(rect.bottom + EDGE_GAP, minimumTop, maxTop);
  } else if (rect.top >= hudHeight + EDGE_GAP) {
    left = clamp(rect.left, VIEWPORT_INSET, maxLeft);
    top = clamp(rect.top - hudHeight - EDGE_GAP, minimumTop, maxTop);
  } else {
    left = pointer.x + EDGE_GAP;
    if (left + hudWidth > window.innerWidth - VIEWPORT_INSET) {
      left = pointer.x - hudWidth - EDGE_GAP;
    }
    top = pointer.y + EDGE_GAP;
    if (top + hudHeight > window.innerHeight - VIEWPORT_INSET) {
      top = pointer.y - hudHeight - EDGE_GAP;
    }
    left = clamp(left, VIEWPORT_INSET, maxLeft);
    top = clamp(top, minimumTop, maxTop);
  }

  // Read panel geometry before updating the outline to avoid another layout flush.
  ui.highlight.hidden = false;
  if (smoothOutline !== undefined) ui.highlight.dataset.smooth = String(smoothOutline);
  const width = Math.max(0, visibleRight - visibleLeft);
  const height = Math.max(0, visibleBottom - visibleTop);
  Object.assign(ui.highlight.style, {
    transform: `translate3d(${visibleLeft}px, ${visibleTop}px, 0)`,
    width: `${width}px`,
    height: `${height}px`,
  });
  // Animate independent 1px edges so resizing never stretches the stroke thickness.
  ui.highlightFill.style.transform = `scale(${width}, ${height})`;
  const edges = [
    `scaleX(${width})`,
    `translateY(${Math.max(0, height - 1)}px) scaleX(${width})`,
    `scaleY(${height})`,
    `translateX(${Math.max(0, width - 1)}px) scaleY(${height})`,
  ];
  ui.highlightEdges.forEach((edge, index) => { edge.style.transform = edges[index]!; });
  ui.hud.style.transform = `translate3d(${left}px, ${top}px, 0)`;
}

function parentElement(target: Element): Element | null {
  if (target.parentElement) return target.parentElement;
  const root = target.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function attachScreenshot(reference: Reference, crop: ScreenshotCrop): Reference {
  return {
    ...reference,
    source: {
      ...reference.source,
      viewport: {
        ...reference.source.viewport,
        scale: crop.scaleX,
      },
    },
    screenshot: {
      dataUrl: crop.dataUrl,
      storagePath: null,
      mimeType: crop.format,
      width: crop.width,
      height: crop.height,
    },
  };
}

async function sendMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  return (await browser.runtime.sendMessage(message)) as ExtensionResponse;
}

function installCursor(host: HTMLElement): () => void {
  const root = document.documentElement;
  const previousAttribute = root.getAttribute(CURSOR_ATTRIBUTE);
  root.setAttribute(CURSOR_ATTRIBUTE, '');

  const cursorStyle = element('style');
  cursorStyle.textContent = `html[${CURSOR_ATTRIBUTE}] *:not(#${HOST_ID}) { cursor: crosshair !important; }`;
  (document.head ?? root).append(cursorStyle);

  return () => {
    cursorStyle.remove();
    if (previousAttribute == null) root.removeAttribute(CURSOR_ATTRIBUTE);
    else root.setAttribute(CURSOR_ATTRIBUTE, previousAttribute);
    host.style.removeProperty('cursor');
  };
}

export function bootstrapInspector(): void {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.dispatchEvent(new CustomEvent(TOGGLE_EVENT));
    return;
  }

  const host = element('div');
  host.id = HOST_ID;
  host.setAttribute('data-refer-overlay', '');
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('inset', '0', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  host.style.setProperty('display', 'block', 'important');
  host.style.setProperty('visibility', 'visible', 'important');
  host.style.setProperty('pointer-events', 'none', 'important');

  const shadow = host.attachShadow({ mode: 'open' });
  const ui = createUi(shadow);
  document.documentElement.append(host);

  let active = true;
  let saving = false;
  let expanded = false;
  let panelAnimation: Animation | undefined;
  let target: Element | null = null;
  let frame = 0;
  let geometryFrame = 0;
  let pendingPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let lastPointer = pendingPoint;
  let lastSavedId: string | null = null;
  let lastSavedUserId: string | undefined;
  let retryTarget: Element | null = null;
  const childTrail = new WeakMap<Element, Element>();
  const cleanups: Array<() => void> = [];
  const restoreCursor = installCursor(host);
  const saveFeedback = createSaveFeedback(ui.root);

  function listen(
    eventTarget: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ): void {
    eventTarget.addEventListener(type, listener, options);
    cleanups.push(() => eventTarget.removeEventListener(type, listener, options));
  }

  function isOverlayEvent(event: Event): boolean {
    return event.composedPath().includes(host);
  }

  function setOverlayVisibility(visible: boolean): void {
    host.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
  }

  function setExpanded(next: boolean, animate = false): void {
    panelAnimation?.cancel();
    panelAnimation = undefined;
    const before = ui.hud.getBoundingClientRect();
    expanded = next;
    ui.hud.dataset.expanded = String(next);
    ui.fontPreview.hidden = next;
    ui.sections.hidden = !next;
    ui.hint.hidden = !next;
    ui.chipLabel.textContent = next ? 'Click again to save' : 'Click to inspect';
    if (!target?.isConnected) return;
    if (next) renderProperties(ui, target);
    positionOverlay(ui, target, lastPointer, next ? false : undefined);
    if (next && animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const after = ui.hud.getBoundingClientRect();
      // Reveal the panel from the compact label without scaling its text or page content.
      // Match the library search expansion curve, with a shorter inspector duration.
      panelAnimation = ui.hud.animate([
        { clipPath: `inset(0 ${Math.max(0, after.width - before.width)}px ${Math.max(0, after.height - before.height)}px 0 round 4px)` },
        { clipPath: 'inset(0 0 0 0 round 4px)' },
      ], { duration: 280, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
  }

  function setTarget(next: Element | null, smoothOutline = false): void {
    if (!active || next === host || next?.closest?.(`#${HOST_ID}`)) return;
    if (next === target) {
      if (target?.isConnected) positionOverlay(ui, target, lastPointer, smoothOutline);
      return;
    }

    target = next;
    if (!target || !target.isConnected) {
      target = null;
      setExpanded(false);
      ui.highlight.hidden = true;
      ui.hud.hidden = true;
      return;
    }

    ui.fontPreview.textContent = primaryFont(getComputedStyle(target).fontFamily);
    if (expanded) renderProperties(ui, target);
    positionOverlay(ui, target, lastPointer, smoothOutline);
  }

  function hideToast(): void {
    ui.toast.hidden = true;
    ui.toast.dataset.kind = '';
  }

  function showToast(kind: ToastKind, message: string): void {
    ui.toast.dataset.kind = kind;
    ui.toastMark.textContent = kind === 'saved' ? '✓' : '×';
    ui.toastMessage.textContent = message;
    ui.undoButton.hidden = kind !== 'saved';
    ui.viewButton.hidden = kind !== 'saved';
    ui.retryButton.hidden = kind !== 'error';
    ui.toast.hidden = false;
    announce(ui.announcer, message);
  }

  async function saveTarget(elementToSave: Element): Promise<void> {
    if (!active || saving || !elementToSave.isConnected) return;
    saving = true;
    saveFeedback.clear();
    retryTarget = elementToSave;
    ui.chipLabel.textContent = 'Saving…';
    announce(ui.announcer, 'Saving reference');
    let restoreEditableContent = () => {};

    try {
      const reference = inspectElement(elementToSave);
      const rect = elementToSave.getBoundingClientRect();
      restoreEditableContent = concealEditableContent(document.documentElement);
      setOverlayVisibility(false);
      await waitForOverlayToDisappear();
      const crop = await captureElementImage(rect);
      const capturedReference = attachScreenshot(
        { ...reference, facets: inferFacets(reference.element) },
        crop,
      );
      restoreEditableContent();
      const response = await sendMessage({ type: 'save-reference', reference: capturedReference });
      if (!response.ok) throw new Error(response.error);

      lastSavedId = capturedReference.id;
      lastSavedUserId = response.userId;
      retryTarget = null;
      const message = 'Saved to your library';
      showToast('saved', message);
      if (active) {
        setExpanded(false);
        saveFeedback.saved(elementToSave);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save. Check your connection and try again.';
      showToast('error', message);
    } finally {
      restoreEditableContent();
      saving = false;
      if (active) {
        setOverlayVisibility(true);
        ui.chipLabel.textContent = expanded ? 'Click again to save' : 'Click to inspect';
        if (target?.isConnected) positionOverlay(ui, target, lastPointer);
      }
    }
  }

  function cleanup(): void {
    if (!active) return;
    active = false;
    panelAnimation?.cancel();
    saveFeedback.dispose();
    if (frame) cancelAnimationFrame(frame);
    if (geometryFrame) cancelAnimationFrame(geometryFrame);
    for (const dispose of cleanups.splice(0)) dispose();
    restoreCursor();
    host.remove();
  }

  function selectAtPointer(): void {
    frame = 0;
    if (expanded || saving) return;
    lastPointer = pendingPoint;
    const hit = document.elementFromPoint(pendingPoint.x, pendingPoint.y);
    if (hit && hit !== host) setTarget(hit, true);
  }

  const handlePointerMove: EventListener = (event) => {
    if (!(event instanceof PointerEvent) || isOverlayEvent(event)) return;
    pendingPoint = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(selectAtPointer);
  };

  const stopPagePointer: EventListener = (event) => {
    if (isOverlayEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const handleClick: EventListener = (event) => {
    if (!(event instanceof MouseEvent) || isOverlayEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.button !== 0 || saving) return;
    if (expanded) {
      if (target?.isConnected) void saveTarget(target);
      else setTarget(null);
      return;
    }
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    lastPointer = pendingPoint = { x: event.clientX, y: event.clientY };
    const clicked = document.elementFromPoint(event.clientX, event.clientY);
    if (clicked && clicked !== host) setTarget(clicked);
    if (target) {
      setExpanded(true, true);
      announce(ui.announcer, 'Element selected. Click again or press Enter to save. Escape resumes inspection.');
    }
  };

  const handleFocus: EventListener = (event) => {
    if (isOverlayEvent(event) || expanded || saving) return;
    if (event.target instanceof Element) setTarget(event.target);
  };

  const handleKeydown: EventListener = (event) => {
    if (!(event instanceof KeyboardEvent)) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (expanded && !saving) {
        setExpanded(false);
        announce(ui.announcer, 'Move the pointer to inspect another element.');
      } else cleanup();
      return;
    }

    if (isOverlayEvent(event)) return;
    if (saving) {
      if (event.key === 'Enter') { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }

    const plainArrow = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (plainArrow && event.key === 'ArrowUp' && target) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const parent = parentElement(target);
      if (parent) {
        childTrail.set(parent, target);
        setTarget(parent);
      }
      return;
    }

    if (plainArrow && event.key === 'ArrowDown' && target) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const child = childTrail.get(target);
      if (child?.isConnected) {
        setTarget(child);
      }
      return;
    }

    if (event.key === 'Enter' && target) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (expanded) void saveTarget(target);
      else {
        setExpanded(true);
        announce(ui.announcer, 'Element selected. Press Enter again to save. Escape resumes inspection.');
      }
    }
  };

  const updateGeometry: EventListener = () => {
    if (geometryFrame) return;
    geometryFrame = requestAnimationFrame(() => {
      geometryFrame = 0;
      if (target?.isConnected) positionOverlay(ui, target, lastPointer, false);
      else if (target) setTarget(null);
    });
  };

  listen(window, 'pointermove', handlePointerMove, { capture: true, passive: true });
  listen(window, 'pointerdown', stopPagePointer, { capture: true, passive: false });
  listen(window, 'pointerup', stopPagePointer, { capture: true, passive: false });
  listen(window, 'click', handleClick, { capture: true, passive: false });
  listen(window, 'keydown', handleKeydown, true);
  listen(document, 'focusin', handleFocus, true);
  listen(document, 'scroll', updateGeometry, { capture: true, passive: true });
  listen(window, 'resize', updateGeometry, { passive: true });
  listen(host, TOGGLE_EVENT, cleanup);

  ui.exitButton.addEventListener('click', cleanup);
  cleanups.push(() => ui.exitButton.removeEventListener('click', cleanup));

  const dismissToast = (): void => hideToast();
  ui.closeToastButton.addEventListener('click', dismissToast);
  cleanups.push(() => ui.closeToastButton.removeEventListener('click', dismissToast));

  const viewReferences = async (): Promise<void> => {
    try {
      const response = await sendMessage({ type: 'open-library' });
      if (!response.ok) showToast('error', 'Unable to open references. Try again.');
    } catch {
      showToast('error', 'Unable to open references. Try again.');
    }
  };
  listen(ui.viewButton, 'click', viewReferences);
  listen(ui.libraryButton, 'click', viewReferences);

  const retrySave = (): void => {
    if (retryTarget?.isConnected) void saveTarget(retryTarget);
  };
  ui.retryButton.addEventListener('click', retrySave);
  cleanups.push(() => ui.retryButton.removeEventListener('click', retrySave));

  const undoSave = (): void => {
    if (!lastSavedId) return;
    const id = lastSavedId;
    ui.undoButton.disabled = true;
    void sendMessage({ type: 'delete-reference', id, expectedUserId: lastSavedUserId })
      .then((response) => {
        if (!response.ok) throw new Error(response.error);
        if (lastSavedId === id) lastSavedId = null;
        showToast('saved', 'Removed');
        ui.undoButton.hidden = true;
      })
      .catch(() => showToast('error', 'Unable to remove the reference. Try again.'))
      .finally(() => {
        ui.undoButton.disabled = false;
      });
  };
  ui.undoButton.addEventListener('click', undoSave);
  cleanups.push(() => ui.undoButton.removeEventListener('click', undoSave));

  announce(ui.announcer, 'Inspector active. Hover to see the font. Click or press Enter to inspect, then again to save.');
}
