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
    if (path === '/extension/exchange') return json({
      token: 'isolated-test-session', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    if (path === '/login') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Sign in</h1>');
      return;
    }
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
    assert.equal(await hud.innerText(), 'Inter', 'Hover must show only the font name');
    assert.equal(await hud.getAttribute('data-expanded'), 'false');
    assert.equal(await host.locator('.sections').isVisible(), false);

    const outlineMotion = await page.evaluate(async () => {
      const root = document.querySelector('#__refer_design_inspector__').shadowRoot;
      const outline = root.querySelector('.highlight');
      const edges = [...root.querySelectorAll('.highlight-edge')];
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const move = async selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.x + 10, clientY: rect.y + 10 }));
        await frame();
        getComputedStyle(outline).transform;
      };
      await move('h1');
      const animations = outline.getAnimations({ subtree: true });
      for (const animation of animations) { animation.pause(); animation.currentTime = 40; }
      const before = edges.map(edge => edge.getBoundingClientRect().toJSON());
      await move('.card:last-child');
      const retargeted = outline.getAnimations({ subtree: true });
      for (const animation of retargeted) { animation.pause(); animation.currentTime = 0; }
      const after = edges.map(edge => edge.getBoundingClientRect().toJSON());
      for (const animation of retargeted) animation.finish();
      return { animated: animations.length > 0, retargeted: retargeted.length > 0,
        noSnap: before.every((rect, i) => ['x', 'y', 'width', 'height'].every(key => Math.abs(rect[key] - after[i][key]) < .5)),
        thinEdges: before[0].height === 1 && before[2].width === 1 };
    });
    assert(outlineMotion.animated && outlineMotion.retargeted, 'The outline must glide and retarget during rapid hovering');
    assert(outlineMotion.noSnap, 'Interrupted outline movement must continue from its visible position');
    assert(outlineMotion.thinEdges, 'Resizing the outline must preserve the 1px stroke');
    await target.hover({ position: cardPaddingPoint });

    const toast = host.locator('.toast');
    // Cancelled sign-in must leave both the cloud and device empty.
    await worker.evaluate(() => {
      globalThis.smokeSignInAttempts = 0;
      chrome.identity.launchWebAuthFlow = async () => { globalThis.smokeSignInAttempts++; return undefined; };
    });
    // Keyboard and reduced-motion users get the same two-step flow.
    await page.keyboard.down('Enter');
    assert.equal(await hud.getAttribute('data-expanded'), 'true');
    assert.match(await hud.textContent(), /TypeInter16 px/i);
    await page.keyboard.down('Enter'); // Repeat must not trigger a save after opening.
    await page.keyboard.up('Enter');
    // Return to preview before checking pointer expansion.
    await page.keyboard.press('Escape');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await target.click({ position: cardPaddingPoint });
    assert.equal(await hud.getAttribute('data-expanded'), 'true');
    assert.equal(await hud.evaluate(el => el.getAnimations().length), 0);
    await page.keyboard.press('Escape');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(await hud.getAttribute('data-expanded'), 'false');
    assert.equal(await host.locator('.sections').isVisible(), false);
    await target.click({ position: cardPaddingPoint });
    assert.equal(await hud.getAttribute('data-expanded'), 'true', 'First click must open the panel');
    assert(await hud.evaluate(el => el.getAnimations().some(animation =>
      animation.effect.getKeyframes().some(frame => frame.clipPath))), 'Pointer selection should animate the panel opening');
    assert.match(await hud.textContent(), /TypeInter16 px/i);
    assert.equal(fixture.captures.size, 0, 'Opening the panel must not save');
    assert.equal(await worker.evaluate(() => globalThis.smokeSignInAttempts), 0, 'Opening must not start sign-in');
    const selectedOutline = await host.locator('.highlight').boundingBox();
    await page.locator('h1').hover();
    assert.deepEqual(await host.locator('.highlight').boundingBox(), selectedOutline, 'The selection must stay locked while the panel is open');
    assert.match(await hud.textContent(), /TypeInter16 px/i);
    await page.locator('h1').click(); // Second click saves the locked card, not the newly hovered heading.
    await toast.waitFor({ state: 'visible', timeout: 10_000 });
    assert.match((await toast.textContent()) ?? '', /cancelled/i);
    assert.doesNotMatch(await host.locator('.chip').textContent(), /Saving/);
    assert.equal(fixture.captures.size, 0);
    assert.deepEqual(await worker.evaluate(() => indexedDB.databases()), []);

    // The browser's native load failure should explain sign-in and release the save state.
    await worker.evaluate(() => {
      chrome.identity.launchWebAuthFlow = async () => { throw new Error('Authorization page could not be loaded.'); };
    });
    await host.locator('button.retry').click();
    await toast.getByText('Unable to open Glance sign-in. Check your connection and try again.').waitFor();
    assert.doesNotMatch(await host.locator('.chip').textContent(), /Saving/);
    assert.equal(fixture.captures.size, 0);

    // A successful retry signs in and resumes the selected save without pre-seeding a session.
    await worker.evaluate(() => {
      let started;
      globalThis.smokeSignInStarted = new Promise(resolve => { started = resolve; });
      chrome.identity.launchWebAuthFlow = ({ url, interactive }) => new Promise(resolve => {
        if (!interactive) throw new Error('Saving while signed out must prompt for sign-in');
        const authUrl = new URL(url);
        const callback = new URL(authUrl.searchParams.get('redirect_uri'));
        callback.searchParams.set('state', authUrl.searchParams.get('state'));
        callback.searchParams.set('code', 'fixture-code');
        globalThis.smokeCompleteSignIn = () => resolve(callback.href);
        started();
      });
    });
    await host.locator('button.retry').click();
    await worker.evaluate(() => globalThis.smokeSignInStarted);
    assert.equal(await toast.isVisible(), false, 'Retry must clear the previous error while sign-in is open');
    assert.match(await host.locator('.chip').textContent(), /Saving/);
    await worker.evaluate(() => globalThis.smokeCompleteSignIn());
    await page.waitForFunction(() => document.querySelector('#__refer_design_inspector__')?.shadowRoot?.querySelector('.toast')?.textContent?.includes('Saved to your library'));
    assert.match((await toast.textContent()) ?? '', /Saved/i);
    assert.equal(fixture.captures.size, 1);
    assert.equal(await hud.getAttribute('data-expanded'), 'false', 'Saving returns to font-only inspection');
    assert.deepEqual(await worker.evaluate(() => indexedDB.databases()), []);

    const savedReference = [...fixture.captures.values()][0].snapshot;
    const savedBounds = await target.boundingBox();
    assert(savedBounds, 'Saved element has no visible bounds');
    const captureScale = savedReference.source.viewport.scale;
    const expectedImageSize = {
      width: Math.ceil((savedBounds.x + savedBounds.width) * captureScale) - Math.floor(savedBounds.x * captureScale),
      height: Math.ceil((savedBounds.y + savedBounds.height) * captureScale) - Math.floor(savedBounds.y * captureScale),
    };
    assert.equal(savedReference.screenshot.width, expectedImageSize.width, 'Saved image includes content outside the element width');
    assert.equal(savedReference.screenshot.height, expectedImageSize.height, 'Saved image includes content outside the element height');

    const libraryOpened = context.waitForEvent('page', { timeout: 5_000 });
    await host.locator('button.view').click();
    const library = await libraryOpened;
    await library.waitForLoadState('domcontentloaded');
    assert.equal(new URL(library.url()).protocol, 'chrome-extension:');
    await library.locator('.reference-card').waitFor({ state: 'visible', timeout: 5_000 });
    assert.equal(await library.locator('.reference-card').count(), 1);
    assert.equal(await library.locator('.card-media > img').count(), 1);
    await library.locator('.card-media > img').evaluate((image) => image.decode());
    assert.deepEqual(await library.locator('.card-media > img').evaluate((image) => ({
      width: image.naturalWidth, height: image.naturalHeight,
    })), expectedImageSize, 'Uploaded image dimensions must match the selected element');
    assert.equal(await library.locator('.card-title').textContent(), 'Inter');
    assert.equal(await library.locator('.card-meta > span').count(), 0);
    assert.equal(await library.locator('.card-source').getAttribute('href'), fixture.url);
    assert.equal(await library.locator('.media-meta').count(), 0);
    assert.equal(await library.locator('[data-filter]').count(), 0);
    assert.equal(await library.locator('.card-media').evaluate((element) => getComputedStyle(element).borderRadius), '4px');
    await library.locator('.reference-card').waitFor({ state: 'visible' });

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
    await library.waitForURL(`${fixture.origin}/login?reauth=1`);
    assert.equal(await library.locator('.reference-card').count(), 0);
    assert.equal(fixture.captures.size, 1);
    assert.deepEqual(await worker.evaluate(() => indexedDB.databases()), []);

    await worker.evaluate(() => chrome.storage.local.set({ 'refer-neon-session': {
      token: 'other-test-session', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } }));
    await library.goto(`chrome-extension://${extensionId}/library.html`);
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
      '  verified: font-only hover, animated first-click inspection, locked selection, second-click save, keyboard/reduced-motion flow, cancelled/unavailable sign-in, retry and save after sign-in, cloud save and screenshot, delete/undo, sign-out and account-switch clearing, no IndexedDB, cleanup',
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
