import { describe, expect, it } from "vitest";
import { LUMA_THRESHOLD, patchMeanLuma } from "../src/plan.js";

const grey = (w: number, h: number, v: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
};

const split = (w: number, h: number, left: number, right: number): Uint8ClampedArray => {
  const out = grey(w, h, left);
  for (let y = 0; y < h; y += 1) {
    for (let x = w / 2; x < w; x += 1) {
      const p = (y * w + x) * 4;
      out[p] = right;
      out[p + 1] = right;
      out[p + 2] = right;
    }
  }
  return out;
};

describe("patchMeanLuma", () => {
  it("reads only the rectangle asked for", () => {
    const data = split(100, 100, 20, 240);
    expect(patchMeanLuma(data, 100, 100, { x: 0, y: 0, width: 50, height: 100 })).toBeCloseTo(20, 4);
    expect(patchMeanLuma(data, 100, 100, { x: 50, y: 0, width: 50, height: 100 })).toBeCloseTo(240, 4);
  });

  it("clamps a rectangle that overruns the edge", () => {

    const data = grey(50, 50, 100);
    expect(patchMeanLuma(data, 50, 50, { x: -30, y: -30, width: 40, height: 40 })).toBeCloseTo(100, 4);
    expect(patchMeanLuma(data, 50, 50, { x: 40, y: 40, width: 40, height: 40 })).toBeCloseTo(100, 4);
  });

  it("falls back rather than returning NaN when the rectangle misses entirely", () => {
    const data = grey(50, 50, 100);
    expect(patchMeanLuma(data, 50, 50, { x: 500, y: 500, width: 10, height: 10 })).toBe(
      LUMA_THRESHOLD,
    );
  });

  it("ignores fully transparent pixels", () => {

    const data = grey(10, 10, 255);
    for (let i = 0; i < 50; i += 1) data[i * 4 + 3] = 0;
    for (let i = 50; i < 100; i += 1) {
      data[i * 4] = 10;
      data[i * 4 + 1] = 10;
      data[i * 4 + 2] = 10;
    }
    expect(patchMeanLuma(data, 10, 10, { x: 0, y: 0, width: 10, height: 10 })).toBeCloseTo(10, 4);
  });

  it("falls back when the rectangle is entirely transparent", () => {
    const data = new Uint8ClampedArray(10 * 10 * 4);
    expect(patchMeanLuma(data, 10, 10, { x: 0, y: 0, width: 10, height: 10 })).toBe(LUMA_THRESHOLD);
  });

  it("uses BT.601, so a green patch reads far brighter than a blue one", () => {
    const g = new Uint8ClampedArray([0, 255, 0, 255]);
    const b = new Uint8ClampedArray([0, 0, 255, 255]);
    const rect = { x: 0, y: 0, width: 1, height: 1 };
    expect(patchMeanLuma(g, 1, 1, rect)).toBeCloseTo(149.685, 3);
    expect(patchMeanLuma(b, 1, 1, rect)).toBeCloseTo(29.07, 3);
  });
});
