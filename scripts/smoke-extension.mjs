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

function buildLocalExtension() {
  const env = { ...process.env };
  env.WXT_NEON_API_URL = 'local-only';
  env.WXT_SITE_URL = 'local-only';
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
    ['activeTab', 'alarms', 'scripting', 'storage'],
    'Unexpected extension permissions',
  );
}

async function serveFixture() {
  const html = await readFile(fixturePath);
  const server = createServer((request, response) => {
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
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function main() {
  buildLocalExtension();
  await validateManifest();

  const fixture = await serveFixture();
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

    await target.click({ position: cardPaddingPoint });
    const toast = host.locator('.toast');
    await toast.waitFor({ state: 'visible', timeout: 10_000 });
    assert.match((await toast.textContent()) ?? '', /Saved/i);

    const libraryOpened = context.waitForEvent('page', { timeout: 5_000 });
    await host.locator('button.view').click();
    const library = await libraryOpened;
    await library.waitForLoadState('domcontentloaded');
    assert.equal(new URL(library.url()).protocol, 'chrome-extension:');
    await library.locator('.reference-card').waitFor({ state: 'visible', timeout: 5_000 });
    assert.match((await library.locator('#library-count').textContent()) ?? '', /1 reference/);
    assert.equal(await library.locator('.card-media > img').count(), 1);

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

    await page.bringToFront();
    await page.keyboard.press('Escape');
    await host.waitFor({ state: 'detached', timeout: 5_000 });
    assert.equal(await page.locator('html[data-refer-inspecting]').count(), 0);

    process.stdout.write([
      'Refer extension smoke test passed.',
      `  browser: ${browserExecutable || 'Playwright Chrome for Testing'}`,
      `  extension: ${extensionId}`,
      '  verified: real toolbar-action activeTab injection, registered shortcut, hover HUD, click save, screenshot-backed local library, pointer + keyboard font preview, cleanup',
      '  permissions: activeTab, alarms, scripting, storage (no broad host access)',
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
