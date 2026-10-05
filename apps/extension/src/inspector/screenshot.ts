import type { ExtensionMessage, ExtensionResponse } from '../messages';

export interface ScreenshotCrop {
  dataUrl: string;
  format: 'image/webp' | 'image/png';
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

export interface CropRectInput {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ScreenshotCropGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

function visibleAxis(
  start: number,
  end: number,
  viewportSize: number,
): readonly [number, number] {
  const visibleStart = Math.max(0, Math.min(viewportSize, start));
  const visibleEnd = Math.max(visibleStart, Math.min(viewportSize, end));
  return [visibleStart, visibleEnd];
}

export function calculateScreenshotCrop(
  rect: CropRectInput,
  viewport: Readonly<{ width: number; height: number }>,
  image: Readonly<{ width: number; height: number }>,
): ScreenshotCropGeometry {
  const viewportWidth = Math.max(1, viewport.width);
  const viewportHeight = Math.max(1, viewport.height);
  const scaleX = image.width / viewportWidth;
  const scaleY = image.height / viewportHeight;

  const [visibleLeft, visibleRight] = visibleAxis(
    rect.left,
    rect.right,
    viewportWidth,
  );
  const [visibleTop, visibleBottom] = visibleAxis(
    rect.top,
    rect.bottom,
    viewportHeight,
  );

  if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
    throw new Error('Move the element into view, then try again.');
  }

  // Crop to the selected border box, without surrounding page context or a
  // minimum preview size. Round outwards only to preserve fractional edge pixels.
  const x = Math.max(0, Math.floor(visibleLeft * scaleX));
  const y = Math.max(0, Math.floor(visibleTop * scaleY));
  const right = Math.min(image.width, Math.ceil(visibleRight * scaleX));
  const bottom = Math.min(image.height, Math.ceil(visibleBottom * scaleY));
  const width = right - x;
  const height = bottom - y;

  if (width < 1 || height < 1) {
    throw new Error('Move the element into view, then try again.');
  }

  return { x, y, width, height, scaleX, scaleY };
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function waitForOverlayToDisappear(): Promise<void> {
  await nextAnimationFrame();
  await nextAnimationFrame();
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to read the captured tab image.'));
    image.src = dataUrl;
  });
}

function canvasDataUrl(
  canvas: HTMLCanvasElement,
): Promise<{ dataUrl: string; format: ScreenshotCrop['format'] }> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webpBlob) => {
        const blobPromise = webpBlob
          ? Promise.resolve(webpBlob)
          : new Promise<Blob | null>((resolvePng) => canvas.toBlob(resolvePng, 'image/png'));

        void blobPromise.then((blob) => {
          if (!blob) {
            reject(new Error('Unable to encode the reference image.'));
            return;
          }

          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              dataUrl: String(reader.result),
              format: blob.type === 'image/webp' ? 'image/webp' : 'image/png',
            });
          reader.onerror = () => reject(new Error('Unable to encode the reference image.'));
          reader.readAsDataURL(blob);
        });
      },
      'image/webp',
      0.9,
    );
  });
}

async function requestVisibleTabImage(): Promise<string> {
  const message: ExtensionMessage = { type: 'capture-visible-tab' };
  const response = (await browser.runtime.sendMessage(message)) as ExtensionResponse;

  if (!response.ok) throw new Error(response.error);
  if (!response.imageDataUrl) throw new Error('The browser did not return a captured tab image.');

  return response.imageDataUrl;
}

export async function captureElementImage(
  rect: DOMRectReadOnly,
  onCaptured: () => void = () => {},
): Promise<ScreenshotCrop> {
  let sourceDataUrl: string;
  try {
    sourceDataUrl = await requestVisibleTabImage();
  } finally {
    // The browser has finished reading page pixels. Restore UI before encoding/upload.
    onCaptured();
  }
  const image = await loadImage(sourceDataUrl);

  const geometry = calculateScreenshotCrop(
    rect,
    { width: window.innerWidth, height: window.innerHeight },
    { width: image.naturalWidth, height: image.naturalHeight },
  );

  const canvas = document.createElement('canvas');
  canvas.width = geometry.width;
  canvas.height = geometry.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to prepare the reference image.');

  context.drawImage(
    image,
    geometry.x,
    geometry.y,
    geometry.width,
    geometry.height,
    0,
    0,
    geometry.width,
    geometry.height,
  );

  const encoded = await canvasDataUrl(canvas);
  canvas.width = 1;
  canvas.height = 1;

  return {
    ...encoded,
    ...geometry,
  };
}
