import { describe, expect, it } from "vitest";
import {
  CENTRAL_WIDTH_FRACTION,
  MAX_ARTWORK_PIXELS,
  MAX_MARK_PIXELS,
  MAX_TEXT_LENGTH,
  isTooLarge,
  megapixels,
  planCentral,
} from "../src/plan.js";

describe("size ceilings", () => {
  it("passes everything this tool is actually for", () => {

    expect(isTooLarge({ width: 4961, height: 3508 }, MAX_ARTWORK_PIXELS)).toBe(false);
    expect(isTooLarge({ width: 4096, height: 5120 }, MAX_ARTWORK_PIXELS)).toBe(false);
    expect(isTooLarge({ width: 8000, height: 6000 }, MAX_ARTWORK_PIXELS)).toBe(false);
  });

  it("refuses what would take the tab down", () => {
    expect(isTooLarge({ width: 20000, height: 15000 }, MAX_ARTWORK_PIXELS)).toBe(true);
  });

  it("holds the mark to a tighter ceiling than the artwork", () => {
    expect(MAX_MARK_PIXELS).toBeLessThan(MAX_ARTWORK_PIXELS);
    expect(isTooLarge({ width: 6000, height: 4000 }, MAX_MARK_PIXELS)).toBe(true);
    expect(isTooLarge({ width: 2000, height: 2000 }, MAX_MARK_PIXELS)).toBe(false);
  });

  it("is inclusive at the boundary, so a ceiling-sized image is allowed", () => {
    expect(isTooLarge({ width: MAX_ARTWORK_PIXELS, height: 1 }, MAX_ARTWORK_PIXELS)).toBe(false);
    expect(isTooLarge({ width: MAX_ARTWORK_PIXELS + 1, height: 1 }, MAX_ARTWORK_PIXELS)).toBe(true);
  });

  it("reports megapixels to one decimal for the refusal message", () => {
    expect(megapixels({ width: 4000, height: 3000 })).toBe(12);
    expect(megapixels({ width: 20000, height: 15000 })).toBe(300);
  });

  it("keeps a text ceiling that leaves room for a real credit line", () => {
    expect(MAX_TEXT_LENGTH).toBeGreaterThanOrEqual("© Some Photographer 2026".length);
  });
});

describe("the central width fraction has one definition", () => {
  it("is what planCentral uses when nothing is passed", () => {
    const image = { width: 2000, height: 2000 };
    const plan = planCentral(image, 4);
    expect(plan.markWidth).toBe(Math.round(image.width * CENTRAL_WIDTH_FRACTION));
  });
});
