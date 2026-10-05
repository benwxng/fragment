import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { demoLibraryAdapter } from '../apps/web/lib/demo-library-adapter';

const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('wxt', { paths: [resolve('apps/extension')] })] }));
const listed = await demoLibraryAdapter().request({ type: 'list-references' });
assert(listed.ok);
const owner = '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bc9';
let activeOwner = owner;
const captures = Array.from({ length: 60 }, (_, index) => {
  const id = `018f37b2-a1f0-7d8c-9b1e-${String(index).padStart(12, '0')}`;
  return { id, user_id: owner, captured_at: `2026-10-05T00:00:${String(59 - index).padStart(2, '0')}Z`,
    updated_at: '2026-10-05T00:00:00Z', facets: ['typography'], screenshot_path: `${owner}/${id}.png`,
    source_url: 'https://example.test', source_origin: 'https://example.test', page_title: 'Fixture',
    snapshot: { ...listed.references![0], id, screenshot: { dataUrl: null, width: 800, height: 1000 } } };
});
const bundle = await build({ stdin: { contents: `
  import {createRoot} from 'react-dom/client';
  import {SharedLibrary} from './components/shared-library';
  createRoot(document.querySelector('#app')).render(<SharedLibrary />);
`, resolveDir: resolve('apps/web'), loader: 'tsx' }, bundle: true, format: 'esm', write: false, jsx: 'automatic',
plugins: [{ name: 'fixture-actions', setup(build: any) {
  build.onResolve({ filter: /^@\/app\/actions$/ }, () => ({ path: 'actions', namespace: 'fixture' }));
  build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export async function signOut() {}' }));
} }] });
const css = await readFile('packages/capture/src/library.css', 'utf8');
let imageBytes: Buffer;
let bootstrapRequests = 0;
const imageRequests: string[] = [];
let releaseImages = false;
const pendingImages: ServerResponse[] = [];
const sendImage = (res: ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300', Vary: 'Cookie' });
  res.end(imageBytes);
};
const server = createServer((req, res) => {
  const url = new URL(req.url!, 'http://localhost');
  if (url.pathname === '/api/library/bootstrap') {
    bootstrapRequests++;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    setTimeout(() => res.end(JSON.stringify({ user: { id: activeOwner, email: 'fixture@example.test' }, userId: activeOwner, complete: true, captures: captures.map(row => ({ ...row, user_id: activeOwner, screenshot_path: `${activeOwner}/${row.id}.png` })) })), 100);
  } else if (url.pathname.startsWith('/api/library/screenshots/')) {
    assert.equal(url.searchParams.get('owner'), activeOwner);
    imageRequests.push(url.pathname);
    if (releaseImages) sendImage(res); else pendingImages.push(res);
  } else if (url.pathname.startsWith('/api/')) {
    res.writeHead(500); res.end('Unexpected API request');
  } else if (url.pathname === '/bundle.js') {
    res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end(url.pathname === '/away' ? '<p>Other page</p>' : `<!doctype html><style>${css}</style><div id="app"></div><script type="module" src="/bundle.js"></script>`);
  }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  imageBytes = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 1000;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#e6eddf'; ctx.fillRect(0, 0, 800, 1000);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await page.context().addCookies([{ name: 'session', value: 'fixture-a', url: base }]);
  await page.goto(base + '/library', { waitUntil: 'domcontentloaded' });
  await page.locator('#library-loading').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.reference-card').count(), 60);
  assert.equal(bootstrapRequests, 1);
  assert.equal(await page.locator('.card-media img').first().evaluate(img => (img as HTMLImageElement).naturalWidth), 0);
  await page.waitForFunction(() => document.querySelector('.reference-card')?.getBoundingClientRect().height! > 0);
  assert(imageRequests.length > 0 && imageRequests.length < captures.length, 'Only nearby images should load before scrolling');
  const initialRequests = imageRequests.length;
  releaseImages = true;
  pendingImages.splice(0).forEach(sendImage);
  await page.waitForFunction(() => document.querySelector('.card-media img') && (document.querySelector('.card-media img') as HTMLImageElement).naturalWidth > 0);
  const firstPath = `/api/library/screenshots/${captures[0].id}.png`;
  assert.equal(imageRequests.filter(path => path === firstPath).length, 1);
  await page.locator('.card-open').first().click();
  await page.waitForFunction(() => (document.querySelector('.detail-hero img') as HTMLImageElement)?.naturalWidth > 0);
  assert.equal(imageRequests.filter(path => path === firstPath).length, 1, 'Detail should reuse the privately cached image');
  await page.goto(base + '/away');
  await page.goto(base + '/library', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (document.querySelector('.card-media img') as HTMLImageElement)?.naturalWidth > 0);
  assert.equal(bootstrapRequests, 2, 'Returning still authenticates and refreshes the listing');
  assert.equal(imageRequests.filter(path => path === firstPath).length, 1, 'Returning should reuse unchanged image bytes');
  await page.locator('.reference-card').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => (Array.from(document.querySelectorAll('.card-media img')).at(-1) as HTMLImageElement)?.naturalWidth > 0);
  assert(imageRequests.includes(`/api/library/screenshots/${captures.at(-1)!.id}.png`));
  await page.goto(base + '/away');
  activeOwner = '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bcb';
  await page.context().addCookies([{ name: 'session', value: 'fixture-b', url: base }]);
  await page.goto(base + '/library', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (document.querySelector('.card-media img') as HTMLImageElement)?.naturalWidth > 0);
  assert.equal(imageRequests.filter(path => path === firstPath).length, 2, 'A changed account must not reuse the previous account’s image cache');
  assert.deepEqual(errors, []);
  console.log(`PASS network loading: one metadata request; all 60 cards available before image bytes; ${initialRequests}/60 nearby image requests initially; image cache reused for detail and return; remaining images load on scroll`);
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
