

import {
  attachIntake,
  measureImage,
  mount,
  readHeaderBytes,
} from "@nasdigitaluk/withnate-tool-core";
import {
  FONTS,
  compose,
  markFromText,
  toPngBlob,
  trimToInk,
  type ComposeOptions,
  type MarkStyle,
} from "./compose.js";
import {
  CENTRAL_WIDTH_FRACTION,
  MAX_ARTWORK_PIXELS,
  MAX_MARK_PIXELS,
  MAX_TEXT_LENGTH,
  MIN_CENTRAL_WIDTH_PX,
  MIN_TILE_WIDTH_PX,
  TILE_WIDTH_FRACTION,
  isTooLarge,
  megapixels,
} from "./plan.js";

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

  const oversizedArtwork = (mp: number): string =>
    `That image is ${mp} megapixels, and marking it would need several times that in memory — enough to bring this tab down. Save a copy at a smaller size and mark that.`;

  const oversizedMark = (mp: number): string =>
    `That logo is ${mp} megapixels. A watermark is drawn small whatever it starts at, so use a more ordinary export of it.`;

  const refuseIfOversized = async (
    file: File,
    ceiling: number,
    message: (mp: number) => string,
  ): Promise<boolean> => {
    const header = measureImage(await readHeaderBytes(file));
    if (!header || !isTooLarge(header, ceiling)) return false;
    showError(message(megapixels(header)));
    return true;
  };

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
    const text = state.text.trim().slice(0, MAX_TEXT_LENGTH);
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

    
    
    
    const projected =
      state.style === "tiled"
        ? Math.round(Math.min(size.width, size.height) * TILE_WIDTH_FRACTION)
        : Math.round(size.width * CENTRAL_WIDTH_FRACTION);
    const floor = state.style === "tiled" ? MIN_TILE_WIDTH_PX : MIN_CENTRAL_WIDTH_PX;
    if (projected < floor) {
      showError(
        `This image is too small to mark legibly — the watermark would come out ${projected} pixels across. Use a larger version of the artwork.`,
      );
      
      
      
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

  

  attachIntake(intake, {
    onReject: showError,
    onFile: (file) => {
      clearError();
      void (async () => {
        if (await refuseIfOversized(file, MAX_ARTWORK_PIXELS, oversizedArtwork)) return;
        const bitmap = await createImageBitmap(file);
        state.artwork?.bitmap.close();
        state.artwork = { bitmap, name: file.name };
        if (controls) controls.hidden = false;
        draw();
      })().catch(() =>
        showError(
          "That file could not be opened as an image. PNG, JPEG, GIF and WebP all work; a HEIC from an iPhone needs exporting as JPEG first.",
        ),
      );
    },
  });

  

  const textInput = el<HTMLInputElement>(root, "[data-wm-text]");
  if (textInput) {
    
    
    
    textInput.maxLength = MAX_TEXT_LENGTH;
    textInput.value = state.text;
    textInput.addEventListener("input", () => {
      state.text = textInput.value;
      state.markImage = null; 
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
    void (async () => {
      if (await refuseIfOversized(file, MAX_MARK_PIXELS, oversizedMark)) return;
      const bitmap = await createImageBitmap(file);
      state.markImage?.close();
      state.markImage = bitmap;
      draw();
    })().catch(() =>
      showError("That logo could not be opened. A PNG with transparency works best."),
    );
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
