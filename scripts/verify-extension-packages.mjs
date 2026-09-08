import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const extensionRoot = join(repoRoot, 'apps/extension');
const outputRoot = join(extensionRoot, '.output');
const extensionPackage = JSON.parse(await readFile(join(extensionRoot, 'package.json'), 'utf8'));
const wxtBinary = join(extensionRoot, 'node_modules/.bin', process.platform === 'win32' ? 'wxt.cmd' : 'wxt');
const version = extensionPackage.version;
const chromeArchive = join(outputRoot, `referextension-${version}-chrome.zip`);
const firefoxArchive = join(outputRoot, `referextension-${version}-firefox.zip`);
const sourcesArchive = join(outputRoot, `referextension-${version}-sources.zip`);
const expectedPermissions = ['activeTab', 'alarms', 'scripting', 'storage'];
const broadOrigins = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);

function packageEnvironment() {
  const env = { ...process.env };
  delete env.WXT_SUPABASE_URL;
  delete env.WXT_SUPABASE_PUBLISHABLE_KEY;
  return env;
}

function parseEnvironment(source) {
  return Object.fromEntries(source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=');
      assert(separator > 0, `Invalid environment line: ${line}`);
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
}

async function releaseConfiguration() {
  let source;
  try {
    source = await readFile(join(extensionRoot, '.env.local'), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }

  const values = parseEnvironment(source);
  assert.deepEqual(
    Object.keys(values).sort(),
    ['WXT_SUPABASE_PUBLISHABLE_KEY', 'WXT_SUPABASE_URL'],
    'Extension release environment must contain only the two public Supabase values',
  );
  const url = new URL(values.WXT_SUPABASE_URL);
  assert.equal(url.protocol, 'https:', 'Release Supabase URL must use HTTPS');
  assert.match(
    values.WXT_SUPABASE_PUBLISHABLE_KEY,
    /^sb_publishable_/u,
    'Only a browser-safe Supabase publishable key may be packaged',
  );
  assert(!/service[_-]?role|secret/i.test(source), 'Secret/service-role material must not be packaged');
  return { source, origin: url.origin, values };
}

function buildArchives(configuration) {
  const env = packageEnvironment();
  if (configuration) Object.assign(env, configuration.values);
  for (const browser of ['chrome', 'firefox']) {
    execFileSync(wxtBinary, ['zip', extensionRoot, '--browser', browser, '--level', 'warn'], {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
    });
  }
}

async function archive(path) {
  return unzipSync(new Uint8Array(await readFile(path)));
}

function assertSafePaths(files, label) {
  for (const name of Object.keys(files)) {
    assert(!name.startsWith('/') && !name.includes('..') && !name.includes('\\'), `${label}: unsafe path ${name}`);
  }
}

function manifestFrom(files, label) {
  assert(files['manifest.json'], `${label}: manifest.json must be at the archive root`);
  return JSON.parse(strFromU8(files['manifest.json']));
}

function assertCommonManifest(manifest, label, configuration) {
  assert.equal(manifest.manifest_version, 3, `${label}: expected Manifest V3`);
  assert.equal(manifest.name, 'Refer — Design Inspector');
  assert.equal(manifest.version, version);
  assert(manifest.description.length <= 132, `${label}: description exceeds store limit`);
  assert(manifest.icons?.['128'], `${label}: missing 128px store icon`);
  assert.deepEqual(manifest.permissions, expectedPermissions, `${label}: unexpected permissions`);
  const origins = [
    ...(manifest.host_permissions ?? []),
    ...(manifest.optional_host_permissions ?? []),
  ];
  assert.equal(
    origins.some((origin) => broadOrigins.has(origin)),
    false,
    `${label}: broad host access is forbidden`,
  );
  assert.deepEqual(origins, configuration ? [`${configuration.origin}/*`] : []);
  assert.equal(manifest.action?.default_title, 'Inspect this page');
  assert.equal(manifest.commands?.['toggle-inspector']?.suggested_key?.default, 'Alt+Shift+D');
  assert.equal(manifest.commands?.['toggle-inspector']?.suggested_key?.mac, 'MacCtrl+Shift+D');
}

function assertRuntimeArchive(files, label) {
  const required = [
    'manifest.json',
    'background.js',
    'inspector.js',
    'library.html',
    'icon/16.png',
    'icon/32.png',
    'icon/48.png',
    'icon/96.png',
    'icon/128.png',
  ];
  for (const name of required) assert(files[name], `${label}: missing ${name}`);
  for (const name of Object.keys(files)) {
    assert(!/(^|\/)\.env(?:\.|$)/u.test(name), `${label}: environment file leaked: ${name}`);
    assert(!name.endsWith('.map'), `${label}: source map leaked: ${name}`);
    assert(!name.endsWith('.ts'), `${label}: TypeScript source leaked: ${name}`);
  }
  assert.equal(files['icon/source.svg'], undefined, `${label}: design source leaked into runtime package`);
}

async function assertArchiveMatchesOutput(files, outputDirectory, label) {
  for (const [name, contents] of Object.entries(files)) {
    const built = await readFile(join(outputDirectory, name));
    assert.deepEqual(Buffer.from(contents), built, `${label}: ${name} differs from built output`);
  }
}

function assertSourceArchive(files, configuration) {
  const required = [
    '.nvmrc',
    'SOURCE_CODE_REVIEW.md',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'scripts/verify-extension-packages.mjs',
    'tsconfig.base.json',
    'apps/extension/package.json',
    'apps/extension/wxt.config.ts',
    'apps/extension/entrypoints/background.ts',
    'packages/capture/package.json',
    'packages/capture/src/index.ts',
    'packages/database/package.json',
    'packages/database/src/index.ts',
  ];
  for (const name of required) assert(files[name], `Firefox sources: missing ${name}`);
  for (const name of Object.keys(files)) {
    assert(!name.includes('/node_modules/'), `Firefox sources: node_modules leaked: ${name}`);
    assert(!name.includes('/.output/'), `Firefox sources: generated output leaked: ${name}`);
    const allowedEnvironment = name === 'apps/extension/.env.example'
      || (configuration && name === 'apps/extension/.env.local');
    assert(!/(^|\/)\.env(?:\.|$)/u.test(name) || allowedEnvironment, `Firefox sources: environment file leaked: ${name}`);
  }
  if (configuration) {
    assert(files['apps/extension/.env.local'], 'Firefox sources: missing public release configuration');
    assert.equal(strFromU8(files['apps/extension/.env.local']), configuration.source);
  }
}

async function main() {
  const configuration = await releaseConfiguration();
  buildArchives(configuration);

  const [chromeFiles, firefoxFiles, sourceFiles] = await Promise.all([
    archive(chromeArchive),
    archive(firefoxArchive),
    archive(sourcesArchive),
  ]);
  assertSafePaths(chromeFiles, 'Chrome package');
  assertSafePaths(firefoxFiles, 'Firefox package');
  assertSafePaths(sourceFiles, 'Firefox sources');
  assertRuntimeArchive(chromeFiles, 'Chrome package');
  assertRuntimeArchive(firefoxFiles, 'Firefox package');
  await assertArchiveMatchesOutput(chromeFiles, join(outputRoot, 'chrome-mv3'), 'Chrome package');
  await assertArchiveMatchesOutput(firefoxFiles, join(outputRoot, 'firefox-mv3'), 'Firefox package');

  const chromeManifest = manifestFrom(chromeFiles, 'Chrome package');
  const firefoxManifest = manifestFrom(firefoxFiles, 'Firefox package');
  assertCommonManifest(chromeManifest, 'Chrome package', configuration);
  assertCommonManifest(firefoxManifest, 'Firefox package', configuration);
  assert.equal(chromeManifest.background?.service_worker, 'background.js');
  assert.equal(chromeManifest.browser_specific_settings, undefined);
  assert.deepEqual(firefoxManifest.background?.scripts, ['background.js']);
  assert.equal(firefoxManifest.browser_specific_settings?.gecko?.id, 'refer@local.design');
  assert.equal(firefoxManifest.browser_specific_settings?.gecko?.strict_min_version, '142.0');
  assert.deepEqual(
    firefoxManifest.browser_specific_settings?.gecko?.data_collection_permissions?.required,
    configuration
      ? ['authenticationInfo', 'browsingActivity', 'personallyIdentifyingInfo', 'websiteContent']
      : ['none'],
  );
  assertSourceArchive(sourceFiles, configuration);

  process.stdout.write([
    'Refer distribution packages verified.',
    `  Chrome/Arc: ${chromeArchive}`,
    `  Firefox: ${firefoxArchive}`,
    `  Firefox reviewer sources: ${sourcesArchive}`,
    '  verified: root manifests, action/shortcut metadata, browser backgrounds, least privilege, runtime assets, review sources',
    '',
  ].join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
