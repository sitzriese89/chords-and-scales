/**
 * PNG export (SPEC §5.10, ADR-45): the standalone SVG (`sheetSvg`, `itemSvg`) drawn onto a
 * canvas at a chosen scale. The SVG is self-contained (no fonts, images or links), so the
 * canvas isn't tainted and can be read back.
 *
 * The SVG's own `width` and `height` are multiplied by the scale before it is loaded, so the
 * browser draws the vectors at the final size: a 2× PNG is drawn at 2×, not a 1× bitmap
 * stretched.
 */

/** The scales offered for a PNG, in CSS pixels per image pixel. */
export const PNG_SCALES = [1, 2, 3] as const;
export type PngScale = (typeof PNG_SCALES)[number];
export const DEFAULT_PNG_SCALE: PngScale = 2;

/**
 * Largest canvas accepted, in pixels. A canvas over a webview's limit is drawn blank or not
 * encoded at all, and the limits differ (WebKit's smallest is 4096 × 4096 = 16,777,216 pixels,
 * Chromium's far larger), so one conservative limit applies everywhere and a too-large export
 * fails with a message instead of an empty image.
 */
export const MAX_PNG_PIXELS = 4096 * 4096;
/** Longest side accepted, in pixels (Chromium's limit for a canvas side). */
export const MAX_PNG_SIDE = 16384;

/** The 8 bytes every PNG file starts with. */
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export interface Size {
  width: number;
  height: number;
}

/** Turns SVG text into PNG bytes at `scale`; injectable so tests and callers can swap it. */
export type Rasterize = (svg: string, scale: number) => Promise<Uint8Array>;

/** What rasterizing needs from the browser; `browserCanvas` in the app, a fake in tests. */
export interface CanvasEnvironment {
  /** Loads an image from a URL and resolves once it can be drawn. */
  loadImage(url: string): Promise<CanvasImageSource>;
  /** A canvas of `size` (the drawing buffer, in image pixels). */
  createCanvas(size: Size): HTMLCanvasElement;
}

function parseSvg(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg') {
    throw new Error('the image is not a valid SVG document');
  }
  return root as unknown as SVGSVGElement;
}

function lengthOf(root: Element, attribute: 'width' | 'height', fromViewBox: number): number {
  const value = Number.parseFloat(root.getAttribute(attribute) ?? '');
  return Number.isFinite(value) && value > 0 ? value : fromViewBox;
}

function sizeOf(root: Element): Size {
  const box = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const [, , boxWidth = NaN, boxHeight = NaN] = box.length === 4 ? box : [];
  const width = lengthOf(root, 'width', boxWidth);
  const height = lengthOf(root, 'height', boxHeight);
  if (!(width > 0) || !(height > 0)) throw new Error('the SVG document has no size');
  return { width, height };
}

/** The size an SVG document declares: its root's `width` and `height` (else its `viewBox`). */
export function svgSize(svg: string): Size {
  return sizeOf(parseSvg(svg));
}

/** The PNG's size in pixels for an SVG of `size` at `scale`. */
export function pngSize(size: Size, scale: number): Size {
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/**
 * `svg` with its root sized `size` (its `viewBox` kept, or set from its old size so the
 * drawing scales with it) as a `data:` URL an `<img>` can load.
 */
export function scaledSvgUrl(svg: string, size: Size): string {
  const root = parseSvg(svg);
  const old = sizeOf(root);
  if (!root.hasAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${old.width} ${old.height}`);
  root.setAttribute('width', String(size.width));
  root.setAttribute('height', String(size.height));
  const text = new XMLSerializer().serializeToString(root);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
}

/** The real browser: an `<img>` and a `<canvas>` of `doc`. */
export function browserCanvas(doc: Document = document): CanvasEnvironment {
  return {
    loadImage(url) {
      return new Promise((resolve, reject) => {
        const image = new (doc.defaultView ?? window).Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('the SVG could not be drawn'));
        image.src = url;
      });
    },
    createCanvas({ width, height }) {
      const canvas = doc.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
  };
}

/**
 * `svg` as PNG bytes at `scale` (2 makes a PNG twice the SVG's width and height). Refuses an
 * image larger than `MAX_PNG_PIXELS` or `MAX_PNG_SIDE`, which a webview would draw blank.
 */
export async function svgToPng(
  svg: string,
  scale: number,
  environment: CanvasEnvironment = browserCanvas(),
): Promise<Uint8Array> {
  if (!(scale > 0)) throw new Error(`invalid scale ${scale}`);
  const size = pngSize(svgSize(svg), scale);
  if (
    size.width * size.height > MAX_PNG_PIXELS ||
    Math.max(size.width, size.height) > MAX_PNG_SIDE
  ) {
    throw new Error(
      `the image would be ${size.width} × ${size.height} pixels, too large at ${scale}×; ` +
        `try a smaller scale`,
    );
  }
  const image = await environment.loadImage(scaledSvgUrl(svg, size));
  const canvas = environment.createCanvas(size);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('the webview could not create a canvas');
  context.drawImage(image, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('the webview could not encode the PNG');
  return new Uint8Array(await blob.arrayBuffer());
}
