import { describe, expect, it } from 'vitest';

import { calculateScreenshotCrop } from './screenshot';

describe('calculateScreenshotCrop', () => {
  it('uses the captured image dimensions instead of assuming devicePixelRatio', () => {
    expect(
      calculateScreenshotCrop(
        { left: 10, top: 20, right: 110, bottom: 70 },
        { width: 500, height: 300 },
        { width: 1_000, height: 900 },
      ),
    ).toEqual({
      x: 0,
      y: 0,
      width: 480,
      height: 480,
      scaleX: 2,
      scaleY: 3,
    });
  });

  it('clips an element to the visible viewport', () => {
    expect(
      calculateScreenshotCrop(
        { left: -25, top: 80, right: 125, bottom: 240 },
        { width: 200, height: 150 },
        { width: 400, height: 300 },
      ),
    ).toMatchObject({ x: 0, y: 0, width: 400, height: 300 });
  });

  it('rejects an element entirely outside the viewport', () => {
    expect(() =>
      calculateScreenshotCrop(
        { left: 250, top: 20, right: 300, bottom: 60 },
        { width: 200, height: 150 },
        { width: 400, height: 300 },
      ),
    ).toThrow('Move the element into view');
  });
});
