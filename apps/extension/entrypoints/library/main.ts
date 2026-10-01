import { conciseElementLabel, formatCaptureDate, libraryFilters, libraryEmptyCopy, type LibraryFilter } from '@refer/capture/presentation';
import type { Reference } from '@refer/capture';
import type { CloudState } from '../../src/cloud/types';
import type { ExtensionMessage, ExtensionResponse } from '../../src/messages';

type Filter = LibraryFilter;
type UnknownRecord = Record<string, unknown>;

const grid = requiredElement<HTMLDivElement>('reference-grid');
const emptyState = requiredElement<HTMLDivElement>('empty-state');
const emptyTitle = requiredElement<HTMLHeadingElement>('empty-title');
const emptyCopy = requiredElement<HTMLParagraphElement>('empty-copy');
const clearFilters = requiredElement<HTMLButtonElement>('clear-filters');
const search = requiredElement<HTMLInputElement>('search');
const count = requiredElement<HTMLParagraphElement>('library-count');
const summary = requiredElement<HTMLDivElement>('result-summary');
const detailDialog = requiredElement<HTMLDialogElement>('detail-dialog');
const detailContent = requiredElement<HTMLDivElement>('detail-content');
const confirmDialog = requiredElement<HTMLDialogElement>('confirm-dialog');
const confirmDelete = requiredElement<HTMLButtonElement>('confirm-delete');
const toast = requiredElement<HTMLDivElement>('toast');
const undoDelete = requiredElement<HTMLButtonElement>('undo-delete');
const dismissToast = requiredElement<HTMLButtonElement>('dismiss-toast');
const accountButton = requiredElement<HTMLButtonElement>('account-button');
const accountButtonLabel = requiredElement<HTMLSpanElement>('account-button-label');
const accountDialog = requiredElement<HTMLDialogElement>('account-dialog');
const accountClose = requiredElement<HTMLButtonElement>('account-close');
const accountCopy = requiredElement<HTMLParagraphElement>('account-copy');
const accountFeedback = requiredElement<HTMLParagraphElement>('account-feedback');
const signInForm = requiredElement<HTMLFormElement>('sign-in-form');
const signInButton = requiredElement<HTMLButtonElement>('sign-in-button');
const signedInPanel = requiredElement<HTMLDivElement>('signed-in-panel');
const signedInEmail = requiredElement<HTMLParagraphElement>('signed-in-email');
const syncDetail = requiredElement<HTMLParagraphElement>('sync-detail');
const syncNowButton = requiredElement<HTMLButtonElement>('sync-now');
const signOutButton = requiredElement<HTMLButtonElement>('sign-out');
const importButton = requiredElement<HTMLButtonElement>('import-legacy');

