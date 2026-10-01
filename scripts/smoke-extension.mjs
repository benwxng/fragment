import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const extensionPath = join(repoRoot, 'apps/extension/.output/chrome-mv3');
const fixturePath = join(repoRoot, 'fixtures/inspector-playground.html');
const hostSelector = '#__refer_design_inspector__';
const browserExecutable = process.env.REFER_BROWSER_EXECUTABLE?.trim();

function buildLocalExtension(origin) {
  const env = { ...process.env };
  env.WXT_NEON_API_URL = origin;
  env.WXT_SITE_URL = origin;
  execFileSync('pnpm', ['--filter', '@refer/extension', 'build'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
}

async function validateManifest() {
  const manifest = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8'));
  const origins = [
    ...(manifest.host_permissions ?? []),
    ...(manifest.optional_host_permissions ?? []),
  ];
  const broadOrigins = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);
  assert.equal(
    origins.some((origin) => broadOrigins.has(origin)),
    false,
    `Smoke test refuses broad host permission: ${origins.join(', ')}`,
  );
  assert.deepEqual(
    manifest.permissions,
    ['activeTab', 'alarms', 'scripting', 'storage', 'identity'],
    'Unexpected extension permissions',
  );
}

async function serveFixture() {
  const html = await readFile(fixturePath);
  const captures = new Map();
  const images = new Map();
  const userId = '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bc9';
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const json = (value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value)); };
    const otherAccount = request.headers.authorization === 'Bearer other-test-session';
    const accountId = otherAccount ? '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bc8' : userId;
    if (path === '/me') return json({ user: { id: accountId, email: otherAccount ? 'other@example.com' : 'fixture@example.com' } });
    if (path === '/library-sync') return json({ userId: accountId, complete: true, captures: otherAccount ? [] : [...captures.values()] });
    if (path === '/extension/session') return json({ ok: true });
    if (path.startsWith('/screenshots/')) {
      if (request.method === 'PUT') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        images.set(path, Buffer.concat(chunks));
        return json({ path: `${userId}/${path.split('/').pop()}` });
      }
      response.writeHead(200, { 'Content-Type': 'image/png' }).end(images.get(path));
      return;
    }
    if (path.startsWith('/captures/')) {
      const id = path.split('/').pop();
      if (request.method === 'DELETE') { captures.delete(id); return json({ ok: true }); }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const row = JSON.parse(Buffer.concat(chunks).toString());
      if (captures.has(id)) return json({ error: 'Already saved' }, 409);
      captures.set(id, { ...row, sync_revision: 'fixture-revision' });
      return json({ revision: 'fixture-revision' });
    }
    if (request.url !== '/' && request.url !== '/inspector-playground.html') {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  return {
    url: `http://127.0.0.1:${address.port}/inspector-playground.html`,
    origin: `http://127.0.0.1:${address.port}`,
    captures,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function main() {
  const fixture = await serveFixture();
  buildLocalExtension(fixture.origin);
  await validateManifest();
  const profilePath = await mkdtemp(join(tmpdir(), 'refer-smoke-'));
  let context;

  try {
    context = await chromium.launchPersistentContext(profilePath, {
      ...(browserExecutable
        ? { executablePath: browserExecutable }
        : { channel: 'chromium' }),
      timeout: 15_000,
      headless: process.env.REFER_SMOKE_HEADED !== '1',
      viewport: { width: 1280, height: 900 },
      args: [
        '--enable-features=DevToolsTabTarget',
        '--enable-unsafe-extension-debugging',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    context.setDefaultTimeout(10_000);
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const extensionId = new URL(worker.url()).host;
    assert(extensionId, 'Could not resolve the unpacked extension ID');

    const commands = await worker.evaluate(() => chrome.commands.getAll());
    const toggleCommand = commands.find(({ name }) => name === 'toggle-inspector');
    assert(toggleCommand?.shortcut, 'Chrome did not register the toggle-inspector shortcut');

    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(fixture.url);
    const browserSession = await context.browser().newBrowserCDPSession();
    const { targetInfos } = await browserSession.send('Target.getTargets', { filter: [{}] });
    const tabTarget = targetInfos.find(({ type, url }) => type === 'tab' && url === fixture.url);
    assert(tabTarget, `Could not resolve the fixture tab target: ${JSON.stringify(targetInfos)}`);
    await browserSession.send('Extensions.triggerAction', {
      id: extensionId,
      targetId: tabTarget.targetId,
    });

    const host = page.locator(hostSelector);
    await host.waitFor({ state: 'attached', timeout: 5_000 });
    assert.equal(await page.locator('html[data-refer-inspecting]').count(), 1);

    const target = page.locator('.card').first();
    const cardPaddingPoint = { x: 10, y: 10 };
    await target.hover({ position: cardPaddingPoint });
    const hud = host.locator('.hud');
    await hud.waitFor({ state: 'visible', timeout: 5_000 });
    const hudText = await hud.textContent();
    assert.match(hudText ?? '', /article/i, 'HUD did not identify the hovered element');
    assert.match(hudText ?? '', /TypeInter16 px/i, 'HUD did not render typography details');

    const toast = host.locator('.toast');
    // Cancelled sign-in must leave both the cloud and device empty.
    await worker.evaluate(() => { chrome.identity.launchWebAuthFlow = async () => undefined; });
    await target.click({ position: cardPaddingPoint });
    await toast.waitFor({ state: 'visible', timeout: 10_000 });
    assert.match((await toast.textContent()) ?? '', /cancelled/i);
    assert.equal(fixture.captures.size, 0);
    assert.deepEqual(await worker.evaluate(() => indexedDB.databases()), []);

    await worker.evaluate(() => chrome.storage.local.set({ 'refer-neon-session': {
      token: 'isolated-test-session', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } }));
    await host.locator('button.retry').click();
    await page.waitForFunction(() => document.querySelector('#__refer_design_inspector__')?.shadowRoot?.querySelector('.toast')?.textContent?.includes('Saved to your library'));
    assert.match((await toast.textContent()) ?? '', /Saved/i);
    assert.equal(fixture.captures.size, 1);
    assert.deepEqual(await worker.evaluate(() => indexedDB.databases()), []);

    const libraryOpened = context.waitForEvent('page', { timeout: 5_000 });
    await host.locator('button.view').click();
    const library = await libraryOpened;
    await library.waitForLoadState('domcontentloaded');
    assert.equal(new URL(library.url()).protocol, 'chrome-extension:');
    await library.locator('.reference-card').waitFor({ state: 'visible', timeout: 5_000 });
    assert.match((await library.locator('#library-count').textContent()) ?? '', /1 reference/);
    assert.equal(await library.locator('.card-media > img').count(), 1);
    assert.equal(await library.locator('.card-title').textContent(), 'Article');
    assert.equal(await library.locator('.media-meta').count(), 0);
    assert.deepEqual(await library.locator('[data-filter]').allTextContents(), ['All', 'Type', 'Components', 'Colors', 'Layout']);
    assert.equal(await library.locator('.card-media').evaluate((element) => getComputedStyle(element).borderRadius), '0px');
    await library.locator('[data-filter=layout]').click();
    assert.equal(await library.locator('[data-filter=layout]').getAttribute('aria-pressed'), 'true');
    await library.locator('[data-filter=all]').click();
    await library.locator('.reference-card').waitFor({ state: 'visible' });

    const fontPreviewTrigger = library.locator('.font-preview-trigger');
    const fontPreview = library.locator('.font-preview-popover');
    await fontPreviewTrigger.hover();
    await fontPreview.waitFor({ state: 'visible', timeout: 5_000 });
    assert.match((await fontPreview.textContent()) ?? '', /Captured preview/);
    assert.match((await fontPreview.textContent()) ?? '', /Inter/);
    assert.ok(await fontPreviewTrigger.getAttribute('aria-describedby'));

    await library.locator('.site-header').hover();
    await fontPreview.waitFor({ state: 'hidden', timeout: 5_000 });
    await fontPreviewTrigger.focus();
    await fontPreview.waitFor({ state: 'visible', timeout: 5_000 });

    await library.locator('.card-open').click();
    await library.locator('.button-delete').click();
    await library.locator('#confirm-delete').click();
    await library.locator('#undo-delete').waitFor({ state: 'visible' });
    assert.equal(fixture.captures.size, 0);
    await library.locator('#undo-delete').click();
    await library.locator('.reference-card').waitFor({ state: 'visible' });
    assert.equal(fixture.captures.size, 1);
    await library.locator('#account-button').click();
    await library.locator('#sign-out').click();
    await library.waitForFunction(() => document.querySelector('#account-button-label')?.textContent === 'Sign in');
    assert.equal(await library.locator('.reference-card').count(), 0);
    assert.equal(fixture.captures.size, 1);
    assert.deepEqual(await worker.evaluate(() => indexedDB.databases()), []);

    await worker.evaluate(() => chrome.storage.local.set({ 'refer-neon-session': {
      token: 'other-test-session', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } }));
    await library.waitForFunction(() => document.querySelector('#account-button-label')?.textContent === 'other@example.com');
    assert.equal(await library.locator('.reference-card').count(), 0);
    assert.equal(fixture.captures.size, 1);

    await page.bringToFront();
    await page.keyboard.press('Escape');
    await host.waitFor({ state: 'detached', timeout: 5_000 });
    assert.equal(await page.locator('html[data-refer-inspecting]').count(), 0);

    process.stdout.write([
      'Refer extension smoke test passed.',
      `  browser: ${browserExecutable || 'Playwright Chrome for Testing'}`,
      `  extension: ${extensionId}`,
      '  verified: inspection without an account, cancelled sign-in, cloud save and screenshot, delete/undo, sign-out and account-switch clearing, no IndexedDB, font previews, cleanup',
      '  backend: isolated local fixture; no production accounts or data used',
      '',
    ].join('\n'));
  } finally {
    await context?.close();
    await fixture.close();
    await rm(profilePath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
