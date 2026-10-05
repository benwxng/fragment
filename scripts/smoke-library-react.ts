import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { demoLibraryAdapter } from '../apps/web/lib/demo-library-adapter';

const demo = demoLibraryAdapter();
const listed = await demo.request({ type: 'list-references' });
const account = await demo.request({ type: 'get-cloud-state' });
assert(listed.ok && account.ok);
const fixture = { references: listed.references!, cloudState: account.cloudState! };

// Exercise the real React bridge, including rerenders and React's preserved-page lifecycle.
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('wxt', { paths: [resolve('apps/extension')] })] }));
const bundle = await build({
  stdin: { contents: `
    import { Activity, StrictMode, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { SharedLibrary } from './components/shared-library';
    function App() {
      const [revision, setRevision] = useState(0);
      const [visible, setVisible] = useState(true);
      Object.assign(window, { rerender: () => setRevision(n => n + 1), showLibrary: setVisible });
      return <><output id="revision">{revision}</output><Activity mode={visible ? 'visible' : 'hidden'}><SharedLibrary demo /></Activity></>;
    }
    createRoot(document.querySelector('#app')).render(<StrictMode><App /></StrictMode>);
  `, resolveDir: resolve('apps/web'), loader: 'tsx' },
  bundle: true, format: 'esm', write: false, jsx: 'automatic',
  plugins: [{ name: 'fixture-adapters', setup(build: any) {
    build.onResolve({ filter: /^@\/lib\/(demo-library-adapter|library-adapter)$/ }, () => ({ path: 'adapter', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const demoLibraryAdapter = () => ({homeUrl:'/library',request:message=>window.libraryRequest(message)});
      export const webLibraryAdapter = demoLibraryAdapter;
    ` }));
  } }],
});
const css = await readFile('packages/capture/src/library.css', 'utf8');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].text : `<!doctype html><style>${css}</style><div id="app"></div><script type="module" src="/bundle.js"></script>`);
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript({ content: 'globalThis.__name = value => value;' });
  await page.addInitScript((fixture) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    Object.assign(window, {
      release,
      libraryRequest: async (message: any) => {
        await gate;
        return message.type === 'get-cloud-state'
          ? { ok: true, cloudState: fixture.cloudState }
          : { ok: true, userId: fixture.cloudState.userId, references: fixture.references };
      },
    });
  }, fixture);
  await page.goto(`http://127.0.0.1:${(server.address() as any).port}/library`);
  await page.waitForFunction(() => document.querySelector('.library-skeleton-card')?.getAnimations().length);
  await page.evaluate(() => {
    (window as any).originalSearch = document.querySelector('#search');
    (window as any).rerender();
  });
  await page.waitForFunction(() => document.querySelector('#revision')?.textContent === '1');
  assert(await page.evaluate(() => (window as any).originalSearch === document.querySelector('#search')), 'A React rerender must preserve the live library DOM');
  assert(await page.locator('.library-skeleton-card').first().evaluate(el => el.getAnimations().length > 0), 'Shimmer must survive a rerender');
  await page.evaluate(() => (window as any).release());
  await page.locator('#library-loading').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.reference-card').count(), fixture.references.length);
  for (let revision = 2; revision <= 4; revision++) {
    await page.evaluate(() => (window as any).rerender());
    await page.waitForFunction(value => document.querySelector('#revision')?.textContent === String(value), revision);
    assert(!await page.locator('#library-loading').isVisible(), 'Rerender must not restore the initial skeleton');
    await page.locator('#account-button').click();
    await page.locator('#account-dialog').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
  }
  for (let visit = 0; visit < 3; visit++) {
    await page.evaluate(() => (window as any).showLibrary(false));
    await page.locator('.glance-library').waitFor({ state: 'hidden' });
    await page.evaluate(() => (window as any).showLibrary(true));
    await page.locator('.reference-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('.reference-card').count(), fixture.references.length);
    assert(!await page.locator('#library-loading').isVisible());
  }
  assert.deepEqual(errors, []);
  console.log('PASS React library: rerenders during/after loading retain DOM, shimmer and account controls; repeated hidden-page returns recover without reload');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