let references: Reference[] = [];
let activeFilter: Filter = 'all';
let selectedReference: Reference | undefined;
let pendingDeletion: Reference | undefined;
let restoreFocusTo: HTMLElement | undefined;
let cloudState: CloudState | undefined;

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: ${id}`);
  return element as T;
}

async function sendExtensionMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  return (await browser.runtime.sendMessage(message)) as ExtensionResponse;
}

async function cloudRequest(message: ExtensionMessage): Promise<CloudState> {
  const response = await sendExtensionMessage(message);
  if (!response.ok) throw new Error(response.error);
  if (!response.cloudState) throw new Error('The extension did not return cloud status.');
  cloudState = response.cloudState;
  renderCloudState();
  return response.cloudState;
}

function renderCloudState(): void {
  const state = cloudState;
  accountButton.dataset.state = state?.authStatus ?? 'unavailable';
  signInForm.hidden = true;
  signedInPanel.hidden = true;

  if (!state?.configured) {
    accountButtonLabel.textContent = 'Account unavailable';
    accountCopy.textContent = 'You can inspect any page. Saving requires an account-enabled build.';
    accountFeedback.textContent = '';
    return;
  }

  if (state.authStatus !== 'signed-in') {
    accountButtonLabel.textContent = 'Sign in';
    accountCopy.textContent = 'Sign in to save references and see the same library on the web and in Glance.';
    signInForm.hidden = false;
    return;
  }

  accountButtonLabel.textContent = state.email ?? 'Account';
  accountCopy.textContent = 'Your references are saved to your account and available in both libraries. An internet connection is required.';
  signedInPanel.hidden = false;
  signedInEmail.textContent = state.email ?? 'Signed in';
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

function fontStack(reference: Reference): string {
  return stringValue(
    reference,
    [
      ['element', 'typography', 'fontFamily'],
      ['snapshot', 'typography', 'fontFamily'],
      ['typography', 'fontFamily'],
    ],
    fontFamily(reference),
  );
}

function fontProperty(reference: Reference, property: string, fallback: string): string {
  return stringValue(
    reference,
    [
      ['element', 'typography', property],
      ['snapshot', 'typography', property],
      ['typography', property],
    ],
    fallback,
  );
}

function screenshot(reference: Reference): string | undefined {
  const result = stringValue(reference, [['screenshotDataUrl'], ['screenshot', 'dataUrl']]);
  return /^data:image\/(?:png|webp|jpeg|gif);base64,/i.test(result) ? result : undefined;
}

function captureDate(reference: Reference): string {
  return formatCaptureDate(reference.capturedAt);
}

function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
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

function createCard(reference: Reference): HTMLElement {
  const card = document.createElement('article');
  card.className = 'reference-card';

  const openButton = document.createElement('button');
  openButton.className = 'card-open';
  openButton.type = 'button';
  const accessibleLabel = elementLabel(reference);
  const conciseLabel = accessibleLabel.length > 80 ? `${accessibleLabel.slice(0, 79)}…` : accessibleLabel;
  openButton.setAttribute('aria-label', `View ${conciseLabel} from ${sourceHost(reference)}`);
  openButton.addEventListener('click', () => openDetails(reference, openButton));

  const media = document.createElement('span');
  media.className = 'card-media';
  const imageUrl = screenshot(reference);
  const width = Number(valueAt(reference, ['screenshot', 'width']));
  const height = Number(valueAt(reference, ['screenshot', 'height']));
  media.style.aspectRatio = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? `${width} / ${height}` : '4 / 3';
  const textColor = stringValue(reference, [['element', 'colors', 'text']]);
  const background = stringValue(reference, [['element', 'colors', 'effectiveBackground'], ['element', 'colors', 'background']]);
  card.style.setProperty('--specimen-color', textColor.startsWith('rgb') ? textColor : '#181916');
  card.style.setProperty('--specimen-bg', background.startsWith('rgb') ? background : '#fcfbf8');
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = `Captured ${elementLabel(reference)} on ${sourceHost(reference)}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    media.append(image);
  } else {
    const specimen = document.createElement('span');
    specimen.className = 'card-specimen';
    specimen.textContent = capturedText(reference) || 'Aa';
    specimen.style.fontFamily = fontFamily(reference);
    media.append(specimen);
  }

  const body = document.createElement('span');
  body.className = 'card-body';

  const meta = document.createElement('span');
  meta.className = 'card-meta';
  const host = document.createElement('bdi');
  host.textContent = sourceHost(reference);
  const date = document.createElement('span');
  date.textContent = captureDate(reference);
  meta.append(host, date);

  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = elementLabel(reference);

  const detail = document.createElement('span');
  detail.className = 'card-detail';
  const previewWrap = document.createElement('span');
  previewWrap.className = 'font-preview-wrap';
  const typeface = document.createElement('button');
  typeface.className = 'font-preview-trigger';
  typeface.type = 'button';
  typeface.textContent = fontFamily(reference);
  const tooltipId = `font-preview-${reference.id.replace(/[^a-zA-Z0-9_-]/gu, '')}`;
  typeface.setAttribute('aria-label', `Preview ${fontFamily(reference)} from ${elementLabel(reference)}`);
  typeface.setAttribute('aria-describedby', tooltipId);
  previewWrap.append(typeface);

  const preview = document.createElement('span');
  preview.className = 'font-preview-popover';
  preview.id = tooltipId;
  preview.setAttribute('role', 'tooltip');
  if (imageUrl) {
    const imageFrame = document.createElement('span');
    imageFrame.className = 'font-preview-image';
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    imageFrame.append(image);
    preview.append(imageFrame);
  } else {
    const specimen = document.createElement('span');
    specimen.className = 'font-preview-sample';
    specimen.textContent = capturedText(reference) || 'Aa Bb Cc 0123';
    specimen.style.fontFamily = fontStack(reference);
    specimen.style.fontWeight = fontProperty(reference, 'fontWeight', '400');
    specimen.style.fontStyle = fontProperty(reference, 'fontStyle', 'normal');
    specimen.style.letterSpacing = fontProperty(reference, 'letterSpacing', 'normal');
    preview.append(specimen);
  }

  const previewCaption = document.createElement('span');
  previewCaption.className = 'font-preview-caption';
  const previewKind = document.createElement('strong');
  previewKind.textContent = fontFamily(reference);
  const previewCaveat = document.createElement('span');
  previewCaveat.textContent = imageUrl
    ? 'Captured preview · Original rendering'
    : 'Live specimen · Browser fallback may apply';
  previewCaption.append(previewKind, previewCaveat);
  preview.append(previewCaption);
  detail.append(previewWrap, preview);

  body.append(meta, title);
  openButton.append(media, body);
  card.append(openButton, detail);
  return card;
}

