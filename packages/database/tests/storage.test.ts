import { describe, expect, it } from 'vitest';

import {
  getReferenceScreenshotPath,
  REFERENCE_SCREENSHOTS_BUCKET,
} from '../src';

const USER_ID = '018f37b2-7f5a-7d8c-9b1e-9ca6155c8bc9';
const CAPTURE_ID = '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bc9';

describe('reference screenshot storage', () => {
  it('uses the private bucket configured by the migration', () => {
    expect(REFERENCE_SCREENSHOTS_BUCKET).toBe('reference-shots');
  });

  it('builds the owner-scoped WebP path by default', () => {
    expect(getReferenceScreenshotPath(USER_ID, CAPTURE_ID)).toBe(
      `${USER_ID}/${CAPTURE_ID}.webp`,
    );
  });

  it('supports the PNG fallback accepted by the bucket', () => {
    expect(getReferenceScreenshotPath(USER_ID, CAPTURE_ID, 'png')).toBe(
      `${USER_ID}/${CAPTURE_ID}.png`,
    );
  });

  it('rejects identifiers that could escape the owner folder', () => {
    expect(() => getReferenceScreenshotPath('../another-user', CAPTURE_ID)).toThrow(TypeError);
  });
});
