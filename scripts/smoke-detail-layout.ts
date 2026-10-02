import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { demoLibraryAdapter } from '../apps/web/lib/demo-library-adapter';

// Run against an isolated, credential-free web preview and the built extension.
const fixture = demoLibraryAdapter();
const references = await fixture.request({ type: 'list-references' });
const account = await fixture.request({ type: 'get-cloud-state' });
assert(references.ok && account.ok);
const profile = await mkdtemp(join(tmpdir(), 'glance-detail-layout-'));
const extensionPath = resolve('apps/extension/.output/chrome-mv3');
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
try {
  await context.addInitScript('globalThis.__name = value => value;');
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const failures: string[] = [];
  for (const surface of ['web', 'extension']) {
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(`${surface}: ${error.message}`));
    if (surface === 'extension') await page.addInitScript(({ references, account }) => {
      Object.defineProperty(chrome.runtime, 'sendMessage', { value: async (message: { type: string }) =>
        message.type === 'get-cloud-state' ? account : references });
    }, { references, account });
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(surface === 'web'
        ? process.env.REFER_WEB_PREVIEW_URL ?? 'http://localhost:3002/library?demo=1'
        : `chrome-extension://${new URL(worker.url()).host}/library.html`);
      await page.locator('.card-open').first().click();
      const hero = page.locator('.detail-hero');
      const original = await hero.innerHTML();
      // Check the text fallback plus wide and tall captures using the real image markup/styles.
      for (const imageHeight of [0, 300, 900]) {
        await hero.evaluate(async (el, { imageHeight, original }) => {
          el.innerHTML = original;
          if (imageHeight) {
            const image = new Image();
            image.alt = 'Layout regression fixture';
            image.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${imageHeight}"><rect width="100%" height="100%" fill="#315b48"/></svg>`);
            await image.decode();
            el.replaceChildren(image);
          }
          window.scrollTo(0, 0);
        }, { imageHeight, original });
        const positions = await hero.evaluate(el => {
          const measure = () => {
            const rect = el.getBoundingClientRect();
            return { x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height };
          };
          const positions = [measure()];
          const tabs = [...document.querySelectorAll<HTMLButtonElement>('.detail-tabs [role="tab"]')];
          // Trigger the real tab handlers without browser automation scrolling offscreen tabs into view.
          for (const index of [1, 0, 1, 0]) { tabs[index]!.click(); positions.push(measure()); }
          return positions;
        });
        for (const position of positions.slice(1)) {
          if (Object.keys(position).some(key => Math.abs(position[key as keyof typeof position] - positions[0]![key as keyof typeof position]) > .5)) {
            failures.push(`${surface}, ${width}px, image height ${imageHeight}: ${JSON.stringify(positions)}`);
            break;
          }
        }
      }
    }
    await page.close();
  }
  assert.deepEqual(failures, [], 'Switching detail tabs must preserve the preview position and size');
  console.log('Detail image stays fixed across repeated tab switches: web and extension, 3 viewport widths, wide/tall images and text fallback.');
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
