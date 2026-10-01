import { defineConfig } from 'wxt';
import { fileURLToPath } from 'node:url';

const monorepoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  manifestVersion: 3,
  zip: {
    exclude: ['icon/source.svg'],
    sourcesRoot: monorepoRoot,
    dotSources: true,
    includeSources: [
      '.nvmrc',
      'SOURCE_CODE_REVIEW.md',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'scripts/verify-extension-packages.mjs',
      'tsconfig.base.json',
      'apps/extension/.env.example',
      'apps/extension/.env.local',
      'apps/extension/entrypoints/**',
      'apps/extension/public/**',
      'apps/extension/src/**',
      'apps/extension/package.json',
      'apps/extension/tsconfig.json',
      'apps/extension/wxt.config.ts',
      'packages/capture/package.json',
      'packages/capture/src/**',
      'packages/capture/tsconfig.json',
      'packages/database/package.json',
      'packages/database/src/**',
      'packages/database/tsconfig.json',
    ],
  },
  manifest: ({ browser }) => {
    const cloudOrigins = [import.meta.env.WXT_NEON_API_URL, import.meta.env.WXT_SITE_URL]
      .flatMap(value => {
        try {
          const url = new URL(value?.trim() ?? '');
          return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)) ? [url.origin] : [];
        } catch { return []; }
      });
    const cloudConfigured = cloudOrigins.length === 2;

    return {
    name: 'Glance — Design Inspector',
    short_name: 'Glance',
    description: 'Inspect and save typography, color, spacing, and component references.',
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      96: '/icon/96.png',
      128: '/icon/128.png',
    },
    permissions: ['activeTab', 'alarms', 'scripting', 'storage', ...(cloudConfigured ? ['identity' as const] : [])],
    ...(cloudConfigured ? { host_permissions: [...new Set(cloudOrigins)].map(origin => `${origin}/*`) } : {}),
    action: {
      default_title: 'Inspect this page',
      default_icon: {
        16: '/icon/16.png',
        32: '/icon/32.png',
      },
    },
    commands: {
      'toggle-inspector': {
        suggested_key: {
          default: 'Alt+Shift+D',
          mac: 'MacCtrl+Shift+D',
        },
        description: 'Toggle the design inspector',
      },
      'open-library': {
        description: 'Open the reference library',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'refer@local.design',
              strict_min_version: '142.0',
              data_collection_permissions: {
                required: cloudConfigured
                  ? [
                      'authenticationInfo',
                      'browsingActivity',
                      'personallyIdentifyingInfo',
                      'websiteContent',
                    ]
                  : ['none'],
              },
            },
          },
        }
      : {}),
    };
  },
});