function render(): void {
  const visible = visibleReferences();
  grid.replaceChildren(...visible.map(createCard));
  grid.setAttribute('aria-busy', 'false');

  count.textContent = `${pluralize(references.length, 'reference')} · ${pluralize(
    references.filter((reference) => facetList(reference).includes('typography')).length,
    'type find',
    'type finds',
  )}`;

  const filtering = Boolean(search.value.trim()) || activeFilter !== 'all';
  summary.textContent = filtering ? `${pluralize(visible.length, 'result')} shown` : '';
  emptyState.hidden = visible.length > 0;
  grid.hidden = visible.length === 0;

  if (cloudState?.authStatus !== 'signed-in') {
    grid.hidden = true;
    emptyState.hidden = false;
    emptyTitle.textContent = 'Sign in to your library';
    emptyCopy.textContent = 'Inspect freely. Sign in to save references and access them anywhere.';
    clearFilters.hidden = true;
    count.textContent = 'Your library';
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

function openDetails(reference: Reference, trigger: HTMLElement): void {
  selectedReference = reference;
  restoreFocusTo = trigger;
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
  header.className = 'detail-header';
  const headerMeta = document.createElement('p');
  headerMeta.className = 'detail-meta';
  headerMeta.textContent = `${sourceHost(reference)} · ${captureDate(reference)}`;
  const title = document.createElement('h2');
  title.id = 'detail-title';
  title.textContent = elementLabel(reference);
  const subtitle = document.createElement('p');
  subtitle.className = 'detail-subtitle';
  subtitle.textContent = pageTitle(reference);
  header.append(headerMeta, title, subtitle);

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
    detailSection('Box', [
      ['Width', firstValue(reference, [['element', 'box', 'width'], ['snapshot', 'box', 'width']])],
      ['Height', firstValue(reference, [['element', 'box', 'height'], ['snapshot', 'box', 'height']])],
      ['Padding', firstValue(reference, [['element', 'box', 'padding'], ['snapshot', 'box', 'padding']])],
      ['Margin', firstValue(reference, [['element', 'box', 'margin'], ['snapshot', 'box', 'margin']])],
      ['Border', firstValue(reference, [['element', 'box', 'border'], ['snapshot', 'box', 'border']])],
      ['Radius', firstValue(reference, [['element', 'box', 'radius'], ['snapshot', 'box', 'borderRadius']])],
      ['Shadow', firstValue(reference, [['element', 'effects', 'boxShadow'], ['snapshot', 'effects', 'boxShadow']])],
    ]),
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
  const url = safeSourceUrl(reference);
  if (url) {
    const sourceLink = document.createElement('a');
    sourceLink.className = 'button button-primary';
    sourceLink.href = url;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    sourceLink.textContent = 'Open source page';
    sourceLink.append(createSvgIcon('M7 4h9v9M16 4 6 14M14 11v5H4V6h5'));
    footer.append(sourceLink);
  }
  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'button button-delete';
  deleteButton.textContent = 'Delete reference';
  deleteButton.addEventListener('click', () => confirmDialog.showModal());
  footer.append(deleteButton);

  detailContent.append(hero, header, propertyGrid, footer);
  detailDialog.showModal();
}

function closeDetails(): void {
  detailDialog.close();
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
    detailDialog.close();
    render();
    toast.hidden = false;
    undoDelete.focus();
    selectedReference = undefined;
  } catch {
    confirmDialog.close();
    summary.textContent = 'Unable to delete the reference. Try again.';
    confirmDialog.returnValue = '';
  }
}

async function undoLastDelete(): Promise<void> {
  const reference = pendingDeletion;
  if (!reference) return;
  const owner = cloudState?.userId;
  if (!owner) return;
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
  }
}

