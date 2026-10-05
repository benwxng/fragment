import { conciseElementLabel, formatCaptureDate, libraryFilters, libraryEmptyCopy, libraryImageUnavailableLabel, type LibraryFilter } from '@refer/capture/presentation';
import type { Reference } from '@refer/capture';
import { libraryTemplate } from './template';
import { mountMasonry } from './masonry';
import { mountLibraryMotion } from './motion';
export { libraryTemplate } from './template';
import type { LibraryAdapter, LibraryRequest as ExtensionMessage, LibraryResponse as ExtensionResponse, LibraryAccount as CloudState } from './types';

/** One DOM renderer shared by Next and the extension; adapters own all platform APIs. */
export function mountLibrary(root: HTMLElement, adapter: LibraryAdapter): () => void {
  root.classList.add('glance-library');
  root.removeAttribute('data-brand-motion');
  root.innerHTML = libraryTemplate;
  const motion = mountLibraryMotion(root);
  const controller = new AbortController();
  const { signal } = controller;
  const brand = root.querySelector<HTMLAnchorElement>('.brand')!;
  brand.href = adapter.homeUrl;
  type Filter = LibraryFilter;
  type UnknownRecord = Record<string, unknown>;

  const loadingState = requiredElement<HTMLDivElement>('library-loading');
  let loadingVisible = false;
  const decodedImages = new Set<string>();
  const grid = requiredElement<HTMLDivElement>('reference-grid');
  const masonry = mountMasonry(grid);
  const emptyState = requiredElement<HTMLDivElement>('empty-state');
  const emptyTitle = requiredElement<HTMLHeadingElement>('empty-title');
  const emptyCopy = requiredElement<HTMLParagraphElement>('empty-copy');
  const clearFilters = requiredElement<HTMLButtonElement>('clear-filters');
  const search = requiredElement<HTMLInputElement>('search');
  const summary = requiredElement<HTMLDivElement>('result-summary');
  const detailPage = requiredElement<HTMLElement>('detail-page');
  const galleryPage = requiredElement<HTMLElement>('main-content');
  const detailContent = requiredElement<HTMLDivElement>('detail-content');
  const confirmDialog = requiredElement<HTMLDialogElement>('confirm-dialog');
  const confirmDelete = requiredElement<HTMLButtonElement>('confirm-delete');
  const toast = requiredElement<HTMLDivElement>('toast');
  const undoDelete = requiredElement<HTMLButtonElement>('undo-delete');
  const dismissToast = requiredElement<HTMLButtonElement>('dismiss-toast');
  const accountButton = requiredElement<HTMLButtonElement>('account-button');
  const accountAvatar = requiredElement<HTMLImageElement>('account-avatar');
  accountAvatar.addEventListener('error', () => { accountAvatar.hidden = true; });
  const accountButtonLabel = requiredElement<HTMLSpanElement>('account-button-label');
  const accountDialog = requiredElement<HTMLDialogElement>('account-dialog');
  const accountClose = requiredElement<HTMLButtonElement>('account-close');
  const accountCopy = requiredElement<HTMLParagraphElement>('account-copy');
  const accountFeedback = requiredElement<HTMLParagraphElement>('account-feedback');
  const signInForm = requiredElement<HTMLFormElement>('sign-in-form');
  const signInButton = requiredElement<HTMLButtonElement>('sign-in-button');
  const signedInPanel = requiredElement<HTMLDivElement>('signed-in-panel');
  const syncDetail = requiredElement<HTMLParagraphElement>('sync-detail');
  const syncNowButton = requiredElement<HTMLButtonElement>('sync-now');
  const signOutButton = requiredElement<HTMLButtonElement>('sign-out');
  const importButton = requiredElement<HTMLButtonElement>('import-legacy');

  const viewState = adapter.viewState;
  let references: Reference[] = viewState?.references ?? [];
  let hasLoadedLibrary = viewState?.account?.authStatus === 'signed-in' && viewState.references !== undefined;
  const parameters = new URLSearchParams(window.location.search);
  search.value = parameters.get('q')?.slice(0, 120) ?? '';
  const filters = root.querySelector('.filters');
  let activeFilter: Filter = filters && libraryFilters.some(([value]) => value === parameters.get('facet'))
    ? parameters.get('facet') as Filter : 'all';
  let selectedReference: Reference | undefined;
  let pendingDeletion: Reference | undefined;
  let restoreFocusTo: HTMLElement | undefined;
  let cloudState: CloudState | undefined = viewState?.account;
  let galleryScroll = 0;
  const originalTitle = document.title;
  const isExtension = new URL(adapter.homeUrl, location.href).protocol === 'chrome-extension:';
  const selectionId = (): string | null => {
    if (isExtension) return new URL(location.href).searchParams.get('reference');
    try { return decodeURIComponent(location.pathname.split('/')[2] ?? '') || null; }
    catch { return location.pathname.split('/')[2] || null; }
  };
  function referenceUrl(id: string | null): URL {
    const url = new URL(location.href);
    if (isExtension) {
      if (id) url.searchParams.set('reference', id); else url.searchParams.delete('reference');
    } else url.pathname = id ? '/library/' + encodeURIComponent(id) : '/library';
    return url;
  }
  function navigate(id: string | null, replace = false): void {
    const url = referenceUrl(id);
    if (url.href === location.href) return;
    const state = { ...history.state, glanceFromLibrary: Boolean(id && (!selectedReference || history.state?.glanceFromLibrary)) };
    history[replace ? 'replaceState' : 'pushState'](state, '', url);
  }
  function animateEntry(element: HTMLElement, animate: boolean): void {
    motion.enter(element, animate);
  }

  function requiredElement<T extends HTMLElement>(id: string): T {
    const element = root.querySelector(`#${id}`);
    if (!element) throw new Error(`Missing required element: ${id}`);
    return element as T;
  }

  async function sendExtensionMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
    const response = await adapter.request(message);
    if (signal.aborted) throw new Error('Library closed.');
    if (response.ok && response.redirecting) {
      clearLibrary();
      accountDialog.close();
      root.hidden = true;
    }
    return response;
  }

  async function cloudRequest(message: ExtensionMessage): Promise<CloudState | undefined> {
    const response = await sendExtensionMessage(message);
    if (!response.ok) throw new Error(response.error);
    if (response.redirecting) return;
    if (!response.cloudState) throw new Error('Unable to check your account right now. Please try again.');
    cloudState = response.cloudState;
    renderCloudState();
    return response.cloudState;
  }

  function renderCloudState(): void {
    const state = cloudState;
    accountButton.dataset.state = state?.authStatus ?? 'unavailable';
    const imageUrl = state?.authStatus === 'signed-in' ? state.image : null;
    let safeImage: string | null = null;
    try { if (imageUrl && new URL(imageUrl).protocol === 'https:') safeImage = imageUrl; } catch { /* Use the white-circle fallback. */ }
    if (safeImage) {
      if (accountAvatar.getAttribute('src') !== safeImage) {
        accountAvatar.hidden = false;
        accountAvatar.referrerPolicy = 'no-referrer';
        accountAvatar.src = safeImage;
      }
    } else {
      accountAvatar.hidden = true;
      accountAvatar.removeAttribute('src');
    }
    signInForm.hidden = true;
    signedInPanel.hidden = true;
    accountCopy.hidden = false;

    if (!state?.configured) {
      accountButtonLabel.textContent = 'Account unavailable';
      accountCopy.textContent = 'You can inspect any page. Saving requires an account-enabled build.';
      accountFeedback.textContent = '';
      return;
    }

    if (state.authStatus !== 'signed-in') {
      accountButtonLabel.textContent = 'Sign in';
      accountCopy.textContent = 'Sign in to keep your references in one place.';
      signInForm.hidden = false;
      return;
    }

    accountButtonLabel.textContent = state.email ?? 'Account';
    accountCopy.textContent = 'Your references are saved to your account and available in both libraries. An internet connection is required.';
    signedInPanel.hidden = false;
    accountCopy.hidden = true;
    importButton.hidden = state.legacyCount === 0;
    importButton.textContent = `Import ${state.legacyCount} older saves`;
    syncDetail.textContent = state.legacyBlocked
      ? 'Older saves on this device belong to another account. Sign in to that account to import them.'
      : state.legacyCount ? 'You have older device saves. Import them into this account to keep them in your library.' : '';
  }

  function asRecord(value: unknown): UnknownRecord | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as UnknownRecord
      : undefined;
  }

  function valueAt(value: unknown, path: readonly string[]): unknown {
    let current: unknown = value;
    for (const segment of path) {
      const record = asRecord(current);
      if (!record || !(segment in record)) return undefined;
      current = record[segment];
    }
    return current;
  }

  function firstValue(value: unknown, paths: readonly (readonly string[])[]): unknown {
    for (const path of paths) {
      const result = valueAt(value, path);
      if (result !== undefined && result !== null && result !== '') return result;
    }
    return undefined;
  }

  function stringValue(value: unknown, paths: readonly (readonly string[])[], fallback = ''): string {
    const result = firstValue(value, paths);
    return typeof result === 'string' || typeof result === 'number' ? String(result) : fallback;
  }

  function formatValue(value: unknown): string {
    if (value === undefined || value === null || value === '') return 'Not captured';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map(formatValue).join(', ');

    const record = asRecord(value);
    if (!record) return 'Not captured';
    return Object.entries(record)
      .map(([key, entry]) => `${key}: ${formatValue(entry)}`)
      .join(' · ');
  }

  function facetList(reference: Reference): string[] {
    const facets = firstValue(reference, [['facets']]);
    return Array.isArray(facets)
      ? facets.filter((facet): facet is string => typeof facet === 'string')
      : [];
  }

  function pageTitle(reference: Reference): string {
    return stringValue(reference, [['source', 'title'], ['pageTitle']], 'Untitled page');
  }

  function sourceUrl(reference: Reference): string {
    return stringValue(reference, [['source', 'url'], ['sourceUrl']]);
  }

  function sourceHost(reference: Reference): string {
    const origin = stringValue(reference, [['source', 'origin'], ['sourceOrigin']]);
    const candidate = origin || sourceUrl(reference);
    if (!candidate) return 'Saved reference';
    try {
      return new URL(candidate).hostname.replace(/^www\./, '');
    } catch {
      return candidate;
    }
  }

  function safeSourceUrl(reference: Reference): string | undefined {
    const candidate = sourceUrl(reference);
    if (!candidate) return undefined;
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
    } catch {
      return undefined;
    }
  }

  function elementLabel(reference: Reference): string {
    const semanticName = stringValue(reference, [['element', 'semantic', 'accessibleName']]);
    const excerpt = capturedText(reference);
    const tagName = stringValue(reference, [['element', 'semantic', 'tagName']]);
    const rawLabel = stringValue(
      reference,
      [['element', 'label'], ['elementLabel']],
      semanticName || excerpt || (tagName ? `${tagName.toLocaleLowerCase()} element` : 'Saved element'),
    );
    const role = stringValue(reference, [['element', 'semantic', 'role']], tagName);
    return conciseElementLabel(rawLabel, role, tagName);
  }

  function capturedText(reference: Reference): string {
    return stringValue(reference, [['element', 'textExcerpt'], ['textExcerpt']]);
  }

  function fontFamily(reference: Reference): string {
    return stringValue(
      reference,
      [
        ['snapshot', 'typography', 'primaryFontFamily'],
        ['snapshot', 'typography', 'fontFamily'],
        ['element', 'typography', 'primaryFontFamily'],
        ['element', 'typography', 'fontFamily'],
        ['typography', 'primaryFontFamily'],
        ['primaryFontFamily'],
      ],
      'Unknown typeface',
    ).split(',')[0]?.replace(/["']/g, '').trim() || 'Unknown typeface';
  }

  function screenshot(reference: Reference): string | undefined {
    const result = stringValue(reference, [['screenshotDataUrl'], ['screenshot', 'dataUrl']]);
    return /^data:image\/(?:png|webp|jpeg|gif);base64,/i.test(result) ? result : adapter.imageUrl?.(reference);
  }

  function captureDate(reference: Reference): string {
    return formatCaptureDate(reference.capturedAt);
  }

  function searchableText(reference: Reference): string {
    const note = stringValue(reference, [['note']]);
    return [
      pageTitle(reference),
      sourceHost(reference),
      elementLabel(reference),
      capturedText(reference),
      fontFamily(reference),
      note,
      ...facetList(reference),
    ].join(' ').toLocaleLowerCase();
  }

  function visibleReferences(): Reference[] {
    const query = search.value.trim().toLocaleLowerCase();
    return references.filter((reference) => {
      const facets = facetList(reference);
      const matchesFilter = activeFilter === 'all' || facets.includes(activeFilter);
      return matchesFilter && (!query || searchableText(reference).includes(query));
    });
  }

  function createSvgIcon(path: string): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathElement.setAttribute('d', path);
    svg.append(pathElement);
    return svg;
  }

  function createCard(reference: Reference, index: number): HTMLElement {
    const card = document.createElement('article');
    card.className = 'reference-card';

    const openButton = document.createElement('a');
    openButton.className = 'card-open';
    openButton.href = referenceUrl(reference.id).href;
    openButton.dataset.referenceId = reference.id;
    const accessibleLabel = fontFamily(reference);
    const conciseLabel = accessibleLabel.length > 80 ? `${accessibleLabel.slice(0, 79)}…` : accessibleLabel;
    openButton.setAttribute('aria-label', `View ${conciseLabel} from ${sourceHost(reference)}`);
    openButton.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openDetails(reference, openButton, true, event.detail > 0);
    });

    const media = document.createElement('span');
    media.className = 'card-media';
    const imageUrl = screenshot(reference);
    const width = Number(valueAt(reference, ['screenshot', 'width']));
    const height = Number(valueAt(reference, ['screenshot', 'height']));
    if (!imageUrl) media.style.aspectRatio = '4 / 3';
    const textColor = stringValue(reference, [['element', 'colors', 'text']]);
    const background = stringValue(reference, [['element', 'colors', 'effectiveBackground'], ['element', 'colors', 'background']]);
    card.style.setProperty('--specimen-color', textColor.startsWith('rgb') ? textColor : '#181916');
    card.style.setProperty('--specimen-bg', background.startsWith('rgb') ? background : '#fcfbf8');
    if (imageUrl) {
      const image = document.createElement('img');
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        image.width = width;
        image.height = height;
      }
      image.alt = `Captured ${elementLabel(reference)} on ${sourceHost(reference)}`;
      image.loading = index < 4 ? 'eager' : 'lazy';
      if (index === 0) image.fetchPriority = 'high';
      image.decoding = 'async';
      const shouldReveal = !decodedImages.has(imageUrl);
      if (shouldReveal) media.classList.add('is-image-loading');
      media.style.aspectRatio = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? `${width} / ${height}` : '4 / 3';
      media.setAttribute('aria-busy', 'true');
      let settled = false;
      const finish = async () => {
        try { await image.decode(); } catch { /* Show the fallback for unavailable images. */ }
        if (settled || signal.aborted || !root.contains(media)) return;
        settled = true;
        media.classList.remove('is-image-loading');
        media.removeAttribute('aria-busy');
        if (image.naturalWidth) {
          media.style.removeProperty('aspect-ratio');
          decodedImages.add(imageUrl);
          if (shouldReveal) motion.imageReady(image);
        } else {
          const unavailable = document.createElement('span');
          unavailable.className = 'card-image-unavailable';
          unavailable.textContent = libraryImageUnavailableLabel;
          image.replaceWith(unavailable);
        }
        masonry.refresh();
      };
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
      image.src = imageUrl;
      media.append(image);
      queueMicrotask(() => { if (image.complete) void finish(); });
    } else {
      const specimen = document.createElement('span');
      specimen.className = 'card-specimen';
      specimen.textContent = capturedText(reference) || 'Aa';
      specimen.style.fontFamily = fontFamily(reference);
      media.append(specimen);
    }

    const body = document.createElement('span');
    body.className = 'card-body';

    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = fontFamily(reference);

    body.append(title);
    const blur = document.createElement('span');
    blur.className = 'card-blur';
    blur.setAttribute('aria-hidden', 'true');
    openButton.append(media, blur, body);
    card.append(openButton);
    const source = safeSourceUrl(reference);
    if (source) {
      // A sibling link keeps source navigation independent of the preview link.
      const sourceLink = document.createElement('a');
      sourceLink.className = 'card-source';
      sourceLink.href = source;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      sourceLink.setAttribute('aria-label', `Visit ${sourceHost(reference)} (opens in a new tab)`);
      sourceLink.append(createSvgIcon('M5 15 15 5M5 5h10v10'));
      card.append(sourceLink);
    }
    return card;
  }

  function showLoading(visible: boolean): void {
    loadingVisible = visible;
    loadingState.hidden = !visible;
    motion.loading(visible);
    if (visible) {
      grid.hidden = true;
      emptyState.hidden = true;
      summary.textContent = '';
    }
  }

  function render(): void {
    if (signal.aborted || (loadingVisible && !hasLoadedLibrary)) return;
    showLoading(false);
    if (viewState && hasLoadedLibrary && cloudState?.authStatus === 'signed-in') {
      viewState.account = cloudState;
      viewState.references = references;
    }
    const url = new URL(window.location.href);
    if (search.value) url.searchParams.set('q', search.value); else url.searchParams.delete('q');
    if (activeFilter !== 'all') url.searchParams.set('facet', activeFilter); else url.searchParams.delete('facet');
    window.history.replaceState(window.history.state, '', url);
    const visible = visibleReferences();
    grid.replaceChildren(...visible.map(createCard));
    motion.refresh();
    grid.setAttribute('aria-busy', 'false');

    const filtering = Boolean(search.value.trim()) || activeFilter !== 'all';
    summary.textContent = '';
    emptyState.hidden = visible.length > 0;
    grid.hidden = visible.length === 0;
    masonry.refresh();

    if (cloudState?.authStatus !== 'signed-in') {
      grid.hidden = true;
      emptyState.hidden = false;
      emptyTitle.textContent = 'Sign in to your library';
      emptyCopy.textContent = 'Inspect freely. Sign in to save references and access them anywhere.';
      clearFilters.hidden = true;
      return;
    }

    if (visible.length === 0 && filtering) {
      const query = search.value.trim();
      emptyTitle.textContent = query ? `No results for “${query}”` : `No ${activeFilter} references`;
      emptyCopy.textContent = 'Try another search, or return to all references.';
      clearFilters.hidden = false;
    } else if (visible.length === 0) {
      emptyTitle.textContent = 'No references yet';
      emptyCopy.textContent = libraryEmptyCopy;
      clearFilters.hidden = true;
    }
  }

  function detailRow(term: string, value: unknown): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'property-row';
    const label = document.createElement('dt');
    label.textContent = term;
    const description = document.createElement('dd');
    description.textContent = formatValue(value);
    row.append(label, description);
    return row;
  }

  function detailSection(title: string, rows: readonly [string, unknown][]): HTMLElement {
    const section = document.createElement('section');
    section.className = 'property-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const list = document.createElement('dl');
    list.className = 'property-list';
    list.append(...rows.map(([term, value]) => detailRow(term, value)));
    section.append(heading, list);
    return section;
  }

  function boxModel(reference: Reference): HTMLElement {
    const box = reference.element.box;
    const section = detailSection('Box model', [
      ['Radius', box?.radius], ['Shadow', reference.element.effects?.boxShadow],
    ]);
    const visual = document.createElement('div');
    visual.className = 'box-model-visual';
    visual.setAttribute('role', 'img');
    const description: string[] = [];
    let parent = visual;
    for (const name of ['margin', 'border', 'padding'] as const) {
      const layer = document.createElement('div');
      layer.className = 'box-model-layer box-model-' + name;
      const label = document.createElement('span');
      label.className = 'box-model-layer-name';
      label.textContent = name;
      layer.append(label);
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const value = box?.[name]?.[side];
        const text = name === 'border' && value && typeof value === 'object'
          ? [value.width, value.style].join(' ') : formatValue(value);
        const cell = document.createElement('span');
        cell.className = 'box-model-side box-model-' + side;
        cell.textContent = text;
        layer.append(cell);
        description.push(name + ' ' + side + ': ' + text);
      }
      const inner = document.createElement('div');
      inner.className = 'box-model-inner';
      layer.append(inner);
      parent.append(layer);
      parent = inner;
    }
    const content = document.createElement('div');
    content.className = 'box-model-content';
    content.textContent = formatValue(box?.width) + ' × ' + formatValue(box?.height);
    parent.append(content);
    visual.setAttribute('aria-label', [...description, 'Content: ' + content.textContent].join('. '));
    section.insertBefore(visual, section.querySelector('dl'));
    return section;
  }

  function openDetails(reference: Reference, trigger?: HTMLElement, updateHistory = true, animate = false, animateBrand = updateHistory): void {
    // Initial deep links stay still; card and history navigation provide feedback.
    if (animateBrand) root.setAttribute('data-brand-motion', '');
    if (!selectedReference) galleryScroll = window.scrollY;
    if (updateHistory) navigate(reference.id, Boolean(selectedReference));
    selectedReference = reference;
    if (trigger) restoreFocusTo = trigger;
    detailContent.replaceChildren();

    const hero = document.createElement('div');
    hero.className = 'detail-hero';
    const imageUrl = screenshot(reference);
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = `Captured ${elementLabel(reference)} on ${sourceHost(reference)}`;
      hero.append(image);
    } else {
      const specimen = document.createElement('div');
      specimen.className = 'detail-specimen';
      specimen.textContent = capturedText(reference) || 'A type specimen was not captured.';
      specimen.style.fontFamily = fontFamily(reference);
      hero.append(specimen);
    }

    const header = document.createElement('header');
    header.className = 'visually-hidden';
    const title = document.createElement('h1');
    title.id = 'detail-title';
    title.tabIndex = -1;
    title.textContent = elementLabel(reference);
    header.append(title);

    const propertyGrid = document.createElement('div');
    propertyGrid.className = 'property-grid';
    propertyGrid.append(
      detailSection('Typography', [
        ['Typeface', firstValue(reference, [['element', 'typography', 'fontFamily'], ['snapshot', 'typography', 'fontFamily']])],
        ['Size', firstValue(reference, [['element', 'typography', 'fontSize'], ['snapshot', 'typography', 'fontSize']])],
        ['Weight', firstValue(reference, [['element', 'typography', 'fontWeight'], ['snapshot', 'typography', 'fontWeight']])],
        ['Line height', firstValue(reference, [['element', 'typography', 'lineHeight'], ['snapshot', 'typography', 'lineHeight']])],
        ['Letter spacing', firstValue(reference, [['element', 'typography', 'letterSpacing'], ['snapshot', 'typography', 'letterSpacing']])],
        ['Text color', firstValue(reference, [['element', 'colors', 'text'], ['snapshot', 'colors', 'text']])],
      ]),
      boxModel(reference),
      detailSection('Layout', [
        ['Display', firstValue(reference, [['element', 'layout', 'display'], ['snapshot', 'layout', 'display']])],
        ['Position', firstValue(reference, [['element', 'layout', 'position'], ['snapshot', 'layout', 'position']])],
        ['Row gap', firstValue(reference, [['element', 'layout', 'rowGap'], ['snapshot', 'layout', 'rowGap']])],
        ['Column gap', firstValue(reference, [['element', 'layout', 'columnGap'], ['snapshot', 'layout', 'columnGap']])],
        ['Alignment', firstValue(reference, [['element', 'layout', 'alignItems'], ['snapshot', 'layout', 'alignItems']])],
        ['Justification', firstValue(reference, [['element', 'layout', 'justifyContent'], ['snapshot', 'layout', 'justifyContent']])],
        ['Background', firstValue(reference, [['element', 'colors', 'effectiveBackground'], ['element', 'colors', 'background'], ['snapshot', 'colors', 'background']])],
      ]),
    );

    const footer = document.createElement('footer');
    footer.className = 'detail-footer';
    const metadata = document.createElement('div');
    metadata.className = 'detail-provenance';
    const url = safeSourceUrl(reference);
    if (url) {
      const sourceLink = document.createElement('a');
      sourceLink.className = 'detail-source';
      sourceLink.href = url;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      sourceLink.textContent = sourceHost(reference);
      sourceLink.append(createSvgIcon('M7 4h9v9M16 4 6 14M14 11v5H4V6h5'));
      metadata.append(sourceLink);
    }
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'button button-delete';
    deleteButton.textContent = 'Delete reference';
    deleteButton.addEventListener('click', () => confirmDialog.showModal());
    const saved = document.createElement('span');
    saved.textContent = 'Saved ' + captureDate(reference);
    metadata.append(saved);
    footer.append(deleteButton);

    propertyGrid.append(detailSection('Context', [
      ['Role', reference.element.semantic?.role],
      ['Selector', reference.element.selector],
      ['Snapshot version', reference.snapshotVersion],
      ['Source', sourceUrl(reference)],
      ['Captured text', capturedText(reference)],
    ]));
    const imageColumn = document.createElement('div');
    imageColumn.className = 'detail-image-column';
    imageColumn.append(hero);
    const info = document.createElement('aside');
    info.className = 'detail-info';
    info.setAttribute('aria-label', 'Reference information');
    info.append(header, metadata);
    const inspect = document.createElement('div');
    inspect.className = 'detail-tab-panel';
    const notes = document.createElement('div');
    notes.className = 'detail-tab-panel';
    if (reference.note) {
      const note = document.createElement('section');
      note.className = 'reference-note';
      const label = document.createElement('span');
      label.textContent = 'Your note';
      const copy = document.createElement('p');
      copy.textContent = reference.note;
      note.append(label, copy);
      notes.append(note);
    }
    const typography = propertyGrid.firstElementChild!;
    const more = document.createElement('div');
    more.className = 'detail-tab-panel';
    for (const section of [...propertyGrid.children].slice(1)) more.append(section);
    const colors = document.createElement('section');
    colors.className = 'detail-colors';
    const colorHeading = document.createElement('h3');
    colorHeading.textContent = 'Colors';
    colors.append(colorHeading);
    for (const [label, color] of [
      ['Text', reference.element.colors?.text],
      ['Background', reference.element.colors?.effectiveBackground || reference.element.colors?.background],
    ]) {
      if (!color) continue;
      const row = document.createElement('div');
      row.className = 'detail-color';
      const swatch = document.createElement('span');
      swatch.className = 'detail-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      if (CSS.supports('color', color)) swatch.style.backgroundColor = color;
      const name = document.createElement('span');
      name.textContent = label!;
      const value = document.createElement('span');
      value.textContent = color;
      row.append(swatch, name, value);
      colors.append(row);
    }
    inspect.append(typography);
    if (colors.children.length > 1) inspect.append(colors);
    const tabList = document.createElement('div');
    tabList.className = 'detail-tabs';
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Reference details');
    const panels: [string, HTMLElement][] = [['Inspect', inspect], ['Layout & context', more]];
    if (reference.note) panels.push(['Notes', notes]);
    const tabs = panels.map(([label, panel], index) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.id = `detail-tab-${index}`;
      tab.textContent = label;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `detail-panel-${index}`);
      tab.setAttribute('aria-selected', String(index === 0));
      tab.tabIndex = index === 0 ? 0 : -1;
      panel.id = `detail-panel-${index}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.tabIndex = 0;
      panel.hidden = index !== 0;
      tab.addEventListener('click', () => selectTab(index));
      tab.addEventListener('keydown', event => {
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % panels.length;
        else if (event.key === 'ArrowLeft') next = (index + panels.length - 1) % panels.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = panels.length - 1;
        else return;
        event.preventDefault();
        selectTab(next);
        tabs[next]!.focus();
      });
      return tab;
    });
    function selectTab(selected: number): void {
      tabs.forEach((tab, index) => {
        tab.setAttribute('aria-selected', String(index === selected));
        tab.tabIndex = index === selected ? 0 : -1;
        panels[index]![1].hidden = index !== selected;
      });
    }
    tabList.append(...tabs);
    info.append(tabList, ...panels.map(([, panel]) => panel), footer);
    detailContent.append(imageColumn, info);
    galleryPage.hidden = true;
    detailPage.hidden = false;
    root.classList.add('is-detail');
    motion.brand(animateBrand);
    motion.refresh();
    root.querySelector('.skip-link')?.setAttribute('href', '#detail-title');
    requiredElement('detail-feedback').textContent = '';
    document.title = elementLabel(reference) + ' · Glance';
    window.scrollTo(0, 0);
    title.focus({ preventScroll: true });
    animateEntry(imageColumn, animate);
    animateEntry(info, animate);
  }

  function closeDetails(updateHistory = true): void {
    const wasOpen = !detailPage.hidden;
    if (wasOpen && !signal.aborted) root.setAttribute('data-brand-motion', '');
    const id = selectedReference?.id;
    if (updateHistory) navigate(null, true);
    selectedReference = undefined;
    detailPage.hidden = true;
    galleryPage.hidden = false;
    masonry.refresh();
    root.classList.remove('is-detail');
    motion.brand(wasOpen && !signal.aborted);
    root.querySelector('.skip-link')?.setAttribute('href', '#main-content');
    document.title = originalTitle;
    const card = [...grid.querySelectorAll<HTMLElement>('[data-reference-id]')].find(item => item.dataset.referenceId === id);
    if (wasOpen && !signal.aborted) {
      (card ?? (restoreFocusTo?.isConnected ? restoreFocusTo : search)).focus({ preventScroll: true });
      window.scrollTo(0, galleryScroll);
    }
    restoreFocusTo = undefined;
  }

  function hideToast(): void {
    toast.hidden = true;
    pendingDeletion = undefined;
  }

  async function performDelete(): Promise<void> {
    const reference = selectedReference;
    if (!reference) return;
    const owner = cloudState?.userId;
    if (!owner) return;

    confirmDelete.disabled = true;
    try {
      const response = await sendExtensionMessage({ type: 'delete-reference', id: reference.id, expectedUserId: owner });
      if (!response.ok) throw new Error(response.error);
      if (cloudState?.userId !== owner) return;
      if (response.cloudState) {
        cloudState = response.cloudState;
        renderCloudState();
      }
      references = references.filter((candidate) => candidate.id !== reference.id);
      pendingDeletion = reference;
      confirmDialog.close();
      restoreFocusTo = undefined;
      closeDetails();
      render();
      toast.hidden = false;
      undoDelete.focus();
      selectedReference = undefined;
    } catch {
      confirmDialog.close();
      requiredElement('detail-feedback').textContent = 'Unable to delete the reference. Try again.';
      confirmDialog.returnValue = '';
    } finally { confirmDelete.disabled = false; }
  }

  async function undoLastDelete(): Promise<void> {
    const reference = pendingDeletion;
    if (!reference) return;
    const owner = cloudState?.userId;
    if (!owner) return;
    undoDelete.disabled = true;
    try {
      const response = await sendExtensionMessage({ type: 'save-reference', reference, expectedUserId: owner });
      if (!response.ok) throw new Error(response.error);
      if (cloudState?.userId !== owner) return;
      if (response.cloudState) {
        cloudState = response.cloudState;
        renderCloudState();
      }
      references = [reference, ...references.filter(item => item.id !== reference.id)];
      hideToast();
      render();
      summary.textContent = 'Reference restored.';
    } catch {
      summary.textContent = 'Unable to restore the reference. Keep this page open and try again.';
    } finally { undoDelete.disabled = false; }
  }

  // Restore the commented filter markup to enable these controls again.
  if (filters) for (const [value, label] of libraryFilters) {
    const button = document.createElement('button');
    button.className = `filter${value === activeFilter ? ' is-active' : ''}`;
    button.type = 'button';
    button.dataset.filter = value;
    button.setAttribute('aria-pressed', String(value === activeFilter));
    button.textContent = label;
    filters.append(button);
  }

  root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      if (!libraryFilters.some(([value]) => value === filter)) return;
      activeFilter = filter as Filter;
      root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((candidate) => {
        const selected = candidate === button;
        candidate.classList.toggle('is-active', selected);
        candidate.setAttribute('aria-pressed', String(selected));
      });
      render();
    });
  });

  search.addEventListener('input', () => {
    if (selectedReference) {
      closeDetails();
      search.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    render();
  });
  clearFilters.addEventListener('click', () => {
    search.value = '';
    activeFilter = 'all';
    root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
      const selected = button.dataset.filter === 'all';
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    render();
    search.focus();
  });

  const backLink = root.querySelector<HTMLAnchorElement>('[data-close-detail]')!;
  backLink.href = referenceUrl(null).href;
  function returnToLibrary(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (detailPage.hidden) return;
    if (history.state?.glanceFromLibrary) history.back(); else closeDetails();
  }
  backLink.addEventListener('click', returnToLibrary, { signal });
  brand.addEventListener('click', returnToLibrary, { signal });
  // The web shell also has a skip link outside the shared renderer.
  document.addEventListener('click', event => {
    if (detailPage.hidden || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a.skip-link');
    if (link?.hash !== '#main-content') return;
    event.preventDefault();
    requiredElement('detail-title').focus();
  }, { signal });

  confirmDelete.addEventListener('click', (event) => {
    event.preventDefault();
    void performDelete();
  });
  undoDelete.addEventListener('click', () => void undoLastDelete());
  dismissToast.addEventListener('click', hideToast);

  function positionAccountMenu(): void {
    if (!accountDialog.open) return;
    const rect = accountButton.getBoundingClientRect();
    accountDialog.style.top = `${Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - accountDialog.offsetHeight - 8))}px`;
    accountDialog.style.left = `${Math.max(8, Math.min(rect.right - accountDialog.offsetWidth, window.innerWidth - accountDialog.offsetWidth - 8))}px`;
  }
  window.addEventListener('resize', positionAccountMenu, { signal });
  document.addEventListener('scroll', positionAccountMenu, { signal, capture: true });
  document.addEventListener('pointerdown', event => {
    if (accountDialog.open && event.target instanceof Node && !accountDialog.contains(event.target) && !accountButton.contains(event.target)) accountDialog.close();
  }, { signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && accountDialog.open) { event.preventDefault(); accountDialog.close(); }
  }, { signal });
  accountButton.addEventListener('click', (event) => {
    if (accountDialog.open) { accountDialog.close(); return; }
    accountButton.setAttribute('aria-expanded', 'true');
    accountFeedback.textContent = '';
    accountDialog.dataset.keyboard = String(event.detail === 0);
    accountDialog.show();
    if (event.detail !== 0) accountDialog.focus({ preventScroll: true });
    positionAccountMenu();
    void cloudRequest({ type: 'get-cloud-state' }).catch((error) => {
      accountFeedback.textContent = error instanceof Error ? error.message : 'Unable to read cloud status.';
    });
  });
  accountClose.addEventListener('click', () => accountDialog.close());
  accountDialog.addEventListener('close', () => {
    accountButton.setAttribute('aria-expanded', 'false');
    accountButton.focus();
  });
  accountDialog.addEventListener('click', (event) => {
    if (event.target === accountDialog) accountDialog.close();
  });
  signInForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    signInButton.disabled = true;
    accountFeedback.textContent = 'Complete sign-in in the browser window…';
    try {
      const state = await cloudRequest({ type: 'cloud-sign-in' });
      if (!state) return;
      await refreshLibrary();
      accountFeedback.textContent = 'Signed in.';
    } catch (error) {
      accountFeedback.textContent = error instanceof Error ? error.message : 'Unable to sign in.';
    } finally { signInButton.disabled = false; }
  });
  syncNowButton.addEventListener('click', async () => {
    syncNowButton.disabled = true;
    accountFeedback.textContent = 'Loading your library…';
    try { await refreshLibrary(); accountFeedback.textContent = 'Library refreshed.'; }
    catch (error) { accountFeedback.textContent = error instanceof Error ? error.message : 'Unable to load your library.'; }
    finally {
      syncNowButton.disabled = false;
    }
  });
  signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true;
    accountFeedback.textContent = 'Signing out…';
    clearLibrary();
    try {
      await cloudRequest({ type: 'cloud-sign-out' });
      render();
      accountFeedback.textContent = 'Signed out. Your references remain in your account.';
    } catch (error) {
      accountFeedback.textContent = error instanceof Error ? error.message : 'Unable to sign out.';
    } finally {
      signOutButton.disabled = false;
    }
  });

  let loadGeneration = 0;
  let openedInitial = false;
  function forgetView(): void {
    hasLoadedLibrary = false;
    if (viewState) { delete viewState.account; delete viewState.references; }
  }
  function clearLibrary(preserveView = false): void {
    loadGeneration++;
    if (!preserveView) forgetView();
    references = [];
    decodedImages.clear();
    selectedReference = undefined;
    pendingDeletion = undefined;
    closeDetails(false);
    confirmDialog.close();
    hideToast();
    grid.replaceChildren();
    showLoading(false);
    grid.setAttribute('aria-busy', 'false');
  }

  async function prepareImages(items: Reference[], generation: number): Promise<void> {
    // Embedded extension images are already downloaded. Remote web images must
    // load in their cards, so off-screen captures cannot hold up the whole page.
    const urls = [...new Set(items.map(screenshot).filter((url): url is string => Boolean(url?.startsWith('data:'))))];
    let next = 0;
    const current = () => !signal.aborted && generation === loadGeneration;
    await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
      while (current() && next < urls.length) {
        const url = urls[next++]!;
        if (decodedImages.has(url)) continue;
        const image = new Image();
        image.decoding = 'async';
        image.src = url;
        try {
          await image.decode();
          if (current() && image.naturalWidth) decodedImages.add(url);
        } catch { /* A broken capture gets the existing fallback, without blocking the gallery. */ }
      }
    }));
  }

  async function loadLibrary(): Promise<void> {
    if (signal.aborted) return;
    const generation = ++loadGeneration;
    let resetOnError = false;
    showLoading(!hasLoadedLibrary);
    grid.setAttribute('aria-busy', 'true');
    try {
      const stateResponse = await sendExtensionMessage({ type: 'get-cloud-state' });
      if (generation !== loadGeneration) return;
      if (!stateResponse.ok) {
        resetOnError = Boolean(stateResponse.resetLibrary);
        throw new Error(stateResponse.error);
      }
      if (stateResponse.redirecting) return;
      const next = stateResponse.cloudState!;
      if (cloudState?.userId !== next.userId) {
        forgetView();
        decodedImages.clear();
        references = []; selectedReference = undefined; pendingDeletion = undefined;
        closeDetails(false); confirmDialog.close(); hideToast();
        grid.replaceChildren();
        showLoading(true);
      }
      cloudState = next;
      renderCloudState();
      if (next.authStatus !== 'signed-in') { clearLibrary(); render(); return; }
      const response = await sendExtensionMessage({ type: 'list-references' });
      if (generation !== loadGeneration) return;
      if (!response.ok) {
        resetOnError = Boolean(response.resetLibrary);
        throw new Error(response.error);
      }
      if (response.redirecting) return;
      if (response.userId !== next.userId) {
        resetOnError = true;
        throw new Error('Your account changed. Refresh the library.');
      }
      const initialLoad = !hasLoadedLibrary;
      const nextReferences = response.references ?? [];
      if (initialLoad) await prepareImages(nextReferences, generation);
      if (signal.aborted || generation !== loadGeneration) return;
      references = nextReferences;
      hasLoadedLibrary = true;
      render();
      if (initialLoad && !grid.hidden) motion.galleryReady(grid);
      requiredElement('detail-feedback').textContent = '';
      const initialId = selectionId() ?? (!openedInitial ? adapter.initialReferenceId : undefined);
      if (initialId && (!openedInitial || detailPage.hidden)) {
        openedInitial = true;
        const initial = references.find(reference => reference.id === initialId);
        if (initial) openDetails(initial, search, false);
        else { closeDetails(); summary.textContent = 'This reference is no longer in your library.'; }
      }
      if (selectedReference && !references.some(reference => reference.id === selectedReference?.id)) closeDetails();
    } catch (error) {
      if (generation !== loadGeneration) return;
      if (hasLoadedLibrary && !resetOnError) {
        const message = 'Unable to refresh right now. Showing your last loaded references.';
        summary.textContent = message;
        if (!detailPage.hidden) requiredElement('detail-feedback').textContent = message;
        throw error;
      }
      clearLibrary();
      render();
      emptyTitle.textContent = 'Unable to load your library';
      emptyCopy.textContent = error instanceof Error ? error.message : 'Check your connection and try again.';
      throw error;
    } finally { if (generation === loadGeneration) grid.setAttribute('aria-busy', 'false'); }
  }
  let refreshing: { generation: number; promise: Promise<void> } | undefined;
  function refreshLibrary(): Promise<void> {
    if (refreshing?.generation === loadGeneration) return refreshing.promise;
    const promise = loadLibrary().finally(() => {
      if (refreshing?.promise === promise) refreshing = undefined;
    });
    refreshing = { generation: loadGeneration, promise };
    return promise;
  }
  const refresh = () => { void refreshLibrary().catch(() => undefined); };
  window.addEventListener('focus', refresh, { signal });
  window.addEventListener('online', refresh, { signal });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); }, { signal });
  const interval = window.setInterval(() => { if (!document.hidden) refresh(); }, 60_000);
  const unsubscribe = adapter.subscribe?.((accountChanged) => {
    if (accountChanged) clearLibrary();
    refresh();
  });
  window.addEventListener('popstate', () => {
    const id = selectionId();
    if (!id) { closeDetails(false); return; }
    const reference = references.find(item => item.id === id);
    if (reference) openDetails(reference, undefined, false, false, true);
    else { closeDetails(); summary.textContent = 'This reference is no longer in your library.'; }
  }, { signal });

  importButton.addEventListener('click', async () => {
    importButton.disabled = true;
    accountFeedback.textContent = 'Importing older saves…';
    try {
      const response = await sendExtensionMessage({ type: 'import-legacy' });
      if (!response.ok) throw new Error(response.error);
      await refreshLibrary();
      accountFeedback.textContent = 'Older saves are now in your account library.';
    } catch (error) {
      accountFeedback.textContent = `${error instanceof Error ? error.message : 'Import failed.'} Your older saves are preserved; you can retry.`;
    } finally { importButton.disabled = false; }
  });

  if (hasLoadedLibrary) {
    renderCloudState();
    render();
    const reference = references.find(item => item.id === (selectionId() ?? adapter.initialReferenceId));
    if (reference) { openedInitial = true; openDetails(reference, search, false); }
  }
  refresh();
  return () => {
    controller.abort();
    motion.dispose();
    masonry.destroy();
    window.clearInterval(interval);
    unsubscribe?.();
    clearLibrary(true);
    accountDialog.close();
    root.replaceChildren();
  };
}
