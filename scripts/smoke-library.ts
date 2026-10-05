import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { demoLibraryAdapter } from '../apps/web/lib/demo-library-adapter';

const previewUrl = process.env.REFER_WEB_PREVIEW_URL ?? 'http://localhost:3002/library?demo=1';
const fixture = demoLibraryAdapter();
const listed = await fixture.request({ type: 'list-references' });
const account = await fixture.request({ type: 'get-cloud-state' });
assert(listed.ok && account.ok);
const profile = await mkdtemp(join(tmpdir(), 'glance-parity-'));
const extensionPath = resolve('apps/extension/.output/chrome-mv3');

async function verifyInterfaceMotion(page: Page) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.locator('#search').focus();
  await page.waitForFunction(() => document.querySelector('#search')!.getAnimations().some(animation => animation instanceof CSSTransition && animation.transitionProperty === 'transform'));
  const search = await page.locator('#search').evaluate(element => {
    const animation = element.getAnimations().find(animation => animation instanceof CSSTransition && animation.transitionProperty === 'transform')!;
    animation.pause(); animation.currentTime = 100;
    return { from: new DOMMatrix(getComputedStyle(element).transform).m41, native: animation.constructor.name === 'CSSTransition' };
  });
  assert(search.native, 'Search must retain its original CSS transition');
  await page.locator('#search').blur();
  const reverse = await page.locator('#search').evaluate(element => {
    const animation = element.getAnimations().find(animation => animation instanceof CSSTransition && animation.transitionProperty === 'transform')!;
    animation.pause(); animation.currentTime = 0;
    const start = new DOMMatrix(getComputedStyle(element).transform).m41;
    animation.finish();
    return start;
  });
  assert(Math.abs(search.from - reverse) < .5, 'Reversing search expansion must not jump');
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished)); });
  // Run twice: effects must release inline styles and remain reusable after completion.
  for (let attempt = 0; attempt < 2; attempt++) {
    const card = page.locator('.reference-card').first();
    await card.hover();
    await page.waitForFunction(() => document.querySelector('.card-body')!.getAnimations().length > 0);
    await card.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)); });
    assert.equal(await card.locator('.card-body').evaluate(el => getComputedStyle(el).opacity), '1');
    await page.mouse.move(0, 0);
    await card.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)); });
    assert.equal(await card.locator('.card-body').evaluate(el => getComputedStyle(el).opacity), '0');
    assert.equal(await card.locator('.card-body').evaluate(el => el.style.opacity), '', 'Finished effects must release inline styles');
  }
  await page.locator('.reference-card').first().hover();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('.glance-library')!.getAnimations({ subtree: true }).length === 0);
  await page.locator('#search').focus();
  assert.equal(await page.locator('#search').evaluate(el => el.getAnimations().length), 0);
  await page.locator('#search').blur();
  await page.mouse.move(0, 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

async function verifyBrandMotion(page: Page) {
  const motion = await page.evaluate(async () => {
    const star = document.querySelector<SVGPathElement>('.brand-asterisk')!;
    const mark = document.querySelector<SVGSVGElement>('.brand-mark')!;
    const detail = document.querySelector<HTMLElement>('#detail-page')!;
    const angle = () => {
      const matrix = new DOMMatrix(getComputedStyle(star).transform);
      return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    };
    const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const transition = async (action: () => void, previous?: Animation) => {
      action();
      for (let frame = 0; frame < 60; frame++) {
        getComputedStyle(star).transform;
        const animation = star.getAnimations().find(item => item !== previous);
        if (animation) { animation.pause(); return animation; }
        await nextFrame();
      }
      throw new Error('Navigation did not animate the logo asterisk');
    };
    const open = () => document.querySelector<HTMLElement>('.card-open')!.click();
    const back = () => document.querySelector<HTMLElement>('[data-close-detail]')!.click();
    const sample = (animation: Animation) => {
      const duration = Number(animation.effect!.getComputedTiming().duration);
      const values = [0, .25, .5, .75, 1].map(progress => {
        animation.currentTime = duration * progress;
        return angle();
      });
      animation.finish();
      return { duration, values };
    };
    const forwardAnimation = await transition(open);
    const previewVisibleDuringSpin = !detail.hidden;
    const forward = sample(forwardAnimation);
    const backward = sample(await transition(back, forwardAnimation));
    const interrupted = await transition(open);
    interrupted.currentTime = 50;
    const beforeReversal = angle();
    const reverse = await transition(back, interrupted);
    reverse.currentTime = 0;
    const afterReversal = angle();
    reverse.finish();
    await nextFrame();
    await nextFrame();
    return { forward, backward, beforeReversal, afterReversal, previewVisibleDuringSpin,
      idleAnimations: star.getAnimations().length,
      stationaryEye: [...mark.children].filter(el => el !== star).every(el => getComputedStyle(el).transform === 'none'),
      libraryVisible: detail.hidden };
  });
  assert(motion.previewVisibleDuringSpin && motion.libraryVisible, 'Navigation must not wait for the spin');
  assert(motion.stationaryEye, 'Only the asterisk should move');
  assert.equal(motion.idleAnimations, 0, 'The spin must stop');
  assert(Math.abs(motion.beforeReversal - motion.afterReversal) < .1, 'Reversing mid-spin must not snap');
  for (const [direction, result] of [[1, motion.forward], [-1, motion.backward]] as const) {
    assert(result.duration <= 300, 'Navigation feedback should settle quickly');
    const distances = result.values.slice(1).map((value, i) => direction * (value - result.values[i]!));
    assert(distances.every(value => value > 0), 'The asterisk must turn in the navigation direction');
    assert(distances.every((value, i) => i === 0 || value < distances[i - 1]!), 'The spin must decelerate');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.card-open').first().click();
  assert.equal(await page.locator('.brand-asterisk').evaluate(el => el.getAnimations().length), 0);
  await page.locator('.brand').click();
  await page.locator('#main-content').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.brand-asterisk').evaluate(el => el.getAnimations().length), 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
try {
  context.setDefaultTimeout(10_000);
  // tsx preserves function names inside browser-evaluated callbacks with this helper.
  await context.addInitScript('globalThis.__name = value => value;');
  const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')];
  const extensionId = new URL(worker!.url()).host;
  const web = await context.newPage();
  const extension = await context.newPage();
  const errors: string[] = [];
  for (const page of [web, extension]) page.on('pageerror', error => errors.push(error.message));
  // Only the transport is replaced; both pages execute their actual built library UI.
  const installFixture = ({ references: initial, cloudState }: any) => {
    if (!chrome.runtime) return;
    let references = initial;
    const respond = async (message: any) => {
      const failure = (window as any).__libraryFailure;
      if (failure === 'unavailable' && message.type === 'get-cloud-state') return { ok: false, error: 'Temporary account outage' };
      if (failure === 'signed-out' && message.type === 'get-cloud-state') return { ok: true, cloudState: {
        ...cloudState, authStatus: 'signed-out', userId: null, email: null,
      } };
      switch (message.type) {
        case 'get-cloud-state': return { ok: true, cloudState };
        case 'list-references': return { ok: true, references, userId: 'preview' };
        case 'delete-reference': references = references.filter((item: any) => item.id !== message.id); return { ok: true };
        case 'save-reference': references = [message.reference, ...references]; return { ok: true };
        default: return { ok: false, error: 'Preview only.' };
      }
    };
    Object.defineProperty(chrome.runtime, 'sendMessage', { value: (message: any, callback?: (value: unknown) => void) => {
      const result = respond(message);
      if (callback) void result.then(callback);
      return result;
    } });
  };
  await extension.addInitScript({ content: 'globalThis.__name = value => value; (' + installFixture.toString() + ')('
    + JSON.stringify({ references: listed.references!, cloudState: account.cloudState! }) + ');' });
  await mkdir('/tmp/glance-parity', { recursive: true });
  for (const width of [1440, 390]) {
    for (const page of [web, extension]) await page.setViewportSize({ width, height: 1000 });
    await web.goto(previewUrl);
    await extension.goto(`chrome-extension://${extensionId}/library.html`);
    for (const page of [web, extension]) {
      try { await page.locator('.reference-card').first().waitFor(); }
      catch (error) { console.error(page.url(), await page.locator('body').innerText(), errors); throw error; }
      assert.equal(await page.locator('.reference-card').count(), 3);
      assert.equal(await page.locator('.search circle').evaluate(el => getComputedStyle(el).r), '5.25px');
      await verifyBrandMotion(page);
      await verifyInterfaceMotion(page);
    }
    const compare = async (state: string) => {
      const images = [];
      for (const [name, page] of [['web', web], ['extension', extension]] as const) {
        await page.mouse.move(0, 0);
        images.push(await page.screenshot({ path: `/tmp/glance-parity/${width}-${state}-${name}.png`, animations: 'disabled' }));
      }
      const difference = await web.evaluate(async (urls) => {
        const pixels = [];
        for (const url of urls) {
          const img = new Image(); img.src = url; await img.decode();
          const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
          pixels.push(ctx.getImageData(0, 0, img.width, img.height).data);
        }
        let count = 0; let min = Infinity; let max = 0;
        for (let i = 0; i < pixels[0]!.length; i++) if (pixels[0]![i] !== pixels[1]![i]) { count++; min = Math.min(min, i); max = i; }
        return { count, min, max };
      }, images.map(buffer => 'data:image/png;base64,' + buffer.toString('base64')));
      if (difference.count) {
        const styles = [];
        for (const page of [web, extension]) styles.push(await page.locator('.reference-grid, .reference-card, .card-media, .card-specimen').evaluateAll(elements =>
          elements.map(el => ({ className: el.className, rect: el.getBoundingClientRect().toJSON(),
            css: Object.fromEntries([...getComputedStyle(el)].map(key => [key, getComputedStyle(el).getPropertyValue(key)])) }))));
        for (let i = 0; i < styles[0]!.length; i++) {
          const a = styles[0]![i]!, b = styles[1]![i]!;
          const different = Object.keys(a.css).filter(key => a.css[key] !== b.css[key]);
          if (different.length || JSON.stringify(a.rect) !== JSON.stringify(b.rect)) console.log(a.className, a.rect, b.rect, different.map(key => [key, a.css[key], b.css[key]]));
        }
      }
      assert.equal(difference.count, 0, `Web and extension differ at ${width}px (${state}): ${JSON.stringify(difference)}; see /tmp/glance-parity`);
    };
    await compare('library');
    for (const page of [web, extension]) {
      const card = page.locator('.reference-card').first();
      await card.hover();
      assert.equal(await card.locator('.card-meta > span').count(), 0);
      const source = card.locator('.card-source');
      const sourceUrl = await source.getAttribute('href');
      assert(sourceUrl);
      await context.route(sourceUrl, route => route.fulfill({ body: 'Source site fixture', contentType: 'text/html' }));
      const opened = page.waitForEvent('popup');
      await source.focus();
      await source.press('Enter');
      const popup = await opened;
      await popup.waitForLoadState();
      assert.equal(popup.url(), sourceUrl);
      assert.equal(await page.locator('#detail-page').isVisible(), false, 'Source button must not open the reference preview');
      await popup.close();
      await context.unroute(sourceUrl);
    }
    for (const page of [web, extension]) {
      await page.locator('#search').fill('no matching reference');
      assert.equal(await page.locator('.reference-card').count(), 0);
      await page.locator('#clear-filters').click();
      assert.equal(await page.locator('.filters').count(), 0);
      const galleryCount = await page.locator('.reference-card').count();
      assert(galleryCount > 0);
      for (const returnLink of ['[data-close-detail]', '.brand']) {
        const originalCard = await page.locator('.reference-card').first().elementHandle();
        const libraryUrl = page.url();
        const timeOrigin = await page.evaluate(() => performance.timeOrigin);
        await page.locator('.card-open').first().click();
        await page.locator('#detail-page').waitFor({ state: 'visible' });
        // Keyboard activation and pointer clicks must both restore the same gallery.
        if (returnLink === '.brand') {
          await page.locator(returnLink).focus();
          await page.keyboard.press('Enter');
        } else await page.locator(returnLink).click();
        await page.locator('#main-content').waitFor({ state: 'visible' });
        assert.equal(page.url(), libraryUrl);
        assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin, 'Returning to the library must not reload the page');
        assert(await originalCard!.evaluate(card => card.isConnected), 'Returning must reuse the loaded cards');
        assert.equal(await page.locator('.reference-card').count(), galleryCount);
        await page.locator('.brand').click();
        assert.equal(page.url(), libraryUrl, 'Clicking the logo in the gallery must stay in the gallery');
        assert(await originalCard!.evaluate(card => card.isConnected));
        await originalCard!.dispose();
      }
      await page.locator('.card-open').first().click();
      await page.locator('#detail-page').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#main-content').isVisible(), false);
      assert.equal(await page.locator('dialog[open]').count(), 0);
      await page.locator('#detail-content').evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)); });
      await page.getByRole('tab', { name: 'Layout & context' }).click();
      const panel = page.getByRole('tabpanel');
      await panel.getByRole('heading').first().hover();
      const scrollBefore = await page.evaluate(() => window.scrollY);
      await page.mouse.wheel(0, 300);
      await page.waitForFunction(before => window.scrollY > before, scrollBefore);
      assert.equal(await panel.evaluate(el => el.scrollTop), 0, 'Details must scroll with the page, not independently');
      await page.evaluate(() => window.scrollTo(0, 0));
      assert(await page.getByRole('tabpanel').getByRole('heading', { name: 'Context', exact: true }).isVisible());
      await page.getByRole('tab', { name: 'Layout & context' }).press('ArrowLeft');
      assert.equal(await page.getByRole('tab', { name: 'Inspect', exact: true }).getAttribute('aria-selected'), 'true');
      assert(await page.getByRole('tabpanel').getByRole('heading', { name: 'Typography', exact: true }).isVisible());
      await page.locator('#detail-title').focus();
      assert(await page.locator('#detail-title').evaluate(el => el === document.activeElement));
      const imageBox = await page.locator('.detail-image-column').boundingBox();
      const infoBox = await page.locator('.detail-info').boundingBox();
      assert(imageBox && infoBox);
      assert(width > 760 ? infoBox.x >= imageBox.x + imageBox.width : infoBox.y >= imageBox.y + imageBox.height);
      const firstUrl = page.url();
      assert(firstUrl.includes('/library/') || firstUrl.includes('reference='));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.goBack();
      await page.locator('#main-content').waitFor({ state: 'visible' });
      await page.goForward();
      await page.locator('#detail-page').waitFor({ state: 'visible' });
      await page.reload();
      await page.locator('#detail-page').waitFor({ state: 'visible' });
      assert.equal(page.url(), firstUrl);
      assert.equal(await page.locator('.glance-library').getAttribute('data-brand-motion'), null, 'Deep-link reload must not spin');
    }
    await compare('detail');
    for (const page of [web, extension]) {
      await page.locator('.button-delete').click();
      await page.locator('#confirm-delete').click();
      await page.locator('#undo-delete').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.reference-card').count(), 2);
      await page.locator('#undo-delete').click();
      await page.locator('#toast').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.reference-card').count(), 3);
      await page.locator('#account-button').click();
    }
    await compare('account');
    for (const page of [web, extension]) await page.keyboard.press('Escape');
    for (const page of [web, extension]) {
      assert(await page.locator('#account-button').evaluate(el => el === document.activeElement));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
  }
  // The shared renderer must preserve the current view during outages, but clear it on real sign-out.
  await extension.reload();
  await extension.locator('.card-open').first().click();
  await extension.locator('#detail-page').waitFor({ state: 'visible' });
  const selectedTitle = await extension.locator('#detail-title').innerText();
  await extension.evaluate(() => { (window as any).__libraryFailure = 'unavailable'; window.dispatchEvent(new Event('focus')); });
  await extension.waitForFunction(() => document.querySelector('#detail-feedback')!.textContent!.includes('Unable to refresh'));
  assert.equal(await extension.locator('#detail-page').isVisible(), true);
  assert.equal(await extension.locator('#detail-title').innerText(), selectedTitle);
  assert.equal(await extension.locator('.reference-card').count(), 3);
  await extension.evaluate(() => { (window as any).__libraryFailure = undefined; window.dispatchEvent(new Event('focus')); });
  await extension.waitForFunction(() => document.querySelector('#detail-feedback')!.textContent === '');
  assert.equal(await extension.locator('#detail-title').innerText(), selectedTitle);
  await extension.route('**/login?reauth=1', route => route.fulfill({ body: '<h1>Sign in</h1>', contentType: 'text/html' }));
  await extension.evaluate(() => { (window as any).__libraryFailure = 'signed-out'; window.dispatchEvent(new Event('focus')); });
  await extension.waitForURL('**/login?reauth=1');
  assert.equal(await extension.locator('.reference-card').count(), 0);
  // Mixed aspect ratios exercise the actual shared renderer and resize observer.
  await extension.setViewportSize({ width: 1440, height: 1000 });
  await extension.goto(`chrome-extension://${extensionId}/library.html`);
  await extension.locator('.reference-card').first().waitFor();
  await extension.evaluate(async (reference) => {
    for (const [index, height] of [900, 100, 220, 150, 380, 90, 260].entries()) {
      const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = height;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#315b48'; ctx.fillRect(0, 0, 180, height);
      await chrome.runtime.sendMessage({ type: 'save-reference', reference: { ...reference,
        id: `masonry-${index}`, screenshotDataUrl: canvas.toDataURL(), screenshot: { width: 180, height } } });
    }
    window.dispatchEvent(new Event('focus'));
  }, listed.references![0]);
  await extension.waitForFunction(() => document.querySelectorAll('.reference-card').length === 10);
  await extension.locator('.card-media img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
  await extension.waitForFunction(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('.reference-card')];
    const gap = parseFloat(getComputedStyle(document.querySelector('.reference-grid')!).columnGap);
    const bottoms = new Map<number, number>();
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      if (bottoms.has(box.x) && Math.abs(box.y - bottoms.get(box.x)! - gap) > 1) return false;
      bottoms.set(box.x, box.bottom);
    }
    return true;
  });
  assert(await extension.locator('.card-media img').evaluateAll(images => images.every(image => {
    const img = image as HTMLImageElement;
    const box = img.getBoundingClientRect(), frame = img.parentElement!.getBoundingClientRect();
    // Portrait previews are already height-bounded; object-fit preserves the
    // whole capture inside that box rather than making the box itself tall.
    return Math.abs(box.width - frame.width) < 1 && Math.abs(box.height - frame.height) < 1
      && box.height <= Math.min(24 * parseFloat(getComputedStyle(document.documentElement).fontSize), innerHeight * .6) + 1
      && getComputedStyle(img).objectFit === 'contain' && img.naturalWidth > 0 && img.naturalHeight > 0;
  })));
  await extension.screenshot({ path: '/tmp/glance-parity/masonry-mixed.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Shared library passed: pixel-identical desktop/mobile gallery and detail pages, Motion hover cleanup and original search reversal, live reduced-motion changes, deep-link reload, Back/Forward, search, hidden filter bar, delete/undo, keyboard focus, and no overflow. Preview data only.');
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