const filters = document.querySelector('.filters')!;
for (const [value, label] of libraryFilters) {
  const button = document.createElement('button');
  button.className = `filter${value === 'all' ? ' is-active' : ''}`;
  button.type = 'button';
  button.dataset.filter = value;
  button.setAttribute('aria-pressed', String(value === 'all'));
  button.textContent = label;
  filters.append(button);
}

document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    if (!libraryFilters.some(([value]) => value === filter)) return;
    activeFilter = filter as Filter;
    document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((candidate) => {
      const selected = candidate === button;
      candidate.classList.toggle('is-active', selected);
      candidate.setAttribute('aria-pressed', String(selected));
    });
    render();
  });
});

search.addEventListener('input', render);
clearFilters.addEventListener('click', () => {
  search.value = '';
  activeFilter = 'all';
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    const selected = button.dataset.filter === 'all';
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  render();
  search.focus();
});

document.querySelector<HTMLButtonElement>('[data-close-detail]')?.addEventListener('click', closeDetails);
detailDialog.addEventListener('close', () => {
  restoreFocusTo?.focus();
  restoreFocusTo = undefined;
});
detailDialog.addEventListener('click', (event) => {
  if (event.target === detailDialog) closeDetails();
});

confirmDelete.addEventListener('click', (event) => {
  event.preventDefault();
  void performDelete();
});
undoDelete.addEventListener('click', () => void undoLastDelete());
dismissToast.addEventListener('click', hideToast);

accountButton.addEventListener('click', () => {
  accountButton.setAttribute('aria-expanded', 'true');
  accountFeedback.textContent = '';
  accountDialog.showModal();
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
    await cloudRequest({ type: 'cloud-sign-in' });
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
function clearLibrary(): void {
  loadGeneration++;
  references = [];
  selectedReference = undefined;
  pendingDeletion = undefined;
  detailDialog.close();
  confirmDialog.close();
  hideToast();
  grid.replaceChildren();
  grid.setAttribute('aria-busy', 'false');
}

async function refreshLibrary(): Promise<void> {
  const generation = ++loadGeneration;
  grid.setAttribute('aria-busy', 'true');
  try {
    const stateResponse = await sendExtensionMessage({ type: 'get-cloud-state' });
    if (generation !== loadGeneration) return;
    if (!stateResponse.ok) throw new Error(stateResponse.error);
    const next = stateResponse.cloudState!;
    if (cloudState?.userId !== next.userId) {
      references = []; selectedReference = undefined; pendingDeletion = undefined;
      detailDialog.close(); confirmDialog.close(); hideToast();
    }
    cloudState = next;
    renderCloudState();
    if (next.authStatus !== 'signed-in') { references = []; render(); return; }
    const response = await sendExtensionMessage({ type: 'list-references' });
    if (generation !== loadGeneration) return;
    if (!response.ok) throw new Error(response.error);
    if (response.userId !== next.userId) throw new Error('Your account changed. Refresh the library.');
    references = response.references ?? [];
    render();
    if (selectedReference && !references.some(reference => reference.id === selectedReference?.id)) detailDialog.close();
  } catch (error) {
    if (generation !== loadGeneration) return;
    clearLibrary();
    render();
    emptyTitle.textContent = 'Unable to load your library';
    emptyCopy.textContent = error instanceof Error ? error.message : 'Check your connection and try again.';
    throw error;
  } finally { if (generation === loadGeneration) grid.setAttribute('aria-busy', 'false'); }
}
const refresh = () => { void refreshLibrary().catch(() => undefined); };
window.addEventListener('focus', refresh);
window.addEventListener('online', refresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.setInterval(() => { if (!document.hidden) refresh(); }, 60_000);
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes['refer-library-updated'] || changes['refer-neon-session'])) {
    if (changes['refer-neon-session']) clearLibrary();
    refresh();
  }
});

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

refresh();
