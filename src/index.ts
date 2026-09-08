/**
 * Watermarker - entry point.
 *
 * Loaded on one page, does nothing on every other. The markup ships as real
 * HTML and this fills it in; nothing is uploaded, nothing is stored, and no
 * request leaves the page. The artwork is drawn on in the tab and handed
 * straight back as a download, which for a tool whose entire purpose is
 * protecting unpublished work is the only architecture that makes sense.
 */

import { attachIntake, mount } from "@nasdigitaluk/withnate-tool-core";
import {
  FONTS,
  compose,
  markFromText,
  toPngBlob,
  trimToInk,
  type ComposeOptions,
  type MarkStyle,
} from "./compose.js";
import { MIN_CENTRAL_WIDTH_PX, MIN_TILE_WIDTH_PX, TILE_WIDTH_FRACTION } from "./plan.js";

interface State {
  artwork: { bitmap: ImageBitmap; name: string } | null;
  markImage: ImageBitmap | null;
  text: string;
  font: string;
  style: MarkStyle;
  opacity: number | null;
}

const el = <T extends HTMLElement>(root: HTMLElement, sel: string): T | null =>
  root.querySelector<T>(sel);

mount("[data-wm]", ({ root }) => {
  const intake = el<HTMLElement>(root, "[data-wm-intake]");
  const preview = el<HTMLElement>(root, "[data-wm-preview]");
  const errorOut = el<HTMLElement>(root, "[data-wm-error]");
  const controls = el<HTMLElement>(root, "[data-wm-controls]");
  if (!intake || !preview) return;

  const state: State = {
    artwork: null,
    markImage: null,
    text: "© Your Name",
    font: FONTS[0]!.stack,
    style: "tiled",
    opacity: null,
  };

  let objectUrl: string | null = null;

  const clearOutput = (): void => {
    preview.replaceChildren();
    const count = el<HTMLElement>(root, "[data-wm-count]");
    if (count) count.textContent = "";
    const link = el<HTMLAnchorElement>(root, "[data-wm-download]");
    if (link) link.hidden = true;
  };

  const showError = (m: string): void => {
    if (errorOut) errorOut.textContent = m;
  };
  const clearError = (): void => {
    if (errorOut) errorOut.textContent = "";
  };

  const buildMark = (): HTMLCanvasElement | null => {
    if (state.markImage) {
      return trimToInk(state.markImage, {
        width: state.markImage.width,
        height: state.markImage.height,
      });
    }
    const text = state.text.trim();
    if (!text) return null;
    return markFromText(text, state.font);
  };

  const draw = (): void => {
    if (!state.artwork) return;
    const mark = buildMark();
    if (!mark) {
      showError("Type some text for the watermark, or upload a logo to use instead.");
      clearOutput();
      return;
    }

    const size = { width: state.artwork.bitmap.width, height: state.artwork.bitmap.height };

    // Refuse rather than produce something illegible. A mark below about a
    // hundred pixels across is a smudge, and a smudge is not a deterrent - it
    // is a defect the customer will ask about.
    const projected =
      state.style === "tiled"
        ? Math.round(Math.min(size.width, size.height) * TILE_WIDTH_FRACTION)
        : Math.round(size.width * 0.62);
    const floor = state.style === "tiled" ? MIN_TILE_WIDTH_PX : MIN_CENTRAL_WIDTH_PX;
    if (projected < floor) {
      showError(
        `This image is too small to mark legibly — the watermark would come out ${projected} pixels across. Use a larger version of the artwork.`,
      );
      // Everything that described the previous result has to go with it.
      // Leaving the caption behind puts "64 marks" directly under a message
      // saying nothing could be marked.
      clearOutput();
      return;
    }

    clearError();
    const opts: ComposeOptions = { style: state.style };
    if (state.opacity !== null) opts.opacity = state.opacity;
    const result = compose(state.artwork.bitmap, size, mark, opts);

    const img = document.createElement("img");
    img.alt = "Your artwork with the watermark applied";
    img.className = "wm-preview-img";
    void toPngBlob(result.canvas).then((blob) => {
      // Held in the closure, not on the element. The element is recreated on
      // every draw, so reading the previous URL off it always found nothing
      // and every redraw leaked a full-size PNG - which on a 12 megapixel
      // photo is tens of megabytes a slider drag.
      const url = URL.createObjectURL(blob);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = url;
      img.src = url;

      const link = el<HTMLAnchorElement>(root, "[data-wm-download]");
      if (link) {
        link.href = url;
        const base = state.artwork?.name.replace(/\.[^.]+$/, "") ?? "artwork";
        link.download = `${base}-watermarked.png`;
        link.hidden = false;
      }
    });

    const count = el<HTMLElement>(root, "[data-wm-count]");
    if (count) {
      count.textContent =
        result.marksDrawn === 1
          ? "One mark, coloured to suit what it sits on."
          : `${result.marksDrawn} marks — ${result.inkCounts.light} light, ${result.inkCounts.dark} dark, each chosen from what it covers.`;
    }
    preview.replaceChildren(img);
  };

  // ------------------------------------------------------------- the artwork

  attachIntake(intake, {
    onReject: showError,
    onFile: (file) => {
      clearError();
      void createImageBitmap(file)
        .then((bitmap) => {
          state.artwork?.bitmap.close();
          state.artwork = { bitmap, name: file.name };
          if (controls) controls.hidden = false;
          draw();
        })
        .catch(() =>
          showError(
            "That file could not be opened as an image. PNG, JPEG, GIF and WebP all work; a HEIC from an iPhone needs exporting as JPEG first.",
          ),
        );
    },
  });

  // ---------------------------------------------------------------- controls

  const textInput = el<HTMLInputElement>(root, "[data-wm-text]");
  if (textInput) {
    textInput.value = state.text;
    textInput.addEventListener("input", () => {
      state.text = textInput.value;
      state.markImage = null; // typing replaces an uploaded logo
      draw();
    });
  }

  const fontSelect = el<HTMLSelectElement>(root, "[data-wm-font]");
  if (fontSelect) {
    fontSelect.replaceChildren(
      ...FONTS.map((f) => {
        const o = document.createElement("option");
        o.value = f.stack;
        o.textContent = f.label;
        return o;
      }),
    );
    fontSelect.addEventListener("change", () => {
      state.font = fontSelect.value;
      draw();
    });
  }

  const markInput = el<HTMLInputElement>(root, "[data-wm-mark]");
  markInput?.addEventListener("change", () => {
    const file = markInput.files?.[0];
    if (!file) return;
    void createImageBitmap(file)
      .then((bitmap) => {
        state.markImage?.close();
        state.markImage = bitmap;
        draw();
      })
      .catch(() => showError("That logo could not be opened. A PNG with transparency works best."));
  });

  for (const b of Array.from(root.querySelectorAll<HTMLButtonElement>("[data-wm-style]"))) {
    b.addEventListener("click", () => {
      const next = b.dataset["wmStyle"];
      if (next !== "tiled" && next !== "central") return;
      state.style = next;
      for (const other of Array.from(root.querySelectorAll<HTMLButtonElement>("[data-wm-style]"))) {
        other.setAttribute("aria-pressed", String(other.dataset["wmStyle"] === next));
      }
      draw();
    });
  }

  const opacityInput = el<HTMLInputElement>(root, "[data-wm-opacity]");
  opacityInput?.addEventListener("input", () => {
    const v = Number(opacityInput.value);
    state.opacity = Number.isFinite(v) ? v / 100 : null;
    draw();
  });
});
