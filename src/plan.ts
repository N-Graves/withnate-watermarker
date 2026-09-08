/**
 * Where the marks go, and which colour they are drawn in.
 *
 * Pure geometry and pure decisions. No canvas, so the part that is easy to get
 * subtly wrong - and impossible to eyeball once it is a picture - can be
 * tested against arithmetic instead.
 *
 * Every constant here is carried from a working implementation in this
 * project's image pipeline where it was chosen by measurement. The measurement
 * is recorded beside it, because a number with no working behind it is a guess
 * that will be believed.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  /** Top-left of the mark's rotated bounding box. May be negative, deliberately. */
  x: number;
  y: number;
  row: number;
  col: number;
}

export interface TilePlan {
  /** Width the mark is scaled to, before rotation. */
  markWidth: number;
  markHeight: number;
  /** Bounding box of the mark once rotated. */
  boundsWidth: number;
  boundsHeight: number;
  pitchX: number;
  pitchY: number;
  angle: number;
  placements: Placement[];
}

/**
 * Tile width as a fraction of the SHORT edge.
 *
 * Deriving from min(width, height) rather than from the width is what makes
 * the geometry aspect-invariant: a square print and a 4:1 banner get a mark of
 * the same visual weight instead of one of them getting a stripe across it. It
 * also makes the tile COUNT roughly constant with resolution, so a 4096px
 * export carries the same fourteen-odd marks as the 1024px master rather than
 * sixteen times as many.
 */
export const TILE_WIDTH_FRACTION = 0.2;

/**
 * Spacing, as a multiple of the rotated mark's bounding box.
 *
 * Measured, not chosen. Worst case over every sliding crop position, as the
 * fraction of one whole mark's ink retained: at 1.6 a crop of a third of the
 * short side keeps 0.36 of a mark, at 1.35 it keeps 0.95, and at 1.2 it keeps
 * everything but visibly veils the picture. 1.35 is the point where any crop
 * worth stealing still contains one readable, whole mark.
 */
export const SPACING = 1.35;

/**
 * Odd rows shift sideways by half a pitch.
 *
 * Honest about what this does: it is worth almost nothing for crop coverage,
 * 0.17 against 0.15. It is kept because without it the marks line up into
 * vertical corridors and the whole thing reads as a screen door laid over the
 * picture rather than as a watermark.
 */
export const ROW_STAGGER = 0.5;

export const ANGLE_DEGREES = 30;

/** Below this the mark is unreadable and the tiling is decoration. */
export const MIN_TILE_WIDTH_PX = 96;

/** Bounding box of a rectangle rotated about its centre. */
export const rotatedBounds = (width: number, height: number, degrees: number): Size => {
  const r = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return {
    width: width * c + height * s,
    height: width * s + height * c,
  };
};

export interface TileOptions {
  widthFraction?: number;
  spacing?: number;
  stagger?: number;
  angle?: number;
}

/**
 * Lay a lattice of marks over the image.
 *
 * The lattice deliberately starts at row and column -1 and overruns every
 * edge. A tidy grid that respects the margins leaves a clean unmarked border,
 * and that border is the first thing anybody crops to.
 */
export const planTiles = (
  image: Size,
  markAspect: number,
  opts: TileOptions = {},
): TilePlan => {
  const angle = opts.angle ?? ANGLE_DEGREES;
  const markWidth = Math.max(
    1,
    Math.round(Math.min(image.width, image.height) * (opts.widthFraction ?? TILE_WIDTH_FRACTION)),
  );
  const markHeight = Math.max(1, Math.round(markWidth / markAspect));
  const bounds = rotatedBounds(markWidth, markHeight, angle);
  const spacing = Math.max(1, opts.spacing ?? SPACING);
  const stagger = opts.stagger ?? ROW_STAGGER;

  const pitchX = Math.max(1, Math.round(bounds.width * spacing));
  const pitchY = Math.max(1, Math.round(bounds.height * spacing));

  const placements: Placement[] = [];
  for (let row = -1; row * pitchY - bounds.height / 2 < image.height; row += 1) {
    const y = row * pitchY - bounds.height / 2;
    for (let col = -1; col * pitchX - bounds.width / 2 < image.width; col += 1) {
      const x = col * pitchX + (row % 2 !== 0 ? pitchX * stagger : 0) - bounds.width / 2;
      placements.push({ x, y, row, col });
    }
  }

  return {
    markWidth,
    markHeight,
    boundsWidth: bounds.width,
    boundsHeight: bounds.height,
    pitchX,
    pitchY,
    angle,
    placements,
  };
};

// ------------------------------------------------------------------ central

