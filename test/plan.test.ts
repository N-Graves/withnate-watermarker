import { describe, expect, it } from "vitest";
import {
  CENTRAL_MAX_HEIGHT_FRACTION,
  LUMA_HYSTERESIS,
  LUMA_THRESHOLD,
  TILE_WIDTH_FRACTION,
  lumaOf,
  meanLuma,
  pickInk,
  planCentral,
  planTiles,
  rotatedBounds,
} from "../src/plan.js";

describe("rotatedBounds", () => {
  it("is the identity at zero", () => {
    expect(rotatedBounds(100, 40, 0)).toEqual({ width: 100, height: 40 });
  });

  it("swaps the axes at a right angle", () => {
    const b = rotatedBounds(100, 40, 90);
    expect(b.width).toBeCloseTo(40, 6);
    expect(b.height).toBeCloseTo(100, 6);
  });

  it("matches the hand calculation at thirty degrees", () => {

    const b = rotatedBounds(100, 40, 30);
    expect(b.width).toBeCloseTo(106.603, 3);
    expect(b.height).toBeCloseTo(84.641, 3);
  });

  it("is the same for a rotation and its mirror", () => {
    expect(rotatedBounds(100, 40, 30)).toEqual(rotatedBounds(100, 40, -30));
  });
});

describe("planTiles", () => {
  it("sizes the mark from the SHORT edge, not the width", () => {

    for (const [w, h] of [[1000, 1000], [3360, 840], [840, 3360], [2000, 1500]] as const) {
      const plan = planTiles({ width: w, height: h }, 4);
      expect(plan.markWidth).toBe(Math.round(Math.min(w, h) * TILE_WIDTH_FRACTION));
    }
  });

  it("keeps the mark count roughly constant as resolution rises", () => {

    const small = planTiles({ width: 1024, height: 1024 }, 4).placements.length;
    const large = planTiles({ width: 4096, height: 4096 }, 4).placements.length;
    expect(Math.abs(large - small)).toBeLessThanOrEqual(2);
  });

  it("overruns every edge instead of respecting the margins", () => {

    const image = { width: 1200, height: 900 };
    const plan = planTiles(image, 4);
    expect(plan.placements.some((p) => p.x < 0)).toBe(true);
    expect(plan.placements.some((p) => p.y < 0)).toBe(true);
    expect(plan.placements.some((p) => p.x + plan.boundsWidth > image.width)).toBe(true);
    expect(plan.placements.some((p) => p.y + plan.boundsHeight > image.height)).toBe(true);
  });

  it("staggers odd rows by half a pitch and leaves even rows alone", () => {
    const plan = planTiles({ width: 1200, height: 900 }, 4);
    const xOf = (row: number, col: number): number =>
      plan.placements.find((p) => p.row === row && p.col === col)!.x;
    expect(xOf(1, 0) - xOf(0, 0)).toBeCloseTo(plan.pitchX * 0.5, 6);
    expect(xOf(2, 0)).toBeCloseTo(xOf(0, 0), 6);
  });

  it("spaces on the ROTATED bounding box, not the unrotated mark", () => {

    const plan = planTiles({ width: 2000, height: 2000 }, 4);
    expect(plan.pitchX).toBeGreaterThanOrEqual(plan.boundsWidth);
    expect(plan.pitchY).toBeGreaterThanOrEqual(plan.boundsHeight);
  });

  it("covers the whole frame with no gap a mark could fall through", () => {
    const image = { width: 1600, height: 1200 };
    const plan = planTiles(image, 4);
    const rows = new Set(plan.placements.map((p) => p.row));
    const cols = new Set(plan.placements.map((p) => p.col));
    expect(Math.min(...rows)).toBe(-1);
    expect(Math.min(...cols)).toBe(-1);
    expect(Math.max(...rows) * plan.pitchY).toBeGreaterThanOrEqual(image.height - plan.pitchY);
  });
});

describe("planCentral", () => {
  it("centres the mark", () => {
    const image = { width: 1600, height: 1200 };
    const p = planCentral(image, 4);
    expect(p.x + p.markWidth / 2).toBeCloseTo(image.width / 2, 6);
    expect(p.y + p.markHeight / 2).toBeCloseTo(image.height / 2, 6);
  });

  it("caps against the height on a tall crop rather than overrunning it", () => {

    const image = { width: 900, height: 2600 };
    const p = planCentral(image, 1);
    expect(p.markHeight).toBeLessThanOrEqual(image.height * CENTRAL_MAX_HEIGHT_FRACTION + 1);
    expect(p.markHeight).toBeLessThan(image.height);
  });

  it("keeps the mark's aspect ratio when it caps", () => {
    const p = planCentral({ width: 900, height: 800 }, 3);
    expect(p.markWidth / p.markHeight).toBeCloseTo(3, 1);
  });

  it("stays inside the frame for every shape tried", () => {
    for (const [w, h] of [[1000, 1000], [3360, 840], [840, 3360], [400, 300]] as const) {
      for (const aspect of [0.5, 1, 4, 8]) {
        const p = planCentral({ width: w, height: h }, aspect);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.markWidth).toBeLessThanOrEqual(w + 1);
        expect(p.y + p.markHeight).toBeLessThanOrEqual(h + 1);
      }
    }
  });
});

describe("pickInk", () => {
  it("puts dark ink on a bright patch and light ink on a dark one", () => {
    expect(pickInk(230, 128)).toBe("dark");
    expect(pickInk(20, 128)).toBe("light");
  });

  it("does NOT flip between the two tiles that caused the checkerboard", () => {

    const darkImage = 90;
    const brightImage = 190;
    expect(pickInk(122, darkImage)).toBe(pickInk(132, darkImage));
    expect(pickInk(122, brightImage)).toBe(pickInk(132, brightImage));
  });

  it("follows the whole image anywhere strictly inside the band", () => {

    for (let patch = LUMA_THRESHOLD - LUMA_HYSTERESIS + 1; patch < LUMA_THRESHOLD + LUMA_HYSTERESIS; patch += 1) {
      expect(pickInk(patch, 60)).toBe("light");
      expect(pickInk(patch, 200)).toBe("dark");
    }
  });

  it("still decides per tile once a patch is decisively one or the other", () => {

    expect(pickInk(250, 40)).toBe("dark");
    expect(pickInk(5, 220)).toBe("light");
  });

  it("has no gap or overlap at the band edges", () => {
    expect(pickInk(LUMA_THRESHOLD + LUMA_HYSTERESIS, 40)).toBe("dark");
    expect(pickInk(LUMA_THRESHOLD + LUMA_HYSTERESIS - 0.001, 40)).toBe("light");
    expect(pickInk(LUMA_THRESHOLD - LUMA_HYSTERESIS, 220)).toBe("light");
    expect(pickInk(LUMA_THRESHOLD - LUMA_HYSTERESIS + 0.001, 220)).toBe("dark");
  });
});

describe("luma", () => {
  it("weights green far above blue", () => {
    expect(lumaOf(0, 255, 0)).toBeCloseTo(149.685, 3);
    expect(lumaOf(0, 0, 255)).toBeCloseTo(29.07, 3);
  });

  it("ignores fully transparent pixels when averaging", () => {

    const rgba = new Uint8ClampedArray([255, 255, 255, 0, 0, 0, 0, 255]);
    expect(meanLuma(rgba)).toBeCloseTo(0, 6);
  });

  it("returns zero when everything is transparent, rather than NaN", () => {
    expect(meanLuma(new Uint8ClampedArray([1, 2, 3, 0]))).toBe(0);
  });
});
