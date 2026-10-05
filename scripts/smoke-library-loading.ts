import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { libraryTemplate } from '../packages/capture/src/library/template';
import { demoLibraryAdapter } from '../apps/web/lib/demo-library-adapter';

const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('wxt', { paths: [resolve('apps/extension')] })] }));
const demo = demoLibraryAdapter();
const listed = await demo.request({ type: 'list-references' });
const account = await demo.request({ type: 'get-cloud-state' });
assert(listed.ok && account.ok);
const references = listed.references!.slice(0, 2).map((reference, index) => ({ ...reference,
  screenshot: { dataUrl: index === 0 ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' : 'data:image/png;base64,broken', width: 1, height: 1, mimeType: 'image/png' },
}));
const fixture = { references, cloudState: account.cloudState };
const bundle = await build({ stdin: { contents: `import {mountLibrary} from './packages/capture/src/library/index.ts';
const adapter={homeUrl:'/library',viewState:{},request:message=>window.loadingRequest(message)};
let dispose=mountLibrary(document.querySelector('.glance-library'),adapter);
window.remount=()=>{dispose();dispose=mountLibrary(document.querySelector('.glance-library'),adapter);};`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', write: false });
const css = await readFile('packages/capture/src/library.css', 'utf8');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html');
  res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].text : req.url === '/style.css' ? css : `<!doctype html><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:#f5f5f5}</style><div class="glance-library">${libraryTemplate}</div><script type="module" src="/bundle.js"></script>`);
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/library`;
const profile = await mkdtemp(join(tmpdir(), 'glance-loading-'));
const extensionPath = resolve('apps/extension/.output/chrome-mv3');
const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
try {
  context.setDefaultTimeout(10000);
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionUrl = `chrome-extension://${new URL(worker.url()).host}/library.html`;
  await mkdir('output/loading', { recursive: true });
  for (const [surface, url] of [['web', base], ['extension', extensionUrl]]) {
    for (const mode of ['images', 'images-reduced', 'empty', 'error', 'signed-out']) {
      const page = await context.newPage();
      await page.setViewportSize({ width: mode.startsWith('images') ? 1440 : 390, height: 1000 });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript({ content: "globalThis.__name = value => value;" });
      await page.addInitScript(({ fixture, mode }) => {
        let releaseAccount!: () => void;
        let releaseList!: () => void;
        const accountGate = new Promise<void>(resolve => { releaseAccount = resolve; });
        const listGate = new Promise<void>(resolve => { releaseList = resolve; });
        let releaseImage!: () => void;
        const imageGate = new Promise<void>(resolve => { releaseImage = resolve; });
        const animations: any[] = [];
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (frames: any, options: any) {
          if (this.id === 'reference-grid') animations.push({ frames, options });
          return animate.call(this, frames, options);
        };
        Object.assign(window, { galleryAnimations: animations, decodeStarted: 0, listings: 0 });
        const decode = HTMLImageElement.prototype.decode;
        HTMLImageElement.prototype.decode = async function () { (window as any).decodeStarted++; await imageGate; return decode.call(this); };
        Object.assign(window, { releaseAccount, releaseList, releaseImage });
        const request = async (message: any) => {
          if (message.type === 'get-cloud-state') {
            await accountGate;
            if (mode === 'error') return { ok: false, error: 'Simulated unavailable service' };
            return { ok: true, cloudState: mode === 'signed-out' ? { ...fixture.cloudState, authStatus: 'signed-out', userId: null } : fixture.cloudState };
          }
          if (message.type === 'list-references') {
            await listGate;
            (window as any).listings++;
            return { ok: true, userId: 'preview', references: mode === 'empty' ? [] : fixture.references };
          }
          return { ok: true };
        };
        (window as any).loadingRequest = request;
        if (location.protocol === 'chrome-extension:') Object.defineProperty(chrome.runtime, 'sendMessage', { value: request });
      }, { fixture, mode });
      if (surface === 'extension' && mode === 'signed-out') await page.route('**/login?reauth=1', route => route.fulfill({ contentType: 'text/html', body: '<h1>Sign in</h1>' }));
      await page.goto(url!, { waitUntil: 'domcontentloaded' });
      await page.locator('#library-loading').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.library-skeleton-card').count(), 8);
      assert(!await page.locator('#empty-state').isVisible());
      await page.waitForFunction(() => document.querySelector('.library-skeleton-card')!.getAnimations().length > 0);
      assert.equal(await page.locator('.library-skeleton-card').first().evaluate(el => el.getAnimations()[0]!.effect!.getTiming().duration), 1000);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.querySelector('.library-skeleton-card')!.getAnimations().length === 0);
      if (mode.startsWith('images')) await page.screenshot({ path: `output/loading/${surface}-loading.png` });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => document.querySelector('.library-skeleton-card')!.getAnimations().length > 0);
      await page.locator('#search').fill('pending');
      assert(await page.locator('#library-loading').isVisible());
      await page.locator('#search').fill('');
      await page.locator('#search').blur();
      if (mode === 'images-reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => (window as any).releaseAccount());
      if (mode.startsWith('images') || mode === 'empty') {
        assert(await page.locator('#library-loading').isVisible());
        await page.evaluate(() => (window as any).releaseList());
      }
      if (surface === 'extension' && mode === 'signed-out') {
        await page.waitForURL('**/login?reauth=1');
        assert(await page.getByRole('heading', { name: 'Sign in' }).isVisible());
        console.log('PASS extension: signed-out redirects to sign-in');
        await page.close();
        continue;
      }
      if (mode.startsWith('images')) {
        await page.waitForFunction(() => (window as any).decodeStarted === 2);
        assert(await page.locator('#library-loading').isVisible());
        assert(!await page.locator('#reference-grid').isVisible());
        await page.evaluate(() => (window as any).releaseImage());
      }
      await page.locator('#library-loading').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.library-skeleton-card').first().evaluate(el => el.getAnimations().length), 0);
      if (mode.startsWith('images')) {
        await page.waitForFunction(() => !document.querySelector('.is-image-loading'));
        assert.equal(await page.locator('.reference-card').count(), 2);
        assert.equal(await page.locator('.card-image-unavailable').count(), 1);
        const animations = await page.evaluate(() => (window as any).galleryAnimations);
        assert.equal(animations.length, mode === 'images-reduced' ? 0 : 2);
        if (mode === 'images') {
          assert(animations.every((animation: any) => animation.options.duration === 240));
          assert(animations.some((animation: any) => JSON.stringify(animation.frames).includes('translateY(6px)')));
        }
        await page.waitForFunction(() => document.querySelector('#reference-grid')!.getAnimations().length === 0);
        const imageBox = await page.locator('.card-media').first().boundingBox();
        assert(imageBox && imageBox.height > 0);
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await page.waitForFunction(() => (window as any).listings >= 2);
        assert(!await page.locator('#library-loading').isVisible());
        assert.equal(await page.evaluate(() => (window as any).galleryAnimations.length), animations.length);
        if (surface === 'web') {
          await page.evaluate(() => (window as any).remount());
          assert(!await page.locator('#library-loading').isVisible());
          assert.equal(await page.locator('.reference-card').count(), 2);
          assert.equal(await page.evaluate(() => (window as any).galleryAnimations.length), animations.length);
        }
      } else {
        await page.evaluate(() => (window as any).releaseImage());
        assert(await page.locator('#empty-state').isVisible());
        assert.equal(await page.locator('.reference-card').count(), 0);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${surface}: ${mode}, loading lifecycle and reduced motion`);
      await page.close();
    }
  }
} finally {
  await context.close();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(profile, { recursive: true, force: true });
}
