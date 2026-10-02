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
      x: 20,
      y: 60,
      width: 200,
      height: 150,
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
    ).toMatchObject({ x: 0, y: 160, width: 250, height: 140 });
  });

  it('does not include neighboring content for a small selection near the left edge', () => {
    expect(
      calculateScreenshotCrop(
        { left: 4, top: 30, right: 44, bottom: 50 },
        { width: 500, height: 300 },
        { width: 500, height: 300 },
      ),
    ).toMatchObject({ x: 4, y: 30, width: 40, height: 20 });
  });

  it('does not add context around a large selection', () => {
    expect(
      calculateScreenshotCrop(
        { left: 100, top: 50, right: 450, bottom: 250 },
        { width: 500, height: 300 },
        { width: 500, height: 300 },
      ),
    ).toMatchObject({ x: 100, y: 50, width: 350, height: 200 });
  });

  it('preserves fractional edge pixels at a non-integer display scale', () => {
    expect(
      calculateScreenshotCrop(
        { left: 10.5, top: 20.5, right: 110.25, bottom: 70.25 },
        { width: 400, height: 300 },
        { width: 500, height: 375 },
      ),
    ).toEqual({ x: 13, y: 25, width: 125, height: 63, scaleX: 1.25, scaleY: 1.25 });
  });

  it('clips at the right edge without shifting the crop left', () => {
    expect(
      calculateScreenshotCrop(
        { left: 180, top: 20, right: 230, bottom: 60 },
        { width: 200, height: 150 },
        { width: 400, height: 300 },
      ),
    ).toMatchObject({ x: 360, y: 40, width: 40, height: 80 });
  });

  it.each([
    { left: 250, top: 20, right: 300, bottom: 60 },
    { left: -50, top: 20, right: -10, bottom: 60 },
    { left: 20, top: -50, right: 60, bottom: -10 },
    { left: 20, top: 160, right: 60, bottom: 200 },
    { left: 10.25, top: 20, right: 10.25, bottom: 60 },
    { left: 20, top: 10.25, right: 60, bottom: 10.25 },
  ])('rejects an empty or entirely offscreen selection: %o', (rect) => {
    expect(() =>
      calculateScreenshotCrop(
        rect,
        { width: 200, height: 150 },
        { width: 400, height: 300 },
      ),
    ).toThrow('Move the element into view');
  });
});
