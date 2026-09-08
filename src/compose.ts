/**
 * The canvas work: build a mark, lay it over the picture, hand back a file.
 *
 * The decisions all live in plan.ts as pure functions. This is the adapter
 * that turns them into pixels.
 *
 * ⚠️ One trap carried over from the Python this is ported from, which does NOT
 * apply here and is worth recording so nobody reintroduces the workaround.
 * There, `paste(tile, box, tile)` on an RGBA destination SQUARES the alpha - a
 * mark at 0.15 lands at 0.022 and is invisible. Canvas does not do that:
 * `globalAlpha` multiplies once against the source alpha, which is the correct
 * behaviour, so the opacity here is the opacity you get.
 */

import {
  meanLuma,
  patchMeanLuma,
  pickInk,
  planCentral,
  planTiles,
  rotatedBounds,
  type Ink,
  type Size,
} from "./plan.js";

export type MarkStyle = "tiled" | "central";

export interface ComposeOptions {
  style: MarkStyle;
  /** Tiled marks are faint because there are many; a single mark carries it alone. */
  opacity?: number;
  widthFraction?: number;
  angle?: number;
}

export const TILED_OPACITY = 0.15;
export const CENTRAL_OPACITY = 0.28;

const canvas2d = (
  w: number,
  h: number,
  opts?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d", opts);
  if (!ctx) throw new Error("this browser would not give us a 2d canvas");
  return ctx;
};

// ------------------------------------------------------------- building a mark

export const FONTS: ReadonlyArray<{ id: string; label: string; stack: string }> = [
  { id: "sans", label: "Bold sans", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: "serif", label: "Bold serif", stack: 'Georgia, "Times New Roman", serif' },
  { id: "mono", label: "Bold mono", stack: '"SF Mono", Consolas, "Courier New", monospace' },
];

/**
 * Fonts are system stacks, never a webfont. The site refuses third-party
 * requests of any kind - its own build check fails on a Google Fonts URL - and
 * a watermark tool that phones out for a typeface would break that for the one
 * thing on the page that is meant to be private.
 */
export const markFromText = (text: string, fontStack: string): HTMLCanvasElement => {
  const SIZE = 256; // Rendered large, scaled down at draw time, so it stays crisp.
  const measure = canvas2d(8, 8);
  measure.font = `bold ${SIZE}px ${fontStack}`;
  const m = measure.measureText(text);
  // Actual ascent and descent rather than the em box, so a mark of "WITH NATE"
  // is not padded out by the space a lowercase g would have taken.
  const ascent = m.actualBoundingBoxAscent || SIZE * 0.8;
  const descent = m.actualBoundingBoxDescent || SIZE * 0.2;
  const w = Math.max(1, Math.ceil(m.width));
  const h = Math.max(1, Math.ceil(ascent + descent));

  const ctx = canvas2d(w, h);
  ctx.font = `bold ${SIZE}px ${fontStack}`;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, 0, ascent);
  return ctx.canvas;
};

/**
 * Trim an uploaded mark to its actual ink.
 *
 * Logos routinely ship with a third of the file as transparent padding, and
 * without this the mark is scaled by its padded size and comes out visibly
 * smaller than asked for.
 */
export const trimToInk = (source: CanvasImageSource, size: Size): HTMLCanvasElement => {
  const ctx = canvas2d(size.width, size.height, { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, size.width, size.height);
  const { data } = ctx.getImageData(0, 0, size.width, size.height);

  let minX = size.width;
  let minY = size.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      if (data[(y * size.width + x) * 4 + 3]! > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // Fully transparent, or opaque to the edges: nothing to trim.
  if (maxX < 0) return ctx.canvas;

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w === size.width && h === size.height) return ctx.canvas;

  const out = canvas2d(w, h);
  out.drawImage(ctx.canvas, minX, minY, w, h, 0, 0, w, h);
  return out.canvas;
};

/**
 * Recolour a mark, keeping its alpha exactly.
 *
 * `source-in` paints the colour only where the mark already has ink, so the
 * shape and its antialiasing survive untouched. Recolouring by drawing the
 * text again in a different fill would work for text and not for an uploaded
 * logo, and two code paths for the same idea is how they drift.
 */
export const tintMark = (mark: HTMLCanvasElement, colour: string): HTMLCanvasElement => {
  const ctx = canvas2d(mark.width, mark.height);
  ctx.drawImage(mark, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, mark.width, mark.height);
  return ctx.canvas;
};

const LIGHT = "#ffffff";
const DARK = "#111111";

// --------------------------------------------------------------- composition

export interface ComposeResult {
  canvas: HTMLCanvasElement;
  marksDrawn: number;
  /** How many marks took each ink, which is what makes the deadband visible. */
  inkCounts: Record<Ink, number>;
}

export const compose = (
  source: CanvasImageSource,
  size: Size,
  mark: HTMLCanvasElement,
  opts: ComposeOptions,
): ComposeResult => {
  // The sampling surface and the drawing surface are separate ON PURPOSE. Ink
  // already laid down changes the brightness underneath the next mark, so
  // measuring the canvas being drawn on makes every mark's colour depend on
  // the ones before it.
  const sampler = canvas2d(size.width, size.height, { willReadFrequently: true });
  sampler.drawImage(source, 0, 0, size.width, size.height);
  const clean = sampler.getImageData(0, 0, size.width, size.height).data;
  const imageLuma = meanLuma(clean);

  const out = canvas2d(size.width, size.height);
  out.drawImage(source, 0, 0, size.width, size.height);
  out.globalAlpha =
    opts.opacity ?? (opts.style === "tiled" ? TILED_OPACITY : CENTRAL_OPACITY);

  const light = tintMark(mark, LIGHT);
  const dark = tintMark(mark, DARK);
  const aspect = mark.width / mark.height;
  const inkCounts: Record<Ink, number> = { light: 0, dark: 0 };
  let marksDrawn = 0;

  const place = (x: number, y: number, w: number, h: number, angle: number): void => {
    const bounds = rotatedBounds(w, h, angle);
    const patch = patchMeanLuma(clean, size.width, size.height, {
      x,
      y,
      width: bounds.width,
      height: bounds.height,
    });
    const ink = pickInk(patch, imageLuma);
    inkCounts[ink] += 1;

    out.save();
    out.translate(x + bounds.width / 2, y + bounds.height / 2);
    out.rotate((angle * Math.PI) / 180);
    out.drawImage(ink === "light" ? light : dark, -w / 2, -h / 2, w, h);
    out.restore();
    marksDrawn += 1;
  };

  if (opts.style === "tiled") {
    const plan = planTiles(size, aspect, {
      widthFraction: opts.widthFraction,
      angle: opts.angle,
    });
    for (const p of plan.placements) {
      place(p.x, p.y, plan.markWidth, plan.markHeight, plan.angle);
    }
  } else {
    const plan = planCentral(size, aspect, {
      widthFraction: opts.widthFraction,
      angle: opts.angle,
    });
    place(plan.x, plan.y, plan.markWidth, plan.markHeight, plan.angle);
  }

  return { canvas: out.canvas, marksDrawn, inkCounts };
};

/**
 * PNG, always, whatever came in.
 *
 * A JPEG in and a JPEG out means a second generation of compression on the
 * whole picture in order to add a watermark, which is a real quality cost paid
 * for nothing. PNG is bigger and lossless, and this file exists to be posted
 * rather than archived.
 */
export const toPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode the image"))), "image/png");
  });
