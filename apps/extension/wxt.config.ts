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
    const configuredUrl = import.meta.env.WXT_SUPABASE_URL?.trim();
    let cloudOrigin: string | null = null;
    try {
      if (configuredUrl) {
        const candidate = new URL(configuredUrl);
        const localDevelopment = candidate.protocol === 'http:'
          && (candidate.hostname === '127.0.0.1' || candidate.hostname === 'localhost');
        if (candidate.protocol === 'https:' || localDevelopment) cloudOrigin = candidate.origin;
      }
    } catch {
      cloudOrigin = null;
    }
    const cloudConfigured = Boolean(
      cloudOrigin && import.meta.env.WXT_SUPABASE_PUBLISHABLE_KEY?.trim(),
    );

    return {
    name: 'Refer — Design Inspector',
    short_name: 'Refer',
    description: 'Inspect and save typography, color, spacing, and component references.',
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      96: '/icon/96.png',
      128: '/icon/128.png',
    },
    permissions: ['activeTab', 'alarms', 'scripting', 'storage'],
    ...(cloudConfigured && cloudOrigin ? { host_permissions: [`${cloudOrigin}/*`] } : {}),
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
