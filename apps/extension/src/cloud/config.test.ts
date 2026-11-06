import { afterEach, expect, it, vi } from 'vitest';
import defaults from '../../cloud-defaults.json';
import { getCloudConfig } from './config';

afterEach(() => vi.unstubAllEnvs());

it('keeps account saving configured in a clean checkout without local env files', () => {
  vi.stubEnv('WXT_NEON_API_URL', undefined);
  vi.stubEnv('WXT_SITE_URL', undefined);
  expect(getCloudConfig()).toEqual({
    apiUrl: defaults.WXT_NEON_API_URL, siteUrl: defaults.WXT_SITE_URL,
  });
});

it('allows local sign-in while retaining the production API', () => {
  vi.stubEnv('WXT_NEON_API_URL', undefined);
  vi.stubEnv('WXT_SITE_URL', 'http://localhost:3001');
  expect(getCloudConfig()).toEqual({
    apiUrl: defaults.WXT_NEON_API_URL, siteUrl: 'http://localhost:3001',
  });
});

it('uses explicit test backend overrides', () => {
  vi.stubEnv('WXT_NEON_API_URL', 'http://127.0.0.1:3100/');
  vi.stubEnv('WXT_SITE_URL', 'http://localhost:3100/');
  expect(getCloudConfig()).toEqual({ apiUrl: 'http://127.0.0.1:3100', siteUrl: 'http://localhost:3100' });
});

it.each(['', 'local-only', 'http://untrusted.example.com'])('does not replace an explicitly disabled or invalid API (%s) with production', value => {
  vi.stubEnv('WXT_NEON_API_URL', value);
  vi.stubEnv('WXT_SITE_URL', undefined);
  expect(getCloudConfig()).toBeNull();
});