/**
 * A single large mark across the middle.
 *
 * 0.62 of the width is a choice rather than a measurement, and it is a
 * different job from the tiled mark: one mark has to carry the whole
 * deterrent, so it is large and more opaque, where fourteen can each be faint.
 * Capped against the height so it does not overrun a tall crop.
 */
export const CENTRAL_WIDTH_FRACTION = 0.62;
export const CENTRAL_MAX_HEIGHT_FRACTION = 0.45;
export const MIN_CENTRAL_WIDTH_PX = 48;

export interface CentralPlan {
  x: number;
  y: number;
  markWidth: number;
  markHeight: number;
  angle: number;
}

export const planCentral = (
  image: Size,
  markAspect: number,
  opts: { widthFraction?: number; angle?: number } = {},
): CentralPlan => {
  let markWidth = Math.max(
    1,
    Math.round(image.width * (opts.widthFraction ?? CENTRAL_WIDTH_FRACTION)),
  );
  let markHeight = Math.max(1, Math.round(markWidth / markAspect));

  const maxHeight = Math.round(image.height * CENTRAL_MAX_HEIGHT_FRACTION);
  if (markHeight > maxHeight) {
    markHeight = Math.max(1, maxHeight);
    markWidth = Math.max(1, Math.round(markHeight * markAspect));
  }

  return {
    x: (image.width - markWidth) / 2,
    y: (image.height - markHeight) / 2,
    markWidth,
    markHeight,
    angle: opts.angle ?? 0,
  };
};

// ---------------------------------------------------------------------- ink

export type Ink = "light" | "dark";

export const LUMA_THRESHOLD = 128;

/**
 * Width of the band in which the whole image decides, rather than the tile.
 *
 * Per-tile ink alone checkerboards. On a real framed-bedroom mockup from this
 * business, neighbouring tiles measured 122 and 132 against a threshold of 128
 * and flipped black to white between them, which reads as a rendering fault
 * rather than as a watermark. One ink for the whole image is coherent but
 * loses every mark that crosses a bright subject on a dark ground - which is
 * most of this product line, and exactly the region worth stealing.
 *
 * A deadband gets both: per-tile ink where the tile is decisively light or
 * dark, the whole-image decision everywhere it is ambiguous.
 */
export const LUMA_HYSTERESIS = 24;

/**
 * `patchLuma` is the mean brightness of what this mark will cover;
 * `imageLuma` is the mean of the whole picture. Both 0-255.
 *
 * Returns the INK: "dark" means draw a dark mark, which is what a bright
 * background wants.
 */
export const pickInk = (
  patchLuma: number,
  imageLuma: number,
  threshold = LUMA_THRESHOLD,
  hysteresis = LUMA_HYSTERESIS,
): Ink => {
  if (patchLuma >= threshold + hysteresis) return "dark";
  if (patchLuma <= threshold - hysteresis) return "light";
  return imageLuma >= threshold ? "dark" : "light";
};

/** ITU-R BT.601. Green carries most of perceived brightness; a channel average does not. */
export const lumaOf = (r: number, g: number, b: number): number =>
  0.299 * r + 0.587 * g + 0.114 * b;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Mean luma of a rectangle of the source image.
 *
 * The rectangle is clamped to the image, because the lattice deliberately
 * overruns every edge and a mark half off the top has only half a patch to
 * measure. Returns the image-wide fallback when the rectangle is entirely
 * outside, which cannot happen with the current lattice but would be a silent
 * NaN if it ever did.
 *
 * ⚠️ This must be given the CLEAN source, never the canvas being drawn on.
 * Ink already laid down shifts the luma of what comes next - measured at 140.0
 * against 136.7 on a real image in the pipeline this is carried from - so
 * sampling the working canvas makes each mark's colour depend on the marks
 * before it, and the lattice slowly drifts.
 */
export const patchMeanLuma = (
  rgba: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  rect: Rect,
  fallback = LUMA_THRESHOLD,
): number => {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(imageWidth, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(imageHeight, Math.ceil(rect.y + rect.height));
  if (x1 <= x0 || y1 <= y0) return fallback;

  let acc = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = (y * imageWidth + x) * 4;
      if (rgba[p + 3]! === 0) continue;
      acc += lumaOf(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!);
      n += 1;
    }
  }
  return n === 0 ? fallback : acc / n;
};

/** Mean luma of an RGBA buffer, ignoring fully transparent pixels. */
export const meanLuma = (rgba: Uint8ClampedArray): number => {
  let acc = 0;
  let n = 0;
  for (let p = 0; p < rgba.length; p += 4) {
    if (rgba[p + 3]! === 0) continue;
    acc += lumaOf(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!);
    n += 1;
  }
  return n === 0 ? 0 : acc / n;
};
