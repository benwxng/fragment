import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { firefox } from 'playwright';
import webExt from 'web-ext';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const extensionPath = join(repoRoot, 'apps/extension/.output/firefox-mv3');
const fixtureUrl = pathToFileURL(join(repoRoot, 'fixtures/inspector-playground.html')).href;

function buildFirefoxExtension() {
  const env = { ...process.env };
  env.WXT_NEON_API_URL = 'local-only';
  env.WXT_SITE_URL = 'local-only';
  execFileSync('pnpm', ['--filter', '@refer/extension', 'build:firefox'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
}

function lintFirefoxExtension() {
  execFileSync(
    'pnpm',
    ['exec', 'web-ext', 'lint', '--source-dir', extensionPath, '--self-hosted'],
    { cwd: repoRoot, stdio: 'inherit' },
  );
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
  assert.deepEqual(manifest.permissions, ['activeTab', 'alarms', 'scripting', 'storage']);
  assert.equal(manifest.browser_specific_settings?.gecko?.id, 'refer@local.design');
}

async function main() {
  buildFirefoxExtension();
  await validateManifest();
  lintFirefoxExtension();

  const firefoxBinary = process.env.FIREFOX_BINARY || firefox.executablePath();
  await access(firefoxBinary);

  let runner;
  try {
    runner = await webExt.cmd.run(
      {
        firefox: firefoxBinary,
        noInput: true,
        noReload: true,
        sourceDir: extensionPath,
        startUrl: [fixtureUrl],
        target: ['firefox-desktop'],
      },
      { shouldExitProgram: false },
    );

    process.stdout.write([
      'Refer Firefox runtime smoke passed.',
      `  browser: ${firefoxBinary}`,
      '  verified: Firefox MV3 build, Mozilla web-ext validation, temporary add-on install',
      '  permissions: activeTab, alarms, scripting, storage (no broad host access)',
      '',
    ].join('\n'));
  } finally {
    await runner?.exit();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
