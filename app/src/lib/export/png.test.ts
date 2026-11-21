// PNG export (ADR-45): sizes, scaling and the canvas steps. jsdom has no canvas and loads no
// images, so the canvas is a recording fake here; the real drawing is checked by hand in a
// browser (see the PR).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PNG_SCALE,
  MAX_PNG_PIXELS,
  PNG_SCALES,
  PNG_SIGNATURE,
  pngSize,
  scaledSvgUrl,
  svgSize,
  svgToPng,
  type CanvasEnvironment,
  type Size,
} from './png';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="150.5" viewBox="0 0 400 150.5">' +
  '<title>C♯ Dorian</title><rect width="400" height="150.5" style="fill: #fefefe"/></svg>';

/** The SVG inside a `data:` URL made by `scaledSvgUrl`. */
function svgOf(url: string): Document {
  const prefix = 'data:image/svg+xml;charset=utf-8,';
  expect(url.startsWith(prefix)).toBe(true);
  const doc = new DOMParser().parseFromString(
    decodeURIComponent(url.slice(prefix.length)),
    'image/svg+xml',
  );
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc;
}

/** A canvas that records what is drawn and encodes to a fixed "PNG". */
function fakeCanvas(options: { context?: boolean; blob?: boolean } = {}) {
  const loaded: string[] = [];
  const canvases: Size[] = [];
  const drawn: { image: unknown; at: number[] }[] = [];
  const types: (string | undefined)[] = [];
  const image = { fake: 'image' };
  const bytes = new Uint8Array([...PNG_SIGNATURE, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const environment: CanvasEnvironment = {
    async loadImage(url) {
      loaded.push(url);
      return image as unknown as CanvasImageSource;
    },
    createCanvas(size) {
      canvases.push(size);
      const context = {
        drawImage: (source: unknown, ...at: number[]) => drawn.push({ image: source, at }),
      };
      return {
        width: size.width,
        height: size.height,
        getContext: () => (options.context === false ? null : context),
        toBlob: (callback: BlobCallback, type?: string) => {
          types.push(type);
          callback(options.blob === false ? null : new Blob([bytes], { type: 'image/png' }));
        },
      } as unknown as HTMLCanvasElement;
    },
  };
  return { environment, loaded, canvases, drawn, types, image, bytes };
}

describe('PNG sizes', () => {
  it('offers 1×, 2× and 3×, 2× by default', () => {
    expect(PNG_SCALES).toEqual([1, 2, 3]);
    expect(DEFAULT_PNG_SCALE).toBe(2);
  });

  it('reads the size an SVG document declares', () => {
    expect(svgSize(SVG)).toEqual({ width: 400, height: 150.5 });
    const viewBoxOnly = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"/>';
    expect(svgSize(viewBoxOnly)).toEqual({ width: 120, height: 60 });
    expect(() => svgSize('<svg xmlns="http://www.w3.org/2000/svg"/>')).toThrow(/no size/);
    expect(() => svgSize('<html/>')).toThrow(/not a valid SVG/);
    expect(() => svgSize('<svg')).toThrow(/not a valid SVG/);
  });

  it('multiplies the size by the scale, in whole pixels', () => {
    expect(pngSize({ width: 400, height: 150.5 }, 1)).toEqual({ width: 400, height: 151 });
    expect(pngSize({ width: 400, height: 150.5 }, 2)).toEqual({ width: 800, height: 301 });
    expect(pngSize({ width: 400, height: 150.5 }, 3)).toEqual({ width: 1200, height: 452 });
    expect(pngSize({ width: 0.1, height: 0.1 }, 1)).toEqual({ width: 1, height: 1 });
  });

  it('sizes the SVG itself to the PNG, so it is drawn at that size and not stretched', () => {
    const doc = svgOf(scaledSvgUrl(SVG, { width: 800, height: 301 }));
    const root = doc.documentElement;
    expect(root.getAttribute('width')).toBe('800');
    expect(root.getAttribute('height')).toBe('301');
    expect(root.getAttribute('viewBox')).toBe('0 0 400 150.5');
    expect(doc.querySelector('title')?.textContent).toBe('C♯ Dorian');
    // Without a viewBox, one is added from the old size so the drawing scales too.
    const bare = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"/>';
    const scaled = svgOf(scaledSvgUrl(bare, { width: 30, height: 60 })).documentElement;
    expect(scaled.getAttribute('viewBox')).toBe('0 0 10 20');
  });
});

describe('svgToPng', () => {
  it.each([
    [1, 400, 151],
    [2, 800, 301],
    [3, 1200, 452],
  ])('draws the SVG at %d× onto a %d × %d canvas and returns its PNG', async (scale, w, h) => {
    const fake = fakeCanvas();
    const png = await svgToPng(SVG, scale, fake.environment);
    expect([...png.slice(0, 8)]).toEqual([...PNG_SIGNATURE]);
    expect(png).toEqual(fake.bytes);
    expect(fake.canvases).toEqual([{ width: w, height: h }]);
    expect(fake.drawn).toEqual([{ image: fake.image, at: [0, 0, w, h] }]);
    expect(fake.types).toEqual(['image/png']);
    const loaded = svgOf(fake.loaded[0]).documentElement;
    expect([loaded.getAttribute('width'), loaded.getAttribute('height')]).toEqual([
      String(w),
      String(h),
    ]);
  });

  it('refuses an image too large for a webview canvas', async () => {
    const big = '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="2000"/>';
    const fake = fakeCanvas();
    expect(1400 * 2000 * 9).toBeGreaterThan(MAX_PNG_PIXELS);
    await expect(svgToPng(big, 3, fake.environment)).rejects.toThrow(
      /4200 × 6000 pixels, too large at 3×; try a smaller scale/,
    );
    expect(fake.loaded).toEqual([]);
    await expect(svgToPng(big, 2, fake.environment)).resolves.toBeInstanceOf(Uint8Array);
    const long = '<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="10"/>';
    await expect(svgToPng(long, 1, fake.environment)).rejects.toThrow(/too large/);
  });

  it('reports a canvas that cannot draw or encode', async () => {
    await expect(svgToPng(SVG, 2, fakeCanvas({ context: false }).environment)).rejects.toThrow(
      /could not create a canvas/,
    );
    await expect(svgToPng(SVG, 2, fakeCanvas({ blob: false }).environment)).rejects.toThrow(
      /could not encode/,
    );
    await expect(svgToPng(SVG, 0, fakeCanvas().environment)).rejects.toThrow(/invalid scale/);
  });
});

describe('the Tauri content security policy', () => {
  // The installed app enforces the CSP in tauri.conf.json; a browser and `pnpm dev` don't, so
  // only this test notices when the policy blocks the image the rasterizer loads.
  it('lets the rasterizer load its SVG as an image', async () => {
    const config = (await import('../../../src-tauri/tauri.conf.json')).default;
    const directives = new Map(
      config.app.security.csp
        .split(';')
        .map((d: string) => d.trim().split(/\s+/))
        .map(([name, ...sources]: string[]) => [name, sources]),
    );
    const sources = directives.get('img-src') ?? directives.get('default-src') ?? [];
    const scheme = scaledSvgUrl(SVG, { width: 10, height: 10 }).split(',')[0].split(':')[0];
    expect(sources).toContain(`${scheme}:`);
  });
});
