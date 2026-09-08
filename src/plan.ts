export interface Size {
  width: number;
  height: number;
}

export interface Placement {

  x: number;
  y: number;
  row: number;
  col: number;
}

export interface TilePlan {

  markWidth: number;
  markHeight: number;

  boundsWidth: number;
  boundsHeight: number;
  pitchX: number;
  pitchY: number;
  angle: number;
  placements: Placement[];
}

export const TILE_WIDTH_FRACTION = 0.2;

export const SPACING = 1.35;

export const ROW_STAGGER = 0.5;

export const ANGLE_DEGREES = 30;

export const MIN_TILE_WIDTH_PX = 96;

export const MAX_ARTWORK_PIXELS = 50e6;
export const MAX_MARK_PIXELS = 16e6;
export const MAX_TEXT_LENGTH = 64;

export const isTooLarge = (size: Size, ceiling: number): boolean =>
  size.width * size.height > ceiling;

export const megapixels = (size: Size): number =>
  Math.round((size.width * size.height) / 1e5) / 10;

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

export type Ink = "light" | "dark";

export const LUMA_THRESHOLD = 128;

export const LUMA_HYSTERESIS = 24;

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

export const lumaOf = (r: number, g: number, b: number): number =>
  0.299 * r + 0.587 * g + 0.114 * b;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
