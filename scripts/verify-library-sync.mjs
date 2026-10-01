import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

// Called by the cloud smoke test while its disposable account/session is alive.
export async function verifyLibrarySync({ base, token, row, png }) {
  assert.equal(process.env.NEON_BRANCH, 'migration-neon');
  execFileSync('pnpm', ['--filter', '@refer/extension', 'build'], {
    env: { ...process.env, WXT_NEON_API_URL: base, WXT_SITE_URL: 'http://localhost:3100' }, stdio: 'inherit',
  });
  const contexts = [];
  const profiles = [];
  const offlineId = randomUUID();
  const extension = resolve('apps/extension/.output/chrome-mv3');
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(new URL(path, base), { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert(response.ok, `API ${method} ${path}: ${response.status}`);
    return response.json();
  };
  const sync = async page => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'sync-now' }));
      assert(result.ok, result.error);
      if (!result.cloudState.pending && !result.cloudState.lastError) return;
    }
    throw new Error('Library did not finish syncing.');
  };
  try {
    const pages = [];
    for (let device = 0; device < 2; device++) {
      const profile = await mkdtemp(join(tmpdir(), 'glace-sync-')); profiles.push(profile);
      const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
      contexts.push(context);
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      await worker.evaluate(session => chrome.storage.local.set({ 'refer-neon-session': session }), {
        token, expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      const page = await context.newPage();
      await page.goto(`chrome-extension://${new URL(worker.url()).host}/library.html`);
      await sync(page);
      await page.locator('.reference-card').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.reference-card').count(), 1);
      await page.waitForFunction(() => document.querySelector('.card-media img')?.naturalWidth > 0);
      pages.push(page);
    }
    console.log('PASS two fresh extension profiles hydrate the same cloud library and images');
    await contexts[0].setOffline(true);
    await pages[0].reload();
    await pages[0].locator('.reference-card').waitFor({ state: 'visible' });
    await pages[0].waitForFunction(() => document.querySelector('.card-media img')?.naturalWidth > 0);
    const reference = { ...row.snapshot, id: offlineId, capturedAt: new Date().toISOString(),
      screenshot: { ...row.snapshot.screenshot, storagePath: null, dataUrl: `data:image/png;base64,${png.toString('base64')}` } };
    const saved = await pages[0].evaluate(reference => chrome.runtime.sendMessage({ type: 'save-reference', reference }), reference);
    assert(saved.ok, saved.error);
    assert.equal((await call('/captures')).captures.length, 1);
    await contexts[0].setOffline(false);
    await sync(pages[0]);
    await sync(pages[1]);
    await pages[1].waitForFunction(() => document.querySelectorAll('.reference-card').length === 2);
    assert.equal((await call('/captures')).captures.length, 2);
    console.log('PASS offline reload retains images; offline save reaches the cloud and second device');
    await call(`/captures/${offlineId}`, 'DELETE');
    for (const page of pages) {
      await sync(page);
      await page.waitForFunction(() => document.querySelectorAll('.reference-card').length === 1);
    }
    console.log('PASS cloud deletion disappears from both extension galleries');
  } finally {
    for (const context of contexts) await context.close();
    await call(`/captures/${offlineId}`, 'DELETE');
    for (const profile of profiles) await rm(profile, { recursive: true, force: true });
    const buildEnv = { ...process.env };
    delete buildEnv.WXT_NEON_API_URL;
    delete buildEnv.WXT_SITE_URL;
    execFileSync('pnpm', ['build'], { env: buildEnv, stdio: 'inherit' });
  }
}
